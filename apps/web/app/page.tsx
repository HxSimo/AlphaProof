import { CatalogResponse, DashboardResponse } from '@poa/schemas';
import { DashboardView } from './dashboard-view.js';

export const dynamic = 'force-dynamic';
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

async function getCatalog() {
  try {
    const response = await fetch(`${API}/v1/profiles`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return CatalogResponse.parse(await response.json());
  } catch {
    return null;
  }
}

async function getDashboard() {
  const experimentId = process.env.POA_DEMO_EXPERIMENT_ID;
  if (!experimentId) return null;
  try {
    const response = await fetch(
      `${API}/v1/experiments/${experimentId}/dashboard`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    return DashboardResponse.parse(await response.json());
  } catch {
    return null;
  }
}

export default async function Page() {
  const [dashboard, catalog] = await Promise.all([
    getDashboard(),
    getCatalog(),
  ]);
  return (
    <main>
      <p className="eyebrow">PROOF OF ALPHA · CANONICAL READ-ONLY DASHBOARD</p>
      <h1>Evidence before capital.</h1>
      <p className="intro">
        Prospective signed decisions, deterministic shadow accounting, fixed
        references, reproducible exports, and verifiable integrity anchors.
      </p>
      {dashboard ? (
        <DashboardView data={dashboard} />
      ) : (
        <aside role="status">
          No canonical demo experiment is configured or the API is unavailable.
          Set POA_DEMO_EXPERIMENT_ID after creating the local experiment. No
          cached result is substituted.
        </aside>
      )}
      {catalog && (
        <details className="catalog">
          <summary>Profile activation and limitations</summary>
          {catalog.profiles.map((profile) => (
            <article key={profile.profileId}>
              <h3>{profile.networkProfile.replaceAll('_', ' ')}</h3>
              <p>
                {profile.resultProvenance} ·{' '}
                {profile.enabled ? 'Enabled' : 'Disabled'}
              </p>
              <ul>
                {profile.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </article>
          ))}
          <p className="hash">
            Configuration hash
            <br />
            <code>{catalog.bundleHash}</code>
          </p>
        </details>
      )}
    </main>
  );
}
