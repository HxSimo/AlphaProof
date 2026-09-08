import { CatalogResponse } from '@poa/schemas';

export const dynamic = 'force-dynamic';
async function getCatalog() {
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/v1/profiles`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    return CatalogResponse.parse(await response.json());
  } catch {
    return null;
  }
}
export default async function Page() {
  const data = await getCatalog();
  return (
    <main>
      <p className="eyebrow">PROOF OF ALPHA · M0 FOUNDATION</p>
      <h1>Evidence before capital.</h1>
      <p className="intro">
        A prospective evaluation protocol for self-hosted treasury agents.
        Signed decisions, virtual capital, auditable results.
      </p>
      <aside>
        Configuration review only. Experiments are not open. No performance
        history or real-capital eligibility is available.
      </aside>
      <h2>Experiment profiles</h2>
      {!data ? (
        <p role="status">
          Profile API unavailable. Start the API to review validated
          configuration.
        </p>
      ) : (
        <>
          <div className="profiles">
            {data.profiles.map((profile) => (
              <article key={profile.profileId}>
                <p className="badge">
                  {profile.enabled
                    ? 'Enabled'
                    : 'Disabled · verification required'}
                </p>
                <h3>{profile.networkProfile.replaceAll('_', ' ')}</h3>
                <p>
                  Evidence: <strong>{profile.resultProvenance}</strong>
                </p>
                <p>{profile.blockers.length} activation blockers</p>
                <details>
                  <summary>Review dependencies and limitations</summary>
                  <ul>
                    {profile.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                  {profile.limitations.map((text) => (
                    <p key={text}>{text}</p>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <p className="hash">
            Configuration hash
            <br />
            <code>{data.bundleHash}</code>
          </p>
        </>
      )}
      <footer>
        Three independent global treasuries: 1,000 · 10,000 · 100,000 USDC. Two
        references: cash and one passive yield instrument selected before start.
        Testnet evidence stays separate from mainnet economics.
      </footer>
    </main>
  );
}
