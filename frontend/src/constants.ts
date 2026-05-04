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
 * Pre-Phase-3 tunable consumed by `chat-page.ts._onChatScroll`. Phase 3
 * adds the `LAZY_LOAD_TRIGGER_PX` / `AT_BOTTOM_THRESHOLD_PX` pair below
 * which Phase 4 will switch chat-page over to. Kept here unchanged so the
 * pre-Phase-4 path keeps working while Phase 3 is purely additive.
 */
export const LAZY_LOAD_SCROLL_THRESHOLD = 200;

// ─── Phase 3: last-read anchor + bidirectional lazy load tunables ──────
//
// Extracted from magic-number style per `Proposed - Last-Read Anchor and
// Read-Receipt Refinement for Chat Panel.md` §Changes "Change 7" / §Phase
// Handoffs Phase 3 deliverables. Phase 4 wires the data-layer plumbing
// added in Phase 3 into chat-page.ts; these constants give that wiring a
// single place to tune. Phase 4 will add `MARK_READ_GRACE_PERIOD_MS = 1000`
// (R1 mitigation) on top of these three.

/**
 * Lazy-load trigger distance (Phase 3+).
 *
 * Distance in pixels from either edge of the chat container at which
 * `loadOlderMessages()` (near the top) or `loadNewerMessages()` (near the
 * bottom) should fire. Phase 4's rewritten `_onChatScroll` consumes this
 * for both directions.
 */
export const LAZY_LOAD_TRIGGER_PX = 150;

/**
 * At-bottom threshold (Phase 3+).
 *
 * Distance in pixels from the bottom of the chat container that counts as
 * "the user has the newest visible message in view." Combined with
 * `MessageStore.hasNewerMessages === false`, this is the trigger for
 * viewport-based mark-read in Phase 4. Used by `setUserAtBottom()` in
 * Phase 4's `_onChatScroll` rewrite.
 */
export const AT_BOTTOM_THRESHOLD_PX = 150;

/**
 * Last-read save debounce (Phase 1 + Phase 3+).
 *
 * Rapid mark-read events coalesce into a single `Store.async_save` after
 * this many milliseconds of quiescence on the backend (`UnreadTracker.
 * _schedule_save`). Mirrored here so the frontend can describe / reason
 * about the persisted-cursor latency window in tests and UI copy without
 * hard-coding the number.
 */
export const LAST_READ_SAVE_DEBOUNCE_MS = 2000;

/**
 * Mark-read grace period after a conversation switch (Phase 4).
 *
 * R1 mitigation per `Proposed - Last-Read Anchor and Read-Receipt
 * Refinement for Chat Panel.md` §"Risks". The new viewport-based
 * mark-read trigger fires whenever scroll is near-bottom AND
 * `hasNewerMessages === false`. For low-unread conversations the
 * post-anchor scroll lands the user near the bottom immediately —
 * without a grace period the cursor would advance the instant the
 * conversation opens, even if the user immediately scrolls UP without
 * reading.
 *
 * Phase 4's `_onChatScroll` arms a one-shot timer of this duration on
 * every conversation switch; the FIRST auto-mark-read after the switch
 * waits for the timer to elapse. Subsequent mark-reads in the same
 * conversation fire without delay.
 */
export const MARK_READ_GRACE_PERIOD_MS = 1000;
