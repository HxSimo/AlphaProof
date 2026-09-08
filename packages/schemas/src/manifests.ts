import { z } from 'zod';
import { STANDARD_CAPITAL } from '@poa/domain';
import {
  Address,
  Allocation,
  Bps,
  Environment,
  Hash,
  Id,
  NetworkProfile,
  PositiveUInt,
  Provenance,
  Seconds,
  Timestamp,
  UInt,
  Version,
} from './primitives.js';

export const EvidenceKind = z.enum([
  'OFFICIAL_SOURCE',
  'ONCHAIN_CODE',
  'FIXED_BLOCK_FORK',
  'ARCHIVE_READ',
  'LIVE_ROUND_TRIP',
  'FEE_CAPTURE',
  'GAS_CALIBRATION',
  'FINALITY',
  'REPLAY',
  'DEPLOYMENT',
  'RETENTION_RESTORE',
]);
export const Verification = z
  .strictObject({
    status: z.enum([
      'TO_VERIFY',
      'VERIFIED_FOR_TESTNET',
      'VERIFIED_FOR_FORWARD_SHADOW',
      'DISABLED',
    ]),
    enabled: z.boolean(),
    checkedAt: Timestamp.nullable(),
    checkedBy: z.string().min(1).nullable(),
    requiredEvidence: z.array(EvidenceKind).min(1),
    evidence: z.array(
      z.strictObject({
        kind: EvidenceKind,
        uri: z.string().min(1),
        contentHash: Hash,
        observedAt: Timestamp,
      }),
    ),
    blockers: z.array(z.string().min(1)),
  })
  .superRefine((v, ctx) => {
    if (
      v.enabled &&
      (v.status === 'TO_VERIFY' ||
        v.status === 'DISABLED' ||
        !v.checkedAt ||
        !v.checkedBy ||
        v.blockers.length ||
        v.requiredEvidence.some((k) => !v.evidence.some((e) => e.kind === k)))
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Enabled dependency requires verification and every evidence kind with no blockers',
      });
    }
  });
export const Network = z
  .strictObject({
    networkId: Id,
    environment: Environment,
    chainId: PositiveUInt.nullable(),
    documentationCheckedAt: Timestamp.nullable(),
    officialSources: z.array(z.url()).min(1),
    rpc: z.strictObject({
      endpointEnvironmentVariable: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
      archiveReadsRequired: z.literal(true),
    }),
    nativeGasAsset: z.enum(['ETH', 'USDC']),
    nativeDecimals: z.number().int().min(0).max(36).nullable(),
    nativeAndErc20AreSameEconomicBalance: z.boolean(),
    assets: z
      .array(
        z.strictObject({
          assetId: Id,
          symbol: z.enum(['USDC', 'USDT']),
          address: Address.nullable(),
          decimals: z.number().int().min(0).max(36).nullable(),
        }),
      )
      .min(1),
    contracts: z.strictObject({
      demoVault: Address.nullable(),
      commitmentRegistry: Address.nullable(),
    }),
    cctp: z.strictObject({
      domain: UInt.nullable(),
      tokenMessenger: Address.nullable(),
      messageTransmitter: Address.nullable(),
      attestationEnvironment: Environment,
    }),
    verification: Verification,
  })
  .superRefine((n, ctx) => {
    if (n.cctp.attestationEnvironment !== n.environment)
      ctx.addIssue({ code: 'custom', message: 'CCTP environment mismatch' });
    if (n.nativeGasAsset === 'USDC' && !n.nativeAndErc20AreSameEconomicBalance)
      ctx.addIssue({
        code: 'custom',
        message: 'Arc balance views must be aliased',
      });
    if (
      n.verification.enabled &&
      (n.chainId === null ||
        n.nativeDecimals === null ||
        n.assets.some((a) => a.address === null || a.decimals === null))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Enabled network requires resolved asset identity and scales',
      });
  });
