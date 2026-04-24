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
 */
export const LAZY_LOAD_SCROLL_THRESHOLD = 200;
