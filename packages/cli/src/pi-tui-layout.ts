import { Container, type Component, type Terminal } from '@earendil-works/pi-tui';
// Deep import (pi-tui does not re-export it): the viewport shadow diff must
// compare the same canonical lines pi-tui diffs, and pi-tui normalizes Thai/Lao
// AM sequences before its diff. Pinned to pi-tui 0.80.3.
import { normalizeTerminalOutput } from '@earendil-works/pi-tui/dist/utils.js';
import {
  renderMakaPiActivityStrip,
  renderMakaPiBrandBar,
  renderMakaPiDivider,
  renderMakaPiPendingQueue,
  renderMakaPiStatusLine,
  renderMakaPiTranscript,
  type MakaPiTranscriptMetadata,
  type MakaPiTranscriptState,
} from './pi-transcript.js';

export class MakaTranscriptComponent implements Component {
  constructor(
    private readonly state: MakaPiTranscriptState,
    private readonly metadata: () => MakaPiTranscriptMetadata,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    return renderMakaPiTranscript(this.state, this.metadata(), width);
  }
}

/** The opencode-style top brand bar (Bloodraven wordmark in accent). */
export class MakaBrandBarComponent implements Component {
  constructor(private readonly metadata: () => MakaPiTranscriptMetadata) {}

  invalidate(): void {}

  render(width: number): string[] {
    return [renderMakaPiBrandBar(this.metadata(), width)];
  }
}

/** The accent separator band above the input panel (sticky-bottom chrome). */
export class MakaDividerComponent implements Component {
  invalidate(): void {}

  render(width: number): string[] {
    return [renderMakaPiDivider(width)];
  }
}

export class MakaStatusLineComponent implements Component {
  constructor(private readonly metadata: () => MakaPiTranscriptMetadata) {}

  invalidate(): void {}

  render(width: number): string[] {
    // Two rows now: identity + metrics (opencode-style bottom bar). chromeRows
    // in the layout counts `.length`, so the extra row is accounted for without
    // a magic constant here.
    return renderMakaPiStatusLine(this.metadata(), width);
  }
}

export class MakaActivityStripComponent implements Component {
  constructor(private readonly metadata: () => MakaPiTranscriptMetadata) {}

  invalidate(): void {}

  render(width: number): string[] {
    return [renderMakaPiActivityStrip(this.metadata(), width)];
  }
}

/** The pending-queue bar (Steering:/Queued:) rendered just above the editor. */
export class MakaPendingQueueComponent implements Component {
  constructor(private readonly state: MakaPiTranscriptState) {}

  invalidate(): void {}

  render(width: number): string[] {
    return renderMakaPiPendingQueue(this.state, width);
  }
}

/**
 * Stacks the brand bar and transcript above the editor and status line. The
 * transcript is never windowed: every line is emitted and, when the whole
 * document is taller than the terminal, pi-tui's differential renderer scrolls
 * older output into the terminal's own scrollback (exactly as the upstream Pi
 * TUI does). History is scrolled with the terminal/trackpad rather than an
 * in-app pager, so long output is never truncated.
 *
 * The only layout work is anchoring: the brand bar sits pinned to the top and
 * the remaining chrome (activity strip, pending queue, accent divider, editor,
 * status line) is bottom-anchored. While the transcript fits, blank rows pad it
 * up so that chrome sits at the bottom of the screen; once it overflows the
 * padding is gone and the buffer grows past the viewport.
 */
export class MakaPiLayoutComponent extends Container {
  /** Composed lines of the previous render, for the viewport-top shadow diff. */
  private previousLines: string[] | undefined;
  private previousRows: number | undefined;
  private previousWidth: number | undefined;
  /** Previous viewport top in COMPOSED coordinates (including the brand bar). */
  private previousViewportTopComposed: number | undefined;

  constructor(
    private readonly state: MakaPiTranscriptState,
    private readonly brand: MakaBrandBarComponent,
    private readonly transcript: MakaTranscriptComponent,
    private readonly activityStrip: MakaActivityStripComponent,
    private readonly pendingQueue: MakaPendingQueueComponent,
    private readonly divider: MakaDividerComponent,
    private readonly editor: Component,
    private readonly statusLine: Component,
    private readonly terminal: Terminal,
  ) {
    super();
    this.addChild(brand);
    this.addChild(transcript);
    this.addChild(activityStrip);
    this.addChild(pendingQueue);
    this.addChild(divider);
    this.addChild(editor);
    this.addChild(statusLine);
  }

