/**
 * Human-readable copy for a not-ready chat connection: maps each
 * `NO_REAL_CONNECTION:<reason>` code to one fix sentence so a first-run / CLI
 * surface does not hand-roll its own table.
 *
 * Pure & sync. `describeChatConfigurationReason` turns a reason into an English
 * sentence naming what is missing and where to fix it (Settings > Models);
 * `parseNoRealConnectionError` reports whether an error is a NO_REAL_CONNECTION
 * failure and recovers its reason, tolerating both the bare CLI form and the
 * `NO_REAL_CONNECTION:<reason>: <message>` form that IPC wrapping produces.
 *
 * This module is the canonical parser and copy table for both CLI and desktop;
 * surfaces adapt their local event shape here instead of duplicating the rules.
 */

import type { ChatConfigurationReason } from './connection-readiness.js';

const GENERIC_FIX_COPY =
  'The model connection cannot send right now. Open Settings > Models, check the connection, and retry.';

/**
 * The one hand-maintained table: reason → fix copy. Typed as
 * `Record<ChatConfigurationReason, string>`, so adding a reason to the union
 * fails the build until its copy is added here — completeness and copy live in
 * one place. `CHAT_CONFIGURATION_REASONS` and the parser's known-token set are
 * derived from its keys, so neither can drift from it.
 */
const REASON_FIX_COPY: Record<ChatConfigurationReason, string> = {
  missing_default_connection:
    'No default model is configured. Open Settings > Models and add a usable model connection before sending.',
  connection_missing:
    'The model connection this session depends on was deleted. Open Settings > Models and reselect or recreate it.',
  connection_disabled:
    'The current model connection is disabled. Open Settings > Models and enable it or choose another default model.',
  missing_api_key:
    'The current model connection has no usable credentials. Open Settings > Models, add the API key or log back in, then send.',
  missing_model:
    'The current model connection has no usable model. Open Settings > Models and choose a default model before sending.',
  empty_model_list:
    'The current model connection has no enabled models. Open Settings > Models and add or enable a model before sending.',
  model_not_enabled:
    'The model selected for this session is not enabled. Open Settings > Models and reselect a usable model before sending.',
  model_not_chat_capable:
    'The model selected for this session cannot be used for chat. Open Settings > Models and reselect a chat-capable model before sending.',
  oauth_subscription_not_wired:
    'This subscription account cannot be used as a chat model yet. Choose a usable API-key or wired OAuth model connection instead.',
  fake_backend:
    'This session comes from an old local mock connection. Open Settings > Models, add a real model, and start a new session.',
};

/**
 * Every reason, derived from the copy table so test coverage and the parser's
 * known-token set track the union automatically. Module-scoped (the package
 * index does not re-export it) — only the parser and the tests read it.
 */
export const CHAT_CONFIGURATION_REASONS = Object.keys(REASON_FIX_COPY) as ChatConfigurationReason[];

const KNOWN_CHAT_CONFIGURATION_REASONS: ReadonlySet<string> = new Set(CHAT_CONFIGURATION_REASONS);

/**
 * Fix instructions for a not-ready connection. `undefined` (a missing or
 * unrecognized reason) returns the generic fallback; every known reason has its
 * own line, guaranteed present by the `Record` type above.
 */
export function describeChatConfigurationReason(reason: string | undefined): string {
  return reason !== undefined && KNOWN_CHAT_CONFIGURATION_REASONS.has(reason)
    ? REASON_FIX_COPY[reason as ChatConfigurationReason]
    : GENERIC_FIX_COPY;
}

// `\bNO_REAL_CONNECTION\b` pins the whole code: the trailing boundary stops it
// matching a longer word like `NO_REAL_CONNECTIONS` (the reason group is
// optional, so without the boundary that prefix alone would falsely match and
// swallow an unrelated error). Then capture the reason token whole, up to the
// next delimiter (`:` in the wrapped `...:<reason>: <msg>` form, whitespace, or
// end), so a token that only prefixes a known reason (`missing_api_key2`) is
// not mistaken for it.
const NO_REAL_CONNECTION_RE = /\bNO_REAL_CONNECTION\b(?::([^\s:]+))?/;

export interface ParsedNoRealConnectionError {
  /** True when the error is a `NO_REAL_CONNECTION` failure. */
  matched: boolean;
  /** The known reason, or `undefined` for a missing/unrecognized token. */
  reason?: ChatConfigurationReason;
}

/**
 * Classify a thrown error: whether it is a NO_REAL_CONNECTION failure and, if
 * so, its reason. A matched error with a missing or unrecognized token yields
 * `{ matched: true, reason: undefined }`, so a caller still renders generic fix
 * copy rather than mistaking it for an unrelated failure and re-throwing.
 */
export function parseNoRealConnectionError(error: unknown): ParsedNoRealConnectionError {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(NO_REAL_CONNECTION_RE);
  if (!match) return { matched: false };
  const token = match[1];
  return {
    matched: true,
    reason:
      token && KNOWN_CHAT_CONFIGURATION_REASONS.has(token)
        ? (token as ChatConfigurationReason)
        : undefined,
  };
}