export const NetworkManifest = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/network-manifest/v1'),
  manifestVersion: Version,
  networks: z.array(Network).min(1),
});
export const Instrument = z
  .strictObject({
    instrumentId: Id,
    networkId: Id,
    assetId: Id,
    kind: z.enum(['CASH', 'LENDING', 'ERC4626']),
    protocolId: Id,
    adapterId: Id,
    adapterVersion: Version,
    contractAddress: Address.nullable(),
    codeHash: Hash.nullable(),
    factSheet: z.string().regex(/^docs\/instrument-catalog\/[a-z0-9-]+\.md$/),
    candidateName: z.string().min(1),
    verification: Verification,
  })
  .superRefine((i, ctx) => {
    if (i.verification.enabled && (!i.contractAddress || !i.codeHash))
      ctx.addIssue({
        code: 'custom',
        message: 'Enabled instrument requires exact contract and bytecode hash',
      });
  });
export const InstrumentManifest = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/instrument-manifest/v1'),
  manifestVersion: Version,
  instruments: z.array(Instrument).min(1),
});
export const Dependency = z.strictObject({
  dependencyId: Id,
  kind: z.enum(['ADAPTER', 'RPC', 'FEED', 'REGISTRY', 'STORAGE', 'INDEXER']),
  scope: z.enum(['MVP_REQUIRED', 'OPTIONAL', 'POST_MVP']),
  networkIds: z.array(Id),
  direction: z
    .strictObject({
      source: Id,
      destination: Id,
      assetSymbol: z.literal('USDC'),
      mode: z.literal('STANDARD'),
    })
    .nullable(),
  officialSources: z.array(z.url()).min(1),
  instructions: z.string().min(20),
  fixture: z.string().min(1),
  verification: Verification,
});
export const DependencyManifest = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/dependency-manifest/v1'),
  manifestVersion: Version,
  dependencies: z.array(Dependency).min(1),
});
export const Profile = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/profile/v1'),
  profileId: Id,
  profileVersion: Version,
  status: z.literal('PROPOSED_NOT_PRODUCTION'),
  enabled: z.boolean(),
  mandate: z.literal('STABLECOIN_TREASURY'),
  networkProfile: NetworkProfile,
  resultProvenance: Provenance,
  unitOfAccount: z.literal('USDC'),
  unitOfAccountDecimals: z.literal(6),
  automaticFundingEnabled: z.literal(false),
  marketNetworkIds: z.array(Id).min(1),
  registryNetworkId: Id,
  requiredDependencyIds: z.array(Id).min(1),
  instrumentAllowlist: z.array(Id).min(1),
  capitalScenarios: z.tuple([
    z.strictObject({
      id: z.literal('capital-1k'),
      initialAmountUsdcMinor: z.literal(STANDARD_CAPITAL[0]),
    }),
    z.strictObject({
      id: z.literal('capital-10k'),
      initialAmountUsdcMinor: z.literal(STANDARD_CAPITAL[1]),
    }),
    z.strictObject({
      id: z.literal('capital-100k'),
      initialAmountUsdcMinor: z.literal(STANDARD_CAPITAL[2]),
    }),
  ]),
  initialDistribution: Allocation,
  references: z.tuple([
    z.strictObject({
      type: z.literal('CASH'),
      instrumentId: Id,
      behavior: z.literal('STATIONARY_INITIAL_DISTRIBUTION'),
    }),
    z.strictObject({
      type: z.enum(['CONSERVATIVE_YIELD', 'CONSERVATIVE_YIELD_TEST_REFERENCE']),
      instrumentId: Id,
      behavior: z.literal('PASSIVE_NO_SWITCHING'),
    }),
  ]),
  constraints: z.strictObject({
    minimumTargetAvailableCashBps: Bps,
    maximumInstrumentWeightBps: Bps,
    maximumUnderlyingProtocolWeightBps: Bps,
    maximumUsdtExposureBps: Bps,
    maximumInTransitBps: Bps,
    maximumSwapSlippageBps: Bps,
    borrowingAllowed: z.literal(false),
    leverageAllowed: z.literal(false),
    oneIntentInProgressPerScenario: z.literal(true),
  }),
  execution: z.strictObject({
    version: Version,
    firstEthereumStepBlockOffset: z.number().int().min(1),
    nextEthereumStepBlockOffset: z.number().int().min(1),
    arcServiceDelaySeconds: Seconds,
    planStartExpirySeconds: Seconds,
    ethereumSegmentMaxBlocks: z.number().int().positive(),
    arcSegmentMaxSeconds: Seconds,
    blockSelection: z.literal('FIRST_ADMISSIBLE_AFTER_DURABLE_RECEIPT'),
    missingData: z.literal('SUSPEND_OR_EXPIRE_NO_PRICE_FALLBACK'),
    partialFailure: z.literal('PRESERVE_SUCCESS_STOP_DEPENDENTS'),
    gasModel: z.literal('CAPTURED_CHAIN_FEES_FORK_CALIBRATED_GAS'),
    costConversion: z.literal('CHARGE_USDC_RETAIN_NATIVE_PRECISION'),
    swapRule: z.literal('DIRECT_EXACT_IN_NET_OF_GAS_TIEBREAK_POOL_ID'),
    referenceFailure: z.literal('RETAIN_CASH_AND_COSTS_COMPARISON_UNAVAILABLE'),
  }),
  transfer: z.strictObject({
    version: Version,
    mechanism: z.literal('CCTP'),
    mode: z.literal('STANDARD'),
    asset: z.literal('USDC'),
    routeDependencyIds: z.array(Id),
    destinationGasConvention: z.literal(
      'PREFUNDED_TEST_RELAYER_CHARGE_SCENARIO',
    ),
    feeRule: z.literal('CAPTURE_ALL_APPLICABLE_COSTS_ONCE'),
    shadowDelayModelVersion: Version.nullable(),
    delayedAfterSeconds: Seconds,
    reconcileAfterSeconds: Seconds,
    maxDestinationAttempts: z.number().int().positive().max(10),
    retryAuthority: z.literal('OPERATOR_WORKER_SAME_MESSAGE'),
    splittingAllowed: z.literal(false),
  }),
  valuation: z.strictObject({
    version: Version,
    basis: z.literal('MARK_AND_LIQUIDATION_ESTIMATE'),
    checkpointRule: z.literal(
      'PER_CHAIN_LAST_ADMISSIBLE_BLOCK_AT_OR_BEFORE_CHECKPOINT',
    ),
    staleData: z.literal('DISPLAY_STALE_EXCLUDE_FRESH_OBSERVATIONS'),
    closure: z.literal('FREEZE_DEADLINE_STATE_RECONCILE_TRANSFERS_SEPARATELY'),
  }),
  cadence: z.strictObject({
    valuationCheckpointSeconds: Seconds,
    descriptiveObservationSeconds: Seconds,
    summarySeconds: Seconds,
    commitmentBatchSeconds: Seconds,
  }),
  durationSeconds: Seconds,
  commitmentMode: z.literal('PERIODIC_AFTER_RECEIPT'),
  configurationPublication: z.literal('CONFIRMED_BEFORE_ACTIONS_OPEN'),
  statistics: z.strictObject({
    status: z.literal('NOT_ASSESSED'),
    methodVersion: z.null(),
    realCapitalEligibilityEnabled: z.literal(false),
  }),
  quotas: z.strictObject({
    activeAgents: z.number().int().positive(),
    acceptedIntentsPerDayPerScenario: z.number().int().positive(),
    activeExperimentsPerAgentPerProfile: z.literal(1),
  }),
  retention: z.strictObject({
    reproducibilityDataDaysAfterClosure: z.number().int().min(90),
  }),
  operatingCosts: z.literal(
    'SUPPLEMENTARY_DECLARED_VIEW_SHARED_ALLOCATION_REQUIRED',
  ),
  limitations: z.array(z.string().min(1)).min(1),
});
export const ProfileManifest = z.strictObject({
  schemaVersion: z.literal('proof-of-alpha/profile-manifest/v1'),
  manifestVersion: Version,
  profiles: z.array(Profile).min(1),
});
export type ProfileData = z.infer<typeof Profile>;
