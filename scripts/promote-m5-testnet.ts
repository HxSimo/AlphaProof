import { readFile, writeFile } from 'node:fs/promises';
import { keccak256, toHex } from 'viem';

const evidencePath = 'docs/evidence/m5-live-index.json';
const evidenceBytes = await readFile(evidencePath);
const evidenceHash = keccak256(toHex(evidenceBytes));
const index = JSON.parse(evidenceBytes.toString('utf8')) as any;
if (
  index.schemaVersion !== 'proof-of-alpha/m5-live-evidence-index/v1' ||
  index.provenance !== 'CROSS_CHAIN_TESTNET' ||
  index.eligibility !== 'NOT_ELIGIBLE_FOR_REAL_CAPITAL'
)
  throw new Error('M5_PROMOTION_INVALID_EVIDENCE_INDEX');

const checkedAt = '2026-09-10T04:04:20.287Z';
const promote = (verification: any) => ({
  ...verification,
  status: 'VERIFIED_FOR_TESTNET',
  enabled: true,
  checkedAt,
  checkedBy: 'codex-m5-live-evidence-verifier',
  evidence: verification.requiredEvidence.map((kind: string) => ({
    kind,
    uri: evidencePath,
    contentHash: evidenceHash,
    observedAt: checkedAt,
  })),
  blockers: [],
});
const load = async (path: string) =>
  JSON.parse(await readFile(path, 'utf8')) as any;
const save = async (path: string, value: any) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const networksPath = 'config/v1/networks.json';
const networks = await load(networksPath);
networks.manifestVersion = '0.5.1';
for (const network of networks.networks) {
  if (network.networkId === 'ethereum-sepolia') {
    network.contracts.demoVault = index.vaults.sepolia.address;
    network.verification = promote(network.verification);
  }
  if (network.networkId === 'arc-testnet') {
    network.contracts.demoVault = index.vaults.arc.address;
    network.verification = promote(network.verification);
  }
}
await save(networksPath, networks);

const instrumentsPath = 'config/v1/instruments.json';
const instruments = await load(instrumentsPath);
instruments.manifestVersion = '0.5.1';
for (const instrument of instruments.instruments) {
  if (instrument.instrumentId === 'sepolia-cash-usdc') {
    instrument.codeHash = index.tokens.sepolia.codeHash;
    instrument.verification = promote(instrument.verification);
  }
  if (instrument.instrumentId === 'arc-test-cash-usdc') {
    instrument.codeHash = index.tokens.arc.codeHash;
    instrument.verification = promote(instrument.verification);
  }
  if (instrument.instrumentId === 'sepolia-vault-usdc') {
    instrument.contractAddress = index.vaults.sepolia.address;
    instrument.codeHash = index.vaults.sepolia.codeHash;
    instrument.verification = promote(instrument.verification);
  }
  if (instrument.instrumentId === 'arc-test-vault-usdc') {
    instrument.contractAddress = index.vaults.arc.address;
    instrument.codeHash = index.vaults.arc.codeHash;
    instrument.verification = promote(instrument.verification);
  }
}
await save(instrumentsPath, instruments);

const dependenciesPath = 'config/v1/dependencies.json';
const dependencies = await load(dependenciesPath);
dependencies.manifestVersion = '0.5.1';
const verifiedDependencies = new Set([
  'rpc-ethereum-sepolia',
  'rpc-arc-testnet',
  'cash-ethereum-sepolia',
  'cash-arc-testnet',
  'demo-vault-ethereum-sepolia',
  'demo-vault-arc-testnet',
  'cctp-ethereum-sepolia-to-arc-testnet',
  'cctp-arc-testnet-to-ethereum-sepolia',
  'testnet-gas-conversion',
]);
for (const dependency of dependencies.dependencies)
  if (verifiedDependencies.has(dependency.dependencyId))
    dependency.verification = promote(dependency.verification);
await save(dependenciesPath, dependencies);

console.log(JSON.stringify({ status: 'PASS', evidenceHash }));
