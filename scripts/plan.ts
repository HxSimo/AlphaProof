import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const plan = JSON.parse(readFileSync('docs/milestones.json', 'utf8')) as {
  authorizedMilestone: string;
  criticalPath: string;
  milestones: {
    id: string;
    title: string;
    dependsOn: string[];
    steps: { id: string; deliverable: string; exit: string }[];
    commands: string[];
    externalGate: string;
  }[];
};
assert.deepEqual(
  plan.milestones.map((m) => m.id),
  Array.from({ length: 8 }, (_, i) => `M${i}`),
);
for (const [i, milestone] of plan.milestones.entries()) {
  assert.deepEqual(milestone.dependsOn, i ? [`M${i - 1}`] : []);
  assert.ok(
    milestone.steps.length &&
      milestone.commands.length &&
      milestone.externalGate,
  );
  assert.equal(
    new Set(milestone.steps.map((s) => s.id)).size,
    milestone.steps.length,
  );
  for (const step of milestone.steps) assert.ok(step.deliverable && step.exit);
}
const requested = process.argv[2];
if (requested === '--check') {
  console.log(
    'Milestone plan valid: M0–M7, sequential dependencies, observable exits and validation commands',
  );
  process.exit(0);
}
if (requested && !plan.milestones.some((m) => m.id === requested))
  throw new Error('Use pnpm plan M0 through M7');
console.log(
  `Authorized scope: ${plan.authorizedMilestone}\nCritical path: ${plan.criticalPath}`,
);
for (const m of plan.milestones.filter(
  (m) => !requested || requested === m.id,
)) {
  console.log(
    `\n${m.id}: ${m.title}\nDependencies: ${m.dependsOn.join(', ') || 'none'}`,
  );
  for (const step of m.steps)
    console.log(`${step.id}: ${step.deliverable}\n  Exit: ${step.exit}`);
  console.log(
    `Validation:\n${m.commands.map((c) => `  ${c}`).join('\n')}\nExternal gate: ${m.externalGate}`,
  );
}