  render(width: number): string[] {
    const brandLines = this.brand.render(width);
    const transcriptLines = this.transcript.render(width);
    const activityLines = this.activityStrip.render(width);
    const pendingLines = this.pendingQueue.render(width);
    const dividerLines = this.divider.render(width);
    const editorLines = this.editor.render(width);
    const statusLines = this.statusLine.render(width);
    // #1064: when the activity strip is showing (a turn is running), separate
    // it from the last transcript line with a blank row. Without this, a
    // thinking or tool row (the agent-work stack, which has no internal blank
    // gaps) sits directly against `Working… 12s`.
    const activityActive =
      activityLines.length > 0 && activityLines.some((line) => line.length > 0);
    const lastTranscriptLine = transcriptLines[transcriptLines.length - 1];
    const needGap =
      activityActive && lastTranscriptLine !== undefined && lastTranscriptLine.length > 0;
    const paddedTranscript = needGap ? [...transcriptLines, ''] : transcriptLines;
    // The brand bar is pinned to the top; every other chrome row is
    // bottom-anchored (activity, pending, divider, editor, status line).
    const chromeRows =
      activityLines.length + pendingLines.length + dividerLines.length +
      editorLines.length + statusLines.length;
    const viewportRows = Math.max(0, this.terminal.rows - chromeRows);
    const paddingRows = Math.max(0, viewportRows - paddedTranscript.length);
    const lines = [
      ...brandLines,
      ...paddedTranscript,
      ...Array.from({ length: paddingRows }, () => ''),
      ...activityLines,
      ...pendingLines,
      ...dividerLines,
      ...editorLines,
      ...statusLines,
    ];
    // #1097: record where pi-tui's live viewport starts for this render. The
    // shadow diff runs over the FULL composed buffer (brand bar included), but
    // the state value is consumed in transcript-line coordinates — the brand
    // bar height is the constant offset between the two.
    const normalized = lines.map(normalizeTerminalOutput);
    const composedTop = this.nextViewportTop(normalized, width);
    this.previousViewportTopComposed = composedTop;
    this.state.renderGeometry.viewportTop = Math.max(0, composedTop - brandLines.length);
    this.previousLines = normalized;
    this.previousRows = this.terminal.rows;
    this.previousWidth = width;
    return lines;
  }

  /** `lines` are normalized, matching what pi-tui's differential renderer diffs. */
  private nextViewportTop(lines: string[], width: number): number {
    const rows = this.terminal.rows;
    const tailTop = Math.max(0, lines.length - rows);
    const previous = this.previousLines;
    const current = this.previousViewportTopComposed;
    // First render; width changes full-redraw unconditionally (tui.js ~1061),
    // even when no line ends up wrapping differently. `current` is set in the
    // same render pass as `previousLines`, so it is present whenever the
    // previous lines are; the guard is defensive for the type system.
    if (previous === undefined || this.previousWidth !== width || current === undefined) {
      return tailTop;
    }
    if (this.previousRows !== rows) {
      // Height changes full-redraw (tui.js ~1069) except under Termux, where
      // the software keyboard resizes constantly and pi-tui instead keeps the
      // buffer and recomputes its top from it (tui.js ~983).
      return Boolean(process.env.TERMUX_VERSION)
        ? Math.max(tailTop, current + (this.previousRows ?? rows) - rows)
        : tailTop;
    }
    // Any change above the viewport top forces a full redraw (tui.js ~1169).
    const scan = Math.min(previous.length, lines.length);
    let firstChanged = -1;
    for (let i = 0; i < scan; i += 1) {
      if (previous[i] !== lines[i]) {
        firstChanged = i;
        break;
      }
    }
    if (firstChanged !== -1 && firstChanged < current) return tailTop;
    if (lines.length < previous.length) {
      // Pure truncation: pi-tui's deleted-lines path full-redraws when the
      // new document ends at or above the viewport top (tui.js ~1122,
      // `targetRow < prevViewportTop`) or when more than a screenful of rows
      // must be cleared (tui.js ~1136); a shallower truncation keeps the
      // viewport where it was.
      if (lines.length <= current) return tailTop;
      if (firstChanged === -1 && previous.length - lines.length > rows) return tailTop;
    }
    return Math.max(current, tailTop);
  }
}
