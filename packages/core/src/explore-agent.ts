/**
 * Read-only deep research mode (external reference design).
 *
 * Deep research is visible and bounded. The session profile pins
 * permissionMode=explore and may use the read-only ExploreAgent tool for
 * scoped local investigation; it is not a hidden autonomous writer.
 */

import type { DeepResearchRun } from './deep-research-run.js';

/**
 * A product intent a caller can open a new session at, distinct from the
 * ordinary chat that needs no intent at all. Absence is spelled `undefined`,
 * not a `'chat'` member: a second spelling of "no mode" is a second thing to
 * keep in agreement.
 */
export type SessionStartMode = 'deep_research';

export const DEEP_RESEARCH_SESSION_LABEL = 'mode:deep_research';

export const DEEP_RESEARCH_WORKFLOW_STEPS = [
  {
    title: 'Locate the entry points first',
    body: 'Read directories, config, startup chain, and test entry points to build a project map.',
  },
  {
    title: 'Then trace the data flow',
    body: 'Follow key modules, IPC, storage, permission, and runtime boundaries to the real implementation.',
  },
  {
    title: 'Then compare against references',
    body: 'Split borrowable points into borrow / diverge / risk / gate.',
  },
  {
    title: 'Finally give a mergeable plan',
    body: 'Output a file list, risk boundaries, and verification commands; do not modify files in read-only mode.',
  },
] as const;

export const DEEP_RESEARCH_REPORT_SECTIONS = [
  {
    title: 'Conclusion first',
    body: 'Use 3-5 points to state the real current state, main gaps, and priority recommendations.',
  },
  {
    title: 'Source evidence',
    body: 'List files, functions, config, tests, and runtime paths instead of giving impression-based judgment.',
  },
  {
    title: 'Borrow breakdown',
    body: 'Write borrow / diverge / risk / gate for every borrowable point.',
  },
  {
    title: 'Implementation improvements',
    body: 'Give a file list, boundaries, and verification commands split into small-step improvements.',
  },
] as const;

export const DEEP_RESEARCH_SCOPE_OPTIONS = [
  {
    label: 'Quick',
    body: 'Only scan entry points, key files, and the most likely data flow; suitable for small problems with a known scope.',
  },
  {
    label: 'Standard',
    body: 'Default depth: trace core paths, related tests, and main risks, then give implementation recommendations.',
  },
  {
    label: 'Deep',
    body: 'Multiple rounds of cross-module, reference-project, and boundary-condition tracing; use only when the user explicitly asks.',
  },
] as const;

export const DEEP_RESEARCH_EVIDENCE_CHECKLIST = [
  {
    title: 'Project entry',
    body: 'First read README, package/config, startup scripts, and directory layering to confirm how it actually runs.',
  },
  {
    title: 'Core path',
    body: 'Trace the UI entry, IPC/services, storage, runtime calls, and error handling; do not just look at surface components.',
  },
  {
    title: 'Boundary conditions',
    body: 'Check permissions, incognito mode, token/path exposure, failure retries, and user-visible feedback.',
  },
  {
    title: 'Verification evidence',
    body: 'Find the matching tests, fixtures, smoke docs, and reproducible commands; explicitly mark gaps.',
  },
] as const;

export const DEEP_RESEARCH_PROGRESS_CHECKPOINTS = [
  {
    title: 'Build the checklist first',
    body: 'When the research scope spans more than three interrelated points, list verifiable checks before tracing code.',
  },
  {
    title: 'Mark the current item',
    body: 'Be explicit about which item is being verified; move to the next only after evidence is obtained.',
  },
  {
    title: 'Record blockers',
    body: 'Mark items blocked when source, runtime, or test evidence cannot be found; do not fill gaps with guesses.',
  },
  {
    title: 'Converge the plan',
    body: 'Completed items must be consolidated into borrow / diverge / risk / gate and actionable improvements.',
  },
] as const;

export const DEEP_RESEARCH_STARTER_PROMPTS = [
  {
    label: 'Research a reference project',
    prompt:
      'Please read-only research this project: first map the directory structure, core modules, startup chain, data flow, and test entry points, then list the feature designs we can borrow, risks to avoid, and an improvement order that lands in Maka.',
  },
  {
    label: 'Read a reference project fully',
    prompt:
      'Please read-only research this reference project at deep scope: build a directory and module map first, then read core features, runtime, storage, permissions, UI, tests, and docs layer by layer; output every borrowable point as borrow / diverge / risk / gate and give an improvement order for Maka.',
  },
  {
    label: 'Compare one feature implementation',
    prompt:
      'Please read-only compare how this feature is implemented in the reference project and in Maka: point out the key files, runtime boundaries, UI entry, persistence, test coverage, and the smallest mergeable improvement.',
  },
  {
    label: 'Do a security-boundary audit',
    prompt:
      'Please read-only audit this feature\'s security boundary: permissions, token/key flow, IPC/renderer exposure, file paths, privacy mode, logging, and telemetry. Output blocking risks and the corresponding contract test.',
  },
] as const;

export function isDeepResearchSession(labels: readonly string[] | undefined): boolean {
  return Array.isArray(labels) && labels.includes(DEEP_RESEARCH_SESSION_LABEL);
}

export const DEEP_RESEARCH_IMPLEMENTATION_PROMPT_MAX_CHARS = 12_000;

