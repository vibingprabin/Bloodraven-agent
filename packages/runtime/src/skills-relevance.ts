/**
 * Just-in-time skill surfacing.
 *
 * The static skill catalog (budget-capped, alphabetical) tells the model what
 * skills EXIST, but does not tell it which skill applies to the CURRENT step.
 * This module projects, per turn, the few skills whose name/description best
 * match the current user message — subject to four guards that prevent the
 * over-triggering loop the surfacing mechanism itself can cause:
 *
 * 1. Precision gate: only skills above a minimum score are surfaced. Weak
 *    matches surface nothing (silence is the correct output).
 * 2. Visible-exclusion: a skill already rendered in the static catalog is
 *    never re-surfaced (no redundancy, no compound anchoring).
 * 3. Behavioral suppression: a skill surfaced repeatedly and never invoked is
 *    dropped for the session; a skill invoked with no follow-up use is
 *    likewise dropped. The tracker is per-session and monotonic.
 * 4. 1x neutral framing: surfaced candidates are labeled optional and carry a
 *    stop-condition hint, so the block nudges at the lowest effective strength
 *    (research: assertive cues amplify invocation ~7x).
 *
 * Placement is turn-boundary only (appended to the current user message),
 * never mid-tool-chain.
 */

import type { HostCapabilities } from './skills-context.js';
import { gateSkillsByHostCapabilities, rankSkillSearchCandidates } from './skills-context.js';
import type { ScannedSkill } from './skills-discovery.js';

export const SKILL_SURFACE_MAX = 3;
export const SKILL_SURFACE_MIN_SCORE = 80;
export const SKILL_SURFACE_SUPPRESS_AFTER_UNUSED = 2;

export interface RelevantSkillMatch {
  ref: string;
  id: string;
  name: string;
  description: string;
  score: number;
  scope: string;
  source: string;
}

export interface SelectRelevantSkillsOptions {
  /** Maximum number of skills to surface this turn. */
  max?: number;
  /** Minimum lexical score to surface a skill. */
  minScore?: number;
  /** Refs already visible in the static catalog (never re-surfaced). */
  alreadyVisibleRefs?: ReadonlySet<string>;
  host?: HostCapabilities;
  /** Refs to exclude this session (behavioral suppression). */
  suppressedRefs?: ReadonlySet<string>;
  /** When set, a skill surfaced this many times without an invocation is hidden. */
  suppressAfterUnused?: number;
}

export interface RelevantSkillsSelection {
  query: string;
  matches: RelevantSkillMatch[];
  totalEligible: number;
  gatedCount: number;
  visibleExcluded: number;
  suppressedExcluded: number;
  belowThreshold: number;
  truncated: number;
}

/**
 * Pure, deterministic per-turn projection of the skills relevant to a user
 * message. Reuses the catalog's lexical scorer so surfacing and SkillSearch
 * agree on what matches what.
 */
export function selectRelevantSkills(
  inventory: readonly ScannedSkill[],
  query: string,
  options: SelectRelevantSkillsOptions = {},
): RelevantSkillsSelection {
  const max = options.max ?? SKILL_SURFACE_MAX;
  const minScore = options.minScore ?? SKILL_SURFACE_MIN_SCORE;
  const visible = options.alreadyVisibleRefs ?? new Set<string>();
  const suppressed = options.suppressedRefs ?? new Set<string>();
  const suppressAfter = options.suppressAfterUnused ?? SKILL_SURFACE_SUPPRESS_AFTER_UNUSED;

  const gated = options.host
    ? gateSkillsByHostCapabilities([...inventory], options.host).filter((skill) => skill.eligible)
    : inventory;
  const eligible = gated.filter((skill) => skill.enabled && !skill.shadowedBy);

  const ranking = rankSkillSearchCandidates(eligible, query, undefined);
  const matches: RelevantSkillMatch[] = [];
  let gatedCount = 0;
  let visibleExcluded = 0;
  let suppressedExcluded = 0;
  let belowThreshold = 0;

  for (const { skill, score } of ranking.ranked) {
    if (matches.length >= max) break;
    if (score < minScore) {
      belowThreshold += 1;
      continue;
    }
    if (visible.has(skill.ref)) {
      visibleExcluded += 1;
      continue;
    }
    if (suppressed.has(skill.ref)) {
      suppressedExcluded += 1;
      continue;
    }
    gatedCount += 1;
    matches.push({
      ref: skill.ref,
      id: skill.id,
      name: skill.name,
      description: skill.description,
      score,
      scope: skill.scope,
      source: skill.source,
    });
  }

  return {
    query: ranking.query,
    matches,
    totalEligible: eligible.length,
    gatedCount,
    visibleExcluded,
    suppressedExcluded,
    belowThreshold,
    truncated: Math.max(0, ranking.ranked.length - matches.length),
  };
}

