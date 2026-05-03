import type {
  HomeAssistant,
  MeshCoreDevice,
  Contact,
  Channel,
  ManagedDevice,
  DeviceConfig,
  NeighborInfo,
  StoredMessage,
} from './types';

/**
 * Thin wrappers around Home Assistant WebSocket and service APIs for MeshCore
 */

/**
 * Get list of available MeshCore devices
 */
export async function getDevices(hass: HomeAssistant): Promise<MeshCoreDevice[]> {
  try {
    const result = await hass.callWS<{ devices: MeshCoreDevice[] }>({
      type: 'meshcore_chat/get_devices',
    });
    return result.devices || [];
  } catch {
    return [];
  }
}

/**
 * Get list of all contacts (saved + discovered)
 */
export async function getContacts(
  hass: HomeAssistant,
  entryId?: string,
): Promise<Contact[]> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_contacts' };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ contacts: Contact[] }>(msg);
    return result.contacts || [];
  } catch {
    return [];
  }
}

/**
 * Get list of channels
 */
export async function getChannels(
  hass: HomeAssistant,
  entryId?: string,
): Promise<Channel[]> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_channels' };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ channels: Channel[] }>(msg);
    return result.channels || [];
  } catch {
    return [];
  }
}

/**
 * Send a message to a channel
 */
export async function sendChannelMessage(
  hass: HomeAssistant,
  channelIdx: number,
  message: string,
): Promise<void> {
  try {
    await hass.callService('meshcore', 'send_channel_message', {
      channel_idx: channelIdx,
      message,
    });
  } catch (error) {
    throw new Error(`Failed to send channel message: ${String(error)}`);
  }
}

/**
 * Send a direct message to a contact by pubkey prefix
 */
export async function sendDirectMessage(
  hass: HomeAssistant,
  pubkeyPrefix: string,
  message: string,
): Promise<void> {
  try {
    await hass.callService('meshcore', 'send_message', {
      pubkey_prefix: pubkeyPrefix,
      message,
    });
  } catch (error) {
    throw new Error(`Failed to send direct message: ${String(error)}`);
  }
}

/**
 * Get list of managed devices (repeaters and clients)
 */
export async function getManagedDevices(
  hass: HomeAssistant,
  entryId?: string,
): Promise<{ repeaters: ManagedDevice[]; clients: ManagedDevice[] }> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_managed_devices' };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{
      repeaters: ManagedDevice[];
      clients: ManagedDevice[];
    }>(msg);
    return {
      repeaters: result.repeaters || [],
      clients: result.clients || [],
    };
  } catch {
    return { repeaters: [], clients: [] };
  }
}

/**
 * Get device configuration
 */
export async function getDeviceConfig(
  hass: HomeAssistant,
  entryId?: string,
): Promise<DeviceConfig> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_device_config' };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<DeviceConfig>(msg);
    return result;
  } catch {
    throw new Error('Failed to get device configuration');
  }
}

/**
 * Set device configuration
 */
export async function setDeviceConfig(
  hass: HomeAssistant,
  settings: Record<string, unknown>,
  entryId?: string,
): Promise<{ success: boolean; changed: string[] }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/set_device_config',
      settings,
    };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ success: boolean; changed: string[] }>(
      msg,
    );
    return result;
  } catch {
    return { success: false, changed: [] };
  }
}

/**
 * Execute a local command
 */
export async function executeLocal(
  hass: HomeAssistant,
  command: string,
  args?: Record<string, unknown>,
  entryId?: string,
): Promise<{ response: string; success: boolean; timestamp: string }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/execute_local',
      command,
    };
    if (args) msg.args = args;
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{
      response: string;
      success: boolean;
      timestamp: string;
    }>(msg);
    return result;
  } catch (error) {
    return {
      response: String(error),
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Execute a remote command on a target device
 */
export async function executeRemote(
  hass: HomeAssistant,
  targetPrefix: string,
  command: string,
  entryId?: string,
): Promise<{ response: string; success: boolean; timestamp: string }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/execute_remote',
      target_prefix: targetPrefix,
      command,
    };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{
      response: string;
      success: boolean;
      timestamp: string;
    }>(msg);
    return result;
  } catch (error) {
    return {
      response: String(error),
      success: false,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Set channel configuration
 */
export async function setChannel(
  hass: HomeAssistant,
  channelIdx: number,
  name: string,
  key?: string,
  entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/set_channel',
      channel_idx: channelIdx,
      name,
    };
    if (key) msg.key = key;
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ success: boolean }>(msg);
    return result;
  } catch {
    return { success: false };
  }
}

/**
 * Remove a channel
 */
