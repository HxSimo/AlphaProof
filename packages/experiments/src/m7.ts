import {
  applyReceipt,
  assertPortfolio,
  createPortfolio,
  globalBookValue,
  valuePortfolio,
} from '@poa/accounting';
import { contentHash, PoaError } from '@poa/domain';
import {
  AccountingReceipt,
  DemoDiagnostic,
  type DemoDiagnosticData,
  type ShadowPortfolioData,
} from '@poa/schemas';

const sizes = [
  {
    id: 'capital-1k',
    capital: '1000000000',
    invested: '400000000',
    transfer: '200000000',
    gas: '3100000',
    failedGas: '1400000',
  },
  {
    id: 'capital-10k',
    capital: '10000000000',
    invested: '3900000000',
    transfer: '2100000000',
    gas: '3400000',
    failedGas: '1700000',
  },
  {
    id: 'capital-100k',
    capital: '100000000000',
    invested: '30000000000',
    transfer: '22000000000',
    gas: '4300000',
    failedGas: '2300000',
  },
] as const;
const start = '2026-08-01T00:00:00.000Z';
const at = (minutes: number) =>
  new Date(Date.parse(start) + minutes * 60_000).toISOString();

export function buildDemoDiagnostic(
  kind: DemoDiagnosticData['kind'],
): DemoDiagnosticData {
  const rawInputs: DemoDiagnosticData['rawInputs'] = [];
  const scenarios = sizes.map((size) => {
    const initial = createPortfolio({
      experimentId:
        kind === 'LONGER_REPLAY'
          ? 'm7-dated-synthetic-replay'
          : 'm7-failure-stress',
      scenarioId: size.id,
      portfolioId:
        'm7-' + kind.toLowerCase().replaceAll('_', '-') + '-' + size.id,
      resultProvenance: 'SYNTHETIC_TEST',
      initialValueUsdcMinor: size.capital,
      maxDestinationAttempts: '3',
      balanceViews: [
        {
          viewId: 'ethereum-usdc',
          networkId: 'ethereum-mainnet',
          assetId: 'usdc',
          balanceFamilyId: 'ethereum-usdc',
          decimals: 6,
          canonicalDecimals: 6,
        },
        {
          viewId: 'arc-usdc',
          networkId: 'arc-testnet',
          assetId: 'usdc',
          balanceFamilyId: 'arc-usdc',
          decimals: 6,
          canonicalDecimals: 6,
        },
      ],
      initialCash: [{ viewId: 'ethereum-usdc', amountUsdcMinor: size.capital }],
    });
    let portfolio = initial;
    const receipts: DemoDiagnosticData['scenarios'][number]['receipts'] = [];
    const step = (
      minute: number,
      fields: Record<string, unknown>,
      gas: string | null = null,
      category = 'EXECUTION_GAS',
    ) => {
      const operationId = initial.portfolioId + '-' + receipts.length;
      const payload = {
        schemaVersion: 'proof-of-alpha/synthetic-demo-input/v1',
        sourceProvenance: 'SYNTHETIC_TEST',
        scenarioId: size.id,
        amountUsdcMinor: size.capital,
        observedAt: at(minute),
        adapterVersion: '1.0.0',
        parserVersion: '1.0.0',
        operationId,
        fields,
        gasUsdcMinor: gas,
      };
      const hash = contentHash(payload);
      rawInputs.push({ contentHash: hash, payload });
      const receipt = AccountingReceipt.parse({
        schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
        accountingVersion: '1.0.0',
        operationId,
        experimentId: initial.experimentId,
        scenarioId: size.id,
        expectedPortfolioVersion: portfolio.version,
        observedAt: at(minute),
        resultProvenance: 'SYNTHETIC_TEST',
        sourceHashes: [hash],
        costs: gas
          ? [
              {
                costId: operationId + '-gas',
                category,
                funding:
                  category === 'RETRY_GAS' ? 'PAYABLE' : 'AVAILABLE_CASH',
                amountUsdcMinor: gas,
                networkId:
                  category === 'RETRY_GAS' ? 'arc-testnet' : 'ethereum-mainnet',
                cashBalanceFamilyId:
                  category === 'RETRY_GAS' ? null : 'ethereum-usdc',
                sourceHash: hash,
              },
            ]
          : [],
        ...fields,
      });
      portfolio = applyReceipt(portfolio, receipt);
      receipts.push(receipt);
    };
    step(
      1,
      {
        kind: 'APPROVE',
        allowanceId: size.id + '-allowance',
        networkId: 'ethereum-mainnet',
        assetId: 'usdc',
        spenderId: 'synthetic-aave',
        amountMinor: size.invested,
      },
      size.gas,
      'APPROVAL_GAS',
    );
    step(
      2,
      {
        kind: 'DEPOSIT',
        cashViewId: 'ethereum-usdc',
        positionId: size.id + '-position',
        instrumentId: 'eth-aave-usdc',
        sharesCreditMinor: size.invested,
        indexNumerator: '1',
        indexDenominator: '1',
        inputUsdcMinor: size.invested,
      },
      size.gas,
    );
    if (kind === 'LONGER_REPLAY') {
      // Absolute daily index captures with an explicit loss regime. These are
      // fabricated stress mechanics, never historical Aave market observations.
      for (let day = 1; day <= 30; day++) {
        const index = day < 15 ? 10000 + day * 2 : 9800 + day;
        step(day * 1440, {
          kind: 'ACCRUE',
          positionId: size.id + '-position',
          nextIndexNumerator: String(index),
          nextIndexDenominator: '10000',
        });
      }
    } else {
      step(
        3,
        {
          kind: 'WITHDRAW',
          cashViewId: 'ethereum-usdc',
          positionId: size.id + '-position',
          sharesDebitMinor: size.invested,
          cashCreditUsdcMinor: size.invested,
        },
        size.gas,
      );
      step(
        4,
        {
          kind: 'COST',
          status: 'FAILED_AFTER_ATTEMPT',
          reasonCode: 'SWAP_FAILED_SYNTHETIC',
        },
        size.failedGas,
      );
      step(5, {
        kind: 'RESERVE',
        reservationId: size.id + '-reservation',
        cashViewId: 'ethereum-usdc',
        amountUsdcMinor: size.transfer,
      });
      step(
        6,
        {
          kind: 'TRANSFER_BURNED',
          reservationId: size.id + '-reservation',
          transferId: size.id + '-transfer',
          messageIdentity: size.id + '-same-message',
          destinationNetworkId: 'arc-testnet',
          destinationCashViewId: 'arc-usdc',
          netReceivableUsdcMinor: size.transfer,
        },
        size.gas,
        'SOURCE_GAS',
      );
      step(70, { kind: 'TRANSFER_DELAYED', transferId: size.id + '-transfer' });
      step(71, { kind: 'CLOSE', closedAt: at(71) });
      step(72, { kind: 'TRANSFER_READY', transferId: size.id + '-transfer' });
      step(
        73,
        {
          kind: 'TRANSFER_DESTINATION_RETRY',
          transferId: size.id + '-transfer',
        },
        size.failedGas,
        'RETRY_GAS',
      );
      step(74, { kind: 'TRANSFER_READY', transferId: size.id + '-transfer' });
      step(75, {
        kind: 'TRANSFER_SETTLED',
        transferId: size.id + '-transfer',
        destinationCreditUsdcMinor: size.transfer,
      });
    }
    const references = (['CASH', 'CONSERVATIVE_YIELD'] as const).map((role) => {
      const refInitial = {
        ...structuredClone(initial),
        portfolioId:
          initial.portfolioId + '-' + role.toLowerCase().replaceAll('_', '-'),
      };
      let ref = refInitial;
      const refReceipts: typeof receipts = [];
      if (role === 'CONSERVATIVE_YIELD') {
        const referenceStep = (
          minute: number,
          fields: Record<string, unknown>,
        ) => {
          const operationId = refInitial.portfolioId + '-' + refReceipts.length;
          const payload = {
            schemaVersion: 'proof-of-alpha/synthetic-demo-input/v1',
            sourceProvenance: 'SYNTHETIC_TEST',
            scenarioId: size.id,
            amountUsdcMinor: size.capital,
            observedAt: at(minute),
            adapterVersion: '1.0.0',
            parserVersion: '1.0.0',
            operationId,
            fields,
            gasUsdcMinor: null,
          };
          const hash = contentHash(payload);
          rawInputs.push({ contentHash: hash, payload });
          const receipt = AccountingReceipt.parse({
            schemaVersion: 'proof-of-alpha/accounting-receipt/v1',
            accountingVersion: '1.0.0',
            operationId,
            experimentId: initial.experimentId,
            scenarioId: size.id,
            expectedPortfolioVersion: ref.version,
            observedAt: at(minute),
            resultProvenance: 'SYNTHETIC_TEST',
            sourceHashes: [
              hash,
              ...(
                (fields.costs as { sourceHash: string }[] | undefined) ?? []
              ).map((c) => c.sourceHash),
            ],
            costs: [],
            ...fields,
          });
          ref = applyReceipt(ref, receipt);
          refReceipts.push(receipt);
        };
        const gasPayload = {
          schemaVersion: 'proof-of-alpha/synthetic-gas/v1',
          role,
          size,
          sourceProvenance: 'SYNTHETIC_TEST',
        };
        rawInputs.push({
          contentHash: contentHash(gasPayload),
          payload: gasPayload,
        });
        // Entry cost is retained as a payable, never free bankroll.
        referenceStep(2, {
          kind: 'DEPOSIT',
          cashViewId: 'ethereum-usdc',
          positionId: refInitial.portfolioId + '-position',
          instrumentId: 'eth-aave-usdc',
          sharesCreditMinor: size.capital,
          indexNumerator: '1',
          indexDenominator: '1',
          inputUsdcMinor: size.capital,
          costs: [
            {
              costId: refInitial.portfolioId + '-entry-gas',
              category: 'EXECUTION_GAS',
              funding: 'PAYABLE',
              amountUsdcMinor: size.gas,
              networkId: 'ethereum-mainnet',
              cashBalanceFamilyId: null,
              sourceHash: contentHash(gasPayload),
            },
          ],
        });
        if (kind === 'LONGER_REPLAY')
          for (let day = 1; day <= 30; day++)
            referenceStep(day * 1440, {
              kind: 'ACCRUE',
              positionId: refInitial.portfolioId + '-position',
              nextIndexNumerator: String(
                day < 15 ? 10000 + day * 2 : 9800 + day,
              ),
              nextIndexDenominator: '10000',
            });
      }
      return {
        kind: role,
        initial: refInitial,
        receipts: refReceipts,
        expectedFinalHash: contentHash(ref),
      };
    });
    return {
      initial,
      receipts,
      expectedFinalHash: contentHash(portfolio),
      references,
    };
  });
  return DemoDiagnostic.parse({
    schemaVersion: 'proof-of-alpha/demo-diagnostic/v1',
    diagnosticVersion: '0.7.0',
    kind,
    presentationProvenance:
      kind === 'LONGER_REPLAY' ? 'HISTORICAL_REPLAY' : 'SYNTHETIC_TEST',
    sourceProvenance: 'SYNTHETIC_TEST',
    periodStartsAt: start,
    periodEndsAt: kind === 'LONGER_REPLAY' ? at(30 * 1440) : at(75),
    sourceDescription:
      'Deterministic authored synthetic amount-specific inputs; dates are illustrative. No historical market observation or transaction is claimed.',
    scenarios,
    rawInputs,
    capitalScenarioRelationship: 'CORRELATED_POLICY_VIEWS',
    effectiveIndependentSampleCount: '1',
    forwardObservationCount: '0',
    automaticFundingEnabled: false,
    limitations: [
      'Replay of synthetic dated inputs validates software only.',
      'Every capital amount has its own receipts and cost inputs.',
      'Automatic funding and real-capital eligibility are disabled.',
    ],
  });
}

