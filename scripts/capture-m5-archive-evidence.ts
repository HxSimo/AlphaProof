import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  createPublicClient,
  defineChain,
  http,
  keccak256,
  parseAbi,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';
import { FileObjectArchive, archiveJson } from '@poa/market-data';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`M5_ARCHIVE_CONFIGURATION_MISSING: ${name}`);
  return value;
};
const evidenceDir = resolve(required('POA_LIVE_EVIDENCE_DIR'));
const rawDir = join(evidenceDir, 'raw/keccak256');
const values = await Promise.all(
  (await readdir(rawDir)).map(async (name) =>
    JSON.parse(await readFile(join(rawDir, name), 'utf8')),
  ),
);
const deployment = (chain: string) => {
  const matches = values.filter(
    (value) => value.kind === `${chain}-deployment`,
  );
  if (matches.length !== 1)
    throw new Error(`M5_ARCHIVE_DEPLOYMENT_AMBIGUOUS: ${chain}`);
  return matches[0].payload;
};
const serializable = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializable(item)]),
    );
  return value;
};
const archive = new FileObjectArchive(evidenceDir);
const erc20 = parseAbi(['function decimals() view returns (uint8)']);
const arc = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [required('ARC_TESTNET_RPC_URL')] } },
});
const inputs = [
  {
    label: 'sepolia',
    client: createPublicClient({
      chain: sepolia,
      transport: http(required('ETHEREUM_SEPOLIA_RPC_URL')),
    }),
    token: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' as Address,
  },
  {
    label: 'arc',
    client: createPublicClient({
      chain: arc,
      transport: http(required('ARC_TESTNET_RPC_URL')),
    }),
    token: '0x3600000000000000000000000000000000000000' as Address,
  },
] as const;

const captured = [];
for (const input of inputs) {
  const proof = deployment(input.label);
  const blockNumber = BigInt(proof.receipt.blockNumber);
  if (
    proof.finality !== 'FINALIZED' ||
    BigInt(proof.finalizedBlock) < blockNumber
  )
    throw new Error(`M5_ARCHIVE_DEPLOYMENT_NOT_FINAL: ${input.label}`);
  const vault = proof.receipt.contractAddress as Address;
  const [block, tokenCode, vaultCode, decimals] = await Promise.all([
    input.client.getBlock({ blockNumber }),
    input.client.getCode({ address: input.token, blockNumber }),
    input.client.getCode({ address: vault, blockNumber }),
    input.client.readContract({
      address: input.token,
      abi: erc20,
      functionName: 'decimals',
      blockNumber,
    }),
  ]);
  if (
    block.hash !== proof.receipt.blockHash ||
    !tokenCode ||
    tokenCode === '0x' ||
    !vaultCode ||
    vaultCode === '0x' ||
    decimals !== 6
  )
    throw new Error(`M5_ARCHIVE_READ_MISMATCH: ${input.label}`);
  captured.push(
    await archiveJson(
      archive,
      {
        kind: `${input.label}-archive-read`,
        payload: serializable({
          chainId: await input.client.getChainId(),
          block,
          token: input.token,
          tokenCodeHash: keccak256(tokenCode),
          tokenDecimals: decimals,
          vault,
          vaultCodeHash: keccak256(vaultCode),
        }),
      },
      new Date().toISOString(),
    ),
  );
}
console.log(JSON.stringify({ status: 'PASS', captured }));
