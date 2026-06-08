/**
 * Home Assistant types (minimal subset needed by the panel)
 */
export interface EntityRegistryEntry {
  display_precision?: number | null;
  [key: string]: unknown;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities: Record<string, EntityRegistryEntry>;
  callApi: <T>(method: string, path: string) => Promise<T>;
  callService: (domain: string, service: string, data?: Record<string, unknown>) => Promise<void>;
  callWS: <T>(msg: Record<string, unknown>) => Promise<T>;
  connection: {
    subscribeEvents: (
      callback: (event: HassEvent) => void,
      eventType: string,
    ) => Promise<() => void>;
    /**
     * Generic streaming-WS subscription. The backend handler emits
     * ``websocket_api.event_message`` payloads (each delivered to
     * ``callback``) and terminates with ``send_result`` (Promise
     * resolves to the unsubscribe fn — note: ``send_result`` payload
     * is NOT exposed to the caller; deliver terminal data via a final
     * event_message) or ``send_error`` (Promise rejects with
     * ``{code, message}``). See
     * ``home-assistant-js-websocket/lib/connection.ts``.
     */
    subscribeMessage: <EventType>(
      callback: (event: EventType) => void,
      msg: Record<string, unknown>,
    ) => Promise<() => void>;
  };
  themes: {
    darkMode: boolean;
  };
  language: string;
  locale: Record<string, unknown>;
  dockedSidebar: 'docked' | 'auto' | 'always_hidden';
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HassEvent {
  event_type: string;
  data: {
    entity_id?: string;
    new_state?: HassEntity;
    old_state?: HassEntity;
    [key: string]: unknown;
  };
  time_fired: string;
}

/**
 * Stored message record from the message store backend.
 * Returned by meshcore/get_stored_messages and meshcore/search_stored_messages.
 */
export interface StoredMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  message_type: 'channel' | 'direct';
  channel?: string;
  channel_idx?: number;
  pubkey_prefix?: string;
  outgoing: boolean;
  rx_log_data: Array<Record<string, unknown>>;
  delivery_status: 'pending' | 'sent' | 'delivered' | 'failed';
  ack_received?: boolean;
  repeater_count?: number;
  round_trip_ms?: number;
  /** Present on search results only */
  entity_id?: string;
  /** Present on search results only */
  conversation_name?: string;
}

/**
 * Delivery status for messages
 */
export interface DeliveryStatus {
  status: 'pending' | 'waiting' | 'sent' | 'delivered' | 'unconfirmed' | 'failed';
  repeaterCount?: number;
  ackReceived?: boolean;
  roundTripMs?: number;
}

/**
 * Parsed chat message
 */
export interface ChatMessage {
  /** Unique ID (hash of timestamp + sender + text) */
  id: string;
  /** Parsed sender name */
  sender: string;
  /** Message content (prefix stripped) */
  text: string;
  /** Message timestamp */
  timestamp: Date;
  /** true if sender matches node_name */
  isOutgoing: boolean;
  /** true if unparseable (no sender:message pattern) */
  isSystem: boolean;
  /** Original logbook message text */
  raw: string;
  /** Extracted @[Name] and @Name mentions */
  mentions: string[];
  /** RX log data for message delivery tracking */
  rxLogData?: Array<Record<string, unknown>>;
  /** Delivery status information */
  deliveryStatus?: DeliveryStatus;
  /** Number of repeaters in message path */
  repeaterCount?: number;
  /** Color for sender identification */
  senderColor?: string;
}

/**
 * Group of consecutive messages from the same sender
 */
export interface MessageGroup {
  sender: string;
  isOutgoing: boolean;
  isSystem: boolean;
  messages: ChatMessage[];
  startTime: Date;
  endTime: Date;
}

/**
 * Render item — either a message group or a date separator
 */
export type RenderItem =
  | { type: 'group'; group: MessageGroup }
  | { type: 'date-separator'; date: Date; label: string };

/**
 * Panel configuration — built at runtime from device info + defaults.
 * Unlike the ha-logbook-chat card, the sidebar panel auto-discovers
 * node_name and node_prefix from the WebSocket API.
 */
export interface PanelConfig {
  /** Node name for outgoing message detection (from device info) */
  node_name: string;
  /** Node prefix for entity pattern matching (from device pubkey) */
  node_prefix?: string;

