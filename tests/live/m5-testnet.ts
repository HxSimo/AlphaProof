import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  pad,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { FileObjectArchive, archiveJson } from '@poa/market-data';
import { normalizeArcBalance } from '@poa/transfers';

if (process.env.POA_RUN_LIVE_TESTNET !== '1') {
  console.log(
    'SKIPPED_TO_VERIFY: set POA_RUN_LIVE_TESTNET=1 only after funding the documented deployer and relayer accounts',
  );
  process.exit(0);
}

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`LIVE_TESTNET_CONFIGURATION_MISSING: ${name}`);
  return value;
};
const privateKey = (name: string): Hex => {
  const value = required(name);
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized))
    throw new Error(`LIVE_TESTNET_CONFIGURATION_INVALID: ${name}`);
  return normalized as Hex;
};
const sepoliaRpc = required('ETHEREUM_SEPOLIA_RPC_URL');
const arcRpc = required('ARC_TESTNET_RPC_URL');
const deployer = privateKeyToAccount(
  privateKey('POA_TESTNET_DEPLOYER_PRIVATE_KEY'),
);
const relayer = privateKeyToAccount(
  privateKey('POA_TESTNET_RELAYER_PRIVATE_KEY'),
);
const evidenceDir = resolve(required('POA_LIVE_EVIDENCE_DIR'));
const outboundTransferAmount = BigInt(
  required('POA_LIVE_OUTBOUND_TRANSFER_AMOUNT_MINOR'),
);
const returnTransferAmount = BigInt(
  required('POA_LIVE_RETURN_TRANSFER_AMOUNT_MINOR'),
);
const vaultDeposit = BigInt(required('POA_LIVE_VAULT_DEPOSIT_MINOR'));
const yieldBudget = BigInt(required('POA_LIVE_YIELD_BUDGET_MINOR'));
const experimentStart = BigInt(required('POA_TESTNET_EXPERIMENT_START_EPOCH'));
const resumeOutboundBurnHash = process.env
  .POA_LIVE_RESUME_OUTBOUND_BURN_HASH as Hex | undefined;
if (
  outboundTransferAmount <= 0n ||
  returnTransferAmount <= 0n ||
  vaultDeposit <= 0n ||
  yieldBudget <= 0n
)
  throw new Error(
    'LIVE_TESTNET_CONFIGURATION_INVALID: amounts must be positive',
  );
const runnerStartedAt = BigInt(Math.floor(Date.now() / 1000));
if (experimentStart <= runnerStartedAt + 10_800n)
  throw new Error(
    'LIVE_SCHEDULE_NOT_PROSPECTIVE: experiment start must be at least three hours ahead',
  );

const ARC_USDC = '0x3600000000000000000000000000000000000000' as Address;
const SEPOLIA_USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' as Address;
const TOKEN_MESSENGER = '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa' as Address;
const MESSAGE_TRANSMITTER =
  '0xe737e5cebeeba77efe34d4aa090756590b1ce275' as Address;
const iris = 'https://iris-api-sandbox.circle.com';
const arc = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [arcRpc] } },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' },
  },
});
const sp = createPublicClient({ chain: sepolia, transport: http(sepoliaRpc) });
const ap = createPublicClient({ chain: arc, transport: http(arcRpc) });
const sw = createWalletClient({
  chain: sepolia,
  transport: http(sepoliaRpc),
  account: deployer,
});
const aw = createWalletClient({
  chain: arc,
  transport: http(arcRpc),
  account: deployer,
});
const sr = createWalletClient({
  chain: sepolia,
  transport: http(sepoliaRpc),
  account: relayer,
});
const ar = createWalletClient({
  chain: arc,
  transport: http(arcRpc),
  account: relayer,
});
const archive = new FileObjectArchive(evidenceDir);
const erc20 = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);
const messenger = parseAbi([
  'function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold)',
]);
const transmitter = parseAbi([
  'function receiveMessage(bytes message,bytes attestation)',
]);
const vaultAbi = parseAbi([
  'constructor(address asset_,address owner_)',
  'function freezeYieldSchedule(uint64 start,uint64 end,uint256 budget)',
  'function deposit(uint256 assets,address receiver) returns (uint256)',
  'function redeem(uint256 shares,address receiver,address owner) returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function asset() view returns (address)',
  'function scheduleOwner() view returns (address)',
  'function scheduleFrozen() view returns (bool)',
  'function yieldStart() view returns (uint64)',
  'function yieldEnd() view returns (uint64)',
  'function yieldBudget() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
]);

