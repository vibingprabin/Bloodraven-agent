import type { BotProvider } from './bot-chat-settings.js';

export type BotPlatform = BotProvider;

export interface BotAttachmentRef {
  kind: 'image' | 'file' | 'voice';
  url?: string;
  fileId?: string;
  mimeType?: string;
}

/**
 * PR-BOT-NON-TEXT-MESSAGE-ACK-0 (external bot research): the kind of non-text
 * payload Telegram delivered alongside (or instead of) text. Used so
 * the handler can send a helpful "Maka only reads text now" ack instead of
 * silently dropping a photo / voice / sticker message. NOT a request
 * to ingest the binary — Maka does not yet have multi-modal input.
 *
 * `unknown` covers Telegram message subtypes we did not enumerate
 * (location, contact, poll, video_note, ...). Those still need an ack
 * because the user typed nothing the bot can act on.
 */
export type BotAttachmentKind =
  | 'photo'
  | 'voice'
  | 'sticker'
  | 'document'
  | 'video'
  | 'audio'
  | 'animation'
  | 'unknown';

export interface BotMessageEvent {
  platform: BotPlatform;
  userId: string;
  userName: string;
  chatId: string;
  isGroup: boolean;
  text: string;
  sourceMessageId: string;
  receivedAt: number;
  attachments?: BotAttachmentRef[];
  /**
   * PR-BOT-NON-TEXT-MESSAGE-ACK-0: when the inbound message carried a
   * non-text payload (photo / voice / etc.), this records the kind so
   * the handler can decide whether to ack or drop. `undefined` means
   * "text-only message" — the default and most common case.
   */
  attachmentKind?: BotAttachmentKind;
}

/**
 * PR-BOT-NON-TEXT-MESSAGE-ACK-0: fixed copy for the "we only handle
 * text" ack. Kind-aware so a voice message and a sticker get slightly
 * different copy without diluting the core message. Exported so the
 * handler can use it AND a contract test can pin it.
 */
export function nonTextMessageAck(kind: BotAttachmentKind): string {
  switch (kind) {
    case 'photo':
      return 'Maka can only read text right now. If you want to ask about this image, please write out its content directly (the caption works too).';
    case 'voice':
    case 'audio':
      return 'Maka cannot recognize voice messages yet. Please send the content you want to ask about as text.';
    case 'sticker':
      return 'Maka does not process stickers. If you have a question, please describe it in text.';
    case 'video':
    case 'animation':
      return 'Maka does not process videos yet. If you want to discuss the video content, please write out the key points as text.';
    case 'document':
      return 'Maka cannot read attached files directly. If the file has a question, please paste the content into the message.';
    case 'unknown':
    default:
      return 'Maka can only handle text messages. Please send the content you want to ask about as text.';
  }
}

export function botDisplayLabel(platform: BotPlatform): string {
  switch (platform) {
    case 'telegram':
      return 'Telegram';
    case 'feishu':
      return 'Feishu';
    case 'wecom':
      return 'WeCom';
    case 'wechat':
      return 'WeChat';
    case 'discord':
      return 'Discord';
    case 'dingtalk':
      return 'DingTalk';
    case 'qq':
      return 'QQ';
    case 'slack':
      return 'Slack';
  }
}

export function botConversationKey(message: Pick<BotMessageEvent, 'platform' | 'chatId'>): string {
  return `${message.platform}:${message.chatId}`;
}

/**
 * PR-BOT-INCOMING-IDEMPOTENCY-0 (external bot research): platform bridges
 * can redeliver the same inbound message during reconnect / polling
 * recovery. The runtime needs a stable event key before creating a
 * Maka turn or sending a transient ack, otherwise a repeated platform
 * update can produce duplicate agent replies.
 *
 * Scope deliberately stays at platform + chat + source message id. The
 * id is only trusted as an idempotency key inside that chat; it is NOT
 * a permission token and does not grant access to message history.
 */
export function botSourceEventKey(
  message: Pick<BotMessageEvent, 'platform' | 'chatId' | 'sourceMessageId'>,
): string | undefined {
  const sourceMessageId = message.sourceMessageId.trim();
  if (!sourceMessageId) return undefined;
  return `${message.platform}:${message.chatId}:${sourceMessageId}`;
}

/**
 * PR-BOT-PLAINTEXT-RESET-COMMAND-0 (external bot research): DM-only plain-text
 * "restart this conversation" affordance. Maka has no slash command
 * runtime; users on mobile cannot easily type `/restart` either, so we
 * coerce a handful of natural phrases into a reset action.
 *
 * Why DM-only: the bot conversation key is `${platform}:${chatId}`, NOT
 * keyed by userId. In a group chat any member typing "restart" would
 * wipe the conversation everyone else is in. Until a userId-scoped key
 * lands, plain-text reset is silently ignored in groups so the cost of
 * a misfire stays bounded to the sender's own DM.
 *
 * Match policy: NFC-normalize + lowercase + trim, then exact membership.
 * No substring matching — the word "restart" inside a sentence is NOT
 * a reset request; matching only the bare command avoids surprising
 * users who intended to send a message ABOUT restart.
 */
export const BOT_PLAINTEXT_RESET_COMMANDS: ReadonlyArray<string> = Object.freeze([
  'restart',
  'reset',
  '/restart',
  '/reset',
  '/new',
  '/newchat',
  'new chat',
  'restart',
  'reset',
  'start over',
  'new chat',
  'new session',
]);

export function isPlaintextResetCommand(
  message: Pick<BotMessageEvent, 'text' | 'isGroup'>,
): boolean {
  if (message.isGroup) return false;
  const trimmed = message.text.normalize('NFC').trim().toLowerCase();
  if (trimmed.length === 0) return false;
  return BOT_PLAINTEXT_RESET_COMMANDS.includes(trimmed);
}

