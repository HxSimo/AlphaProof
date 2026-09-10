import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  decodeFunctionData,
  http,
  keccak256,
  parseAbi,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { contentHash, PoaError } from '@poa/domain';
import { loadBundle, requireDependency } from '@poa/config';
import { DemoSession, RegistryPublicationReceipt } from '@poa/schemas';
import { experimentIdHash } from '@poa/commitments';
import {
  archiveJson,
  FileObjectArchive,
  readArchivedJson,
} from '@poa/market-data';
import { createPool, M6Repository, OperationsRepository } from '@poa/storage';
import { replayDemoSession } from './lib/session-replay.js';

async function main() {
  const verifyOnly = process.argv.includes('--verify');
  if (
    process.env[
      verifyOnly ? 'POA_RUN_LIVE_M7_VERIFY' : 'POA_RUN_LIVE_M7_PUBLICATION'
    ] !== '1'
  ) {
    console.log(
      'SKIPPED_TO_VERIFY: explicit M7 ' +
        (verifyOnly ? 'read-only verification' : 'testnet publication') +
        ' gate is closed',
    );
    return;
  }
  const file = process.env.POA_DEMO_OUTPUT ?? 'docs/evidence/m7-session.json';
  const publishedFile = file.replace(/\.json$/, '-published.json');
  const session = DemoSession.parse(JSON.parse(readFileSync(file, 'utf8')));
  await replayDemoSession(session);
  const config = loadBundle();
  requireDependency(config.bundle, 'registry-arc-testnet');
  const known = JSON.parse(
    readFileSync('docs/evidence/m6-registry-publication.json', 'utf8'),
  );
  const rpc = process.env.ARC_TESTNET_RPC_URL;
  if (!rpc)
    throw new PoaError('CONFIG_INVALID', 'ARC_TESTNET_RPC_URL is required');
  const chain = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const client = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 15000, retryCount: 1 }),
  });
  const registry = known.registry as Hex;
  const abi = parseAbi([
    'function isPublisher(address) view returns (bool)',
    'function heads(bytes32) view returns (uint64 lastSequence,uint64 batchCount,bytes32 batchHash)',
    'function publishBatch(bytes32,uint64,uint64,bytes32,bytes32,bytes32,bytes32)',
  ]);
  const id = experimentIdHash(session.policy.experimentId);
  const batch = session.commitment.batch;
  const args = [
    id,
    BigInt(batch.firstSequence),
    BigInt(batch.lastSequence),
    batch.root as Hex,
    ('0x' + '0'.repeat(64)) as Hex,
    batch.leavesObjectHash as Hex,
    session.commitment.batchHash as Hex,
  ] as const;
  const [chainId, code] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: registry, blockTag: 'finalized' }),
  ]);
  if (
    chainId !== 5042002 ||
    !code ||
    keccak256(code) !== known.registryCodeHash
  )
    throw new PoaError(
      'ENVIRONMENT_MISMATCH',
      'Registry chain or finalized bytecode differs from M6',
    );
  const txFile = file + '.transaction.json';
  let transactionHash: Hex | undefined = existsSync(txFile)
    ? JSON.parse(readFileSync(txFile, 'utf8')).transactionHash
    : undefined;
  let publisherAddress = known.publisher as Hex;
  if (!transactionHash) {
    if (verifyOnly)
      throw new PoaError(
        'EXPORT_INCOMPLETE',
        'No retained M7 publication transaction',
      );
    const secret =
      process.env.POA_REGISTRY_PUBLISHER_PRIVATE_KEY ??
      process.env.POA_TESTNET_RELAYER_PRIVATE_KEY;
    if (!secret)
      throw new PoaError(
        'CONFIG_INVALID',
        'Dedicated testnet publisher key is required',
      );
    const normalized = secret.startsWith('0x') ? secret : '0x' + secret;
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized))
      throw new PoaError('CONFIG_INVALID', 'Invalid testnet publisher key');
    const publisher = privateKeyToAccount(normalized as Hex);
    publisherAddress = publisher.address.toLowerCase() as Hex;
    if (
      session.agentVersion.decisionKeys.includes(publisherAddress) ||
      publisherAddress !== known.publisher
    )
      throw new PoaError(
        'INVALID_SIGNATURE',
        'Publisher must be the retained separate M6 account',
      );
    const [allowed, head] = await Promise.all([
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
        args: [id],
      }),
    ]);
    if (!allowed || head[0] !== 0n)
      throw new PoaError(
        'BATCH_CONTINUITY',
        'Publication already exists or publisher is unauthorized; recover the existing transaction instead of republishing',
      );
    const simulation = await client.simulateContract({
      account: publisher,
      address: registry,
      abi,
      functionName: 'publishBatch',
      args,
    });
    const estimate = await client.estimateContractGas({
      account: publisher,
      address: registry,
      abi,
      functionName: 'publishBatch',
      args,
    });
    if (estimate > 1_000_000n)
      throw new PoaError(
        'LIMIT_EXCEEDED',
        'Publication gas exceeds the frozen demo bound',
      );
    transactionHash = await createWalletClient({
      chain,
      account: publisher,
      transport: http(rpc),
    }).writeContract(simulation.request);
    writeFileSync(
      txFile,
      JSON.stringify(
        {
          sessionHash: contentHash(session),
          transactionHash,
          publisherAddress,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    console.log(
      JSON.stringify({ status: 'BROADCAST_RETAINED', transactionHash }),
    );
  }
  const txRecord = JSON.parse(readFileSync(txFile, 'utf8'));
  if (txRecord.sessionHash !== contentHash(session))
    throw new PoaError(
      'PROVENANCE_SPLICE',
      'Resume transaction belongs to another export',
    );
  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    timeout: 120000,
  });
  const transaction = await client.getTransaction({ hash: transactionHash });
  const decoded = decodeFunctionData({ abi, data: transaction.input });
  if (
    receipt.status !== 'success' ||
    transaction.to?.toLowerCase() !== registry ||
    transaction.from.toLowerCase() !== publisherAddress ||
    decoded.functionName !== 'publishBatch' ||
    JSON.stringify(decoded.args, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ) !==
      JSON.stringify(args, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  )
    throw new PoaError(
      'COMMITMENT_INVALID',
      'Actual publication receipt or calldata differs',
    );
  let finalized = await client.getBlock({ blockTag: 'finalized' });
  for (
    let attempt = 0;
    finalized.number < receipt.blockNumber && attempt < 30;
    attempt++
  ) {
    await setTimeout(2000);
    finalized = await client.getBlock({ blockTag: 'finalized' });
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (
    finalized.number < receipt.blockNumber ||
    block.hash !== receipt.blockHash
  )
    throw new PoaError(
      'PUBLICATION_REORGED',
      'Publication is not finalized in the canonical chain',
    );
  const head = await client.readContract({
    address: registry,
    abi,
    functionName: 'heads',
    args: [id],
    blockNumber: finalized.number,
  });
  if (
    head[0] !== BigInt(batch.lastSequence) ||
    head[1] !== 1n ||
    head[2] !== session.commitment.batchHash
  )
    throw new PoaError('BATCH_CONTINUITY', 'Finalized registry head differs');
  if (
    verifyOnly &&
    (!existsSync(publishedFile) ||
      !existsSync('docs/evidence/m7-registry-publication.json'))
  )
    throw new PoaError(
      'EXPORT_INCOMPLETE',
      'Read-only verification requires the retained published revision and archive descriptor',
    );
  const old = existsSync(publishedFile)
    ? DemoSession.parse(JSON.parse(readFileSync(publishedFile, 'utf8')))
    : null;
  const observedAt =
    old?.commitment.registryReceipt?.observedAt ?? new Date().toISOString();
  const publication = RegistryPublicationReceipt.parse({
    schemaVersion: 'proof-of-alpha/registry-publication-receipt/v1',
    batchId: batch.batchId,
    batchHash: session.commitment.batchHash,
    experimentIdHash: id,
    registryNetworkId: 'arc-testnet',
    chainId: '5042002',
    registryAddress: registry,
    registryCodeHash: known.registryCodeHash,
    publisherAddress,
    transactionHash,
    block: {
      networkId: 'arc-testnet',
      environment: 'testnet',
      chainId: '5042002',
      number: receipt.blockNumber.toString(),
      hash: receipt.blockHash,
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      finality: 'FINALIZED',
    },
    observedAt,
    status: 'CONFIRMED',
  });
  const published = DemoSession.parse({
    ...session,
    commitment: { ...session.commitment, registryReceipt: publication },
    limitations: [
      ...session.limitations,
      'This immutable published revision attaches an actual finalized Arc Testnet receipt. The prior unpublished export is retained.',
    ],
  });
  await replayDemoSession(published);
  if (old && contentHash(old) !== contentHash(published))
    throw new PoaError(
      'OPERATION_CONFLICT',
      'Retained published revision differs',
    );
  if (!old) {
    const archive = new FileObjectArchive('.local-evidence/m7');
    const payload = JSON.parse(
      JSON.stringify(
        {
          chainId,
          code,
          transaction,
          receipt,
          block,
          finalized,
          head,
          officialSource: 'https://docs.arc.io/arc/references/connect-to-arc',
          priorDeploymentEvidenceHash: contentHash(known),
        },
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      ),
    );
    const raw = await archiveJson(archive, payload, observedAt);
    writeFileSync(publishedFile, JSON.stringify(published, null, 2) + '\n', {
      flag: 'wx',
    });
    mkdirSync('docs/evidence', { recursive: true });
    writeFileSync(
      'docs/evidence/m7-registry-publication.json',
      JSON.stringify(
        {
          schemaVersion: 'proof-of-alpha/m7-registry-evidence/v1',
          observedAt,
          sessionHash: contentHash(session),
          publishedSessionHash: contentHash(published),
          publication,
          raw,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
  }
  const retainedEvidence = JSON.parse(
    readFileSync('docs/evidence/m7-registry-publication.json', 'utf8'),
  );
  const archived = (await readArchivedJson(
    new FileObjectArchive('.local-evidence/m7'),
    retainedEvidence.raw,
  )) as any;
  if (
    retainedEvidence.publishedSessionHash !== contentHash(published) ||
    contentHash(retainedEvidence.publication) !== contentHash(publication) ||
    archived.receipt.transactionHash !== transactionHash ||
    archived.receipt.blockHash !== block.hash ||
    archived.transaction.input !== transaction.input
  )
    throw new PoaError(
      'ARCHIVE_INTEGRITY',
      'Retained publication archive does not match canonical chain evidence',
    );
  if (!verifyOnly) {
    const run = JSON.parse(readFileSync(file + '.run.json', 'utf8'));
    if (!/^poa_m7_demo_[0-9_]+$/.test(run.databaseSchema))
      throw new PoaError('CONFIG_INVALID', 'Unexpected retained schema');
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('options', '-c search_path=' + run.databaseSchema);
    const pool = createPool(url.toString());
    try {
      await new M6Repository(pool).recordPublication(publication);
      await new OperationsRepository(pool).saveDemoSession(published);
    } finally {
      await pool.end();
    }
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      registry,
      transactionHash,
      block: receipt.blockNumber.toString(),
      root: batch.root,
      publishedSessionHash: contentHash(published),
      verificationMode: verifyOnly ? 'READ_ONLY_LIVE' : 'PUBLISHED_TESTNET',
    }),
  );
}
try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'FAILED',
      code: error instanceof PoaError ? error.code : 'M7_PUBLICATION_FAILED',
      message:
        error instanceof PoaError
          ? error.message
          : 'RPC, archive or publication verification failed; inspect retained transaction before retry',
    }),
  );
  process.exitCode = 1;
}