export function buildDeepResearchImplementationPrompt(run: DeepResearchRun): string {
  if (run.status !== 'completed' || !run.handoff || !run.reportArtifactId) {
    throw new Error('Deep Research implementation handoff requires a completed run');
  }
  const lines: string[] = [
    'This is a new implementation task created from a completed read-only Deep Research session.',
    'The original research session remains read-only. Inspect the current code and present an implementation plan before changing project files.',
    '',
    `Research objective: ${run.objective}`,
    `Source session: ${run.sessionId}`,
    `Final report artifact: ${run.reportArtifactId}`,
    `Handoff artifact: ${run.handoff.artifactId}`,
    '',
    'Implementation tasks:',
    ...run.handoff.implementationTasks.map((item) => `- ${item}`),
    '',
    'Recommended issues:',
    ...(run.handoff.recommendedIssues.length > 0
      ? run.handoff.recommendedIssues.map((item) => `- ${item}`)
      : ['- None specified.']),
    '',
    'Recommended pull requests:',
    ...(run.handoff.recommendedPullRequests.length > 0
      ? run.handoff.recommendedPullRequests.map((item) => `- ${item}`)
      : ['- None specified.']),
    '',
    'Verification commands:',
    ...run.handoff.verificationCommands.map((item) => `- ${item}`),
  ];
  const content = lines.join('\n');
  const characters = Array.from(content);
  if (characters.length <= DEEP_RESEARCH_IMPLEMENTATION_PROMPT_MAX_CHARS) return content;
  const marker = '\n[Handoff truncated to the safe composer limit.]';
  return (
    characters
      .slice(0, DEEP_RESEARCH_IMPLEMENTATION_PROMPT_MAX_CHARS - Array.from(marker).length)
      .join('') + marker
  );
}

export function buildDeepResearchSystemPromptFragment(): string {
  return [
    'Deep research mode is active for this session.',
    '',
    'Mode contract:',
    '- Inspect first. Prefer Read, Glob, Grep, ExploreAgent, and safe read-only shell commands.',
    '- Use ExploreAgent only for a separate, self-contained local investigation that benefits from a bounded read-only worker. Keep synthesis and final judgment in the main thread.',
    '- Do not use ExploreAgent just because it is available. If the next step is a known file, a specific symbol, package scripts, test setup, config, or 1-3 obvious files, inspect directly in the main thread.',
    '- When using ExploreAgent, bound the prompt with a goal, relevant paths or keywords, what to ignore, a stopping condition, and exactly what evidence the worker should return.',
    '- Do not write, edit, delete, move, or rename user project files; do not install, run migrations, start services, or send network requests unless the user explicitly leaves research mode.',
    '- The deep_research_* tools are the one write exception: they only update Maka-owned research artifacts and an append-only workspace ledger, never the user project.',
    '- If implementation is needed, produce a concrete plan with files, risks, and verification commands instead of modifying files.',
    '- Keep findings source-grounded: name files, functions, configs, tests, and observed behavior.',
    '- Summarize borrow / diverge / risk / gate when comparing a reference project to Maka.',
    '',
    'Durable workspace protocol:',
    '- Call deep_research_start once with the concrete objective and scope level. After interruption or context compaction, call deep_research_status, then deep_research_read_artifact for the exact saved evidence needed to continue.',
    '- Knowledge-base stage: archive each important raw source first with deep_research_save_artifact role=source, then save evidence notes that cite those source artifact ids.',
    '- After each bounded local exploration or web-research substep, call deep_research_record_step with roots or query terms, ignored paths, a stopping condition, expected evidence, inspected files/symbols/URLs, worker run ids, persisted evidence ids, and any blocker.',
    '- Keep the four durable checklist items current with deep_research_update_checklist. Completed items require evidence artifacts; blocked items require an explicit reason.',
    '- Checkpoint every meaningful research round with deep_research_checkpoint, including open questions, next steps, related task ids, and the artifacts needed to resume.',
    '- Report-writing stage: save an outline, then source-backed report_section artifacts for conclusion, source_evidence, borrow_diverge_risk_gate, implementation_recommendations, and verification. Mark each section completed only when it is ready.',
    '- Save one final role=report artifact and one role=handoff artifact. The handoff must turn findings into implementation tasks, recommended issues and/or PRs, and verification commands without performing project writes.',
    '- Call deep_research_complete only after every checklist item is completed or explicitly skipped, all five report sections are completed, and both report and handoff artifacts are persisted.',
    '',
    'Research workflow:',
    ...DEEP_RESEARCH_WORKFLOW_STEPS.map((step) => `- ${step.title}: ${step.body}`),
    '',
    'Research scope budget:',
    ...DEEP_RESEARCH_SCOPE_OPTIONS.map((option) => `- ${option.label}: ${option.body}`),
    '- If the user does not specify a scope, use Standard. Use Deep only when the user explicitly asks for deep / exhaustive / full-project research.',
    '',
    'Evidence checklist:',
    ...DEEP_RESEARCH_EVIDENCE_CHECKLIST.map((item) => `- ${item.title}: ${item.body}`),
    '- If any checklist area cannot be verified from available files or runtime context, call that out explicitly instead of guessing.',
    '',
    'Progress checkpoints:',
    ...DEEP_RESEARCH_PROGRESS_CHECKPOINTS.map((item) => `- ${item.title}: ${item.body}`),
    '- Treat the checklist as a control loop for multi-step research, not as a hidden task system. Keep it visible in the answer or status update when the research spans multiple modules.',
    '',
    'Final report contract:',
    ...DEEP_RESEARCH_REPORT_SECTIONS.map((section) => `- ${section.title}: ${section.body}`),
  ].join('\n');
}
