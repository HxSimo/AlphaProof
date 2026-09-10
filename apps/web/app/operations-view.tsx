import type { OperationsSnapshotData } from '@poa/schemas';
export function OperationsView({
  data,
}: {
  data: OperationsSnapshotData | null;
}) {
  return (
    <section aria-label="Operations">
      <h2>Operations</h2>
      {data ? (
        <>
          <p>
            {data.status} · observed {data.observedAt}
          </p>
          <p>
            Open incidents: {data.openIncidentCount} · rejected requests:{' '}
            {data.rejectedRequestCount} · oldest runnable job:{' '}
            {data.oldestRunnableAgeSeconds === null
              ? 'Unavailable (no queued work)'
              : data.oldestRunnableAgeSeconds + ' seconds'}
          </p>
          <ul>
            {data.alerts.map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
          <ul>
            {data.workers.map((worker) => (
              <li key={worker.workerId}>
                {worker.workerId} · {worker.lastStatus} ·{' '}
                {worker.stale ? 'STALE' : 'RECENT'} · {worker.lastSeenAt}
              </li>
            ))}
          </ul>
          <ul>
            {data.jobs.map((job) => (
              <li key={job.state}>
                {job.state}: {job.count} · maximum attempt {job.maxAttempt}
              </li>
            ))}
          </ul>
          <p className="hash">
            Operational policy <code>{data.policyHash}</code>
          </p>
          <p>
            Operational health does not confer economic or statistical
            eligibility.
          </p>
        </>
      ) : (
        <p role="status">
          Operational monitoring unavailable; health is not assumed.
        </p>
      )}
    </section>
  );
}
