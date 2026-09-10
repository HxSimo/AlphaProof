import { readFile, writeFile } from 'node:fs/promises';
import { keccak256, toHex } from 'viem';

const evidenceFile = 'docs/evidence/m6-registry-publication.json';
const evidenceBytes = await readFile(evidenceFile);
const evidenceHash = keccak256(toHex(evidenceBytes));
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
if (
  ![
    'proof-of-alpha/m6-registry-evidence/v1',
    'proof-of-alpha/m6-registry-evidence/v2',
  ].includes(evidence.schemaVersion) ||
  evidence.chainId !== '5042002' ||
  evidence.eligibility !== 'NOT_ELIGIBLE_FOR_REAL_CAPITAL' ||
  evidence.keySeparation?.ownerAndPublisherDiffer !== true ||
  evidence.keySeparation?.agentSigningKeyHeldByService !== false ||
  evidence.publicationReceipt?.status !== 'success' ||
  BigInt(evidence.finalizedBlock) <
    BigInt(evidence.publicationReceipt.blockNumber) ||
  evidence.batch?.status !== 'CONFIRMED'
)
  throw new Error('M6_PROMOTION_EVIDENCE_INVALID');

const dependencyFile = 'config/v1/dependencies.json';
const networkFile = 'config/v1/networks.json';
const dependencies = JSON.parse(await readFile(dependencyFile, 'utf8'));
const networks = JSON.parse(await readFile(networkFile, 'utf8'));
const dependency = dependencies.dependencies.find(
  (entry: any) => entry.dependencyId === 'registry-arc-testnet',
);
const network = networks.networks.find(
  (entry: any) => entry.networkId === 'arc-testnet',
);
if (!dependency || !network) throw new Error('M6_PROMOTION_TARGET_MISSING');
if (
  network.contracts.commitmentRegistry &&
  network.contracts.commitmentRegistry !== evidence.registry
)
  throw new Error('M6_PROMOTION_REGISTRY_CONFLICT');
network.contracts.commitmentRegistry = evidence.registry;
networks.manifestVersion = '0.6.0';
dependencies.manifestVersion = '0.6.0';
dependency.verification = {
  status: 'VERIFIED_FOR_TESTNET',
  enabled: true,
  checkedAt: evidence.checkedAt,
  checkedBy: 'codex-m6-registry-evidence-verifier',
  requiredEvidence: dependency.verification.requiredEvidence,
  evidence: dependency.verification.requiredEvidence.map((kind: string) => ({
    kind,
    uri: evidenceFile,
    contentHash: evidenceHash,
    observedAt: evidence.checkedAt,
  })),
  blockers: [],
};
await writeFile(networkFile, `${JSON.stringify(networks, null, 2)}\n`);
await writeFile(dependencyFile, `${JSON.stringify(dependencies, null, 2)}\n`);
console.log(
  JSON.stringify({
    status: 'PROMOTED_FOR_TESTNET',
    dependencyId: dependency.dependencyId,
    registry: evidence.registry,
    evidenceHash,
    profileEnabled: false,
    remainingProfileBlocker: 'archive-storage',
  }),
);
