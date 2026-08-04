import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  renderRelevantSkillsBlock,
  selectRelevantSkills,
  SkillSurfaceTracker,
  SKILL_SURFACE_MAX,
  SKILL_SURFACE_MIN_SCORE,
} from '../skills-relevance.js';
import type { ScannedSkill } from '../skills-discovery.js';

function skill(name: string, description: string, overrides: Partial<ScannedSkill> = {}): ScannedSkill {
  return {
    ref: `user:maka:${name}`,
    id: name,
    name,
    description,
    scope: 'user',
    source: 'maka',
    path: `/skills/${name}`,
    discoveryRoot: '/skills',
    declaredTools: [],
    requiredTools: [],
    requiredCapabilities: [],
    enabled: true,
    pinned: false,
    runtimeStatus: 'enabled',
    precedence: 0,
    content: '',
    contentSha256: '',
    ...overrides,
  };
}

describe('selectRelevantSkills', () => {
  const sql = skill(
    'sql-injection-testing',
    'Comprehensive SQL injection assessment. NOT for general database work.',
  );
  const api = skill(
    'api-security-testing',
    'REST/GraphQL API security workflow: auth, authorization, rate limiting.',
  );
  const pdf = skill('pdf-forms', 'Extracts text and tables from PDFs, fills PDF forms.');
  const inventory = [sql, api, pdf];

  it('surfaces the best-matching skill for the query', () => {
    const selection = selectRelevantSkills(inventory, 'test SQL injection on the login form');
    assert.equal(selection.matches.length, 1);
    assert.equal(selection.matches[0].name, 'sql-injection-testing');
  });

  it('surfaces nothing when no skill clears the precision gate', () => {
    const selection = selectRelevantSkills(inventory, 'cook pasta for dinner');
    assert.equal(selection.matches.length, 0);
    assert.ok(selection.belowThreshold > 0);
  });

  it('never re-surfaces a skill already visible in the static catalog', () => {
    const selection = selectRelevantSkills(inventory, 'SQL injection testing on the login form', {
      alreadyVisibleRefs: new Set([sql.ref]),
    });
    assert.ok(selection.visibleExcluded >= 1);
    assert.equal(
      selection.matches.some((match) => match.name === 'sql-injection-testing'),
      false,
    );
  });

  it('excludes behaviorally-suppressed skills', () => {
    const selection = selectRelevantSkills(inventory, 'SQL injection testing', {
      suppressedRefs: new Set([sql.ref]),
    });
    assert.equal(
      selection.matches.some((match) => match.name === 'sql-injection-testing'),
      false,
    );
  });

  it('caps the surfaced set at SKILL_SURFACE_MAX', () => {
    const many = [
      skill('sql-a', 'SQL injection testing skill A.'),
      skill('sql-b', 'SQL injection testing skill B.'),
      skill('sql-c', 'SQL injection testing skill C.'),
      skill('sql-d', 'SQL injection testing skill D.'),
    ];
    const selection = selectRelevantSkills(many, 'sql injection testing');
    assert.ok(selection.matches.length <= SKILL_SURFACE_MAX);
  });

  it('respects an explicit minimum score', () => {
    const selection = selectRelevantSkills(inventory, 'SQL injection testing', { minScore: 1_000_000 });
    assert.equal(selection.matches.length, 0);
  });
});

describe('renderRelevantSkillsBlock', () => {
  it('returns undefined for an empty selection (silence is correct)', () => {
    assert.equal(
      renderRelevantSkillsBlock({ query: 'x', matches: [], totalEligible: 0, gatedCount: 0, visibleExcluded: 0, suppressedExcluded: 0, belowThreshold: 0, truncated: 0 }),
      undefined,
    );
  });

  it('renders candidates with neutral, optional framing', () => {
    const block = renderRelevantSkillsBlock({
      query: 'sql',
      matches: [
        {
          ref: 'user:maka:sql-injection-testing',
          id: 'sql-injection-testing',
          name: 'sql-injection-testing',
          description: 'SQL injection assessment. NOT for general database work.',
          score: 200,
          scope: 'user',
          source: 'maka',
        },
      ],
      totalEligible: 1,
      gatedCount: 1,
      visibleExcluded: 0,
      suppressedExcluded: 0,
      belowThreshold: 0,
      truncated: 0,
    });
    assert.ok(block?.includes('<relevant-skills candidates="optional"'));
    assert.ok(block?.includes('call Skill with this exact name'));
    assert.ok(block?.includes('not general database work'), 'stop-condition hint present');
    assert.ok(!/recommended|should use|MUST/i.test(block ?? ''), 'no assertive framing');
  });
});

describe('SkillSurfaceTracker', () => {
  it('suppresses a skill surfaced N times with no invocation', () => {
    const tracker = new SkillSurfaceTracker();
    tracker.recordSurface('s1', ['ref-a']);
    tracker.recordSurface('s1', ['ref-a']);
    const suppressed = tracker.suppressedRefs('s1');
    assert.ok(suppressed.has('ref-a'));
  });

  it('keeps a skill that was actually invoked', () => {
    const tracker = new SkillSurfaceTracker();
    tracker.recordSurface('s1', ['ref-a']);
    tracker.recordSurface('s1', ['ref-a']);
    tracker.recordInvocation('s1', 'ref-a');
    assert.equal(tracker.suppressedRefs('s1').has('ref-a'), false);
  });

  it('does not suppress a skill surfaced only once', () => {
    const tracker = new SkillSurfaceTracker();
    tracker.recordSurface('s1', ['ref-a']);
    assert.equal(tracker.suppressedRefs('s1').has('ref-a'), false);
  });

  it('silences the session after an invoked skill is surfaced again', () => {
    const tracker = new SkillSurfaceTracker();
    tracker.silence('s1');
    assert.equal(tracker.silenced('s1'), true);
    assert.equal(tracker.silenced('s2'), false);
  });

  it('is isolated per session', () => {
    const tracker = new SkillSurfaceTracker();
    tracker.recordSurface('s1', ['ref-a']);
    tracker.recordSurface('s1', ['ref-a']);
    assert.ok(tracker.suppressedRefs('s1').has('ref-a'));
    assert.equal(tracker.suppressedRefs('s2').has('ref-a'), false);
  });
});