const serializable = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializable(v)]),
    );
  return value;
};
const captured: unknown[] = [];
type PendingFinalityReceipt = {
  client: typeof sp | typeof ap;
  expectedStatus: 'success' | 'reverted';
  kind: string;
  receipt: Awaited<ReturnType<typeof sp.waitForTransactionReceipt>>;
};
const pendingFinalityReceipts: PendingFinalityReceipt[] = [];
async function record(kind: string, value: unknown) {
  const capturedAt = new Date().toISOString();
  const descriptor = await archiveJson(
    archive,
    { kind, payload: serializable(value) },
    capturedAt,
  );
  captured.push({ kind, ...descriptor });
  return descriptor;
}
async function receipt(client: typeof sp | typeof ap, hash: Hex, kind: string) {
  await record(`${kind}-submitted`, { transactionHash: hash });
  const value = await client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 180_000,
  });
  if (value.status !== 'success')
    throw new Error(`LIVE_TRANSACTION_REVERTED: ${kind} ${hash}`);
  await record(`${kind}-included`, { receipt: value });
  pendingFinalityReceipts.push({
    client,
    expectedStatus: 'success',
    kind,
    receipt: value,
  });
  return value;
}
async function revertedReceipt(
  client: typeof sp | typeof ap,
  hash: Hex,
  kind: string,
) {
  await record(`${kind}-submitted`, { transactionHash: hash });
  const value = await client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 180_000,
  });
  if (value.status !== 'reverted')
    throw new Error(`LIVE_DUPLICATE_SETTLEMENT_SUCCEEDED: ${kind} ${hash}`);
  await record(`${kind}-included`, {
    receipt: value,
    expectedStatus: 'reverted',
  });
  pendingFinalityReceipts.push({
    client,
    expectedStatus: 'reverted',
    kind,
    receipt: value,
  });
  return value;
}
async function finalizeReceipts() {
  for (const client of [sp, ap] as const) {
    const receipts = pendingFinalityReceipts.filter(
      (item) => item.client === client,
    );
    if (receipts.length === 0) continue;
    const requiredBlock = receipts.reduce(
      (maximum, item) =>
        item.receipt.blockNumber > maximum ? item.receipt.blockNumber : maximum,
      0n,
    );
    const deadline = Date.now() + 1_800_000;
    let finalizedBlock = 0n;
    while (Date.now() < deadline) {
      finalizedBlock = (await client.getBlock({ blockTag: 'finalized' }))
        .number;
      if (finalizedBlock >= requiredBlock) break;
      await new Promise((done) => setTimeout(done, 10_000));
    }
    if (finalizedBlock < requiredBlock)
      throw new Error(
        `LIVE_FINALITY_TIMEOUT: required block ${requiredBlock.toString()}`,
      );
    for (const item of receipts)
      await record(item.kind, {
        receipt: item.receipt,
        ...(item.expectedStatus === 'reverted'
          ? { expectedStatus: 'reverted' }
          : {}),
        finality: 'FINALIZED',
        finalizedBlock,
      });
  }
}
async function bytecode(
  client: typeof sp | typeof ap,
  address: Address,
  label: string,
) {
  const code = await client.getCode({ address });
  if (!code || code === '0x')
    throw new Error(`LIVE_BYTECODE_MISSING: ${label} ${address}`);
  await record(`${label}-bytecode`, {
    address,
    codeHash: keccak256(code),
    code,
  });
}
async function approve(
  wallet: typeof sw | typeof aw,
  client: typeof sp | typeof ap,
  token: Address,
  spender: Address,
  value: bigint,
  label: string,
) {
  return receipt(
    client,
    await wallet.writeContract({
      address: token,
      abi: erc20,
      functionName: 'approve',
      args: [spender, value],
    }),
    label,
  );
}
async function deployVault(
  wallet: typeof sw | typeof aw,
  client: typeof sp | typeof ap,
  token: Address,
  label: string,
) {
  const artifact = JSON.parse(
    await readFile(
      'contracts/out/FiniteYieldVault.sol/FiniteYieldVault.json',
      'utf8',
    ),
  ) as { bytecode: { object: Hex } };
  const hash = await wallet.deployContract({
    abi: vaultAbi,
    bytecode: artifact.bytecode.object,
    args: [token, deployer.address],
  });
  const deployed = await receipt(client, hash, `${label}-deployment`);
  if (!deployed.contractAddress)
    throw new Error(`LIVE_DEPLOYMENT_ADDRESS_MISSING: ${label}`);
  await bytecode(client, deployed.contractAddress, `${label}-vault`);
  const [asset, owner] = await Promise.all([
    client.readContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'asset',
    }),
    client.readContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'scheduleOwner',
    }),
  ]);
  if (
    asset.toLowerCase() !== token ||
    owner.toLowerCase() !== deployer.address.toLowerCase()
  )
    throw new Error(`LIVE_VAULT_IDENTITY_MISMATCH: ${label}`);
  const scheduleStart = experimentStart + 60n;
  const depositorBefore = await client.readContract({
    address: token,
    abi: erc20,
    functionName: 'balanceOf',
    args: [deployer.address],
  });
  await approve(
    wallet,
    client,
    token,
    deployed.contractAddress,
    yieldBudget + vaultDeposit,
    `${label}-vault-approval`,
  );
  await receipt(
    client,
    await wallet.writeContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'freezeYieldSchedule',
      args: [scheduleStart, scheduleStart + 86400n, yieldBudget],
    }),
    `${label}-schedule-funding`,
  );
  const schedule = await Promise.all([
    client.readContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'scheduleFrozen',
    }),
    client.readContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'yieldStart',
    }),
    client.readContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'yieldEnd',
    }),
    client.readContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'yieldBudget',
    }),
  ]);
  if (
    !schedule[0] ||
    schedule[1] !== scheduleStart ||
    schedule[2] !== scheduleStart + 86_400n ||
    schedule[3] !== yieldBudget
  )
    throw new Error(`LIVE_SCHEDULE_MISMATCH: ${label}`);
  await record(`${label}-frozen-yield-schedule`, {
    vault: deployed.contractAddress,
    frozenBeforeExperimentStart: true,
    scheduleStart: schedule[1],
    scheduleEnd: schedule[2],
    yieldBudget: schedule[3],
    experimentStart,
  });
  await receipt(
    client,
    await wallet.writeContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'deposit',
      args: [vaultDeposit, deployer.address],
    }),
    `${label}-deposit`,
  );
  const shares = await client.readContract({
    address: deployed.contractAddress,
    abi: vaultAbi,
    functionName: 'balanceOf',
    args: [deployer.address],
  });
  const managedAfterDeposit = await client.readContract({
    address: deployed.contractAddress,
    abi: vaultAbi,
    functionName: 'totalAssets',
  });
  if (shares !== vaultDeposit || managedAfterDeposit !== vaultDeposit)
    throw new Error(`LIVE_VAULT_DEPOSIT_MISMATCH: ${label}`);
  await receipt(
    client,
    await wallet.writeContract({
      address: deployed.contractAddress,
      abi: vaultAbi,
      functionName: 'redeem',
      args: [shares, deployer.address, deployer.address],
    }),
    `${label}-withdraw`,
  );
  const [depositorAfter, remainingShares, managedAfterWithdraw, fundedBalance] =
    await Promise.all([
      client.readContract({
        address: token,
        abi: erc20,
        functionName: 'balanceOf',
        args: [deployer.address],
      }),
      client.readContract({
        address: deployed.contractAddress,
        abi: vaultAbi,
        functionName: 'balanceOf',
        args: [deployer.address],
      }),
      client.readContract({
        address: deployed.contractAddress,
        abi: vaultAbi,
        functionName: 'totalAssets',
      }),
      client.readContract({
        address: token,
        abi: erc20,
        functionName: 'balanceOf',
        args: [deployed.contractAddress],
      }),
    ]);
  if (
    remainingShares !== 0n ||
    managedAfterWithdraw !== 0n ||
    fundedBalance !== yieldBudget
  )
    throw new Error(`LIVE_VAULT_WITHDRAW_MISMATCH: ${label}`);
  await record(`${label}-vault-round-trip`, {
    vault: deployed.contractAddress,
    depositAssets: vaultDeposit,
    mintedShares: shares,
    redeemedAssets: vaultDeposit,
    remainingShares,
    depositorBefore,
    depositorAfter,
    fundedYieldRemainingInVault: fundedBalance,
    note:
      label === 'arc'
        ? 'depositor delta also contains Arc native gas because native and ERC-20 USDC alias one balance'
        : 'depositor token delta excludes ETH gas',
  });
  return deployed.contractAddress;
}
type Attestation = {
  message: Hex;
  attestation: Hex;
  status: string;
  decodedMessage?: {
    sourceDomain?: string;
    destinationDomain?: string;
    decodedMessageBody?: { amount?: string; mintRecipient?: string };
  };
};
const hexSlice = (value: Hex, offset: number, length: number): Hex => {
  const start = 2 + offset * 2;
  const end = start + length * 2;
  if (value.length < end) throw new Error('LIVE_ATTESTATION_MESSAGE_TRUNCATED');
  return `0x${value.slice(start, end)}` as Hex;
};
const uintAt = (value: Hex, offset: number, length: number) =>
  BigInt(hexSlice(value, offset, length));
