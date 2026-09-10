import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { FileObjectArchive, archiveJson } from '@poa/market-data';
import { contentHash } from '@poa/domain';
import { verifyExport } from '@poa/commitments';
import {
  createM6ExportFixture,
  type PublicationEvidence,
} from '../tests/helpers/m6.js';

if (process.env.POA_RUN_LIVE_M6 !== '1') {
  console.log(
    'SKIPPED_TO_VERIFY: set POA_RUN_LIVE_M6=1 with the documented Arc RPC, owner and separate publisher keys',
  );
  process.exit(0);
}

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`M6_LIVE_CONFIGURATION_MISSING: ${name}`);
  return value;
};
const key = (primary: string, fallback: string): Hex => {
  const value = process.env[primary] ?? required(fallback);
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized))
    throw new Error(`M6_LIVE_CONFIGURATION_INVALID: ${primary}`);
  return normalized as Hex;
};
const serializable = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, serializable(item)]),
    );
  return value;
};

const rpc = required('ARC_TESTNET_RPC_URL');
const owner = privateKeyToAccount(
  key('POA_REGISTRY_OWNER_PRIVATE_KEY', 'POA_TESTNET_DEPLOYER_PRIVATE_KEY'),
);
const publisher = privateKeyToAccount(
  key('POA_REGISTRY_PUBLISHER_PRIVATE_KEY', 'POA_TESTNET_RELAYER_PRIVATE_KEY'),
);
if (owner.address.toLowerCase() === publisher.address.toLowerCase())
  throw new Error('M6_KEY_SEPARATION_REQUIRED: owner and publisher differ');
const arc = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' },
  },
});
const publicClient = createPublicClient({ chain: arc, transport: http(rpc) });
const ownerWallet = createWalletClient({
  chain: arc,
  transport: http(rpc),
  account: owner,
});
const publisherWallet = createWalletClient({
  chain: arc,
  transport: http(rpc),
  account: publisher,
});
if ((await publicClient.getChainId()) !== arc.id)
  throw new Error('M6_CHAIN_ID_MISMATCH');

const artifact = JSON.parse(
  await readFile(
    resolve('contracts/out/ProofOfAlphaRegistry.sol/ProofOfAlphaRegistry.json'),
    'utf8',
  ),
) as { abi: Abi; bytecode: { object?: Hex } | Hex };
const bytecode =
  typeof artifact.bytecode === 'string'
    ? artifact.bytecode
    : artifact.bytecode.object;
if (!bytecode || bytecode === '0x')
  throw new Error(
    'M6_REGISTRY_ARTIFACT_MISSING: run forge build --root contracts',
  );

const deterministic = createM6ExportFixture();
const resumeDeploymentHash = process.env.POA_M6_RESUME_DEPLOYMENT_HASH as
  Hex | undefined;
const resumePublicationHash = process.env.POA_M6_RESUME_PUBLICATION_HASH as
  Hex | undefined;
if (Boolean(resumeDeploymentHash) !== Boolean(resumePublicationHash))
  throw new Error('M6_RESUME_REQUIRES_BOTH_TRANSACTION_HASHES');
const deploymentHash =
  resumeDeploymentHash ??
  (await ownerWallet.deployContract({
    abi: artifact.abi,
    bytecode,
    args: [publisher.address],
  }));
const deploymentReceipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentHash,
  confirmations: 1,
  timeout: 180_000,
});
if (
  deploymentReceipt.status !== 'success' ||
  !deploymentReceipt.contractAddress
)
  throw new Error(`M6_REGISTRY_DEPLOYMENT_FAILED: ${deploymentHash}`);
const registry = deploymentReceipt.contractAddress.toLowerCase() as Address;
const registryAbi = parseAbi([
  'function owner() view returns (address)',
  'function isPublisher(address) view returns (bool)',
  'function heads(bytes32) view returns (uint64 lastSequence,uint64 batchCount,bytes32 batchHash)',
  'function computeBatchHash(bytes32,uint64,uint64,bytes32,bytes32,bytes32) pure returns (bytes32)',
  'function publishBatch(bytes32,uint64,uint64,bytes32,bytes32,bytes32,bytes32)',
]);
const publicationHash =
  resumePublicationHash ??
  (await (async () => {
    const request = await publicClient.simulateContract({
      address: registry,
      abi: registryAbi,
      functionName: 'publishBatch',
      args: [
        deterministic.receipt.experimentIdHash as Hex,
        BigInt(deterministic.batch.firstSequence),
        BigInt(deterministic.batch.lastSequence),
        deterministic.batch.root as Hex,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        deterministic.batch.leavesObjectHash as Hex,
        deterministic.batchHash,
      ],
      account: publisher,
    });
    return publisherWallet.writeContract(request.request);
  })());
const publicationReceipt = await publicClient.waitForTransactionReceipt({
  hash: publicationHash,
  confirmations: 1,
  timeout: 180_000,
});
if (publicationReceipt.status !== 'success')
  throw new Error(`M6_REGISTRY_PUBLICATION_FAILED: ${publicationHash}`);

