import type { EditorTheme, SelectListTheme } from '@earendil-works/pi-tui';

// Bloodraven theme — k-means extraction from the app icon (D:\Downloads\bg.png),
// a dark lowpoly scene: a near-black ground, cool gray-blue surfaces and borders,
// and one warm red accent from the creature's eyes. The base accent is the exact
// extraction; the working accent is a hue-matched brightening of it (see below).
const BLOODRAVEN_BG_RGB = [8, 10, 11] as const; // #080a0b — dominant (36.9%)
const BLOODRAVEN_SURFACE_RGB = [29, 32, 35] as const; // #1d2023 — panels
const BLOODRAVEN_BORDER_RGB = [54, 59, 62] as const; // #363b3e — quiet chrome
const BLOODRAVEN_BORDER_HI_RGB = [82, 88, 92] as const; // #52585c — raised chrome
const BLOODRAVEN_MUTED_RGB = [117, 125, 135] as const; // #757d87 — dim text

// The eye red from the icon: rgb(109,18,18) = #6d1212, saturation 0.83. Its
// contrast against the near-black theme background measures ~1.65:1, which is
// too dark for thin terminal glyphs (spinner frames, reasoning headers, running
// discs, the wordmark). `accent` therefore uses a hue-matched brightening of the
// same red family — hue ≈357° preserved, lightness raised to L=45% — measuring
// ~3.5:1 on #080a0b, which is legible without leaving the eye-red family.
// `accentDeep` keeps the exact extraction for large/chrome elements (the input
// divider band, editor chrome) where a quieter deep tone reads as the lowpoly
// accent. Verified by measured contrast rather than taste.
const BLOODRAVEN_ACCENT_RGB = [109, 18, 18] as const; // #6d1212 — exact eye red
const BLOODRAVEN_ACCENT_TEXT_RGB = [197, 40, 33] as const; // #c52821 — legible text accent

// #1064: detect terminal color capability at module load so truecolor is
// downgraded on basic terminals and disabled entirely under NO_COLOR.
let colorLevel = detectColorLevel();

/**
 * Override the detected color level — for tests that assert exact escape
 * sequences. Production code never calls this; the module-load detection
 * governs real terminal output.
 */
export function _setColorLevelForTesting(level: 0 | 1 | 2 | 3): void {
  colorLevel = level;
  rebuildAnsi();
}

/**
 * Detect color level from an explicit env snapshot — for unit-testing the
 * detection logic directly. Production code uses `detectColorLevel()` which
 * reads `process.env` at module load.
 */
export function _detectColorLevelForTesting(env: {
  NO_COLOR?: string;
  TERM?: string;
  COLORTERM?: string;
}): 0 | 1 | 2 | 3 {
  return detectColorLevelFromEnv(env);
}

export let ansi = buildAnsi();

// #1053: status disc — a single `●` tinted by tone. The shared visual primitive
// for the transcript's tool rows: ok = done, accent = running, danger = error,
// muted = detached/unavailable (neither a success nor a failure of this session).
export type DiscTone = 'ok' | 'muted' | 'accent' | 'danger';

const DISC_GLYPH = '●';

