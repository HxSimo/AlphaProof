import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { keccak256, toHex, type Hex } from 'viem';

type Archived = {
  hash: Hex;
  kind: string;
  payload: Record<string, any>;
  bytes: number;
};

const fail = (message: string): never => {
  throw new Error(`M5_EVIDENCE_INVALID: ${message}`);
};
const root = resolve(
  process.env.POA_LIVE_EVIDENCE_DIR ?? '.local-evidence/m5',
  'raw/keccak256',
);
const objects: Archived[] = [];
for (const name of (await readdir(root)).sort()) {
  const bytes = await readFile(join(root, name));
  const hash = keccak256(toHex(bytes));
  if (hash !== name) fail(`content hash mismatch for ${name}`);
  const parsed = JSON.parse(bytes.toString('utf8')) as {
    kind?: string;
    payload?: Record<string, any>;
  };
  if (!parsed.kind || !parsed.payload) fail(`malformed object ${name}`);
  objects.push({
    hash,
    kind: parsed.kind!,
    payload: parsed.payload!,
    bytes: bytes.length,
  });
}
const all = (kind: string) => objects.filter((item) => item.kind === kind);
const one = (kind: string) => {
  const matches = all(kind);
  if (matches.length !== 1)
    fail(`expected one ${kind}, found ${matches.length}`);
  return matches[0]!;
};
const finalized = (
  kind: string,
  status: 'success' | 'reverted' = 'success',
) => {
  const item = one(kind);
  const receipt = item.payload.receipt;
  if (
    item.payload.finality !== 'FINALIZED' ||
    receipt?.status !== status ||
    BigInt(item.payload.finalizedBlock) < BigInt(receipt.blockNumber)
  )
    fail(`${kind} is not a finalized ${status} receipt`);
  return item;
};

const identities = one('network-identities').payload;
if (
  identities.sepoliaChainId !== 11_155_111 ||
  identities.arcChainId !== 5_042_002
)
  fail('chain identities');
const decimals = one('usdc-decimals').payload;
if (decimals.sepoliaDecimals !== 6 || decimals.arcDecimals !== 6)
  fail('USDC decimals');
const tokens = {
  sepolia: one('sepolia-usdc-bytecode').payload,
  arc: one('arc-usdc-bytecode').payload,
};
const prefunding = one('relayer-prefunding').payload;
if (
  BigInt(prefunding.sepoliaNativeBalance) <= 0n ||
  BigInt(prefunding.arcNativeBalance) <= 0n ||
  BigInt(prefunding.bankrollCreditMinor) !== 0n
)
  fail('relayer prefunding');

const vaults: Record<string, { address: string; codeHash: string }> = {};
for (const chain of ['sepolia', 'arc']) {
  const deployment = finalized(`${chain}-deployment`);
  const address = deployment.payload.receipt.contractAddress?.toLowerCase();
  if (!address) fail(`${chain} deployment address`);
  const bytecode = all(`${chain}-vault-bytecode`).find(
    (item) => item.payload.address.toLowerCase() === address,
  )?.payload;
  const schedule = all(`${chain}-frozen-yield-schedule`).find(
    (item) => item.payload.vault.toLowerCase() === address,
  )?.payload;
  const roundTrip = all(`${chain}-vault-round-trip`).find(
    (item) => item.payload.vault.toLowerCase() === address,
  )?.payload;
  if (!bytecode || !schedule || !roundTrip)
    fail(`${chain} coherent vault evidence`);
  const verifiedBytecode = bytecode!;
  const verifiedSchedule = schedule!;
  const verifiedRoundTrip = roundTrip!;
  if (
    verifiedSchedule.frozenBeforeExperimentStart !== true ||
    BigInt(verifiedSchedule.scheduleStart) <=
      BigInt(verifiedSchedule.experimentStart) ||
    BigInt(verifiedRoundTrip.depositAssets) !==
      BigInt(verifiedRoundTrip.redeemedAssets) ||
    BigInt(verifiedRoundTrip.remainingShares) !== 0n
  )
    fail(`${chain} vault schedule or round trip`);
  for (const operation of [
    'vault-approval',
    'schedule-funding',
    'deposit',
    'withdraw',
  ])
    finalized(`${chain}-${operation}`);
  vaults[chain] = { address, codeHash: verifiedBytecode.codeHash };
}

