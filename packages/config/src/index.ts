import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, PoaError } from '@poa/domain';
import {
  DependencyManifest,
  InstrumentManifest,
  NetworkManifest,
  ProfileManifest,
  type ProfileData,
} from '@poa/schemas';

export const configFiles = [
  'networks.json',
  'instruments.json',
  'dependencies.json',
  'profiles.json',
] as const;
export const defaultConfigDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config/v1',
);
export function parseBundle(
  raw: Record<(typeof configFiles)[number], unknown>,
) {
  const parsed = {
    networks: NetworkManifest.parse(raw['networks.json']),
    instruments: InstrumentManifest.parse(raw['instruments.json']),
    dependencies: DependencyManifest.parse(raw['dependencies.json']),
    profiles: ProfileManifest.parse(raw['profiles.json']),
  };
  const invalid = (message: string): never => {
    throw new PoaError('CONFIG_INVALID', message);
  };
  function unique<T>(items: T[], key: (item: T) => string) {
    const ids = items.map(key);
    if (new Set(ids).size !== ids.length)
      invalid('Duplicate manifest identifiers');
    return new Map(items.map((item) => [key(item), item]));
  }
  const networks = unique(parsed.networks.networks, (x) => x.networkId);
  const instruments = unique(
    parsed.instruments.instruments,
    (x) => x.instrumentId,
  );
  const dependencies = unique(
    parsed.dependencies.dependencies,
    (x) => x.dependencyId,
  );
  unique(parsed.profiles.profiles, (x) => x.profileId);
  const knownChains = parsed.networks.networks
    .filter((n) => n.chainId !== null)
    .map((n) => n.chainId);
  if (new Set(knownChains).size !== knownChains.length)
    invalid('Duplicate chain identities');
  for (const n of networks.values()) {
    unique(n.assets, (a) => a.assetId);
    if (
      n.verification.enabled &&
      n.verification.status !==
        (n.environment === 'mainnet'
          ? 'VERIFIED_FOR_FORWARD_SHADOW'
          : 'VERIFIED_FOR_TESTNET')
    )
      invalid('Network verification environment mismatch');
  }
  for (const i of instruments.values()) {
    const n = networks.get(i.networkId);
    if (!n || !n.assets.some((a) => a.assetId === i.assetId))
      throw new PoaError(
        'CONFIG_INVALID',
        `Unknown network/asset for ${i.instrumentId}`,
      );
    if (
      i.verification.enabled &&
      (!n.verification.enabled ||
        i.verification.status !== n.verification.status)
    )
      invalid(
        `Instrument environment or network not verified: ${i.instrumentId}`,
      );
    if (!dependencies.has(i.adapterId))
      invalid(`Missing adapter dependency: ${i.adapterId}`);
    if (
      i.verification.enabled &&
      !dependencies.get(i.adapterId)!.verification.enabled
    )
      invalid(`Instrument adapter not verified: ${i.adapterId}`);
  }
  for (const d of dependencies.values()) {
    if (d.networkIds.some((id) => !networks.has(id)))
      invalid(`Unknown dependency network: ${d.dependencyId}`);
    if (d.direction) {
      const source = networks.get(d.direction.source);
      const dest = networks.get(d.direction.destination);
      if (
        !source ||
        !dest ||
        source.networkId === dest.networkId ||
        source.environment !== dest.environment
      )
        throw new PoaError(
          'ENVIRONMENT_MISMATCH',
          `Incompatible route: ${d.dependencyId}`,
        );
      if (
        d.networkIds.length !== 2 ||
        !d.networkIds.includes(source.networkId) ||
        !d.networkIds.includes(dest.networkId)
      )
        invalid('Route/network binding mismatch');
      if (
        d.verification.enabled &&
        (!source.verification.enabled ||
          !dest.verification.enabled ||
          source.cctp.domain === null ||
          dest.cctp.domain === null ||
          source.cctp.domain === dest.cctp.domain ||
          !source.cctp.tokenMessenger ||
          !dest.cctp.messageTransmitter)
      )
        invalid('Route contracts/domains unresolved');
    }
    if (
      d.verification.enabled &&
      d.networkIds.some(
        (id) =>
          networks.get(id)!.environment !==
          (d.verification.status === 'VERIFIED_FOR_TESTNET'
            ? 'testnet'
            : 'mainnet'),
      )
    )
      invalid('Dependency verification environment mismatch');
  }
  for (const p of parsed.profiles.profiles) {
    if (
      new Set(p.marketNetworkIds).size !== p.marketNetworkIds.length ||
      new Set(p.instrumentAllowlist).size !== p.instrumentAllowlist.length ||
      new Set(p.requiredDependencyIds).size !== p.requiredDependencyIds.length
    )
      invalid('Duplicate profile references');
    if (
      !networks.has(p.registryNetworkId) ||
      p.marketNetworkIds.some((id) => !networks.has(id))
    )
      invalid('Unknown profile network');
    const expected =
      p.networkProfile === 'ETHEREUM_MAINNET_FORWARD'
        ? ['ethereum-mainnet']
        : p.networkProfile === 'CROSS_CHAIN_TESTNET'
          ? ['arc-testnet', 'ethereum-sepolia']
          : p.networkProfile === 'CROSS_CHAIN_MAINNET_FORWARD'
            ? ['arc-mainnet', 'ethereum-mainnet']
            : null;
    if (
      expected &&
      p.marketNetworkIds.slice().sort().join() !== expected.sort().join()
    )
      throw new PoaError(
        'ENVIRONMENT_MISMATCH',
        `Wrong markets for ${p.networkProfile}`,
      );
    if (
      expected &&
      p.marketNetworkIds.some(
        (id) =>
          networks.get(id)!.environment !==
          (p.networkProfile === 'CROSS_CHAIN_TESTNET' ? 'testnet' : 'mainnet'),
      )
    ) {
      throw new PoaError(
        'ENVIRONMENT_MISMATCH',
        `Market environment contradicts ${p.networkProfile}`,
      );
    }
    if (
      (p.networkProfile === 'CROSS_CHAIN_TESTNET' &&
        p.resultProvenance !== 'CROSS_CHAIN_TESTNET') ||
      (p.networkProfile === 'MIXED_DIAGNOSTIC' &&
        p.resultProvenance !== 'MIXED_DIAGNOSTIC') ||
      (p.networkProfile.endsWith('MAINNET_FORWARD') &&
        p.resultProvenance !== 'FORWARD_SHADOW')
    )
      invalid('Profile provenance mismatch');
    for (const id of p.instrumentAllowlist) {
      const i = instruments.get(id);
      if (
        !i ||
        !p.marketNetworkIds.includes(i.networkId) ||
        !p.requiredDependencyIds.includes(i.adapterId)
      )
        invalid(`Invalid allowlist/adapter binding: ${id}`);
    }
    for (const id of p.requiredDependencyIds) {
      const d = dependencies.get(id);
      if (
        !d ||
        d.networkIds.some(
          (id) =>
            !p.marketNetworkIds.includes(id) &&
            !(d.kind === 'REGISTRY' && id === p.registryNetworkId),
        )
      )
        invalid(`Dependency outside profile markets: ${id}`);
    }
    for (const a of p.initialDistribution) {
      const i = instruments.get(a.instrumentId);
      if (
        !i ||
        !p.instrumentAllowlist.includes(i.instrumentId) ||
        i.networkId !== a.networkId ||
        i.kind !== 'CASH' ||
        networks
          .get(i.networkId)
          ?.assets.find((asset) => asset.assetId === i.assetId)?.symbol !==
          'USDC'
      )
        invalid('Initial capital must be allowlisted USDC cash');
    }
    for (const ref of p.references)
      if (!p.instrumentAllowlist.includes(ref.instrumentId))
        invalid('Reference outside allowlist');
    const cashReference = instruments.get(p.references[0].instrumentId)!;
    if (
      networks
        .get(cashReference.networkId)
        ?.assets.find((asset) => asset.assetId === cashReference.assetId)
        ?.symbol !== 'USDC'
    )
      invalid('Cash reference must hold USDC');
    if (
      instruments.get(p.references[0].instrumentId)?.kind !== 'CASH' ||
      instruments.get(p.references[1].instrumentId)?.kind === 'CASH'
    )
      invalid('Require cash and yield references');
    if (
      (p.networkProfile === 'CROSS_CHAIN_TESTNET') !==
      (p.references[1].type === 'CONSERVATIVE_YIELD_TEST_REFERENCE')
    )
      invalid('Reference evidence label mismatch');
    for (const id of p.transfer.routeDependencyIds) {
      const d = dependencies.get(id);
      if (
        !d?.direction ||
        !p.requiredDependencyIds.includes(id) ||
        d.networkIds.some((id) => !p.marketNetworkIds.includes(id))
      )
        invalid('Transfer route outside frozen profile');
    }
    if (
      p.marketNetworkIds.length > 1 &&
      p.networkProfile !== 'MIXED_DIAGNOSTIC'
    ) {
      for (const source of p.marketNetworkIds)
        for (const destination of p.marketNetworkIds) {
          if (
            source !== destination &&
            !p.transfer.routeDependencyIds.some(
              (id) =>
                dependencies.get(id)?.direction?.source === source &&
                dependencies.get(id)?.direction?.destination === destination,
            )
          )
            invalid('Both transfer directions must be explicitly gated');
        }
    }
    if (p.enabled) {
      if (p.networkProfile === 'CROSS_CHAIN_MAINNET_FORWARD')
        invalid(
          'Cross-chain mainnet activation requires a new policy with a verified mainnet gas-funding convention',
        );
      if (
        p.marketNetworkIds.some(
          (id) => !networks.get(id)!.verification.enabled,
        ) ||
        p.instrumentAllowlist.some(
          (id) => !instruments.get(id)!.verification.enabled,
        ) ||
        p.requiredDependencyIds.some(
          (id) => !dependencies.get(id)!.verification.enabled,
        ) ||
        !networks.get(p.registryNetworkId)!.contracts.commitmentRegistry
      )
        invalid('Profile cannot activate unresolved dependencies');
      if (
        p.transfer.routeDependencyIds.length &&
        !p.transfer.shadowDelayModelVersion
      )
        invalid('Transfer profile needs a versioned delay model');
    }
  }
  return parsed;
}
export type ConfigBundle = ReturnType<typeof parseBundle>;
export function loadBundle(
  directory = process.env.POA_CONFIG_DIR ?? defaultConfigDir,
  verifyHash = true,
) {
  const raw = Object.fromEntries(
    configFiles.map((file) => [
      file,
      JSON.parse(readFileSync(join(directory, file), 'utf8')),
    ]),
  ) as Record<(typeof configFiles)[number], unknown>;
  const bundle = parseBundle(raw);
  const hashes = Object.fromEntries(
    configFiles.map((file) => [file, contentHash(raw[file])]),
  );
  const seal = {
    schemaVersion: 'proof-of-alpha/config-seal/v1',
    algorithm: 'KECCAK256_POA_CJSON_1',
    files: hashes,
    bundleHash: contentHash(hashes),
  };
  if (
    verifyHash &&
    contentHash(
      JSON.parse(readFileSync(join(directory, 'checksums.json'), 'utf8')),
    ) !== contentHash(seal)
  )
    throw new PoaError(
      'CONFIG_HASH_MISMATCH',
      'Manifest seal does not match. Create a new manifest version for material changes.',
    );
  return { bundle, seal };
}
export function profileReadiness(profile: ProfileData, bundle: ConfigBundle) {
  return {
    profileId: profile.profileId,
    networkProfile: profile.networkProfile,
    resultProvenance: profile.resultProvenance,
    enabled: profile.enabled,
    realCapitalEligibilityEnabled: false as const,
    blockers: [
      ...(!profile.enabled ? ['PROFILE_DISABLED'] : []),
      ...bundle.networks.networks
        .filter(
          (n) =>
            [...profile.marketNetworkIds, profile.registryNetworkId].includes(
              n.networkId,
            ) && !n.verification.enabled,
        )
        .map((n) => `network:${n.networkId}`),
      ...bundle.instruments.instruments
        .filter(
          (i) =>
            profile.instrumentAllowlist.includes(i.instrumentId) &&
            !i.verification.enabled,
        )
        .map((i) => `instrument:${i.instrumentId}`),
      ...bundle.dependencies.dependencies
        .filter(
          (d) =>
            profile.requiredDependencyIds.includes(d.dependencyId) &&
            !d.verification.enabled,
        )
        .map((d) => `dependency:${d.dependencyId}`),
    ],
    limitations: profile.limitations,
  };
}
export function requireDependency(bundle: ConfigBundle, dependencyId: string) {
  const dep = bundle.dependencies.dependencies.find(
    (d) => d.dependencyId === dependencyId,
  );
  if (!dep || !dep.verification.enabled)
    throw new PoaError(
      'DEPENDENCY_UNVERIFIED',
      `External dependency ${dependencyId} is disabled`,
    );
  return dep;
}
export function catalog() {
  const { bundle, seal } = loadBundle();
  return {
    milestone: 'M0' as const,
    experimentStartAvailable: false as const,
    automaticFundingEnabled: false as const,
    bundleHash: seal.bundleHash,
    profiles: bundle.profiles.profiles.map((p) => profileReadiness(p, bundle)),
  };
}
