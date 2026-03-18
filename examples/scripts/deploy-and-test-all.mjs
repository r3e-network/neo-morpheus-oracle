import { execFileSync } from 'node:child_process';

const steps = [
  'examples/scripts/deploy-neox-examples.mjs',
  'examples/scripts/test-neox-examples.mjs',
  'examples/scripts/deploy-n3-examples.mjs',
  'examples/scripts/test-n3-examples.mjs',
];

for (const script of steps) {
  console.log(`\n=== Running ${script} ===`);
  execFileSync('node', [script], { stdio: 'inherit' });
}