export function disc(tone: DiscTone): string {
  const color =
    tone === 'ok'
      ? ansi.green
      : tone === 'muted'
        ? ansi.muted
        : tone === 'accent'
          ? ansi.accent
          : ansi.red;
  return color(DISC_GLYPH);
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

export function editorTheme(): EditorTheme {
  return {
    // Neutral raised-chrome border: the accent is reserved for the divider band
    // above the input, so a red box here would double up on the separator.
    borderColor: ansi.border,
    selectList: selectListTheme(),
  };
}

export function selectListTheme(): SelectListTheme {
  return {
    selectedPrefix: ansi.accent,
    selectedText: ansi.bold,
    description: ansi.dim,
    scrollInfo: ansi.dim,
    noMatch: ansi.dim,
  };
}

function rebuildAnsi(): void {
  ansi = buildAnsi();
}

function buildAnsi() {
  return {
    bold: style(1, 22),
    dim: style(2, 22),
    italic: style(3, 23),
    underline: style(4, 24),
    strikethrough: style(9, 29),
    red: style(31, 39),
    green: style(32, 39),
    yellow: style(33, 39),
    // Brightened eye red — thin text, discs, wordmark, reasoning headers.
    accent: colorLevel === 0 ? identity : colorFn(BLOODRAVEN_ACCENT_TEXT_RGB, colorLevel),
    // Exact icon extraction — large/chrome surfaces (the input divider band).
    accentDeep: colorLevel === 0 ? identity : colorFn(BLOODRAVEN_ACCENT_RGB, colorLevel),
    // #757d87 cool muted — dim text, de-emphasised chrome.
    muted: colorLevel === 0 ? identity : colorFn(BLOODRAVEN_MUTED_RGB, colorLevel),
    // #52585c raised border — quiet structural lines and editor chrome.
    border: colorLevel === 0 ? identity : colorFn(BLOODRAVEN_BORDER_HI_RGB, colorLevel),
    reverse: style(7, 27),
  };
}

function detectColorLevel(): 0 | 1 | 2 | 3 {
  const level = detectColorLevelFromEnv({
    NO_COLOR: process.env.NO_COLOR,
    TERM: process.env.TERM,
    COLORTERM: process.env.COLORTERM,
  });
  // Windows PowerShell/cmd do not set TERM or COLORTERM, yet Windows Terminal,
  // VS Code integrated terminal, and conhost are all truecolor-capable. Treat
  // an unset TERM on win32 as truecolor (level 3) rather than colorless — the
  // Bloodraven theme (crimson accent, colored discs, spinner) is invisible
  // otherwise.
  if (level === 0 && !process.env.NO_COLOR && process.platform === 'win32') return 3;
  return level;
}

/**
 * Pure color level detection from an env snapshot.
 * - 0: no color (NO_COLOR non-empty, or TERM is dumb/empty)
 * - 1: 16-color (basic ANSI)
 * - 2: 256-color (TERM contains 256color)
 * - 3: 24-bit truecolor (COLORTERM=truecolor/24bit or TERM ends with -truecolor)
 *
 * Benchmark: codex `supports-color` 3-level; pi `theme.ts` 256 fallback.
 */
function detectColorLevelFromEnv(env: {
  NO_COLOR?: string;
  TERM?: string;
  COLORTERM?: string;
}): 0 | 1 | 2 | 3 {
  // NO_COLOR spec — a non-empty value disables all color.
  // (NO_COLOR= with an empty string does NOT disable color per the spec.)
  if (env.NO_COLOR && env.NO_COLOR.length > 0) return 0;
  // TERM=dumb is explicitly colorless.
  const term = env.TERM ?? '';
  if (term === 'dumb' || term === '') return 0;
  // COLORTERM=truecolor → 24-bit.
  const colorterm = env.COLORTERM ?? '';
  if (colorterm === 'truecolor' || colorterm === '24bit') return 3;
  // Known truecolor terminals by TERM name.
  if (/\-(truecolor|24bit)$/.test(term)) return 3;
  // 256-color: most modern terminals set this explicitly.
  if (/256color|256-color/.test(term)) {
    return 2;
  }
  // Everything else (xterm, screen, rxvt, …) supports at least 16 colors.
  return 1;
}

/**
 * Build a color function for the detected capability level.
 * - level 3: 24-bit truecolor `\x1b[38;2;R;G;Bm`
 * - level 2: nearest 256-color cube entry
 * - level 1: nearest 16-color (ANSI 30-37 + bright via 90-97)
 */
function colorFn(
  rgb: readonly [number, number, number],
  level: 1 | 2 | 3,
): (text: string) => string {
  if (level === 3) return rgb24(...rgb);
  if (level === 2) return rgb256(...rgb);
  return rgb16(...rgb);
}

function rgb24(red: number, green: number, blue: number): (text: string) => string {
  return (text) => `\x1b[38;2;${red};${green};${blue}m${text}\x1b[39m`;
}

/**
 * Map an RGB triple to the nearest 256-color palette entry.
 * The 256 palette is: 0-15 (standard), 16-231 (6×6×6 cube), 232-255 (grayscale).
 * For custom brand colors we use the 6×6×6 cube (indices 16-231).
 */
function rgb256(red: number, green: number, blue: number): (text: string) => string {
  const index = nearest256(red, green, blue);
  return (text) => `\x1b[38;5;${index}m${text}\x1b[39m`;
}

function nearest256(red: number, green: number, blue: number): number {
  // 6×6×6 cube: each channel maps to {0,1,2,3,4,5} → values {0,95,135,175,215,255}.
  const cube = [0, 95, 135, 175, 215, 255];
  const r = nearestIndex(red, cube);
  const g = nearestIndex(green, cube);
  const b = nearestIndex(blue, cube);
  return 16 + r * 36 + g * 6 + b;
}

function nearestIndex(value: number, stops: readonly number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const dist = Math.abs(value - stops[i]!);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Map an RGB triple to the nearest 16-color ANSI entry (0-7 normal, 8-15 bright).
 * Uses a simple nearest-match against the standard 16-color palette.
 */
function rgb16(red: number, green: number, blue: number): (text: string) => string {
  // Standard 16-color palette (RGB approximations).
  const palette: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 0], // 0 black
    [128, 0, 0], // 1 red
    [0, 128, 0], // 2 green
    [128, 128, 0], // 3 yellow
    [0, 0, 128], // 4 blue
    [128, 0, 128], // 5 magenta
    [0, 128, 128], // 6 cyan
    [192, 192, 192], // 7 white
    [128, 128, 128], // 8 bright black (grey)
    [255, 0, 0], // 9 bright red
    [0, 255, 0], // 10 bright green
    [255, 255, 0], // 11 bright yellow
    [0, 0, 255], // 12 bright blue
    [255, 0, 255], // 13 bright magenta
    [0, 255, 255], // 14 bright cyan
    [255, 255, 255], // 15 bright white
  ];
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i]!;
    const dist = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  // Foreground: 30-37 for normal, 90-97 for bright (8-15).
  const code = best < 8 ? 30 + best : 90 + (best - 8);
  return (text) => `\x1b[${code}m${text}\x1b[39m`;
}

function identity(text: string): string {
  return text;
}

function style(open: number, close: number): (text: string) => string {
  if (colorLevel === 0) return identity;
  return (text) => `\x1b[${open}m${text}\x1b[${close}m`;
}
