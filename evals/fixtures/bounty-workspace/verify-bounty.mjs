// Verifier for the bugcrowd-mission task.
// PASS: the agent produced (1) at least one real engagements JSON page fetched
//       from Bugcrowd, (2) a REPORT.md that names a real program whose slug
//       appears in the fetched JSON, and (3) the three required files.
// This proves the agent actually reached live Bugcrowd data and picked a real target.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const files = ['candidates.md', 'TARGET.md', 'REPORT.md'];
for (const f of files) {
  if (!existsSync(f)) {
    console.error(`FAIL: ${f} missing`);
    process.exit(1);
  }
}

// Find fetched engagements JSON (evidence the agent reached live data).
const jsonFiles = readdirSync('.').filter(
  (name) => /engagements.*\.json$/.test(name) || /^.*_p\d+\.json$/.test(name),
);
if (jsonFiles.length === 0) {
  console.error('FAIL: no fetched engagements JSON evidence found');
  process.exit(1);
}

// Build the set of real program slugs/names from fetched data.
const realSlugs = new Set();
const realNames = new Set();
for (const f of jsonFiles) {
  try {
    const data = JSON.parse(readFileSync(f, 'utf8'));
    for (const e of data.engagements ?? []) {
      const slug = (e.briefUrl ?? '').split('/').pop() ?? '';
      if (slug) realSlugs.add(slug.toLowerCase());
      if (e.name) realNames.add(e.name.toLowerCase());
    }
  } catch {
    // ignore unparseable file; another may parse
  }
}
if (realSlugs.size === 0) {
  console.error('FAIL: fetched JSON contained no parseable engagements');
  process.exit(1);
}

// The recommended target in REPORT.md must reference a real fetched program.
const report = readFileSync('REPORT.md', 'utf8').toLowerCase();
const recommendation = report.match(/recommended target:\s*([^\n]+)/)?.[1]?.trim() ?? '';
const recommendedLine = recommendation || report.slice(0, 2000);
const matchedSlug = [...realSlugs].find((slug) => recommendedLine.includes(slug));
const matchedName = [...realNames].find((name) => recommendedLine.includes(name));

console.log(`fetched engagements JSON: ${jsonFiles.length} file(s)`);
console.log(`real slugs in data: ${realSlugs.size}`);
console.log(`report names a real program: ${matchedSlug || matchedName ? 'YES' : 'NO'}`);

if (report.length < 500) {
  console.error('FAIL: REPORT.md is too thin (<500 chars)');
  process.exit(1);
}
if (!matchedSlug && !matchedName) {
  console.error('FAIL: recommended target does not match any program in fetched data');
  process.exit(1);
}
console.log('PASS: mission completed with real Bugcrowd data and a grounded target');
process.exit(0);
