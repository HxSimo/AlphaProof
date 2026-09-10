import { readFile } from 'node:fs/promises';
import {
  createPublicClient,
  defineChain,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { contentHash, rawBytesHash } from '@poa/domain';
import { verifyExport } from '@poa/commitments';
import { FileObjectArchive, readArchivedJson } from '@poa/market-data';

if (process.env.POA_RUN_LIVE_M6_VERIFY !== '1') {
  console.log(
    'SKIPPED_TO_VERIFY: set POA_RUN_LIVE_M6_VERIFY=1 with ARC_TESTNET_RPC_URL to verify retained publication evidence',
  );
  process.exit(0);
}
const rpc = process.env.ARC_TESTNET_RPC_URL;
if (!rpc)
  throw new Error('M6_VERIFY_CONFIGURATION_MISSING: ARC_TESTNET_RPC_URL');
const evidence = JSON.parse(
  await readFile('docs/evidence/m6-registry-publication.json', 'utf8'),
);
const bundle = JSON.parse(
  await readFile('docs/evidence/m6-demo-export.json', 'utf8'),
);
const { rawDescriptor, evidenceHash, exportHash, ...archivedEvidence } =
  evidence;
if (
  ![
    'proof-of-alpha/m6-registry-evidence/v1',
    'proof-of-alpha/m6-registry-evidence/v2',
  ].includes(evidence.schemaVersion) ||
  contentHash(archivedEvidence) !== evidenceHash ||
  contentHash(bundle) !== exportHash
)
  throw new Error('M6_VERIFY_PUBLIC_EVIDENCE_HASH_MISMATCH');
const archive = new FileObjectArchive(
  process.env.POA_M6_EVIDENCE_DIR ?? '.local-evidence/m6',
);
const restored = await readArchivedJson(archive, rawDescriptor);
if (
  contentHash(restored) !== evidenceHash ||
  rawBytesHash(
    await readFile(
      `${process.env.POA_M6_EVIDENCE_DIR ?? '.local-evidence/m6'}/${rawDescriptor.objectKey}`,
    ),
  ) !== rawDescriptor.objectHash
)
  throw new Error('M6_VERIFY_ARCHIVE_RESTORE_MISMATCH');
const replay = verifyExport(bundle);
if (
  replay.batchHash !== evidence.batchHash ||
  replay.root !== evidence.batch.root ||
  replay.transactionHash !== evidence.publicationReceipt.transactionHash
)
  throw new Error('M6_VERIFY_EXPORT_PROOF_MISMATCH');

const arc = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain: arc, transport: http(rpc) });
if ((await client.getChainId()) !== arc.id)
  throw new Error('M6_VERIFY_CHAIN_ID_MISMATCH');
const blockNumber = BigInt(evidence.publicationReceipt.blockNumber);
const [block, code, finalized, transaction, receipt] = await Promise.all([
  client.getBlock({ blockNumber }),
  client.getCode({ address: evidence.registry as Address, blockNumber }),
  client.getBlock({ blockTag: 'finalized' }),
  client.getTransaction({ hash: evidence.publicationReceipt.transactionHash }),
  client.getTransactionReceipt({
    hash: evidence.publicationReceipt.transactionHash,
  }),
]);
if (
  block.hash !== evidence.publicationReceipt.blockHash ||
  receipt.status !== 'success' ||
  receipt.blockHash !== block.hash ||
  transaction.from.toLowerCase() !== evidence.publisher ||
  transaction.to?.toLowerCase() !== evidence.registry ||
  finalized.number < blockNumber ||
  !code ||
  code === '0x' ||
  keccak256(code) !== evidence.registryCodeHash
)
  throw new Error('M6_VERIFY_PUBLICATION_NOT_CANONICAL');
const registryAbi = parseAbi([
  'function owner() view returns (address)',
  'function isPublisher(address) view returns (bool)',
  'function heads(bytes32) view returns (uint64 lastSequence,uint64 batchCount,bytes32 batchHash)',
]);
const [owner, allowed, head] = await Promise.all([
  client.readContract({
    address: evidence.registry as Address,
    abi: registryAbi,
    functionName: 'owner',
    blockNumber,
  }),
  client.readContract({
    address: evidence.registry as Address,
    abi: registryAbi,
    functionName: 'isPublisher',
    args: [evidence.publisher as Address],
    blockNumber,
  }),
  client.readContract({
    address: evidence.registry as Address,
    abi: registryAbi,
    functionName: 'heads',
    args: [bundle.registryReceipts[0].experimentIdHash as Hex],
    blockNumber,
  }),
]);
if (
  owner.toLowerCase() !== evidence.owner ||
  !allowed ||
  head[0].toString() !== evidence.batch.lastSequence ||
  head[1].toString() !== (evidence.batchCount ?? '1') ||
  head[2] !== evidence.batchHash
)
  throw new Error('M6_VERIFY_REGISTRY_STATE_MISMATCH');
console.log(
  JSON.stringify({
    status: 'PASS',
    registry: evidence.registry,
    publicationTransactionHash: receipt.transactionHash,
    publicationBlock: blockNumber.toString(),
    finalizedBlock: finalized.number.toString(),
    codeHash: evidence.registryCodeHash,
    batchHash: replay.batchHash,
    root: replay.root,
    exportHash,
    restoredObjectHash: rawDescriptor.objectHash,
  }),
);
