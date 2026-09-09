import { z } from 'zod';
import { Hash, Id, NetworkProfile, Provenance } from './primitives.js';
export const CatalogResponse = z.strictObject({
  milestone: z.literal('M3'),
  experimentStartAvailable: z.literal(false),
  automaticFundingEnabled: z.literal(false),
  bundleHash: Hash,
  profiles: z.array(
    z.strictObject({
      profileId: Id,
      networkProfile: NetworkProfile,
      resultProvenance: Provenance,
      enabled: z.boolean(),
      realCapitalEligibilityEnabled: z.literal(false),
      blockers: z.array(z.string()),
      limitations: z.array(z.string()),
    }),
  ),
});
