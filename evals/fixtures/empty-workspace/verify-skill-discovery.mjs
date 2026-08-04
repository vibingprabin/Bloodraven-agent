// Verifier for the skill-discovery task.
// PASS: answer.txt mentions the skill name and the threshold -1.78.
// FAIL: NO_SKILL, missing file, or no threshold.
import { readFileSync, existsSync } from 'node:fs';

const file = 'answer.txt';
if (!existsSync(file)) {
  console.error('FAIL: answer.txt missing');
  process.exit(1);
}
const text = readFileSync(file, 'utf8');
if (text.includes('NO_SKILL')) {
  console.error('FAIL: agent reported no skill');
  process.exit(1);
}
const hasSkill = /forensic|financial statement|earnings|manipulation/i.test(text);
const hasThreshold = /-1\.78|-1.8|-1,78/i.test(text);
if (hasSkill && hasThreshold) {
  console.log(`PASS: skill found with threshold: ${text.trim()}`);
  process.exit(0);
}
console.error(`FAIL: answer missing skill name or threshold: ${text.trim()}`);
process.exit(1);
