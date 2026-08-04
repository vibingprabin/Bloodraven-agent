// Verifier for the tool-calling task.
// PASS: answer.txt contains EVAL_TOOL_OK (the Bash tool ran and returned output).
// FAIL: TOOL_UNAVAILABLE, missing file, or wrong content.
import { readFileSync, existsSync } from 'node:fs';

const file = 'answer.txt';
if (!existsSync(file)) {
  console.error('FAIL: answer.txt missing');
  process.exit(1);
}
const text = readFileSync(file, 'utf8').trim();
if (text.includes('TOOL_UNAVAILABLE')) {
  console.error('FAIL: agent reported tool unavailable');
  process.exit(1);
}
if (text.includes('EVAL_TOOL_OK')) {
  console.log(`PASS: Bash tool call produced expected output: ${text}`);
  process.exit(0);
}
console.error(`FAIL: unexpected answer content: ${text}`);
process.exit(1);