  // === Entity patterns (MeshCore preset) ===
  channel_entity_pattern: string;
  contact_entity_pattern: string;
  recipient_type_entity: string;
  channel_entity: string;
  contact_entity: string;
  domain_filter: string;

  // === Display ===
  hours_to_show: number;
  initial_hours: number;
  max_messages: number;
  show_date_separators: boolean;
  group_messages: boolean;
  group_timeout: number;
  timestamp_format: 'relative' | 'time' | 'datetime';

  // === Real-Time ===
  update_mode: 'auto' | 'websocket' | 'polling';
  refresh_interval: number;

  // === Cache ===
  enable_cache: boolean;
  cache_ttl: number;
  cache_max_size: number;

  /** Config entry ID for WebSocket calls that need it */
  entry_id?: string;
}

/**
 * MeshCore device from meshcore/get_devices WebSocket API
 */
export interface MeshCoreDevice {
  entry_id: string;
  name: string;
  pubkey: string;
  pubkey_prefix: string;
  firmware: string;
  connected: boolean;
}

/**
 * Contact from meshcore/get_contacts WebSocket API.
 * Matches the output of coordinator.get_all_contacts().
 */
export interface Contact {
  public_key: string;
  pubkey_prefix: string;
  added_to_node: boolean;
  adv_name: string;
  type: number;
  flags: number;
  adv_lat: number;
  adv_lon: number;
  lastmod: number;
  last_advert: number;
  out_path: string;
  out_path_len: number;
  out_path_hash_mode: number;
  [key: string]: unknown;
}

/**
 * Channel from meshcore/get_channels WebSocket API
 */
export interface Channel {
  channel_idx: number;
  name: string;
  settings: Record<string, unknown>;
  /**
   * Persisted per-channel region scope. Threaded into
   * `meshcore.send_channel_message`'s `scope` argument on each send so
   * the message floods only through repeaters configured for that
   * region. Absent = no scope (legacy global flood).
   */
  scope?: string;
}

/**
 * Managed device (repeater or client)
 */
export interface ManagedDevice {
  name: string;
  pubkey_prefix: string;
  password?: string;  // masked
  update_interval: number;
  telemetry_enabled?: boolean;
  neighbors_enabled?: boolean;
  disable_path_reset?: boolean;
  connected: boolean;
  status?: 'online' | 'offline' | 'unknown';
  status_entity_id?: string;
  firmware_version?: string;
  stats?: Record<string, unknown>;
  type: 'repeater' | 'client';
}

/**
 * Device configuration
 */
export interface DeviceConfig {
  name: string;
  firmware_version: string;
  hardware_model: string;
  pubkey: string;
  max_channels: number;
  tx_power?: number;
  frequency?: number;
  bandwidth?: number;
  spreading_factor?: number;
  coding_rate?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  path_hash_mode?: number;
  location_source?: 'manual' | 'gps' | 'home_assistant';
  connection_type?: string;
  connection_address?: string;
  [key: string]: unknown;
}

/**
 * Command parameter definition
 */
export interface CommandParam {
  /**
   * Wire argument name. For local commands this MUST match the SDK command
   * method's keyword-argument name — `ws_execute_local` calls
   * `command_method(**args)` with no remapping, so a mismatch raises
   * TypeError. For remote commands the value is positionally space-joined
   * into the CLI string, so `name` is display-only there.
   */
  name: string;
  /** Human-readable label shown in the form. Falls back to `name`. */
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'bitmask';
  description: string;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];                                                 // legacy: label === submitted value (always a string)
  selectOptions?: Array<{ label: string; value: string | number }>;  // structured select: label/value separable, value type preserved
  bits?: Array<{ label: string; value: number }>;                    // for type 'bitmask': checkbox per bit, submits the OR as a number
}

/**
 * Command definition
 */
export interface CommandDef {
  name: string;
  description: string;
  category: string;
  params?: CommandParam[];
  responseFormat?: string;
  dangerous?: boolean;
  dangerMessage?: string;
  localOnly?: boolean;
  remoteOnly?: boolean;
}

/**
 * Channel form data
 */
export interface ChannelFormData {
  channel_idx: number;
  name: string;
  key: string;
  autoKey: boolean;
}

/**
 * Neighbor information
 */
export interface NeighborInfo {
  name: string;
  pubkey_prefix: string;
  snr: number;
  last_seen: string;
  seen_48h?: number;
  entity_ids?: Record<string, string>;
}