/**
 * PR-BOT-PLAINTEXT-HELP-COMMAND-0 (external bot research): DM-only help
 * affordance so a new user can discover what the bot supports
 * without leaving Telegram. Same match policy as
 * {@link isPlaintextResetCommand} — DM-only, NFC + lowercase + trim,
 * exact membership, no substring match.
 *
 * The fixed reply text is deliberately short and product-scoped:
 * how to chat, how to reset, and the threading behavior. No
 * marketing copy or roadmap language.
 */
export const BOT_PLAINTEXT_HELP_COMMANDS: ReadonlyArray<string> = Object.freeze([
  'help',
  '/help',
  '?',
  '/?',
  'help',
  '/help',
]);

export function isPlaintextHelpCommand(
  message: Pick<BotMessageEvent, 'text' | 'isGroup'>,
): boolean {
  if (message.isGroup) return false;
  const trimmed = message.text.normalize('NFC').trim().toLowerCase();
  if (trimmed.length === 0) return false;
  return BOT_PLAINTEXT_HELP_COMMANDS.includes(trimmed);
}

export function plaintextHelpReply(): string {
  return [
    'Maka bot help',
    '',
    '· Send text messages directly to chat with Maka; replies are threaded under your question.',
    '· To clear the current conversation and start a new session, send: restart / reset / new chat.',
    '· Plaintext reset commands do not work in groups (to avoid one member clearing the whole group conversation).',
    '· Long replies are split into multiple messages, with the first one threaded under your question.',
  ].join('\n');
}

export function formatBotMessageForSession(
  message: Pick<BotMessageEvent, 'platform' | 'userName' | 'text'>,
): string {
  return `[${botDisplayLabel(message.platform)}:${sanitizeBotUserName(message.userName)}] ${message.text.trim()}`;
}

function sanitizeBotUserName(value: string): string {
  return (
    value
      .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
      .replace(/[\p{Cf}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'unknown'
  );
}

/**
 * PR-BOT-LASTERROR-FROM-SEND-0 (external bot research): translate the bridge's
 * machine-readable `BotStatus.reason` into a short user-readable string
 * suitable for persistence in `BotChannelSettings.lastError`. The Settings
 * page reads `lastError` from persisted settings (not live status), so
 * without this persistence step the user sees stale connection-test
 * errors instead of the actual send-path failure that happened minutes
 * ago.
 *
 * Returns `undefined` for non-error reasons (disabled/stopped/missing
 * credentials — those have their own UI surface) and for unrecognized
 * inputs whose pass-through risks leaking unredacted payloads.
 *
 * Length-capped at 200 chars defensively; a real Telegram error
 * description is typically well under 80 chars.
 */
const BOT_REASON_HUMANIZE: Record<string, string | undefined> = {
  'rate-limited': 'Sending was rate-limited (429); the previous reply may have been truncated; ask the user to send again',
  'polling-timeout': 'Event polling timed out; possibly a network blip or a dead proxy',
  'send-failed': 'The last send failed; Telegram did not return a reason',
  'get-me-failed': 'Credential probe failed; check the Bot Token',
  // Non-error states surface elsewhere in the UI — return undefined so
  // we do not overwrite a real lastError with a benign status change.
  disabled: undefined,
  stopped: undefined,
  'no-token': undefined,
  'missing-feishu-credentials': undefined,
  'feishu-domain-required': undefined,
  'feishu-events-not-connected': undefined,
  'scaffold-only': undefined,
  unimplemented: undefined,
};

/**
 * PR-BOT-RUNTIME-REASON-HUMANIZE-0: Discord / DingTalk / QQ bridges
 * emit parameterized reason strings like `gateway-closed-4004` and
 * `connections-open-500`. Without these patterns the user sees the
 * raw machine code in `lastError`; with them they get a translated
 * description plus the diagnostic code preserved in parentheses.
 *
 * Each entry is a regex with one numeric capture group; the matched
 * code is preserved verbatim so support diagnostics still survive.
 */
const BOT_REASON_HUMANIZE_PATTERNS: Array<{ pattern: RegExp; format: (code: string) => string }> = [
  { pattern: /^gateway-bot-(\d+)$/, format: (code) => `Failed to get Gateway (HTTP ${code})` },
  { pattern: /^gateway-closed-(\d+)$/, format: (code) => `Gateway connection closed (${code}); reconnecting` },
  { pattern: /^connections-open-(\d+)$/, format: (code) => `Failed to open Stream subscription (HTTP ${code})` },
  { pattern: /^stream-closed-(\d+)$/, format: (code) => `Stream connection closed (${code}); reconnecting` },
  { pattern: /^send-failed-(\d+)$/, format: (code) => `Send failed (HTTP ${code})` },
  {
    pattern: /^getAppAccessToken-(\d+)$/,
    format: (code) => `Failed to get access_token (HTTP ${code})`,
  },
];

export function humanizeBotStatusReason(reason: string | undefined): string | undefined {
  if (typeof reason !== 'string' || reason.length === 0) return undefined;
  if (reason in BOT_REASON_HUMANIZE) {
    return BOT_REASON_HUMANIZE[reason];
  }
  for (const { pattern, format } of BOT_REASON_HUMANIZE_PATTERNS) {
    const match = pattern.exec(reason);
    if (match) return format(match[1]);
  }
  // Pass-through for platform-supplied descriptions ("Bad Request:
  // chat not found", etc.). Trim + length-cap to keep `lastError`
  // bounded.
  const trimmed = reason.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}
