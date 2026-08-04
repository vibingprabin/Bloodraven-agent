// Verifier for the nepse-mcp task.
// PASS: answer.txt contains a plausible SCORE=... LABEL=... line (the agent
//       reached the live NEPSE MCP server through the nepse MCP tools).
// FAIL: NO_NEPSE_MCP, missing file, or no recognizable score/label pair.
import { readFileSync, existsSync } from 'node:fs';

const file = 'answer.txt';
if (!existsSync(file)) {
  console.error('FAIL: answer.txt missing');
  process.exit(1);
}
const text = readFileSync(file, 'utf8').trim();
if (text.includes('NO_NEPSE_MCP')) {
  console.error('FAIL: agent reported nepse MCP tools unavailable');
  process.exit(1);
}
const score = text.match(/SCORE=(\d+(?:\.\d+)?)/);
const label = text.match(/LABEL=(\w+)/);
if (score && label && Number(score[1]) >= 0 && Number(score[1]) <= 100) {
  console.log(`PASS: NEPSE MCP reached — score ${score[1]} (${label[1]})`);
  process.exit(0);
}
console.error(`FAIL: unexpected answer content: ${text}`);
process.exit(1);