const deadline = Date.now() + 1_800_000;
let finalized = 0n;
while (Date.now() < deadline) {
  finalized = (await publicClient.getBlock({ blockTag: 'finalized' })).number;
  if (finalized >= publicationReceipt.blockNumber) break;
  await new Promise((done) => setTimeout(done, 10_000));
}
if (finalized < publicationReceipt.blockNumber)
  throw new Error('M6_REGISTRY_FINALITY_TIMEOUT');

const publicationBlock = await publicClient.getBlock({
  blockNumber: publicationReceipt.blockNumber,
});
if (publicationBlock.hash !== publicationReceipt.blockHash)
  throw new Error('M6_REGISTRY_PUBLICATION_REORGED');
const code = await publicClient.getCode({
  address: registry,
  blockNumber: publicationReceipt.blockNumber,
});
if (!code || code === '0x') throw new Error('M6_REGISTRY_CODE_MISSING');
const [onchainOwner, publisherAllowed, head, onchainBatchHash] =
  await Promise.all([
    publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'owner',
      blockNumber: publicationReceipt.blockNumber,
    }),
    publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'isPublisher',
      args: [publisher.address],
      blockNumber: publicationReceipt.blockNumber,
    }),
    publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'heads',
      args: [deterministic.receipt.experimentIdHash as Hex],
      blockNumber: publicationReceipt.blockNumber,
    }),
    publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'computeBatchHash',
      args: [
        deterministic.receipt.experimentIdHash as Hex,
        BigInt(deterministic.batch.firstSequence),
        BigInt(deterministic.batch.lastSequence),
        deterministic.batch.root as Hex,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        deterministic.batch.leavesObjectHash as Hex,
      ],
      blockNumber: publicationReceipt.blockNumber,
    }),
  ]);
if (
  onchainOwner.toLowerCase() !== owner.address.toLowerCase() ||
  !publisherAllowed ||
  head[0] !== BigInt(deterministic.batch.lastSequence) ||
  head[1] !== 1n ||
  head[2] !== deterministic.batchHash ||
  onchainBatchHash !== deterministic.batchHash
)
  throw new Error('M6_REGISTRY_PINNED_READ_MISMATCH');

const observedAt = new Date().toISOString();
const publication: PublicationEvidence = {
  registryAddress: registry,
  registryCodeHash: keccak256(code),
  publisherAddress: publisher.address.toLowerCase() as Address,
  transactionHash: publicationHash,
  blockNumber: publicationReceipt.blockNumber.toString(),
  blockHash: publicationReceipt.blockHash,
  blockTimestamp: new Date(Number(publicationBlock.timestamp) * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z'),
  observedAt,
};
const live = createM6ExportFixture(publication);
const replay = verifyExport(live.bundle);
const evidence = {
  schemaVersion: 'proof-of-alpha/m6-registry-evidence/v1',
  resultProvenance: 'CROSS_CHAIN_TESTNET',
  eligibility: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
  checkedAt: observedAt,
  chainId: String(arc.id),
  registry,
  registryCodeHash: publication.registryCodeHash,
  owner: owner.address.toLowerCase(),
  publisher: publisher.address.toLowerCase(),
  keySeparation: {
    ownerAndPublisherDiffer: true,
    agentSigningKeyHeldByService: false,
  },
  deploymentReceipt: serializable(deploymentReceipt),
  publicationReceipt: serializable(publicationReceipt),
  finalizedBlock: finalized.toString(),
  batch: live.batch,
  batchHash: live.batchHash,
  selectedProof: live.bundle.proofs.at(-1),
  replay,
  source: {
    contract: 'contracts/src/ProofOfAlphaRegistry.sol',
    contractSourceHash: contentHash(
      await readFile('contracts/src/ProofOfAlphaRegistry.sol', 'utf8'),
    ),
    officialSources: [
      'https://docs.arc.io/arc/references/connect-to-arc',
      'https://eips.ethereum.org/EIPS/eip-712',
    ],
  },
  timingClaim: 'POST_EXECUTION_INTEGRITY_ONLY',
  limitations: [
    'The committed result is a synthetic replay fixture and cannot become real-capital eligible.',
    'Periodic publication is not independent proof of server receipt before execution.',
  ],
};
const evidenceDirectory = resolve(
  process.env.POA_M6_EVIDENCE_DIR ?? '.local-evidence/m6',
);
const archive = new FileObjectArchive(evidenceDirectory);
const rawDescriptor = await archiveJson(archive, evidence, observedAt);
const publicEvidence = {
  ...evidence,
  rawDescriptor,
  evidenceHash: contentHash(evidence),
  exportHash: contentHash(live.bundle),
};
for (const [file, value] of [
  ['docs/evidence/m6-registry-publication.json', publicEvidence],
  ['docs/evidence/m6-demo-export.json', live.bundle],
] as const) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
console.log(
  JSON.stringify({
    status: 'PASS',
    registry,
    deploymentTransactionHash: deploymentHash,
    publicationTransactionHash: publicationHash,
    finalizedBlock: finalized.toString(),
    batchHash: live.batchHash,
    root: live.batch.root,
    exportHash: contentHash(live.bundle),
    rawObjectHash: rawDescriptor.objectHash,
  }),
);
