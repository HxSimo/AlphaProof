import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { contentHash } from '@poa/domain';
import { verifyExport } from '@poa/commitments';
import { FileObjectArchive, archiveJson } from '@poa/market-data';
import {
  createM6CorrectedExportFixture,
  type PublicationEvidence,
} from '../tests/helpers/m6.js';

if (process.env.POA_RUN_LIVE_M6_CORRECTION !== '1') {
  console.log(
    'SKIPPED_TO_VERIFY: set POA_RUN_LIVE_M6_CORRECTION=1 to append the canonical correction batch',
  );
  process.exit(0);
}
const rpc = process.env.ARC_TESTNET_RPC_URL;
const privateKey =
  process.env.POA_REGISTRY_PUBLISHER_PRIVATE_KEY ??
  process.env.POA_TESTNET_RELAYER_PRIVATE_KEY;
if (!rpc || !privateKey) throw new Error('M6_CORRECTION_CONFIGURATION_MISSING');
const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(normalized))
  throw new Error('M6_CORRECTION_PUBLISHER_KEY_INVALID');
const publisher = privateKeyToAccount(normalized as Hex);
const priorEvidence = JSON.parse(
  await readFile('docs/evidence/m6-registry-publication.json', 'utf8'),
);
const priorExport = JSON.parse(
  await readFile('docs/evidence/m6-demo-export.json', 'utf8'),
);
const firstPublication: PublicationEvidence = {
  registryAddress: priorEvidence.registry,
  registryCodeHash: priorEvidence.registryCodeHash,
  publisherAddress: priorEvidence.publisher,
  transactionHash: priorEvidence.publicationReceipt.transactionHash,
  blockNumber: priorEvidence.publicationReceipt.blockNumber,
  blockHash: priorEvidence.publicationReceipt.blockHash,
  blockTimestamp: priorExport.registryReceipts[0].block.timestamp,
  observedAt: priorEvidence.checkedAt,
};
const correctionOccurredAt = new Date().toISOString();
const deterministic = createM6CorrectedExportFixture(
  undefined,
  firstPublication,
  correctionOccurredAt,
);
if (
  publisher.address.toLowerCase() !== priorEvidence.publisher ||
  deterministic.first.batchHash !== priorEvidence.batchHash
)
  throw new Error('M6_CORRECTION_PREDECESSOR_MISMATCH');

const arc = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain: arc, transport: http(rpc) });
const wallet = createWalletClient({
  chain: arc,
  transport: http(rpc),
  account: publisher,
});
const registry = priorEvidence.registry as Address;
const abi = parseAbi([
  'function isPublisher(address) view returns (bool)',
  'function heads(bytes32) view returns (uint64 lastSequence,uint64 batchCount,bytes32 batchHash)',
  'function publishBatch(bytes32,uint64,uint64,bytes32,bytes32,bytes32,bytes32)',
]);
const [allowed, priorHead] = await Promise.all([
  client.readContract({
    address: registry,
    abi,
    functionName: 'isPublisher',
    args: [publisher.address],
  }),
  client.readContract({
    address: registry,
    abi,
    functionName: 'heads',
    args: [deterministic.receipt.experimentIdHash as Hex],
  }),
]);
if (
  !allowed ||
  priorHead[0] !== 15n ||
  priorHead[1] !== 1n ||
  priorHead[2] !== deterministic.first.batchHash
)
  throw new Error('M6_CORRECTION_ONCHAIN_PREDECESSOR_MISMATCH');
const resumeHash = process.env.POA_M6_CORRECTION_TX_HASH as Hex | undefined;
const transactionHash =
  resumeHash ??
  (await (async () => {
    const simulation = await client.simulateContract({
      address: registry,
      abi,
      functionName: 'publishBatch',
      args: [
        deterministic.receipt.experimentIdHash as Hex,
        16n,
        16n,
        deterministic.batch.root as Hex,
        deterministic.first.batchHash,
        deterministic.batch.leavesObjectHash as Hex,
        deterministic.batchHash,
      ],
      account: publisher,
    });
    return wallet.writeContract(simulation.request);
  })());
const receipt = await client.waitForTransactionReceipt({
  hash: transactionHash,
  confirmations: 1,
  timeout: 180_000,
});
if (receipt.status !== 'success')
  throw new Error(`M6_CORRECTION_PUBLICATION_FAILED: ${transactionHash}`);