const transfers: Record<string, Record<string, string>> = {};
for (const direction of ['sepolia-to-arc', 'arc-to-sepolia']) {
  const burn = finalized(`${direction}-burn`);
  const mint = finalized(`${direction}-mint`);
  const duplicate = finalized(
    `${direction}-duplicate-mint-rejected`,
    'reverted',
  );
  const attestation = one(`${direction}-attestation`).payload;
  const reconciliation = one(`${direction}-amount-reconciliation`).payload;
  const fee = one(`${direction}-fee-response`).payload;
  const standard = fee.body?.find(
    (item: any) => Number(item.finalityThreshold) === 2000,
  );
  if (
    attestation.burnHash !== burn.payload.receipt.transactionHash ||
    keccak256(attestation.message) !== attestation.messageIdentity ||
    BigInt(reconciliation.expected) !== BigInt(reconciliation.received) ||
    BigInt(reconciliation.protocolFeeMinor) !== 0n ||
    fee.status !== 200 ||
    !standard ||
    BigInt(standard.minimumFee) !== 0n
  )
    fail(`${direction} binding, amount, or fee`);
  transfers[direction] = {
    burnHash: burn.payload.receipt.transactionHash,
    mintHash: mint.payload.receipt.transactionHash,
    duplicateMintHash: duplicate.payload.receipt.transactionHash,
    messageIdentity: attestation.messageIdentity,
    amountMinor: reconciliation.received,
  };
}

for (const [chain, chainId] of [
  ['sepolia', 11_155_111],
  ['arc', 5_042_002],
] as const) {
  const archiveRead = one(`${chain}-archive-read`).payload;
  const deployment = one(`${chain}-deployment`).payload;
  if (
    archiveRead.chainId !== chainId ||
    archiveRead.tokenDecimals !== 6 ||
    archiveRead.block.hash !== deployment.receipt.blockHash ||
    BigInt(archiveRead.block.number) !==
      BigInt(deployment.receipt.blockNumber) ||
    archiveRead.vault.toLowerCase() !== vaults[chain]!.address ||
    archiveRead.vaultCodeHash !== vaults[chain]!.codeHash ||
    archiveRead.tokenCodeHash !== tokens[chain].codeHash
  )
    fail(`${chain} pinned archive read`);
}

const index = {
  schemaVersion: 'proof-of-alpha/m5-live-evidence-index/v1',
  provenance: 'CROSS_CHAIN_TESTNET',
  eligibility: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
  sourceReview: {
    reviewedAt: '2026-09-10T00:00:00.000Z',
    sources: [
      'https://ethereum.org/en/developers/docs/networks/',
      'https://eips.ethereum.org/EIPS/eip-4626',
      'https://docs.arc.io/integrate/connect-to-arc',
      'https://docs.arc.io/integrate/infrastructure/bridges',
      'https://developers.circle.com/stablecoins/usdc-contract-addresses',
      'https://developers.circle.com/cctp/concepts/supported-chains-and-domains',
      'https://developers.circle.com/cctp/references/contract-addresses',
      'https://developers.circle.com/cctp/references/contract-interfaces',
      'https://developers.circle.com/cctp/concepts/fees',
      'https://developers.circle.com/cctp/references/technical-guide',
      'https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc',
    ],
  },
  objectCount: objects.length,
  tokens: {
    sepolia: {
      address: tokens.sepolia.address,
      codeHash: tokens.sepolia.codeHash,
      decimals: decimals.sepoliaDecimals,
    },
    arc: {
      address: tokens.arc.address,
      codeHash: tokens.arc.codeHash,
      decimals: decimals.arcDecimals,
    },
  },
  vaults,
  transfers,
  objects: objects.map(({ hash, kind, bytes }) => ({ hash, kind, bytes })),
};
const output = resolve('docs/evidence/m5-live-index.json');
if (process.argv.includes('--write')) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}
const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
console.log(
  JSON.stringify({
    status: 'PASS',
    objectCount: objects.length,
    index: basename(output),
    indexHash: keccak256(toHex(indexBytes)),
  }),
);
