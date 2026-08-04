import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AttentionController } from '../tui-attention.js';

const BUSY = 'Maka (working)';

const BELL = '\x07';

class SpyTerminal {
  readonly writes: string[] = [];
  readonly titles: string[] = [];
  write(data: string): void {
    this.writes.push(data);
  }
  setTitle(title: string): void {
    this.titles.push(title);
  }
  get bells(): number {
    return this.writes.filter((w) => w === BELL).length;
  }
  get title(): string | undefined {
    return this.titles.at(-1);
  }
}

/** A controller wired to a spy terminal and a clock. */
function makeController(longTurnThresholdMs = 8000) {
  const terminal = new SpyTerminal();
  let clock = 0;
  const controller = new AttentionController(terminal, {
    baseTitle: 'Maka',
    now: () => clock,
    longTurnThresholdMs,
  });
  return {
    terminal,
    controller,
    advance: (ms: number) => (clock += ms),
  };
}

describe('AttentionController title', () => {
  test('updates the base title while preserving the current state marker', () => {
    const { terminal, controller } = makeController();
    controller.promptTurnStarted();

    controller.setBaseTitle('Generated title');

    assert.equal(terminal.title, 'Generated title (working)');
    controller.promptTurnEnded();
    assert.equal(terminal.title, 'Generated title');
  });

  test('control actions mark busy without ever ringing', () => {
    const { terminal, controller } = makeController();
    controller.focusChanged(false);
    controller.controlStarted();
    assert.equal(terminal.title, BUSY);
    controller.controlEnded();
    assert.equal(terminal.title, 'Maka');
    assert.equal(terminal.bells, 0);
  });

  test('reset clears the busy marker and goes inert', () => {
    const { terminal, controller } = makeController(8000);
    controller.focusChanged(false);
    controller.promptTurnStarted();
    assert.equal(terminal.title, BUSY);
    controller.reset();
    assert.equal(terminal.title, 'Maka');
    // A finalizer that settles after close must not re-dirty the handed-back
    // title or ring — every event method is now a no-op.
    controller.promptTurnEnded();
    controller.attentionNeeded();
    controller.promptTurnStarted();
    assert.equal(terminal.title, 'Maka');
    assert.equal(terminal.bells, 0);
  });

  test('keeps the title static while busy (no spinner in the title bar)', () => {
    const { terminal, controller } = makeController(8000);
    controller.focusChanged(false);
    controller.promptTurnStarted();
    // The title is a stable "(working)" marker — the braille spinner lives in
    // the TUI content (activity strip), never the title bar, so no rotation.
    assert.equal(terminal.title, BUSY);
    controller.attentionNeeded();
    assert.equal(terminal.title, '★ Maka');
  });
});

describe('AttentionController long-turn ring', () => {
  test('rings only when a long turn ends while unfocused', () => {
    const cases = [
      { focused: false, elapsedMs: 9000, bells: 1, title: '★ Maka' },
      { focused: true, elapsedMs: 9000, bells: 0, title: 'Maka' },
      { focused: false, elapsedMs: 200, bells: 0, title: 'Maka' },
    ];

    for (const { focused, elapsedMs, bells, title } of cases) {
      const harness = makeController(8000);
      harness.controller.focusChanged(focused);
      harness.controller.promptTurnStarted();
      harness.advance(elapsedMs);
      harness.controller.promptTurnEnded();
      assert.equal(harness.terminal.bells, bells, `${focused}/${elapsedMs}`);
      assert.equal(harness.terminal.title, title, `${focused}/${elapsedMs}`);
    }
  });

  test('focus and a new turn both clear a stale attention marker', () => {
    for (const action of ['focus', 'turn'] as const) {
      const { terminal, controller, advance } = makeController(8000);
      controller.focusChanged(false);
      controller.promptTurnStarted();
      advance(9000);
      controller.promptTurnEnded();
      assert.equal(terminal.title, '★ Maka');
      if (action === 'focus') controller.focusChanged(true);
      else controller.promptTurnStarted();
      assert.equal(terminal.title, action === 'focus' ? 'Maka' : BUSY, action);
    }
  });
});

describe('AttentionController attention events', () => {
  test('rings for explicit attention only while unfocused', () => {
    for (const focused of [false, true]) {
      const { terminal, controller } = makeController();
      controller.focusChanged(focused);
      controller.attentionNeeded();
      assert.equal(terminal.bells, focused ? 0 : 1, String(focused));
      assert.equal(terminal.title, focused ? 'Maka' : '★ Maka', String(focused));
    }
  });
});