const deadline = Date.now() + 1_800_000;
let finalized = 0n;
while (Date.now() < deadline) {
  finalized = (await client.getBlock({ blockTag: 'finalized' })).number;
  if (finalized >= receipt.blockNumber) break;
  await new Promise((done) => setTimeout(done, 10_000));
}
if (finalized < receipt.blockNumber)
  throw new Error('M6_CORRECTION_FINALITY_TIMEOUT');

const publicationBlock = await client.getBlock({
  blockNumber: receipt.blockNumber,
});
if (publicationBlock.hash !== receipt.blockHash)
  throw new Error('M6_CORRECTION_PUBLICATION_REORGED');
const code = await client.getCode({
  address: registry,
  blockNumber: receipt.blockNumber,
});
if (!code || code === '0x') throw new Error('M6_CORRECTION_CODE_MISSING');
const registryCodeHash = keccak256(code);
const finalHead = await client.readContract({
  address: registry,
  abi,
  functionName: 'heads',
  args: [deterministic.receipt.experimentIdHash as Hex],
  blockNumber: receipt.blockNumber,
});
if (
  registryCodeHash !== priorEvidence.registryCodeHash ||
  finalHead[0] !== 16n ||
  finalHead[1] !== 2n ||
  finalHead[2] !== deterministic.batchHash
)
  throw new Error('M6_CORRECTION_PINNED_READ_MISMATCH');

const observedAt = new Date().toISOString();
const publication: PublicationEvidence = {
  registryAddress: registry.toLowerCase() as Address,
  registryCodeHash,
  publisherAddress: publisher.address.toLowerCase() as Address,
  transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  blockHash: receipt.blockHash,
  blockTimestamp: new Date(Number(publicationBlock.timestamp) * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z'),
  observedAt,
};
const live = createM6CorrectedExportFixture(
  publication,
  firstPublication,
  correctionOccurredAt,
);
if (live.batchHash !== deterministic.batchHash)
  throw new Error('M6_CORRECTION_NONDETERMINISTIC_BATCH');
const replay = verifyExport(live.bundle);

const serializable = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, serializable(item)]),
    );
  return value;
};
const evidence = {
  schemaVersion: 'proof-of-alpha/m6-registry-evidence/v2',
  resultProvenance: 'CROSS_CHAIN_TESTNET',
  eligibility: 'NOT_ELIGIBLE_FOR_REAL_CAPITAL',
  checkedAt: observedAt,
  chainId: String(arc.id),
  registry: registry.toLowerCase(),
  registryCodeHash,
  owner: priorEvidence.owner,
  publisher: publisher.address.toLowerCase(),
  keySeparation: {
    ownerAndPublisherDiffer: true,
    agentSigningKeyHeldByService: false,
  },
  deploymentReceipt: priorEvidence.deploymentReceipt,
  priorPublicationReceipt: priorEvidence.publicationReceipt,
  publicationReceipt: serializable(receipt),
  finalizedBlock: finalized.toString(),
  batchCount: '2',
  batch: live.batch,
  batchHash: live.batchHash,
  batches: live.bundle.batches,
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
    'The second batch is an append-only correction; the original report and first commitment remain retained and independently verifiable.',
  ],
};

const copyIfAbsent = async (source: string, destination: string) => {
  try {
    await access(destination, constants.F_OK);
  } catch {
    await copyFile(source, destination);
  }
};
await copyIfAbsent(
  'docs/evidence/m6-registry-publication.json',
  'docs/evidence/m6-registry-publication-v1.json',
);
await copyIfAbsent(
  'docs/evidence/m6-demo-export.json',
  'docs/evidence/m6-demo-export-v1.json',
);

const evidenceDirectory =
  process.env.POA_M6_EVIDENCE_DIR ?? '.local-evidence/m6';
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
    registry: evidence.registry,
    publicationTransactionHash: transactionHash,
    finalizedBlock: finalized.toString(),
    batchCount: evidence.batchCount,
    batchHash: live.batchHash,
    root: live.batch.root,
    exportHash: contentHash(live.bundle),
    rawObjectHash: rawDescriptor.objectHash,
  }),
);
