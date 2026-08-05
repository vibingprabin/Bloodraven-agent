import { visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { ansi, stripAnsi } from './tui-ansi.js';

// Side-by-side diff rendering for Edit/Write tool cards. Pure: the same
// (oldText, newText, width) tuple always yields the same lines, so the
// transcript render cache (keyed on entry fields + width) stays valid.

// No background helper exists in tui-ansi.ts (foreground-only), so the dark
// green/dark red cell tints for added/removed lines live here as named exports
// following the same rgb/color-level pattern.
const ADD_TINT_RGB = [22, 54, 28] as const; // #16361c
const DEL_TINT_RGB = [56, 24, 24] as const; // #381818

// Probe color capability once like tui-ansi's module-load detection so the
// tints degrade to identity under NO_COLOR / dumb terminals.
const COLORLESS = stripAnsi(ansi.dim('x')) === 'x';

function tint(rgb: readonly [number, number, number], text: string): string {
  if (COLORLESS) return text;
  return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[49m`;
}

/** Background tint for added lines. */
export function tintAdd(text: string): string {
  return tint(ADD_TINT_RGB, text);
}

/** Background tint for removed lines. */
export function tintDel(text: string): string {
  return tint(DEL_TINT_RGB, text);
}

const GUTTER = 2;
const NUM_SEP = ' │ ';
const COL_SEP = ' │ ';
const GUTTER_PLUS_SEPS = GUTTER + visibleWidth(NUM_SEP) * 2 + visibleWidth(COL_SEP);
const MIN_CONTENT_WIDTH = 24;
const CONTEXT_LINES = 3;
const MAX_HUNKS = 40;
const MAX_LINES_BEFORE_CAP = 200;
const NEW_FILE_HEAD_LINES = 3;
const NEW_FILE_TAIL_LINES = 3;

interface DiffRow {
  /** 0-based index into old content lines; -1 when the row has no old side. */
  oldIndex: number;
  /** 0-based index into new content lines; -1 when the row has no new side. */
  newIndex: number;
  kind: 'eq' | 'del' | 'add';
}

interface Hunk {
  start: number;
  end: number;
}

// A trailing newline terminates the last content line instead of inventing an
// empty line after it (`a\n` is one line, `a\n\n` is two, `\n` is one blank).
function contentLines(text: string): string[] {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

// Line LCS alignment. Common prefix/suffix are trimmed so a single local edit
// diffs in a tiny window; a middle LCS over the remainder falls back to a
// whole-block replace when the DP table would get too large.
function alignLines(oldLines: readonly string[], newLines: readonly string[]): DiffRow[] {
  const n = oldLines.length;
  const m = newLines.length;
  let start = 0;
  while (start < n && start < m && oldLines[start] === newLines[start]) start += 1;
  let end = 0;
  while (end < n - start && end < m - start && oldLines[n - 1 - end] === newLines[m - 1 - end])
    end += 1;
  const midOld = oldLines.slice(start, n - end);
  const midNew = newLines.slice(start, m - end);
  const rows: DiffRow[] = [];
  for (let i = 0; i < start; i += 1) rows.push({ oldIndex: i, newIndex: i, kind: 'eq' });
  const a = midOld.length;
  const b = midNew.length;
  if (a * b <= 250_000) {
    const dp: number[][] = Array.from({ length: a + 1 }, () => new Array<number>(b + 1).fill(0));
    for (let i = a - 1; i >= 0; i -= 1) {
      for (let j = b - 1; j >= 0; j -= 1) {
        dp[i]![j] =
          midOld[i] === midNew[j]
            ? dp[i + 1]![j + 1]! + 1
            : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a && j < b) {
      if (midOld[i] === midNew[j]) {
        rows.push({ oldIndex: start + i, newIndex: start + j, kind: 'eq' });
        i += 1;
        j += 1;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        rows.push({ oldIndex: start + i, newIndex: -1, kind: 'del' });
        i += 1;
      } else {
        rows.push({ oldIndex: -1, newIndex: start + j, kind: 'add' });
        j += 1;
      }
    }
    while (i < a) {
      rows.push({ oldIndex: start + i, newIndex: -1, kind: 'del' });
      i += 1;
    }
    while (j < b) {
      rows.push({ oldIndex: -1, newIndex: start + j, kind: 'add' });
      j += 1;
    }
  } else {
    for (let i = 0; i < a; i += 1) rows.push({ oldIndex: start + i, newIndex: -1, kind: 'del' });
    for (let j = 0; j < b; j += 1) rows.push({ oldIndex: -1, newIndex: start + j, kind: 'add' });
  }
  for (let k = 0; k < end; k += 1) {
    const index = n - end + k;
    rows.push({ oldIndex: index, newIndex: m - end + k, kind: 'eq' });
  }
  return rows;
}

// Group rows into hunks: each change block expanded by CONTEXT_LINES of
// unchanged context, overlapping hunks merged; a no-change diff keeps a small
// context window so the block never renders empty.
function buildHunks(rows: readonly DiffRow[]): Hunk[] {
  const blocks: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]!.kind === 'eq') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j]!.kind !== 'eq') j += 1;
    blocks.push({ start: i, end: j });
    i = j;
  }
  if (blocks.length === 0) {
    return rows.length > 0 ? [{ start: 0, end: Math.min(rows.length, CONTEXT_LINES * 2) }] : [];
  }
  const hunks: Hunk[] = [];
  for (const block of blocks) {
    const start = Math.max(0, block.start - CONTEXT_LINES);
    const end = Math.min(rows.length, block.end + CONTEXT_LINES);
    const last = hunks[hunks.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else hunks.push({ start, end });
  }
  return hunks;
}

function hunkLineCount(rows: readonly DiffRow[], hunk: Hunk): number {
  let count = 0;
  for (let r = hunk.start; r < hunk.end; r += 1) {
    if (rows[r]!.oldIndex >= 0) count += 1;
    if (rows[r]!.newIndex >= 0) count += 1;
  }
  return count;
}

function padTo(text: string, width: number): string {
  const missing = width - visibleWidth(text);
  return missing > 0 ? text + ' '.repeat(missing) : text;
}

// One physical side of a diff row: a dim right-aligned line number + ` │ `,
// then a body padded to the content width and styled by kind so the tint (or
// dim) reads as a continuous column highlight. `first` false suppresses the
// line number on wrapped continuation rows.
function cellText(
  numW: number,
  first: boolean,
  lineNumber: number,
  content: string,
  contentW: number,
  kind: DiffRow['kind'],
): { numPart: string; body: string } {
  // A line number <= 0 means the side has no line at this row (an add/del
  // opposite cell): leave the number slot blank rather than showing a `0`.
  const numText = first && lineNumber > 0 ? String(lineNumber).padStart(numW, ' ') : ' '.repeat(numW);
  const numPart = ansi.dim(`${numText}${NUM_SEP}`);
  const body =
    kind === 'add'
      ? tintAdd(padTo(content, contentW))
      : kind === 'del'
        ? tintDel(padTo(content, contentW))
        : ansi.dim(padTo(content, contentW));
  return { numPart, body };
}

// A `…` row collapsing a large unchanged gap between hunks (no line numbers).
function ellipsisRow(numW: number, contentW: number): string {
  const numPart = ansi.dim(`${' '.repeat(numW)}${NUM_SEP}`);
  const dot = ansi.dim('…'.padEnd(contentW));
  return `${' '.repeat(GUTTER)}${numPart}${dot}${ansi.dim(COL_SEP)}${numPart}${dot}`;
}

// The row tint lands only on the changed side: removed content is red on the
// left, added content green on the right, the opposite cell stays plain.
function sideKinds(kind: DiffRow['kind']): { oldKind: DiffRow['kind']; newKind: DiffRow['kind'] } {
  return {
    oldKind: kind === 'del' ? 'del' : 'eq',
    newKind: kind === 'add' ? 'add' : 'eq',
  };
}

/**
 * Side-by-side old|new rendering for an Edit. Returns undefined when the two
 * columns cannot fit legibly or there is no old side, so the caller falls back
 * to the single-column unified diff.
 */
export function renderEditDiff(oldText: string, newText: string, width: number): string[] | undefined {
  const oldLines = contentLines(oldText);
  const newLines = contentLines(newText);
  // An append edit has no old side; the left pane would be empty, so render
  // the new lines as a single green column instead.
  if (oldLines.length === 0) return renderNewFileColumns(newLines, width);
  const rows = alignLines(oldLines, newLines);
  const numW = Math.max(1, String(oldLines.length).length, String(newLines.length).length);
  const contentW = Math.floor((width - GUTTER_PLUS_SEPS - numW * 2) / 2);
  if (contentW < MIN_CONTENT_WIDTH) return undefined;

  const needsCap =
    oldLines.length > MAX_LINES_BEFORE_CAP || newLines.length > MAX_LINES_BEFORE_CAP;
  let hunks = buildHunks(rows);
  let hidden = 0;
  if (needsCap && hunks.length > MAX_HUNKS) {
    hidden = 0;
    for (let h = MAX_HUNKS; h < hunks.length; h += 1) hidden += hunkLineCount(rows, hunks[h]!);
    hunks = hunks.slice(0, MAX_HUNKS);
  }

  const lines: string[] = [];
  let sawHunk = false;
  for (const hunk of hunks) {
    if (sawHunk) lines.push(ellipsisRow(numW, contentW));
    sawHunk = true;
    for (let r = hunk.start; r < hunk.end; r += 1) {
      const row = rows[r]!;
      const oldSegments =
        row.oldIndex >= 0 ? wrapTextWithAnsi(oldLines[row.oldIndex]!, contentW) : [''];
      const newSegments =
        row.newIndex >= 0 ? wrapTextWithAnsi(newLines[row.newIndex]!, contentW) : [''];
      const kinds = sideKinds(row.kind);
      const physical = Math.max(oldSegments.length, newSegments.length);
      for (let p = 0; p < physical; p += 1) {
        const oldCell = cellText(
          numW,
          p === 0,
          row.oldIndex + 1,
          oldSegments[p] ?? '',
          contentW,
          kinds.oldKind,
        );
        const newCell = cellText(
          numW,
          p === 0,
          row.newIndex + 1,
          newSegments[p] ?? '',
          contentW,
          kinds.newKind,
        );
        lines.push(
          `${' '.repeat(GUTTER)}${oldCell.numPart}${oldCell.body}${ansi.dim(COL_SEP)}${newCell.numPart}${newCell.body}`,
        );
      }
    }
  }
  if (hidden > 0) {
    lines.push(`${' '.repeat(GUTTER)}${ansi.dim(`⋯ ${hidden} more lines ⋯`)}`);
  }
  return lines;
}

/**
 * Single-column view of new-file content (Write, or an append-only Edit):
 * right-aligned dim line numbers, green-tinted lines, head/tail cap mirroring
 * the existing result-text cap.
 */
export function renderNewFileLines(text: string, width: number): string[] | undefined {
  return renderNewFileColumns(contentLines(text), width);
}

function renderNewFileColumns(lines: string[], width: number): string[] | undefined {
  if (lines.length === 0) return undefined;
  const numW = String(lines.length).length;
  const contentW = width - GUTTER - numW - visibleWidth(NUM_SEP);
  if (contentW < MIN_CONTENT_WIDTH) return undefined;

  let head: string[];
  let tail: string[];
  let hidden = 0;
  if (lines.length > NEW_FILE_HEAD_LINES + NEW_FILE_TAIL_LINES + 1) {
    head = lines.slice(0, NEW_FILE_HEAD_LINES);
    tail = lines.slice(lines.length - NEW_FILE_TAIL_LINES);
    hidden = lines.length - head.length - tail.length;
  } else {
    head = lines;
    tail = [];
  }
  const out: string[] = [];
  const emit = (line: string, lineNumber: number): void => {
    const segments = wrapTextWithAnsi(line, contentW);
    for (let p = 0; p < segments.length; p += 1) {
      const numPart = ansi.dim(
        `${(p === 0 ? String(lineNumber) : '').padStart(numW, ' ')}${NUM_SEP}`,
      );
      out.push(`${' '.repeat(GUTTER)}${numPart}${tintAdd(padTo(segments[p] ?? '', contentW))}`);
    }
  };
  for (let i = 0; i < head.length; i += 1) emit(head[i]!, i + 1);
  if (hidden > 0) {
    out.push(`${' '.repeat(GUTTER)}${ansi.dim(`⋯ ${hidden} lines hidden ⋯`)}`);
  }
  for (let i = 0; i < tail.length; i += 1) {
    emit(tail[i]!, lines.length - tail.length + i + 1);
  }
  return out;
}

/** Compact `+N −M` tally for an Edit's old_string/new_string args. */
export function editDiffTally(oldText: string, newText: string): string | undefined {
  const dels = contentLines(oldText).length;
  const adds = contentLines(newText).length;
  if (adds === 0 && dels === 0) return undefined;
  const parts: string[] = [];
  if (adds > 0) parts.push(ansi.green(`+${adds}`));
  if (dels > 0) parts.push(ansi.red(`-${dels}`));
  return parts.join(' ');
}

/** Compact `+N` tally for a Write's content. */
export function writeDiffTally(content: string): string | undefined {
  const adds = contentLines(content).length;
  if (adds === 0) return undefined;
  return ansi.green(`+${adds}`);
}
