import {
  canonicalJson,
  contentHash,
  hashTypedData,
  hexToString,
  PoaError,
  recoverTypedDataAddress,
  stringToHex,
  type Address,
  type Hex,
} from '@poa/domain';
import {
  ActionEnvelope,
  ActionIntent,
  Allocation,
  ExperimentPolicy,
  type ActionEnvelopeData,
  type ActionIntentData,
  type ExperimentPolicyData,
} from '@poa/schemas';

export const ACTION_TYPES = {
  ActionIntent: [
    { name: 'experimentId', type: 'string' },
    { name: 'capitalScenarioId', type: 'string' },
    { name: 'agentId', type: 'string' },
    { name: 'declaredVersionHash', type: 'bytes32' },
    { name: 'policyHash', type: 'bytes32' },
    { name: 'transferPolicyHash', type: 'bytes32' },
    { name: 'networkProfile', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expectedPortfolioVersion', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'allocationHash', type: 'bytes32' },
    { name: 'maxCostUsdcMinor', type: 'uint256' },
    { name: 'maxTransferUsdcMinor', type: 'uint256' },
    { name: 'maxSlippageBps', type: 'uint16' },
  ],
} as const;

export function buildAllocation(
  entries: { networkId: string; instrumentId: string; weightBps: number }[],
) {
  return Allocation.parse(
    [...entries].sort((a, b) =>
      `${a.networkId}/${a.instrumentId}`.localeCompare(
        `${b.networkId}/${b.instrumentId}`,
      ),
    ),
  );
}

export function actionTypedData(
  intentInput: ActionIntentData,
  policyInput: ExperimentPolicyData,
) {
  const intent = ActionIntent.parse(intentInput);
  const policy = ExperimentPolicy.parse(policyInput);
  return {
    domain: {
      name: policy.signingDomain.name,
      version: policy.signingDomain.version,
      chainId: BigInt(policy.signingDomain.chainId),
      verifyingContract: policy.signingDomain.verifyingContract as Address,
    },
    types: ACTION_TYPES,
    primaryType: 'ActionIntent' as const,
    message: {
      experimentId: intent.experimentId,
      capitalScenarioId: intent.capitalScenarioId,
      agentId: intent.agentId,
      declaredVersionHash: intent.declaredVersionHash as Hex,
      policyHash: intent.policyHash as Hex,
      transferPolicyHash: intent.transferPolicyHash as Hex,
      networkProfile: intent.networkProfile,
      nonce: BigInt(intent.nonce),
      expectedPortfolioVersion: BigInt(intent.expectedPortfolioVersion),
      validUntil: BigInt(intent.validUntil),
      allocationHash: contentHash(intent.targetAllocation),
      maxCostUsdcMinor: BigInt(intent.maxCostUsdcMinor),
      maxTransferUsdcMinor: BigInt(intent.maxTransferUsdcMinor),
      maxSlippageBps: intent.maxSlippageBps,
    },
  };
}

export function actionTypedDataHash(
  intent: ActionIntentData,
  policy: ExperimentPolicyData,
) {
  return hashTypedData(actionTypedData(intent, policy));
}

export async function recoverActionSigner(
  intent: ActionIntentData,
  policy: ExperimentPolicyData,
  signature: string,
) {
  try {
    return (
      await recoverTypedDataAddress({
        ...actionTypedData(intent, policy),
        signature: signature as Hex,
      })
    ).toLowerCase() as Address;
  } catch {
    throw new PoaError('INVALID_SIGNATURE', 'Invalid EIP-712 signature');
  }
}

export function canonicalSignedBytes(
  intent: ActionIntentData,
  policy: ExperimentPolicyData,
) {
  const typed = actionTypedData(intent, policy);
  const wire = {
    domain: {
      ...typed.domain,
      chainId: typed.domain.chainId.toString(),
    },
    types: typed.types,
    primaryType: typed.primaryType,
    message: {
      ...typed.message,
      nonce: typed.message.nonce.toString(),
      expectedPortfolioVersion:
        typed.message.expectedPortfolioVersion.toString(),
      validUntil: typed.message.validUntil.toString(),
      maxCostUsdcMinor: typed.message.maxCostUsdcMinor.toString(),
      maxTransferUsdcMinor: typed.message.maxTransferUsdcMinor.toString(),
    },
  };
  return stringToHex(canonicalJson(wire));
}

export interface InjectedActionSigner {
  getAddress(): Promise<Address>;
  signTypedData(data: ReturnType<typeof actionTypedData>): Promise<Hex>;
}

export async function signAction(
  intentInput: ActionIntentData,
  policyInput: ExperimentPolicyData,
  idempotencyKey: string,
  signer: InjectedActionSigner,
): Promise<ActionEnvelopeData> {
  const intent = ActionIntent.parse(intentInput);
  const policy = ExperimentPolicy.parse(policyInput);
  const signature = await signer.signTypedData(actionTypedData(intent, policy));
  return ActionEnvelope.parse({
    request: { intent, signature, idempotencyKey },
    signedBytes: canonicalSignedBytes(intent, policy),
  });
}

export function verifySignedBytes(
  envelope: ActionEnvelopeData,
  policy: ExperimentPolicyData,
) {
  const parsed = ActionEnvelope.parse(envelope);
  const expected = canonicalSignedBytes(parsed.request.intent, policy);
  if (parsed.signedBytes !== expected)
    throw new PoaError('INVALID_SIGNATURE', 'Signed EIP-712 bytes differ');
  // Also require a canonical, decodable UTF-8 encoding instead of opaque bytes.
  canonicalJson(JSON.parse(hexToString(parsed.signedBytes as Hex)));
  return {
    intentHash: contentHash(parsed.request.intent),
    typedDataHash: actionTypedDataHash(parsed.request.intent, policy),
    signedBytesHash: contentHash(parsed.signedBytes),
  };
}

export interface ApiTransport {
  request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T>;
}

export class ProofOfAlphaClient {
  constructor(private readonly transport: ApiTransport) {}
  getPolicy(experimentId: string) {
    return this.transport.request<ExperimentPolicyData>(
      'GET',
      `/v1/experiments/${experimentId}/policy`,
    );
  }
  createAgent(input: unknown) {
    return this.transport.request<unknown>('POST', '/v1/agents', input);
  }
  createAgentVersion(agentId: string, input: unknown) {
    return this.transport.request<unknown>(
      'POST',
      `/v1/agents/${agentId}/versions`,
      input,
    );
  }
  createExperiment(input: unknown) {
    return this.transport.request<unknown>('POST', '/v1/experiments', input);
  }
  startExperiment(experimentId: string) {
    return this.transport.request<{
      policy: ExperimentPolicyData;
      policyHash: string;
    }>('POST', `/v1/experiments/${experimentId}/start`);
  }
  getInstruments(experimentId: string) {
    return this.transport.request<unknown>(
      'GET',
      `/v1/experiments/${experimentId}/instruments`,
    );
  }
  getPortfolios(experimentId: string) {
    return this.transport.request<unknown>(
      'GET',
      `/v1/experiments/${experimentId}/portfolios`,
    );
  }
  async submit(
    experimentId: string,
    envelope: ActionEnvelopeData,
    expectedPolicyHash: string,
  ) {
    const result = await this.transport.request<{
      acknowledgment: {
        actionId: string;
        policyHash: string;
        status: string;
        receivedAt: string;
        sequence: string;
        portfolioVersion: string;
        reasonCodes: string[];
      };
      intentHash: string;
      typedDataHash: string;
      signedBytesHash: string;
    }>('POST', `/v1/experiments/${experimentId}/actions`, envelope);
    if (result.acknowledgment.policyHash !== expectedPolicyHash)
      throw new PoaError(
        'CONFIG_HASH_MISMATCH',
        'Acknowledgment policy changed',
      );
    return result;
  }
  getAction(experimentId: string, actionId: string) {
    return this.transport.request<unknown>(
      'GET',
      `/v1/experiments/${experimentId}/actions/${actionId}`,
    );
  }
}

export class FetchTransport implements ApiTransport {
  constructor(private readonly baseUrl: string) {}
  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(new URL(path, this.baseUrl), init);
    const result = (await response.json()) as T & {
      code?: string;
      message?: string;
    };
    if (!response.ok)
      throw new PoaError(
        (result.code as ConstructorParameters<typeof PoaError>[0]) ??
          'DATA_UNAVAILABLE',
        result.message ?? `HTTP ${response.status}`,
      );
    return result;
  }
}
