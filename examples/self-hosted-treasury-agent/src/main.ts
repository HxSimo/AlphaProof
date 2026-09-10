import {
  contentHash,
  PoaError,
  privateKeyToAccount,
  type Hex,
} from '@poa/domain';
import {
  buildAllocation,
  FetchTransport,
  ProofOfAlphaClient,
  signAction,
} from '@poa/sdk';

const privateKey = process.env.POA_AGENT_PRIVATE_KEY as Hex | undefined;
if (!privateKey)
  throw new PoaError(
    'CONFIG_INVALID',
    'POA_AGENT_PRIVATE_KEY is required by this self-hosted example and is never sent to the API',
  );
const account = privateKeyToAccount(privateKey);
const client = new ProofOfAlphaClient(
  new FetchTransport(
    process.env.POA_API_URL ?? 'http://localhost:3001',
    process.env.POA_OPERATOR_TOKEN,
  ),
);
const agentId = process.env.POA_AGENT_ID ?? 'example-agent';
const versionId = process.env.POA_AGENT_VERSION_ID ?? 'example-agent-v1';
const experimentId = process.env.POA_EXPERIMENT_ID ?? 'example-experiment';
const declaredVersionHash = contentHash({
  example: 'capital-dependent-treasury',
  version: '1.0.0',
});

if (process.env.POA_BOOTSTRAP_EXPERIMENT === '1') {
  await client.createAgent({
    agentId,
    displayName: 'Self-hosted treasury example',
  });
  await client.createAgentVersion(agentId, {
    versionId,
    declaredVersionHash,
    decisionKeys: [account.address.toLowerCase()],
    declaredHashes: {
      code: declaredVersionHash,
      prompt: null,
      model: null,
      parameters: null,
      memory: null,
      data: null,
    },
  });
  await client.createExperiment({
    experimentId,
    agentId,
    versionId,
    profileId: 'synthetic-m3-local',
  });
  await client.startExperiment(experimentId);
}

const policy = await client.getPolicy(experimentId);
const portfolios = (await client.getPortfolios(experimentId)) as {
  scenarios: {
    scenarioId: string;
    portfolio: { initialValueUsdcMinor: string; version: string };
  }[];
};
await client.getInstruments(experimentId);
const scenario = process.env.POA_SCENARIO_ID
  ? portfolios.scenarios.find(
      (item) => item.scenarioId === process.env.POA_SCENARIO_ID,
    )
  : portfolios.scenarios[0];
if (!scenario)
  throw new PoaError('POLICY_VIOLATION', 'Requested scenario is absent');
// The example visibly varies its target by capital and contains no hidden model call.
const aaveWeight =
  BigInt(scenario.portfolio.initialValueUsdcMinor) >= 100_000_000_000n
    ? 3000
    : 4000;
const allocation = buildAllocation([
  {
    networkId: 'ethereum-mainnet',
    instrumentId: 'eth-aave-usdc',
    weightBps: aaveWeight,
  },
  {
    networkId: 'ethereum-mainnet',
    instrumentId: 'eth-cash-usdc',
    weightBps: 10000 - aaveWeight,
  },
]);
const intent = {
  schemaVersion: 'proof-of-alpha/action-intent/v1' as const,
  experimentId,
  capitalScenarioId: scenario.scenarioId,
  agentId,
  declaredVersionHash,
  policyHash: contentHash(policy),
  transferPolicyHash: policy.transferPolicyHash,
  networkProfile: policy.networkProfile,
  nonce: process.env.POA_ACTION_NONCE ?? '1',
  expectedPortfolioVersion: scenario.portfolio.version,
  validUntil: String(Math.floor(Date.now() / 1000) + 120),
  targetAllocation: allocation,
  maxCostUsdcMinor: '20000000',
  maxTransferUsdcMinor: '0',
  maxSlippageBps: 10,
};
const envelope = await signAction(
  intent,
  policy,
  process.env.POA_IDEMPOTENCY_KEY ?? 'example-intent-0001',
  {
    getAddress: async () => account.address,
    signTypedData: (data) => account.signTypedData(data),
  },
);
const result = await client.submit(experimentId, envelope, intent.policyHash);
console.log(
  JSON.stringify({
    actionId: result.acknowledgment.actionId,
    status: result.acknowledgment.status,
    signer: account.address,
    privateKeySent: false,
  }),
);
