import assert from 'node:assert/strict';
import { replayDemoSession } from '../../scripts/lib/session-replay.js';
import type { DemoSessionData } from '@poa/schemas';
export async function rejectDemoTampering(session: DemoSessionData) {
  const cases: ((copy: DemoSessionData) => void)[] = [
    (copy) => {
      copy.commitment.leafSet.leaves[0]!.contentHash = '0x' + 'a'.repeat(64);
    },
    (copy) => {
      copy.initialPortfolios[0]!.cash[0]!.amountUsdcMinor = '1';
    },
    (copy) => {
      copy.actions[0]!.record.receivedAt =
        copy.actions[0]!.receipts[0]!.observedAt;
    },
    (copy) => {
      copy.actions[0]!.receipts.pop();
    },
    (copy) => {
      copy.checkpoints[0]!.rawObjects.pop();
    },
    (copy) => {
      copy.initialPortfolios[1] = copy.initialPortfolios[0]!;
    },
    (copy) => {
      (copy.referenceEntries[0] as any).rawObjects = [];
    },
    (copy) => {
      copy.sourceFiles.pop();
    },
    (copy) => {
      copy.objects.pop();
    },
    (copy) => {
      (copy as any).resultProvenance = 'ETHEREUM_MAINNET_FORWARD';
    },
  ];
  for (const mutate of cases) {
    const changed = structuredClone(session);
    mutate(changed);
    await assert.rejects(replayDemoSession(changed));
  }
  console.log(
    'PASS: demo leaf/financial/source/receive-time/missing-object/reference/provenance tampering rejected',
  );
}
