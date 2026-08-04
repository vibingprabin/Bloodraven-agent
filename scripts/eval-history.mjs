// Bloodraven eval history reader.
// Prints each recorded loop iteration: model, task pass/fail, pass rate, and
// context-footprint trend, so the test/eval/improve loop has a readable ledger.
//
// Usage: node scripts/eval-history.mjs [--out <dir>]
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : join(repoRoot, 'evals', 'runs');
const historyFile = join(outDir, 'history.jsonl');

if (!existsSync(historyFile)) {
  console.log(`No eval history at ${historyFile}. Run \`npm run eval:loop\` first.`);
  process.exit(0);
}

const lines = readFileSync(historyFile, 'utf8').trim().split('\n').filter(Boolean);
console.log(`\nBloodraven eval history (${lines.length} iteration${lines.length === 1 ? '' : 's'})`);
console.log('='.repeat(88));
for (const line of lines) {
  const row = JSON.parse(line);
  const when = new Date(row.ts).toLocaleString();
  const tasks = row.tasks
    .map((t) => (t.passed ? 'PASS' : t.smoke ? 'SMOKE' : 'FAIL') + ':' + t.taskId)
    .join('  ');
  const fp = row.footprint;
  console.log(
    `[${row.iteration}] ${when}  ${row.model}  ${row.passRate}\n` +
      `     ${tasks}\n` +
      `     footprint: ${fp.toolCount} tools / ${fp.schemaChars} chars / ~${fp.schemaTokens} tokens` +
      (row.footprintDelta !== undefined ? `  (delta ${row.footprintDelta} chars)` : ''),
  );
}
console.log('='.repeat(88));
