import { spawnSync } from 'node:child_process';
import { rawBytesHash } from '@poa/domain';

if (process.env.POA_RUN_ETHEREUM_FORK !== '1') {
  console.log(
    'SKIPPED_TO_VERIFY M2 Ethereum fork: set POA_RUN_ETHEREUM_FORK=1 only after filling the pinned variables documented in docs/runbooks/m2-integration-verification.md.',
  );
  process.exit(0);
}
const required = [
  'ETHEREUM_MAINNET_RPC_URL',
  'POA_M2_FORK_BLOCK',
  'POA_M2_FORK_BLOCK_HASH',
  'POA_USDC',
  'POA_USDT',
  'POA_AAVE_POOL',
  'POA_AAVE_USDC_ATOKEN',
  'POA_ERC4626_VAULT',
  'POA_UNISWAP_V3_ROUTER',
  'POA_UNISWAP_USDC_USDT_FEE',
  'POA_USDC_CODE_HASH',
  'POA_USDT_CODE_HASH',
  'POA_AAVE_POOL_CODE_HASH',
  'POA_AAVE_USDC_ATOKEN_CODE_HASH',
  'POA_ERC4626_VAULT_CODE_HASH',
  'POA_UNISWAP_V3_ROUTER_CODE_HASH',
] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length)
  throw new Error(
    `M2 fork gate enabled but variables are missing: ${missing.join(', ')}`,
  );
const rpcUrl = process.env.ETHEREUM_MAINNET_RPC_URL!;
let rpcId = 0;
async function rpc(method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (!response.ok)
    throw new Error(`Archive RPC ${method} returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error || body.result === undefined)
    throw new Error(
      `Archive RPC ${method} failed: ${body.error?.message ?? 'missing result'}`,
    );
  return body.result;
}
if ((await rpc('eth_chainId', [])) !== '0x1')
  throw new Error('Archive RPC is not Ethereum mainnet');
const blockNumber = BigInt(process.env.POA_M2_FORK_BLOCK!).toString(16);
const block = (await rpc('eth_getBlockByNumber', [
  `0x${blockNumber}`,
  false,
])) as { hash?: string } | null;
if (
  !block ||
  block.hash?.toLowerCase() !==
    process.env.POA_M2_FORK_BLOCK_HASH!.toLowerCase()
)
  throw new Error('Pinned block hash does not match archive RPC');
const codeTargets = [
  ['POA_USDC', 'POA_USDC_CODE_HASH'],
  ['POA_USDT', 'POA_USDT_CODE_HASH'],
  ['POA_AAVE_POOL', 'POA_AAVE_POOL_CODE_HASH'],
  ['POA_AAVE_USDC_ATOKEN', 'POA_AAVE_USDC_ATOKEN_CODE_HASH'],
  ['POA_ERC4626_VAULT', 'POA_ERC4626_VAULT_CODE_HASH'],
  ['POA_UNISWAP_V3_ROUTER', 'POA_UNISWAP_V3_ROUTER_CODE_HASH'],
] as const;
for (const [addressName, hashName] of codeTargets) {
  const code = await rpc('eth_getCode', [
    process.env[addressName],
    `0x${blockNumber}`,
  ]);
  if (typeof code !== 'string' || code === '0x')
    throw new Error(`${addressName} has no code at the pinned block`);
  const bytes = Uint8Array.from(Buffer.from(code.slice(2), 'hex'));
  if (rawBytesHash(bytes) !== process.env[hashName]!.toLowerCase())
    throw new Error(`${addressName} bytecode hash differs from ${hashName}`);
}
const run = spawnSync(
  'forge',
  ['test', '--match-path', 'test/fork/M2Fork.t.sol', '-vvv'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);
if (run.error) throw run.error;
if (run.status !== 0) process.exit(run.status ?? 1);