/**
 * Render surfaced skills with 1x neutral framing. Each candidate is optional,
 * carries a "use only if this step requires it" label, and — where possible —
 * a stop-condition hint extracted from the description. No "recommended", no
 * "should use": assertive framing measurably increases spurious invocation.
 */
export function renderRelevantSkillsBlock(selection: RelevantSkillsSelection): string | undefined {
  if (selection.matches.length === 0) return undefined;
  const lines = [
    '<relevant-skills candidates="optional" — for the CURRENT step only; ignore if none fit>',
  ];
  for (const match of selection.matches) {
    const desc = cleanRelevanceText(match.description);
    const stop = stopConditionHint(desc) ?? '(no stop-condition declared)';
    lines.push(
      `- ${match.name}: ${desc}  (call Skill with this exact name to load it — ${stop})`,
    );
  }
  lines.push('</relevant-skills>');
  return lines.join('\n');
}

/**
 * Per-session behavioral suppression. Monotonic: once a skill is suppressed it
 * stays suppressed for the session, and once the session is silenced (an
 * invoked skill produced no follow-up use) no further candidates surface.
 * This is the feedback loop that prevents "keep suggesting, keep ignoring".
 */
export class SkillSurfaceTracker {
  private readonly surfacedBySession = new Map<string, Map<string, number>>();
  private readonly invokedBySession = new Map<string, Set<string>>();
  private readonly silencedBySession = new Set<string>();

  recordSurface(sessionId: string, refs: readonly string[]): void {
    let byRef = this.surfacedBySession.get(sessionId);
    if (!byRef) {
      byRef = new Map();
      this.surfacedBySession.set(sessionId, byRef);
    }
    for (const ref of refs) byRef.set(ref, (byRef.get(ref) ?? 0) + 1);
  }

  recordInvocation(sessionId: string, ref: string): void {
    let invoked = this.invokedBySession.get(sessionId);
    if (!invoked) {
      invoked = new Set();
      this.invokedBySession.set(sessionId, invoked);
    }
    invoked.add(ref);
  }

  /**
   * Suppressed = surfaced N+ times with no invocation, or surfaced once and
   * never used again this session. The threshold is per-call so a skill that
   * was once useful but is no longer being used also decays out of the block.
   */
  suppressedRefs(
    sessionId: string,
    suppressAfterUnused = SKILL_SURFACE_SUPPRESS_AFTER_UNUSED,
  ): ReadonlySet<string> {
    const suppressed = new Set<string>();
    const byRef = this.surfacedBySession.get(sessionId);
    const invoked = this.invokedBySession.get(sessionId);
    if (!byRef) return suppressed;
    for (const [ref, count] of byRef) {
      const used = invoked?.has(ref) === true;
      if (!used && count >= suppressAfterUnused) suppressed.add(ref);
      if (used && count >= suppressAfterUnused + 1) suppressed.add(ref);
    }
    return suppressed;
  }

  silenced(sessionId: string): boolean {
    return this.silencedBySession.has(sessionId);
  }

  silence(sessionId: string): void {
    this.silencedBySession.add(sessionId);
  }

  private forget(sessionId: string): void {
    this.surfacedBySession.delete(sessionId);
    this.invokedBySession.delete(sessionId);
    this.silencedBySession.delete(sessionId);
  }

  /** Bound session memory; drop least-recently-touched sessions. */
  prune(maxSessions = 200): void {
    while (this.surfacedBySession.size > maxSessions) {
      const first = this.surfacedBySession.keys().next().value;
      if (typeof first !== 'string') break;
      this.forget(first);
    }
  }
}

function cleanRelevanceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Cheap stop-condition heuristic: pull a clause like "NOT for X" / "not X" /
 * "use only when X" from the description so the surfaced line carries the
 * negative case (loop-literature root cause: missing termination clauses).
 */
function stopConditionHint(description: string): string | undefined {
  const lower = description.toLowerCase();
  const notMatch = lower.match(/\bnot (for|for general|needed|required for|appropriate for) ([^.;]{2,40})/);
  if (notMatch) return `not ${notMatch[2]}`;
  const onlyMatch = lower.match(/\bonly (?:use |needed )?when ([^.;]{2,40})/);
  if (onlyMatch) return `only when ${onlyMatch[1]}`;
  const avoidMatch = lower.match(/\bavoid ([^.;]{2,40})/);
  if (avoidMatch) return `avoid ${avoidMatch[1]}`;
  return undefined;
}
