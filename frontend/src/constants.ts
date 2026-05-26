import type { PanelConfig } from './types';

/**
 * Panel registration name
 */
export const PANEL_TAG = 'meshcore-chat-panel';

/**
 * Regex patterns
 */
export const CHANNEL_PREFIX_REGEX = /^<[^>]+>\s*/;
export const MENTION_BRACKET_REGEX = /@\[([^\]]+)\]/g;
export const MENTION_WORD_REGEX = /@(\w+)/g;

/**
 * MeshCore preset entity patterns — the panel always uses these.
 */
export const MESHCORE_PRESET = {
  recipient_type_entity: 'select.meshcore_recipient_type',
  channel_entity: 'select.meshcore_channel',
  contact_entity: 'select.meshcore_contact',
  channel_entity_pattern: 'binary_sensor.meshcore_{prefix}_ch_{idx}_messages',
  contact_entity_pattern: 'binary_sensor.meshcore_{prefix}_{contact}_messages',
  domain_filter: 'meshcore',
};

/**
 * Default display/realtime config values
 */
export const DEFAULT_PANEL_CONFIG: Omit<PanelConfig, 'node_name'> = {
  ...MESHCORE_PRESET,
  hours_to_show: 48,
  initial_hours: 1,
  max_messages: 500,
  show_date_separators: true,
  group_messages: true,
  group_timeout: 300,
  timestamp_format: 'relative',
  update_mode: 'auto',
  refresh_interval: 30,
  enable_cache: true,
  cache_ttl: 86400,
  cache_max_size: 5242880,
};

/**
 * Entity switch debounce
 */
export const ENTITY_SWITCH_DEBOUNCE_MS = 300;

/**
 * Fetch retry limit — after this many consecutive failures, polling slows down.
 */
export const FETCH_MAX_RETRIES = 5;

/**
 * Lazy loading scroll threshold — pixels from top to trigger loadOlderMessages.
 *
 * Legacy tunable consumed by `chat-page.ts._onChatScroll`. The
 * `LAZY_LOAD_TRIGGER_PX` / `AT_BOTTOM_THRESHOLD_PX` pair below
 * supersedes it for the rewritten scroll handler. Kept here unchanged
 * so the older scroll path keeps working alongside the newer one.
 */
export const LAZY_LOAD_SCROLL_THRESHOLD = 200;

// ─── Last-read anchor + bidirectional lazy load tunables ───────────────
//
// Extracted from magic-number style so the data-layer plumbing in
// chat-page.ts has a single place to tune. The
// `MARK_READ_GRACE_PERIOD_MS` constant below sits on top of these three
// as the mark-read grace-window mitigation.

/**
 * Lazy-load trigger distance.
 *
 * Distance in pixels from either edge of the chat container at which
 * `loadOlderMessages()` (near the top) or `loadNewerMessages()` (near the
 * bottom) should fire. The rewritten `_onChatScroll` consumes this
 * for both directions.
 */
export const LAZY_LOAD_TRIGGER_PX = 150;

/**
 * At-bottom threshold.
 *
 * Distance in pixels from the bottom of the chat container that counts as
 * "the user has the newest visible message in view." Combined with
 * `MessageStore.hasNewerMessages === false`, this is the trigger for
 * viewport-based mark-read. Used by `setUserAtBottom()` in the
 * `_onChatScroll` rewrite.
 */
export const AT_BOTTOM_THRESHOLD_PX = 150;

/**
 * Last-read save debounce.
 *
 * Rapid mark-read events coalesce into a single `Store.async_save` after
 * this many milliseconds of quiescence on the backend (`UnreadTracker.
 * _schedule_save`). Mirrored here so the frontend can describe / reason
 * about the persisted-cursor latency window in tests and UI copy without
 * hard-coding the number.
 */
export const LAST_READ_SAVE_DEBOUNCE_MS = 2000;

/**
 * Mark-read grace period after a conversation switch.
 *
 * Mitigation for premature cursor advance. The viewport-based
 * mark-read trigger fires whenever scroll is near-bottom AND
 * `hasNewerMessages === false`. For low-unread conversations the
 * post-anchor scroll lands the user near the bottom immediately —
 * without a grace period the cursor would advance the instant the
 * conversation opens, even if the user immediately scrolls UP without
 * reading.
 *
 * As of the unified-unread-state refactor this constant is
 * consumed by `UnreadController` (not chat-page): `beginConversation`
 * stamps `ReadProgress.graceUntil = Date.now() + this` and arms a
 * one-shot deferred post-switch timer of this duration. The FIRST
 * auto-mark-read after a conversation switch waits for the grace
 * window to elapse; subsequent mark-reads in the same conversation
 * fire without delay. Value unchanged by the refactor.
 */
export const MARK_READ_GRACE_PERIOD_MS = 1000;