export function replayDemoDiagnostic(input: unknown) {
  const bundle = DemoDiagnostic.parse(input);
  const raw = new Map(bundle.rawInputs.map((o) => [o.contentHash, o.payload]));
  if (raw.size !== bundle.rawInputs.length)
    throw new PoaError('ARCHIVE_INTEGRITY', 'Duplicate diagnostic source');
  for (const object of bundle.rawInputs)
    if (contentHash(object.payload) !== object.contentHash)
      throw new PoaError('ARCHIVE_INTEGRITY', 'Diagnostic raw input changed');
  if (
    bundle.presentationProvenance !==
    (bundle.kind === 'LONGER_REPLAY' ? 'HISTORICAL_REPLAY' : 'SYNTHETIC_TEST')
  )
    throw new PoaError(
      'PROVENANCE_SPLICE',
      'Diagnostic presentation provenance changed',
    );
  const output = bundle.scenarios.map((scenario) => {
    let state = assertPortfolio(scenario.initial);
    if (state.resultProvenance !== 'SYNTHETIC_TEST')
      throw new PoaError(
        'PROVENANCE_SPLICE',
        'Synthetic input cannot become forward history',
      );
    const snapshots: { at: string; portfolio: ShadowPortfolioData }[] = [];
    for (const receipt of scenario.receipts) {
      if (receipt.resultProvenance !== state.resultProvenance)
        throw new PoaError('PROVENANCE_SPLICE', 'Receipt provenance changed');
      for (const hash of receipt.sourceHashes)
        if (!raw.has(hash))
          throw new PoaError(
            'ARCHIVE_INTEGRITY',
            'Missing exact diagnostic input',
          );
      const source = raw.get(receipt.sourceHashes[0]!) as any;
      const costs = 'costs' in receipt ? receipt.costs : [];
      if (
        source.gasUsdcMinor !== null &&
        (costs.length !== 1 ||
          costs[0]!.amountUsdcMinor !== source.gasUsdcMinor ||
          costs[0]!.sourceHash !== receipt.sourceHashes[0])
      )
        throw new PoaError(
          'REPLAY_MISMATCH',
          'Diagnostic cost differs from its exact source',
        );
      if (
        source.operationId !== receipt.operationId ||
        source.scenarioId !== state.scenarioId ||
        source.observedAt !== receipt.observedAt ||
        source.sourceProvenance !== 'SYNTHETIC_TEST'
      )
        throw new PoaError(
          'PROVENANCE_SPLICE',
          'Receipt source is outside its financial identity',
        );
      for (const [key, value] of Object.entries(source.fields))
        if (contentHash((receipt as any)[key]) !== contentHash(value))
          throw new PoaError(
            'REPLAY_MISMATCH',
            'Receipt differs from exact captured mechanics',
          );
      state = applyReceipt(JSON.parse(JSON.stringify(state)), receipt);
      // Duplicate delivery after serialization must be an exact no-op.
      if (contentHash(applyReceipt(state, receipt)) !== contentHash(state))
        throw new PoaError('REPLAY_MISMATCH', 'Duplicate financial effect');
      snapshots.push({ at: receipt.observedAt, portfolio: state });
    }
    if (contentHash(state) !== scenario.expectedFinalHash)
      throw new PoaError('REPLAY_MISMATCH', 'Diagnostic final state changed');
    const deadline = snapshots.find((s) => s.portfolio.closedAt !== null);
    let peak = BigInt(state.initialValueUsdcMinor),
      drawdown = 0n;
    for (const snapshot of snapshots) {
      const value = BigInt(globalBookValue(snapshot.portfolio));
      if (value > peak) peak = value;
      const draw = ((peak - value) * 10000n) / peak;
      if (draw > drawdown) drawdown = draw;
    }
    if (new Set(scenario.references.map((r) => r.kind)).size !== 2)
      throw new PoaError(
        'REPLAY_MISMATCH',
        'Exactly two frozen references are required',
      );
    const references = scenario.references.map((reference) => {
      if (
        reference.initial.initialValueUsdcMinor !==
          scenario.initial.initialValueUsdcMinor ||
        contentHash(reference.initial.cash) !==
          contentHash(scenario.initial.cash) ||
        reference.initial.resultProvenance !== 'SYNTHETIC_TEST'
      )
        throw new PoaError(
          'PROVENANCE_SPLICE',
          'Reference initial capital, distribution or provenance differs',
        );
      let current = reference.initial;
      for (const receipt of reference.receipts) {
        for (const hash of receipt.sourceHashes)
          if (!raw.has(hash))
            throw new PoaError(
              'ARCHIVE_INTEGRITY',
              'Reference requires every cost and mechanics source',
            );
        const source = raw.get(receipt.sourceHashes[0]!) as any;
        if (
          !source ||
          source.operationId !== receipt.operationId ||
          source.scenarioId !== current.scenarioId
        )
          throw new PoaError(
            'ARCHIVE_INTEGRITY',
            'Reference source is missing or mismatched',
          );
        for (const [key, value] of Object.entries(source.fields))
          if (contentHash((receipt as any)[key]) !== contentHash(value))
            throw new PoaError(
              'REPLAY_MISMATCH',
              'Reference differs from captured mechanics',
            );
        current = applyReceipt(current, receipt);
      }
      if (contentHash(current) !== reference.expectedFinalHash)
        throw new PoaError('REPLAY_MISMATCH', 'Reference replay changed');
      return {
        kind: reference.kind,
        finalHash: contentHash(current),
        markValueUsdcMinor: globalBookValue(current),
        differenceUsdcMinor: (
          BigInt(globalBookValue(state)) - BigInt(globalBookValue(current))
        ).toString(),
      };
    });
    return {
      scenarioId: state.scenarioId,
      finalHash: contentHash(state),
      markValueUsdcMinor: globalBookValue(state),
      cashReferenceUsdcMinor: state.initialValueUsdcMinor,
      costsUsdcMinor: state.recognizedCosts
        .reduce((s, c) => s + BigInt(c.amountUsdcMinor), 0n)
        .toString(),
      maxDrawdownBps: drawdown.toString(),
      references,
      deadlineStateHash: state.deadlineStateHash,
      unresolvedAtClosure:
        deadline?.portfolio.receivables[0]?.amountUsdcMinor ?? null,
      unavailableMark: valuePortfolio(
        state,
        state.positions.map((p) => ({
          positionId: p.positionId,
          markValueUsdcMinor: null,
          recoverableUsdcMinor: null,
          exitCostUsdcMinor: null,
          dataQuality: 'UNAVAILABLE' as const,
          sourceHash: p.lastSourceHash,
          observedAt: p.lastObservedAt,
        })),
      ).markValueUsdcMinor,
      snapshots,
    };
  });
  return {
    diagnosticHash: contentHash(bundle),
    presentationProvenance: bundle.presentationProvenance,
    sourceProvenance: bundle.sourceProvenance,
    forwardObservationCount: '0',
    scenarios: output,
  };
}
