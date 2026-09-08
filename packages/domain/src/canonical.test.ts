import { describe, expect, it } from 'vitest';
import { canonicalJson, contentHash, PoaError } from './index.js';

describe('POA-CJSON-1', () => {
  it('sorts keys recursively while preserving array order and decimal strings', () => {
    expect(
      canonicalJson({ z: ['100000000000', { b: 2, a: null }], a: true }),
    ).toBe('{"a":true,"z":["100000000000",{"a":null,"b":2}]}');
    expect(contentHash({ a: '1', b: 2 })).toBe(contentHash({ b: 2, a: '1' }));
    // Independently cross-checked with Foundry cast keccak on the canonical bytes.
    expect(contentHash({ b: 2, a: '1' })).toBe(
      '0x012ab269a47043e8e1f3103d13c13fe88fa405d36baee397e63c0a6ec9fb1dc8',
    );
    expect(contentHash(['1', '2'])).not.toBe(contentHash(['2', '1']));
  });
  it.each([
    1.1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    -0,
    1n,
    undefined,
    new Date(),
    new Map(),
    '\ud800',
    [undefined],
    Array(2),
    { a: undefined },
    {
      get a() {
        return 1;
      },
    },
  ])('rejects noncanonical values %#', (value) => {
    expect(() => canonicalJson(value)).toThrow(PoaError);
  });
  it('rejects cycles and accepts repeated non-cyclic objects and Unicode', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalJson(value)).toThrow('Expected acyclic');
    const a = { amount: '1' };
    expect(canonicalJson([a, a, '🌍'])).toBe(
      '[{"amount":"1"},{"amount":"1"},"🌍"]',
    );
  });
  it('rejects hidden properties and array getters without executing them', () => {
    const values = [1];
    let invoked = false;
    Object.defineProperty(values, '0', {
      get() {
        invoked = true;
        return 1;
      },
    });
    expect(() => canonicalJson(values)).toThrow(PoaError);
    expect(invoked).toBe(false);
    expect(() =>
      canonicalJson(Object.defineProperty({}, 'hidden', { value: 1 })),
    ).toThrow(PoaError);
    expect(() =>
      canonicalJson(Object.assign([], { [Symbol('hidden')]: 1 })),
    ).toThrow(PoaError);
  });
  it('is independent of insertion order over all 120 permutations', () => {
    function permutations(xs: string[]): string[][] {
      return xs.length === 0
        ? [[]]
        : xs.flatMap((x, i) =>
            permutations(xs.filter((_, j) => i !== j)).map((rest) => [
              x,
              ...rest,
            ]),
          );
    }
    const values = ['policy', 'profile', 'scenario', 'nonce', 'amount'];
    const expected = contentHash(Object.fromEntries(values.map((k) => [k, k])));
    for (const keys of permutations(values))
      expect(contentHash(Object.fromEntries(keys.map((k) => [k, k])))).toBe(
        expected,
      );
  });
});
