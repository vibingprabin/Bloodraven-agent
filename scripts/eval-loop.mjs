// Bloodraven eval loop runner.
//
// Runs the tasks in an eval spec against the REAL agent (deepseek-v4-flash via
// the configured opencode-go connection) using the exact same `maka run` code
// path the user gets in day-to-day usage, verifies each task's answer file,
// and records pass rate + context-footprint telemetry per iteration so the
// test/eval/improve loop has a visible history.
//
// Usage:
//   node scripts/eval-loop.mjs <spec.json> [--out <dir>] [--iterations N] [--model <id>]
//
// Requires: built workspaces (npm run build), the opencode-go connection
// configured, and (for skill/tool tasks) the test skills installed in
// %APPDATA%\Maka\workspaces\default\skills.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const specPath = resolve(process.argv[2] ?? join(repoRoot, 'evals', 'specs', 'core-loop.spec.json'));
const specDir = dirname(specPath);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const args = process.argv.slice(2);
const outDir = flag(args, '--out') ?? join(repoRoot, 'evals', 'runs');
const iterations = Number(flag(args, '--iterations') ?? '1');
const modelId = flag(args, '--model') ?? 'deepseek-v4-flash';
const connectionSlug = flag(args, '--connection') ?? 'opencode-go';
const configId = flag(args, '--config') ?? 'flash';
const workspace = join(homedir(), 'AppData', 'Roaming', 'Maka', 'workspaces', 'default');
const telemetryDb = join(workspace, 'runtime.sqlite');
const historyFile = join(outDir, 'history.jsonl');

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}

function runMaka(instruction, cwd) {
  const cli = join(repoRoot, 'packages', 'cli', 'dist', 'cli.js');
  const args = ['run', '--cwd', cwd, '--yolo', '--connection', connectionSlug, '--model', modelId, '--timeout', '240000', instruction];
  try {
    const output = execFileSync(process.execPath, [cli, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1', GIT_PAGER: 'cat', PAGER: 'cat' },
    });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, error: (e.stderr?.toString?.() || e.stdout?.toString?.() || String(e)).slice(0, 400) };
  }
}

function readFootprintSync() {
  try {
    if (!existsSync(telemetryDb)) return { toolCount: 'n/a', schemaChars: 'n/a', schemaTokens: 'n/a' };
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(telemetryDb, { readOnly: true });
    const rows = db
      .prepare(
        "SELECT record_json FROM core_agent_run_events WHERE event_type = 'send_diagnostics_recorded' ORDER BY event_ts DESC LIMIT 1",
      )
      .all();
    db.close();
    if (rows.length === 0) return { toolCount: 'n/a', schemaChars: 'n/a', schemaTokens: 'n/a' };
    const seg = JSON.parse(rows[0].record_json).data?.promptSegments?.find((s) => s.kind === 'tool_schema');
    return {
      toolCount: seg?.toolCount ?? 'n/a',
      schemaChars: seg?.chars ?? 'n/a',
      schemaTokens: seg?.estimatedTokens ?? 'n/a',
    };
  } catch (e) {
    return { toolCount: 'n/a', schemaChars: 'n/a', schemaTokens: 'n/a', error: String(e).slice(0, 80) };
  }
}

const require = createRequire(import.meta.url);

function runVerifier(task, workDir) {
  if (!task.verification || !task.verification.command) {
    return { passed: true, detail: 'no verification command' };
  }
  // The spec command is a shell line like "node verify-x.mjs"; strip the
  // leading `node` and run with the current process's node so it always works.
  const parts = task.verification.command.trim().split(/\s+/);
  const program = parts[0] === 'node' ? process.execPath : parts[0];
  const args = parts[0] === 'node' ? parts.slice(1) : parts.slice(1);
  try {
    const output = execFileSync(program, args, {
      cwd: workDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { passed: true, detail: output.trim() };
  } catch (e) {
    return { passed: false, detail: (e.stdout?.toString?.() ?? String(e)).slice(0, 200) };
  }
}

function makeWorkDir(task) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const src = resolve(specDir, task.workspaceDir);
  const dest = join(tmpdir(), `maka-eval-${task.id}-${id}`);
  cpSync(src, dest, { recursive: true });
  return dest;
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const config = spec.configs.find((c) => c.id === configId) ?? spec.configs[0];
  const isReal = config.backend !== 'fake';
  if (isReal) {
    console.log(`\nBloodraven eval loop  (real model: ${config.model} via ${config.llmConnectionSlug})`);
  } else {
    console.log(`\nBloodraven eval loop  (fake backend smoke)`);
  }
  console.log(`spec: ${specPath}`);
  console.log(`tasks: ${spec.tasks.map((t) => t.id).join(', ')}`);
  console.log(`iterations: ${iterations}\n`);

  for (let iter = 1; iter <= iterations; iter++) {
    const before = readFootprintSync();
    const results = [];
    for (const task of spec.tasks) {
      if (isReal) {
        const workDir = makeWorkDir(task);
        const run = runMaka(task.instruction, workDir);
        const verdict = runVerifier(task, workDir);
        results.push({
          taskId: task.id,
          configId: config.id,
          passed: verdict.passed,
          detail: verdict.detail,
          runError: run.ok ? null : run.error,
        });
        rmSync(workDir, { recursive: true, force: true });
      } else {
        // Fake backend: no real model, so the answer file won't exist — mark as smoke-only.
        results.push({ taskId: task.id, configId: config.id, passed: false, detail: 'fake backend: no model run', smoke: true });
      }
    }
    const after = readFootprintSync();
    const passes = results.filter((r) => r.passed).length;
    const row = {
      ts: Date.now(),
      iteration: iter,
      model: isReal ? config.model : 'fake',
      connection: isReal ? config.llmConnectionSlug : undefined,
      tasks: results,
      passRate: `${passes}/${results.length}`,
      footprint: after,
      footprintDelta: before.schemaChars !== 'n/a' && after.schemaChars !== 'n/a' ? after.schemaChars - before.schemaChars : undefined,
    };
    writeFileSync(historyFile, JSON.stringify(row) + '\n', { flag: 'a' });

    console.log(`--- iteration ${iter} ---`);
    for (const r of results) {
      const mark = r.passed ? 'PASS' : r.smoke ? 'SMOKE' : 'FAIL';
      console.log(`  [${mark}] ${r.taskId}  ${r.detail ?? ''}`);
      if (r.runError) console.log(`         run: ${String(r.runError).slice(0, 120)}`);
    }
    console.log(`  pass rate: ${row.passRate}`);
    console.log(`  tool schema: ${after.toolCount} tools / ${after.schemaChars} chars / ~${after.schemaTokens} tokens`);
  }

  console.log(`\nhistory: ${historyFile}`);
}

main();
