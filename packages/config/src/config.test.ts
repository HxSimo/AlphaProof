import {
  readFileSync,
  mkdtempSync,
  cpSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  catalog,
  configFiles,
  defaultConfigDir,
  loadBundle,
  parseBundle,
  requireDependency,
} from './index.js';
import { CatalogResponse } from '@poa/schemas';

const raw = () =>
  Object.fromEntries(
    configFiles.map((f) => [
      f,
      JSON.parse(readFileSync(join(defaultConfigDir, f), 'utf8')),
    ]),
  ) as Parameters<typeof parseBundle>[0];
describe('versioned manifests', () => {
  it('validates every profile and preserves the registry/market distinction', () => {
    const { bundle } = loadBundle();
    expect(CatalogResponse.safeParse(catalog()).success).toBe(true);
    expect(bundle.profiles.profiles).toHaveLength(3);
    const mainnet = bundle.profiles.profiles.find(
      (p) => p.networkProfile === 'ETHEREUM_MAINNET_FORWARD',
    )!;
    expect(mainnet.marketNetworkIds).toEqual(['ethereum-mainnet']);
    expect(mainnet.registryNetworkId).toBe('arc-testnet');
  });
  it('rejects mainnet-to-testnet routes even while disabled', () => {
    const r = raw();
    const d = r['dependencies.json'] as {
      dependencies: { direction: { source: string } | null }[];
    };
    d.dependencies.find(
      (d) => d.direction?.source === 'ethereum-sepolia',
    )!.direction!.source = 'ethereum-mainnet';
    expect(() => parseBundle(r)).toThrow('Incompatible route');
  });
  it('rejects enabling a network without verification evidence', () => {
    const r = raw();
    (
      r['networks.json'] as {
        networks: { verification: { enabled: boolean } }[];
      }
    ).networks[0]!.verification.enabled = true;
    expect(() => parseBundle(r)).toThrow();
  });
  it('rejects relabeling both mainnet networks as testnet even when IDs stay unchanged', () => {
    const r = raw();
    const manifest = r['networks.json'] as {
      networks: {
        environment: string;
        cctp: { attestationEnvironment: string };
      }[];
    };
    for (const n of manifest.networks.filter(
      (n) => n.environment === 'mainnet',
    )) {
      n.environment = 'testnet';
      n.cctp.attestationEnvironment = 'testnet';
    }
    expect(() => parseBundle(r)).toThrow('Market environment contradicts');
  });
  it('rejects a USDT cash reference under the USDC mandate', () => {
    const r = raw();
    const manifest = r['profiles.json'] as {
      profiles: { references: { instrumentId: string }[] }[];
    };
    manifest.profiles[0]!.references[0]!.instrumentId = 'eth-cash-usdt';
    expect(() => parseBundle(r)).toThrow('Cash reference must hold USDC');
  });
  it('rejects enabling a profile with unverified dependencies', () => {
    const r = raw();
    (
      r['profiles.json'] as { profiles: { enabled: boolean }[] }
    ).profiles[0]!.enabled = true;
    expect(() => parseBundle(r)).toThrow('Profile cannot activate');
  });
  it('detects missing references, duplicate identities, wrong evidence and missing return route', () => {
    for (const change of [
      (r: ReturnType<typeof raw>) => {
        const x = r['networks.json'] as { networks: unknown[] };
        x.networks.push(x.networks[0]);
      },
      (r: ReturnType<typeof raw>) => {
        const x = r['profiles.json'] as {
          profiles: { resultProvenance: string }[];
        };
        x.profiles[1]!.resultProvenance = 'FORWARD_SHADOW';
      },
      (r: ReturnType<typeof raw>) => {
        const x = r['profiles.json'] as {
          profiles: { transfer: { routeDependencyIds: string[] } }[];
        };
        x.profiles[1]!.transfer.routeDependencyIds.pop();
      },
      (r: ReturnType<typeof raw>) => {
        const x = r['instruments.json'] as { instruments: unknown[] };
        x.instruments.shift();
      },
    ]) {
      const r = raw();
      change(r);
      expect(() => parseBundle(r)).toThrow();
    }
  });
  it('unverified dependencies fail closed and evidence-complete testnet gates resolve', () => {
    const fixture = JSON.parse(
      readFileSync('tests/fixtures/dependency-unavailable.json', 'utf8'),
    );
    const { bundle } = loadBundle();
    expect(fixture.resultProvenance).toBe('SYNTHETIC_TEST');
    expect(fixture.response.transactionHash).toBeNull();
    for (const d of bundle.dependencies.dependencies) {
      if (d.verification.enabled) {
        expect(d.verification.status).toBe('VERIFIED_FOR_TESTNET');
        expect(requireDependency(bundle, d.dependencyId)).toEqual(d);
        expect(d.verification.blockers).toEqual([]);
        expect(
          d.verification.requiredEvidence.every((kind) =>
            d.verification.evidence.some((item) => item.kind === kind),
          ),
        ).toBe(true);
      } else {
        expect(() => requireDependency(bundle, d.dependencyId)).toThrow(
          expect.objectContaining({ code: fixture.response.code }),
        );
        expect(d.verification.blockers.length).toBeGreaterThan(0);
      }
    }
  });
  it('detects manifest tampering and reloads unchanged configuration identically', () => {
    expect(loadBundle()).toEqual(loadBundle());
    const dir = mkdtempSync(join(tmpdir(), 'poa-config-'));
    try {
      cpSync(defaultConfigDir, dir, { recursive: true });
      const value = JSON.parse(
        readFileSync(join(dir, 'profiles.json'), 'utf8'),
      );
      value.profiles[0].constraints.minimumTargetAvailableCashBps = 1001;
      writeFileSync(join(dir, 'profiles.json'), JSON.stringify(value));
      expect(() => loadBundle(dir)).toThrow('Manifest seal does not match');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