const addressAt = (value: Hex, offset: number) =>
  `0x${hexSlice(value, offset, 32).slice(-40)}`.toLowerCase();
const decodedRecipientMatches = (value: string | undefined) =>
  value !== undefined &&
  `0x${value.slice(-40)}`.toLowerCase() === deployer.address.toLowerCase();
const decodeMessageBindings = (message: Hex) => {
  const messageBodyOffset = 148;
  return {
    sourceDomain: Number(uintAt(message, 4, 4)),
    destinationDomain: Number(uintAt(message, 8, 4)),
    mintRecipient: addressAt(message, messageBodyOffset + 36),
    amount: uintAt(message, messageBodyOffset + 68, 32),
  };
};
async function waitAttestation(sourceDomain: number, burnHash: Hex) {
  const deadline = Date.now() + 7_200_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${iris}/v2/messages/${sourceDomain}?transactionHash=${burnHash}`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const descriptor = await record('cctp-attestation-http', {
      status: response.status,
      body: new TextDecoder().decode(bytes),
    });
    if (response.ok) {
      const body = JSON.parse(new TextDecoder().decode(bytes)) as {
        messages?: Attestation[];
      };
      const found = body.messages?.[0];
      if (found?.status === 'complete' && found.message && found.attestation)
        return { ...found, rawObjectHash: descriptor.objectHash };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('LIVE_ATTESTATION_TIMEOUT');
}
async function bridge(input: {
  sourceDomain: number;
  destinationDomain: number;
  token: Address;
  sourceWallet: typeof sw | typeof aw;
  sourceClient: typeof sp | typeof ap;
  destinationRelayer: typeof sr | typeof ar;
  destinationClient: typeof sp | typeof ap;
  label: string;
  amountUsdcMinor: bigint;
  resumeBurnHash?: Hex;
}) {
  const feeResponse = await fetch(
    `${iris}/v2/burn/USDC/fees/${input.sourceDomain}/${input.destinationDomain}`,
  );
  const feeBody = (await feeResponse.json()) as Array<{
    finalityThreshold: number | string;
    minimumFee: number | string;
  }>;
  await record(`${input.label}-fee-response`, {
    status: feeResponse.status,
    body: feeBody,
  });
  if (!feeResponse.ok)
    throw new Error(`LIVE_FEE_RESPONSE_FAILED: ${input.label}`);
  const standardFee = feeBody.find(
    (item) => Number(item.finalityThreshold) === 2000,
  );
  if (!standardFee || BigInt(standardFee.minimumFee) !== 0n)
    throw new Error(
      `LIVE_STANDARD_FEE_UNSUPPORTED: ${input.label}; update the versioned fee parser before spending`,
    );
  const destinationToken =
    input.destinationDomain === 26 ? ARC_USDC : SEPOLIA_USDC;
  const destinationBefore = await input.destinationClient.readContract({
    address: destinationToken,
    abi: erc20,
    functionName: 'balanceOf',
    args: [deployer.address],
  });
  let burnHash: Hex;
  if (input.resumeBurnHash) {
    const transaction = await input.sourceClient.getTransaction({
      hash: input.resumeBurnHash,
    });
    const decoded = decodeFunctionData({
      abi: messenger,
      data: transaction.input,
    });
    const args = decoded.args;
    if (
      transaction.from.toLowerCase() !== deployer.address.toLowerCase() ||
      transaction.to?.toLowerCase() !== TOKEN_MESSENGER.toLowerCase() ||
      decoded.functionName !== 'depositForBurn' ||
      !args ||
      args[0] !== input.amountUsdcMinor ||
      args[1] !== input.destinationDomain ||
      args[2].toLowerCase() !==
        pad(deployer.address, { size: 32 }).toLowerCase() ||
      args[3].toLowerCase() !== input.token.toLowerCase() ||
      args[4].toLowerCase() !== pad('0x', { size: 32 }).toLowerCase() ||
      args[5] !== 0n ||
      args[6] !== 2000
    )
      throw new Error(`LIVE_RESUME_BURN_MISMATCH: ${input.label}`);
    burnHash = input.resumeBurnHash;
  } else {
    await approve(
      input.sourceWallet,
      input.sourceClient,
      input.token,
      TOKEN_MESSENGER,
      input.amountUsdcMinor,
      `${input.label}-approval`,
    );
    burnHash = await (input.sourceWallet as typeof sw).sendTransaction({
      to: TOKEN_MESSENGER,
      data: encodeFunctionData({
        abi: messenger,
        functionName: 'depositForBurn',
        args: [
          input.amountUsdcMinor,
          input.destinationDomain,
          pad(deployer.address, { size: 32 }),
          input.token,
          pad('0x', { size: 32 }),
          0n,
          2000,
        ],
      }),
    });
  }
  await receipt(input.sourceClient, burnHash, `${input.label}-burn`);
  const attestation = await waitAttestation(input.sourceDomain, burnHash);
  const messageBindings = decodeMessageBindings(attestation.message);
  if (
    Number(attestation.decodedMessage?.sourceDomain) !== input.sourceDomain ||
    Number(attestation.decodedMessage?.destinationDomain) !==
      input.destinationDomain ||
    BigInt(attestation.decodedMessage?.decodedMessageBody?.amount ?? '-1') !==
      input.amountUsdcMinor ||
    !decodedRecipientMatches(
      attestation.decodedMessage?.decodedMessageBody?.mintRecipient,
    ) ||
    messageBindings.sourceDomain !== input.sourceDomain ||
    messageBindings.destinationDomain !== input.destinationDomain ||
    messageBindings.amount !== input.amountUsdcMinor ||
    messageBindings.mintRecipient !== deployer.address.toLowerCase()
  )
    throw new Error(`LIVE_ATTESTATION_BINDING_MISMATCH: ${input.label}`);
  const messageIdentity = keccak256(attestation.message);
  await record(`${input.label}-attestation`, {
    burnHash,
    messageIdentity,
    ...attestation,
  });
  const mintHash = await (
    input.destinationRelayer as typeof sr
  ).sendTransaction({
    to: MESSAGE_TRANSMITTER,
    data: encodeFunctionData({
      abi: transmitter,
      functionName: 'receiveMessage',
      args: [attestation.message, attestation.attestation],
    }),
  });
  await receipt(input.destinationClient, mintHash, `${input.label}-mint`);
  const duplicateMintHash = await (
    input.destinationRelayer as typeof sr
  ).sendTransaction({
    to: MESSAGE_TRANSMITTER,
    data: encodeFunctionData({
      abi: transmitter,
      functionName: 'receiveMessage',
      args: [attestation.message, attestation.attestation],
    }),
    gas: 500_000n,
  });
  await revertedReceipt(
    input.destinationClient,
    duplicateMintHash,
    `${input.label}-duplicate-mint-rejected`,
  );
  const destinationAfter = await input.destinationClient.readContract({
    address: destinationToken,
    abi: erc20,
    functionName: 'balanceOf',
    args: [deployer.address],
  });
  if (destinationAfter - destinationBefore !== input.amountUsdcMinor)
    throw new Error(`LIVE_DESTINATION_AMOUNT_MISMATCH: ${input.label}`);
  await record(`${input.label}-amount-reconciliation`, {
    destinationBefore,
    destinationAfter,
    expected: input.amountUsdcMinor,
    received: destinationAfter - destinationBefore,
    protocolFeeMinor: '0',
  });
  return { burnHash, mintHash, duplicateMintHash, messageIdentity };
}

const [sepoliaChainId, arcChainId] = await Promise.all([
  sp.getChainId(),
  ap.getChainId(),
]);
await record('network-identities', { sepoliaChainId, arcChainId });
if (sepoliaChainId !== 11_155_111 || arcChainId !== 5_042_002)
  throw new Error('LIVE_CHAIN_ID_MISMATCH');
for (const [client, address, label] of [
  [sp, SEPOLIA_USDC, 'sepolia-usdc'],
  [ap, ARC_USDC, 'arc-usdc'],
  [sp, TOKEN_MESSENGER, 'sepolia-token-messenger'],
  [ap, TOKEN_MESSENGER, 'arc-token-messenger'],
  [sp, MESSAGE_TRANSMITTER, 'sepolia-message-transmitter'],
  [ap, MESSAGE_TRANSMITTER, 'arc-message-transmitter'],
] as const)
  await bytecode(client, address, label);
const [sepoliaDecimals, arcDecimals] = await Promise.all([
  sp.readContract({
    address: SEPOLIA_USDC,
    abi: erc20,
    functionName: 'decimals',
  }),
  ap.readContract({
    address: ARC_USDC,
    abi: erc20,
    functionName: 'decimals',
  }),
]);
await record('usdc-decimals', { sepoliaDecimals, arcDecimals });
if (sepoliaDecimals !== 6 || arcDecimals !== 6)
  throw new Error('LIVE_USDC_DECIMALS_MISMATCH');
const [sepoliaRelayerBalance, arcRelayerBalance] = await Promise.all([
  sp.getBalance({ address: relayer.address }),
  ap.getBalance({ address: relayer.address }),
]);
await record('relayer-prefunding', {
  relayer: relayer.address,
  sepoliaNativeBalance: sepoliaRelayerBalance,
  arcNativeBalance: arcRelayerBalance,
  bankrollCreditMinor: '0',
});
if (sepoliaRelayerBalance === 0n || arcRelayerBalance === 0n)
  throw new Error('LIVE_RELAYER_NOT_PREFUNDED');
const sepoliaDeployerUsdc = await sp.readContract({
  address: SEPOLIA_USDC,
  abi: erc20,
  functionName: 'balanceOf',
  args: [deployer.address],
});
const minimumSepoliaUsdc =
  yieldBudget +
  (vaultDeposit > outboundTransferAmount
    ? vaultDeposit
    : outboundTransferAmount);
if (sepoliaDeployerUsdc < minimumSepoliaUsdc)
  throw new Error('LIVE_SEPOLIA_USDC_INSUFFICIENT');
await deployVault(sw, sp, SEPOLIA_USDC, 'sepolia');
const outbound = await bridge({
  sourceDomain: 0,
  destinationDomain: 26,
  token: SEPOLIA_USDC,
  sourceWallet: sw,
  sourceClient: sp,
  destinationRelayer: ar,
  destinationClient: ap,
  label: 'sepolia-to-arc',
  amountUsdcMinor: outboundTransferAmount,
  ...(resumeOutboundBurnHash ? { resumeBurnHash: resumeOutboundBurnHash } : {}),
});
const arcAliasBlock = await ap.getBlockNumber();
const [arcDeployerNative, arcDeployerUsdc] = await Promise.all([
  ap.getBalance({ address: deployer.address, blockNumber: arcAliasBlock }),
  ap.readContract({
    address: ARC_USDC,
    abi: erc20,
    functionName: 'balanceOf',
    args: [deployer.address],
    blockNumber: arcAliasBlock,
  }),
]);
const arcAlias = normalizeArcBalance(
  arcDeployerNative.toString(),
  arcDeployerUsdc.toString(),
);
await record('arc-usdc-alias', {
  blockNumber: arcAliasBlock,
  nativeMinor18: arcDeployerNative,
  erc20Minor6: arcDeployerUsdc,
  ...arcAlias,
});
const minimumArcUsdc =
  yieldBudget +
  (vaultDeposit > returnTransferAmount ? vaultDeposit : returnTransferAmount);
if (arcDeployerUsdc < minimumArcUsdc)
  throw new Error('LIVE_ARC_USDC_INSUFFICIENT_AFTER_OUTBOUND');
await deployVault(aw, ap, ARC_USDC, 'arc');
const inbound = await bridge({
  sourceDomain: 26,
  destinationDomain: 0,
  token: ARC_USDC,
  sourceWallet: aw,
  sourceClient: ap,
  destinationRelayer: sr,
  destinationClient: sp,
  label: 'arc-to-sepolia',
  amountUsdcMinor: returnTransferAmount,
});
await finalizeReceipts();
console.log(
  JSON.stringify({
    status: 'PASS',
    profile: 'CROSS_CHAIN_TESTNET',
    eligibility: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
    outbound,
    inbound,
    evidenceObjects: captured.length,
  }),
);