export async function removeChannel(
  hass: HomeAssistant,
  channelIdx: number,
  entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/remove_channel',
      channel_idx: channelIdx,
    };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ success: boolean }>(msg);
    return result;
  } catch {
    return { success: false };
  }
}

/**
 * Get stored messages for a conversation (from the persistent message store)
 */
export async function getStoredMessages(
  hass: HomeAssistant,
  entityId: string,
  limit = 50,
  before?: string,
): Promise<{ messages: StoredMessage[]; has_more: boolean }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/get_stored_messages',
      entity_id: entityId,
      limit,
    };
    if (before) msg.before = before;
    return await hass.callWS<{ messages: StoredMessage[]; has_more: boolean }>(msg);
  } catch {
    return { messages: [], has_more: false };
  }
}

/**
 * Get message count for a conversation (from in-memory index, no disk I/O)
 */
export async function getStoredMessageCount(
  hass: HomeAssistant,
  entityId: string,
): Promise<number> {
  try {
    const result = await hass.callWS<{ count: number }>({
      type: 'meshcore_chat/get_stored_message_count',
      entity_id: entityId,
    });
    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Get neighbor information
 */
export async function getNeighbors(
  hass: HomeAssistant,
  targetPrefix: string,
  entryId?: string,
): Promise<NeighborInfo[]> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/get_neighbors',
      target_prefix: targetPrefix,
    };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ neighbors: NeighborInfo[] }>(msg);
    return result.neighbors || [];
  } catch {
    return [];
  }
}

/**
 * Get blocked contacts (Task 8.1)
 */
export async function getBlockedContacts(
  hass: HomeAssistant,
  entryId?: string,
): Promise<Contact[]> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_blocked_contacts' };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ contacts: Contact[] }>(msg);
    return result.contacts || [];
  } catch {
    return [];
  }
}

/**
 * Trace result — returned by traceContact().
 *
 * The backend sends a send_trace SDK command and waits for a TRACE_DATA event
 * matched on the random tag it generated.  See ws_api.ws_trace() for details.
 */
export interface TraceResult {
  round_trip_ms: number;
  response_time: string;
  /** Number of intermediate hops on the return path; 0 means direct reception. */
  hops: number;
  /** SNR of the final hop (this device receiving the trace echo); null if hops==0. */
  final_snr: number | null;
  /**
   * Per-node entries along the return path.  The final entry is the local
   * device and has no `hash` — its SNR is also surfaced as `final_snr`.
   */
  path: Array<{ hash?: string; snr: number }>;
}

/**
 * Session 54: trace path-selection mode. `discovery` runs the existing
 * flood path discovery; `select` and `explicit` supply an explicit
 * outbound hop sequence and skip discovery. Backend only inspects `path`;
 * `pathMode` is sent for frontend-side clarity / future backend use.
 */
export type TracePathMode = 'discovery' | 'select' | 'explicit';

/**
 * Run a trace against a contact and measure round-trip time.
 * Resolves with timing, hop count, and per-hop SNR data.
 * Rejects on timeout or SDK error.
 *
 * Session 54: optional `pathMode` + `path` (comma-separated hex hops,
 * e.g. "86,AE"). When pathMode is 'select' or 'explicit' and `path` is
 * provided, backend skips flood path discovery and calls send_trace with
 * the explicit path. Defaulted `pathMode` keeps two-arg call sites
 * source-compatible.
 */
export async function traceContact(
  hass: HomeAssistant,
  pubkeyPrefix: string,
  entryId?: string,
  pathMode: TracePathMode = 'discovery',
  path?: string,
): Promise<TraceResult> {
  const msg: Record<string, unknown> = {
    type: 'meshcore_chat/trace',
    pubkey_prefix: pubkeyPrefix,
  };
  if (entryId) msg.entry_id = entryId;
  if ((pathMode === 'select' || pathMode === 'explicit') && path) {
    msg.path = path;
  }
  // Let hass.callWS reject with its native { code, message } object so the
  // caller can surface the actual reason (e.g. "path_discovery_failed",
  // "timeout").  A try/catch here that rewraps into `new Error(String(err))`
  // would coerce the object to "[object Object]".
  return hass.callWS<TraceResult>(msg);
}

/**
 * Toggle contact blocked status (Task 8.16)
 */
export async function toggleBlockContact(
  hass: HomeAssistant,
  publicKey: string,
  blocked: boolean,
  entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/set_contact_blocked',
      public_key: publicKey,
      blocked,
    };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ success: boolean }>(msg);
    return result;
  } catch {
    return { success: false };
  }
}

