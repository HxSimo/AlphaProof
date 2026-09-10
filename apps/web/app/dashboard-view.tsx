import type { DashboardResponseData } from '@poa/schemas';

const usdc = (minor: string | null) => {
  if (minor === null) return 'Unavailable';
  const value = BigInt(minor);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${(absolute / 1_000_000n).toLocaleString('en-US')}.${(
    absolute % 1_000_000n
  )
    .toString()
    .padStart(6, '0')} USDC`;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DashboardView({ data }: { data: DashboardResponseData }) {
  return (
    <>
      <section className="status-strip" aria-label="Experiment status">
        <Metric label="Provenance" value={data.resultProvenance} />
        <Metric
          label="Scenario relationship"
          value="Correlated policy views · n = 1"
        />
        <Metric label="Funding" value="Automatic funding disabled" />
      </section>
      <h2>Capital scenarios</h2>
      <div className="scenarios">
        {data.scenarios.map((scenario) => {
          const result = scenario.descriptiveEvaluation;
          const agent = result.agent;
          return (
            <article key={scenario.scenarioId}>
              <p className="badge">{usdc(scenario.initialAmountUsdcMinor)}</p>
              <h3>{scenario.scenarioId}</h3>
              <div className="status-grid">
                <Metric
                  label="Compliance"
                  value={scenario.eligibility.operationalStatus}
                />
                <Metric
                  label="Economics"
                  value={scenario.eligibility.economicStatus}
                />
                <Metric
                  label="Statistics"
                  value={scenario.eligibility.statisticalStatus}
                />
                <Metric
                  label="Eligibility"
                  value={scenario.eligibility.overallStatus}
                />
              </div>
              <div className="metrics">
                <Metric
                  label="Mark value"
                  value={usdc(agent.markValueUsdcMinor)}
                />
                <Metric
                  label="Liquidation value"
                  value={usdc(agent.liquidationValueUsdcMinor)}
                />
                <Metric
                  label="Available cash"
                  value={usdc(agent.availableUsdcMinor)}
                />
                <Metric
                  label="Position mark"
                  value={usdc(agent.investedMarkUsdcMinor)}
                />
                <Metric
                  label="In transit"
                  value={usdc(agent.inTransitUsdcMinor)}
                />
                <Metric
                  label="Blocked"
                  value={usdc(agent.blockedValueUsdcMinor)}
                />
                <Metric
                  label="Costs"
                  value={usdc(agent.cumulativeCostsUsdcMinor)}
                />
                <Metric
                  label="Drawdown"
                  value={
                    agent.drawdownMarkBps === null
                      ? 'Unavailable'
                      : `${agent.drawdownMarkBps} bps`
                  }
                />
              </div>
              <div className="references">
                <h4>Cash reference</h4>
                <p>
                  {usdc(result.cashReference.markValueUsdcMinor)} · agent
                  difference {usdc(result.differenceVsCashMarkUsdcMinor)}
                </p>
                <h4>Frozen conservative-yield reference</h4>
                <p>
                  {result.comparisonAvailability.conservativeYield
                    ? `${usdc(result.conservativeYieldReference.markValueUsdcMinor)} · agent difference ${usdc(result.differenceVsConservativeYieldMarkUsdcMinor)}`
                    : 'Comparison unavailable; cash and incurred entry costs retained.'}
                </p>
              </div>
              <div className="holdings">
                <h4>Cash by network</h4>
                <ul>
                  {scenario.checkpoint.agent.portfolio.cash.map((cash) => (
                    <li key={cash.balanceFamilyId}>
                      {cash.networkId} · {cash.assetId} ·{' '}
                      {usdc(cash.amountUsdcMinor)}
                    </li>
                  ))}
                </ul>
                <h4>Open positions</h4>
                {scenario.checkpoint.agent.portfolio.positions.length ? (
                  <ul>
                    {scenario.checkpoint.agent.portfolio.positions.map(
                      (position) => (
                        <li key={position.positionId}>
                          {position.networkId} · {position.instrumentId} · book{' '}
                          {usdc(position.bookValueUsdcMinor)} · shares{' '}
                          {position.sharesMinor}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p>No open positions.</p>
                )}
                <h4>Transfers in transit</h4>
                {scenario.checkpoint.agent.portfolio.receivables.length ? (
                  <ul>
                    {scenario.checkpoint.agent.portfolio.receivables.map(
                      (receivable) => (
                        <li key={receivable.transferId}>
                          {receivable.sourceNetworkId} →{' '}
                          {receivable.destinationNetworkId} · {receivable.state}{' '}
                          · {usdc(receivable.amountUsdcMinor)}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p>No capital in transit.</p>
                )}
              </div>
              <details>
                <summary>Evidence and data quality</summary>
                <p>
                  {scenario.checkpoint.checkpointAt} · {agent.dataQuality} ·{' '}
                  {scenario.checkpoint.resultProvenance}
                </p>
                <p>Observation set: {scenario.checkpoint.observationSetHash}</p>
                <p>Amount quote set: {scenario.checkpoint.amountQuoteHash}</p>
                <ul>
                  {scenario.eligibility.reasonCodes.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </div>
      <section className="proof" aria-label="Commitment proof">
        <p className="eyebrow">ARC TESTNET INTEGRITY ANCHOR</p>
        <h2>Selected proof verified</h2>
        <div className="proof-grid">
          <Metric label="Batch" value={data.commitment.batch.batchId} />
          <Metric
            label="Sequences"
            value={`${data.commitment.batch.firstSequence}–${data.commitment.batch.lastSequence}`}
          />
          <Metric label="Root" value={data.commitment.batch.root} />
          <Metric
            label="Transaction"
            value={data.commitment.registryReceipt.transactionHash}
          />
        </div>
        <p>
          This periodic post-execution anchor proves integrity from publication.
          It does not independently prove that the server received an intent
          before execution.
        </p>
      </section>
      <section>
        <h2>Incidents</h2>
        {data.incidents.length ? (
          <ul>
            {data.incidents.map((incident) => (
              <li key={incident.contentHash}>{incident.contentHash}</li>
            ))}
          </ul>
        ) : (
          <p>No incidents are recorded in this canonical view.</p>
        )}
        <h2>Limitations</h2>
        <ul>
          {data.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
