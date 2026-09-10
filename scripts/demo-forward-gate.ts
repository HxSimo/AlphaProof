import { catalog } from '@poa/config';
import { PoaError } from '@poa/domain';
const profile = catalog().profiles.find(
  (p) => p.profileId === 'ethereum-forward',
)!;
if (!profile.enabled || profile.blockers.length) {
  console.log(
    JSON.stringify({
      status: 'SKIPPED_TO_VERIFY',
      profileId: profile.profileId,
      blockers: profile.blockers,
      freshEthereumSession: false,
      forwardObservationCount: '0',
      automaticFundingEnabled: false,
    }),
  );
  if (process.env.POA_REQUIRE_FRESH_FORWARD === '1')
    throw new PoaError(
      'DEPENDENCY_UNVERIFIED',
      'Fresh forward session explicitly required but existing activation evidence is incomplete',
    );
} else
  throw new PoaError(
    'DEPENDENCY_UNVERIFIED',
    'A newly activated forward manifest requires a separately reviewed capture/session runner; synthetic execution cannot be used',
  );