/**
 * Add a contact to the node's contact list
 */
export async function addContact(
  hass: HomeAssistant,
  publicKey: string,
  name?: string,
  entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/add_contact',
      public_key: publicKey,
    };
    if (name) msg.name = name;
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ success: boolean }>(msg);
    return result;
  } catch {
    return { success: false };
  }
}

/**
 * Remove a contact
 */
export async function removeContact(
  hass: HomeAssistant,
  publicKey: string,
  entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/remove_contact',
      public_key: publicKey,
    };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ success: boolean }>(msg);
    return result;
  } catch {
    return { success: false };
  }
}

// ─── Unread Tracking ─────────────────────────────────────────────────────

export async function getUnreadCounts(
  hass: HomeAssistant, entryId?: string,
): Promise<Record<string, number>> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_unread_counts' };
    if (entryId) msg.entry_id = entryId;
    const result = await hass.callWS<{ unread: Record<string, number> }>(msg);
    return result.unread || {};
  } catch { return {}; }
}

export async function markConversationRead(
  hass: HomeAssistant, entityId: string, entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/mark_conversation_read', entity_id: entityId };
    if (entryId) msg.entry_id = entryId;
    return await hass.callWS<{ success: boolean }>(msg);
  } catch { return { success: false }; }
}

// ─── Identity Management ─────────────────────────────────────────────────

/**
 * Streaming-progress identity flow (Phase 1.1).
 *
 * The chat backend's ``ws_regenerate_identity`` / ``ws_import_identity``
 * handlers emit one ``event_message`` per step (generating →
 * importing → rebooting → reconnecting → reloading → verifying →
 * done) before terminating with ``send_result`` on success or
 * ``send_error`` on failure. The terminal success data rides on the
 * final ``done`` event because ``home-assistant-js-websocket``'s
 * ``subscribeMessage`` promise resolves to the unsubscribe handle only
 * and discards ``send_result`` payloads.
 *
 * The wrapper translates the wire shapes into a typed
 * ``IdentityFlowEvent`` enum so the modal component doesn't have to
 * touch transport details.
 */

export type IdentityFlowStep =
  | 'generating'
  | 'importing'
  | 'rebooting'
  | 'reconnecting'
  | 'reloading'
  | 'verifying'
  | 'done';

export interface IdentityFlowResult {
  success: true;
  old_pubkey: string;
  new_pubkey: string;
  warning?: string;
}

export interface IdentityFlowError {
  success: false;
  /** WS error code from the backend, e.g. ``import_rejected`` or ``verify_failed``. */
  code: string;
  /** Human-readable error message from the backend. */
  message: string;
}

export type IdentityFlowEvent =
  | { type: 'progress'; step: Exclude<IdentityFlowStep, 'done'> }
  | { type: 'result'; data: IdentityFlowResult }
  | { type: 'error'; data: IdentityFlowError };

/** Raw event-message payload shape pushed by the backend over the WS subscription. */
interface IdentityFlowWireEvent {
  step: IdentityFlowStep;
  success?: boolean;
  old_pubkey?: string;
  new_pubkey?: string;
  warning?: string;
}

/**
 * Subscribe to a streaming identity-change WS handler.
 *
 * Returns an ``unsubscribe`` function (the backend self-terminates so
 * calling it is normally a no-op; included for completeness if the
 * caller wants to abandon the flow early) and a ``done`` Promise that
 * resolves with either the typed ``IdentityFlowResult`` (success) or
 * the typed ``IdentityFlowError`` (failure). The Promise never
 * rejects — caller dispatches on ``data.success`` instead.
 */
