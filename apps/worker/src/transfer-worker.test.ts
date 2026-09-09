import { describe, expect, it } from 'vitest';
import type { TransferRepository } from '@poa/storage';
import { createTransfer } from '@poa/transfers';
import { runTransferWorkerOnce } from './worker.js';

const transfer = createTransfer({
  transferId: 'worker-transfer',
  experimentId: 'worker-experiment',
  scenarioId: 'worker-scenario',
  routeId: 'cctp-sepolia-to-arc-testnet',
  reservationId: 'worker-reservation',
  sourceCashViewId: 'sepolia-usdc',
  destinationCashViewId: 'arc-usdc-erc20',
  amountUsdcMinor: '1000000',
  netReceivableUsdcMinor: '1000000',
  evidenceMode: 'SYNTHETIC',
  resultProvenance: 'SYNTHETIC_TEST',
  createdAt: '2026-09-09T00:00:00.000Z',
  maxDestinationAttempts: '2',
});

describe('M5 transfer worker evidence boundary', () => {
  it('persists a retry without fabricating settlement while attestation is absent', async () => {
    const calls: unknown[] = [];
    const repository = {
      claim: async () => ({ transferId: transfer.transferId, attempt: 1 }),
      load: async () => transfer,
      retry: async (...args: unknown[]) => calls.push(args),
      appendEvent: async () => {
        throw new Error('must not append an event');
      },
    } as unknown as TransferRepository;
    const result = await runTransferWorkerOnce(repository, {
      observe: async () => ({
        kind: 'WAITING',
        reasonCode: 'ATTESTATION_PENDING',
      }),
    });
    expect(result).toMatchObject({
      status: 'WAITING',
      reasonCode: 'ATTESTATION_PENDING',
    });
    expect(calls).toEqual([[transfer.transferId, 'ATTESTATION_PENDING', 30]]);
  });
});