export function subscribeIdentityChange(
  hass: HomeAssistant,
  type: 'meshcore_chat/regenerate_identity' | 'meshcore_chat/import_identity',
  payload: Record<string, unknown>,
  onEvent: (e: IdentityFlowEvent) => void,
): {
  unsubscribe: () => void;
  done: Promise<IdentityFlowResult | IdentityFlowError>;
} {
  let unsubFn: (() => void) | null = null;
  let resolveDone!: (v: IdentityFlowResult | IdentityFlowError) => void;
  const done = new Promise<IdentityFlowResult | IdentityFlowError>((res) => {
    resolveDone = res;
  });

  // Default outcome if the subscription terminates cleanly without a
  // ``done`` event ever arriving — should not happen in practice but
  // defends against a backend that closes the request before the
  // terminal event lands. Treated as a verify-failed error so the UI
  // surfaces something rather than hanging.
  let terminal: IdentityFlowResult | IdentityFlowError = {
    success: false,
    code: 'unknown',
    message: 'Identity flow terminated without a result event.',
  };

  const subscribePromise = hass.connection.subscribeMessage<IdentityFlowWireEvent>(
    (msg) => {
      if (msg.step === 'done' && msg.success && msg.old_pubkey && msg.new_pubkey) {
        const result: IdentityFlowResult = {
          success: true,
          old_pubkey: msg.old_pubkey,
          new_pubkey: msg.new_pubkey,
          warning: msg.warning,
        };
        terminal = result;
        onEvent({ type: 'result', data: result });
      } else if (msg.step !== 'done') {
        onEvent({ type: 'progress', step: msg.step });
      }
    },
    { type, ...payload },
  );

  subscribePromise
    .then((unsub) => {
      unsubFn = unsub;
      // Backend self-terminated with send_result — the typed
      // ``terminal`` value was already populated by the ``done`` event.
      resolveDone(terminal);
    })
    .catch((err: { code?: string; message?: string }) => {
      const errorData: IdentityFlowError = {
        success: false,
        code: err.code || 'error',
        message: err.message || 'Identity flow failed.',
      };
      onEvent({ type: 'error', data: errorData });
      resolveDone(errorData);
    });

  return {
    unsubscribe: () => {
      if (unsubFn) {
        unsubFn();
      }
    },
    done,
  };
}

// ─── Location Source ─────────────────────────────────────────────────────

export async function setLocationSource(
  hass: HomeAssistant, source: string, entryId?: string,
): Promise<{ success: boolean }> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/set_location_source', source };
    if (entryId) msg.entry_id = entryId;
    return await hass.callWS<{ success: boolean }>(msg);
  } catch { return { success: false }; }
}

// ─── Paginated Contacts & Node Counts ───────────────────────────────

export type PrimaryCategory = 'all' | 'added' | 'discovered';

export interface TypeCounts {
  clients: number;
  repeaters: number;
  room_servers: number;
  sensors: number;
}

export interface NodeCounts {
  all: number;
  added: number;
  discovered: number;
}

export interface PaginatedContactsResponse {
  contacts: Contact[];
  total: number;
  counts: TypeCounts;
}

export async function getContactsPaginated(
  hass: HomeAssistant,
  category: PrimaryCategory = 'all',
  options: {
    nodeType?: number;
    search?: string;
    limit?: number;
    offset?: number;
    entryId?: string;
    sortBy?: 'last_heard' | 'name' | 'prefix';
  } = {},
): Promise<PaginatedContactsResponse> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/get_contacts_paginated',
      category,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    };
    if (options.nodeType !== undefined) msg.node_type = options.nodeType;
    if (options.search) msg.search = options.search;
    if (options.entryId) msg.entry_id = options.entryId;
    if (options.sortBy) msg.sort_by = options.sortBy;
    return await hass.callWS<PaginatedContactsResponse>(msg);
  } catch {
    return { contacts: [], total: 0, counts: { clients: 0, repeaters: 0, room_servers: 0, sensors: 0 } };
  }
}

export async function clearDiscoveredContacts(
  hass: HomeAssistant,
  daysThreshold?: number,
  entryId?: string,
): Promise<{ removed: number }> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/clear_discovered_contacts' };
    if (daysThreshold !== undefined) msg.days_threshold = daysThreshold;
    if (entryId) msg.entry_id = entryId;
    return await hass.callWS<{ removed: number }>(msg);
  } catch {
    return { removed: 0 };
  }
}

export async function getNodeCounts(
  hass: HomeAssistant,
  entryId?: string,
): Promise<NodeCounts> {
  try {
    const msg: Record<string, unknown> = { type: 'meshcore_chat/get_node_counts' };
    if (entryId) msg.entry_id = entryId;
    return await hass.callWS<NodeCounts>(msg);
  } catch {
    return { all: 0, added: 0, discovered: 0 };
  }
}

// ─── Message Search ──────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  entity_id: string;
  conversation_name: string;
}

export async function searchStoredMessages(
  hass: HomeAssistant,
  query: string,
  entityId?: string,
  fromDate?: string,
  toDate?: string,
  limit = 100,
): Promise<{ results: SearchResult[]; count: number }> {
  try {
    const msg: Record<string, unknown> = {
      type: 'meshcore_chat/search_stored_messages',
      query,
      limit,
    };
    if (entityId) msg.entity_id = entityId;
    if (fromDate) msg.from_date = fromDate;
    if (toDate) msg.to_date = toDate;
    const result = await hass.callWS<{ results: SearchResult[] }>(msg);
    return { results: result.results || [], count: (result.results || []).length };
  } catch {
    return { results: [], count: 0 };
  }
}
