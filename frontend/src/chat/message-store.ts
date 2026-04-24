import type {
  PanelConfig,
  ChatMessage,
  DeliveryStatus,
  HomeAssistant,
  HassEvent,
  StoredMessage,
} from '../types';
import { generateId, extractMentions, toClientMessage } from './message-parser';
import {
  CHANNEL_PREFIX_REGEX,
  FETCH_MAX_RETRIES,
} from '../constants';

/** Background polling interval (30s — real-time events handle instant display) */
const POLL_INTERVAL_MS = 30_000;
/** Poll interval when API is erroring */
const ERROR_POLL_INTERVAL_MS = 60_000;

/**
 * Manages message fetching from the persistent message store, real-time
 * updates via WebSocket events, and optimistic rendering.
 *
 * Replaces the previous logbook-based implementation. Messages are now
 * fetched as structured JSON from meshcore/get_stored_messages, eliminating
 * text parsing, delivery caches, localStorage caching, and carry-forward
 * merge logic.
 */
export class MessageStore {
  private _messages: ChatMessage[] = [];
  private _loading = false;
  private _error: string | null = null;
  private _entityId: string | null = null;
  private _config: PanelConfig;
  private _hass: HomeAssistant | null = null;
  private _pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Real-time event subscriptions (meshcore_message, meshcore_delivery_update) */
  private _realtimeSubscriptions: Array<() => void> = [];
  private _retryCount = 0;
  private _onChange: (() => void) | null = null;
  private _fetchDebounce: ReturnType<typeof setTimeout> | null = null;
  private _active = false;

  // Lazy loading state
  private _hasOlderMessages = true;
  private _loadingOlder = false;

  constructor(config: PanelConfig) {
    this._config = config;
  }

  get messages(): ChatMessage[] {
    return this._messages;
  }

  get loading(): boolean {
    return this._loading;
  }

  get error(): string | null {
    return this._error;
  }

  get entityId(): string | null {
    return this._entityId;
  }

  get loadingOlder(): boolean {
    return this._loadingOlder;
  }

  get hasOlderMessages(): boolean {
    return this._hasOlderMessages;
  }

  /**
   * Set the change callback — called whenever messages, loading, or error state changes.
   */
  setOnChange(callback: () => void): void {
    this._onChange = callback;
  }

  /**
   * Update the hass object (called on every hass change).
   */
  setHass(hass: HomeAssistant): void {
    this._hass = hass;
  }

  /**
   * Update config.
   */
  setConfig(config: PanelConfig): void {
    this._config = config;
  }

  /**
   * Switch to a new entity. Triggers fresh fetch from the message store.
   */
  async switchEntity(entityId: string | null): Promise<void> {
    if (entityId === this._entityId) return;

    // Cleanup previous subscriptions
    this._stopUpdates();

    this._entityId = entityId;
    this._messages = [];
    this._error = null;
    this._retryCount = 0;
    this._hasOlderMessages = true;
    this._loadingOlder = false;

    if (!entityId) {
      this._active = false;
      this._notify();
      return;
    }

    this._active = true;

    // Start real-time updates before the fetch
    this._startUpdates(entityId);

    // Fetch messages from the store
    await this._fetchMessages(entityId);
  }

  /**
   * Force a full refresh.
   */
  async refresh(): Promise<void> {
    if (this._entityId) {
      await this._fetchMessages(this._entityId);
    }
  }

  /**
   * Add a local optimistic message immediately (before API confirmation).
   */
  addOptimisticMessage(sender: string, text: string): void {
    const now = new Date();
    const tempId = `optimistic_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;

    const msg: ChatMessage = {
      id: tempId,
      sender,
      text,
      timestamp: now,
      isOutgoing: true,
      isSystem: false,
      raw: `${sender}: ${text}`,
      mentions: [],
    };

    this._messages = [...this._messages, msg];
    this._notify();
  }

  /**
   * Load older messages using cursor-based pagination.
   * Called when user scrolls near the top of the chat.
   */
  async loadOlderMessages(): Promise<void> {
    if (this._loadingOlder || !this._hasOlderMessages || !this._hass || !this._entityId) {
      return;
    }

    this._loadingOlder = true;
    this._notify();

    try {
      // Cursor: oldest non-temporary message ID
      const oldestReal = this._messages.find(
        (m) => !m.id.startsWith('rt_') && !m.id.startsWith('optimistic_'),
      );

      const msg: Record<string, unknown> = {
        type: 'meshcore_chat/get_stored_messages',
        entity_id: this._entityId,
        limit: 50,
      };
      if (oldestReal) msg.before = oldestReal.id;

      const result = await this._hass.callWS<{
        messages: StoredMessage[];
        has_more: boolean;
      }>(msg);

      const older = result.messages.map(toClientMessage);
      this._hasOlderMessages = result.has_more;

      // Deduplicate against existing messages
      const existingIds = new Set(this._messages.map((m) => m.id));
      const newMessages = older.filter((m) => !existingIds.has(m.id));

      if (newMessages.length > 0) {
        this._messages = [...newMessages, ...this._messages];
        this._messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      }
    } catch {
      // Silently fail — user can try scrolling up again
    } finally {
      this._loadingOlder = false;
      this._notify();
    }
  }

  /**
   * Ensure messages around a specific timestamp are loaded so the UI
   * can scroll to a search result. Loads progressively older batches
   * until the target message is found or the store is exhausted.
   */
  async fetchAroundTimestamp(isoTimestamp: string): Promise<boolean> {
    const targetTime = new Date(isoTimestamp).getTime();

    // Check if a message near this timestamp is already loaded
    const existing = this._messages.find(
      (m) => Math.abs(m.timestamp.getTime() - targetTime) < 2000,
    );
    if (existing) return true;

    // Load older batches until we find it or exhaust the store
    let attempts = 0;
    const maxAttempts = 20; // Safety limit
    while (this._hasOlderMessages && attempts < maxAttempts) {
      await this.loadOlderMessages();
      attempts++;
      const found = this._messages.find(
        (m) => Math.abs(m.timestamp.getTime() - targetTime) < 2000,
      );
      if (found) return true;
    }
    return false;
  }

  /**
   * Pause updates — stop polling and WebSocket, but keep onChange callback.
   */
  pause(): void {
    this._stopUpdates();
    this._active = false;
    if (this._fetchDebounce) {
      clearTimeout(this._fetchDebounce);
      this._fetchDebounce = null;
    }
  }

  /**
   * Resume updates — restart polling and WebSocket.
   */
  async resume(): Promise<void> {
    if (this._entityId && !this._active) {
      this._active = true;
      this._startUpdates(this._entityId);
      await this._fetchMessages(this._entityId);
    }
  }

  /**
   * Full cleanup — only for permanent discard.
   */
  destroy(): void {
    this._stopUpdates();
    this._active = false;
    if (this._fetchDebounce) {
      clearTimeout(this._fetchDebounce);
      this._fetchDebounce = null;
    }
    this._onChange = null;
  }

  /**
   * Fetch messages from the persistent message store via WS command.
   */
  private async _fetchMessages(entityId: string): Promise<void> {
    if (!this._hass) return;

    this._loading = true;
    this._notify();

    try {
      const limit = 50;
      const result = await this._hass.callWS<{
        messages: StoredMessage[];
        has_more: boolean;
      }>({
        type: 'meshcore_chat/get_stored_messages',
        entity_id: entityId,
        limit,
      });

      const fetched = result.messages.map(toClientMessage);
      this._hasOlderMessages = result.has_more;

      // Merge: keep rt_ and optimistic messages that don't yet have a store match
      const fetchedIds = new Set(fetched.map((m) => m.id));
      const kept = this._messages.filter((m) => {
        if (m.id.startsWith('optimistic_')) {
          // Remove optimistic messages once a real version arrives
          const hasReal = fetched.some((f) => f.sender === m.sender && f.text === m.text);
          return !hasReal;
        }
        if (m.id.startsWith('rt_')) {
          // Remove rt_ messages once the stored version arrives
          const baseId = m.id.substring(3); // strip 'rt_' prefix
          return !fetchedIds.has(baseId);
        }
        return false; // Drop any other old messages — store is authoritative
      });

      this._messages = [...fetched, ...kept];
      this._messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Enforce max_messages limit
      const maxMessages = this._config.max_messages ?? 500;
      if (this._messages.length > maxMessages) {
        this._messages = this._messages.slice(-maxMessages);
        this._hasOlderMessages = true;
      }

      this._error = null;
      this._retryCount = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._error = `Failed to fetch messages: ${message}`;
      this._retryCount++;
    } finally {
      this._loading = false;
      this._notify();
    }
  }

  /**
   * Start real-time updates (event subscriptions + background polling).
   */
  private _startUpdates(entityId: string): void {
    this._startPolling(entityId);
    this._subscribeRealtime(entityId).catch(() => {
      // Event subscription failed, polling is still active as fallback
    });
  }

  /**
   * Subscribe to real-time WebSocket events for instant message display.
   */
  private async _subscribeRealtime(entityId: string): Promise<void> {
    if (!this._hass) return;

    const unsubs: Array<() => void> = [];

    try {
      // meshcore_message — incoming & outgoing messages
      const unsubMsg = await this._hass.connection.subscribeEvents(
        (event: HassEvent) => {
          if (event.data.entity_id === entityId) {
            this._handleRealtimeMessage(event.data);
          }
        },
        'meshcore_message',
      );
      unsubs.push(unsubMsg);

      // meshcore_delivery_update — delivery status updates
      const unsubDelivery = await this._hass.connection.subscribeEvents(
        (event: HassEvent) => {
          if (event.data.entity_id === entityId) {
            this._handleDeliveryUpdate(event.data);
          }
        },
        'meshcore_delivery_update',
      );
      unsubs.push(unsubDelivery);

      this._realtimeSubscriptions = unsubs;
    } catch (err) {
      unsubs.forEach((fn) => fn());
      throw err;
    }
  }

  /**
   * Handle incoming meshcore_message event.
   * Renders the message immediately from the event payload for near-instant
   * display, then triggers a debounced store fetch for confirmation.
   */
  private _handleRealtimeMessage(eventData: Record<string, unknown>): void {
    const sender = (eventData.sender_name ?? eventData.sender) as string;
    const text = (eventData.message ?? eventData.text) as string;
    const isOutgoing = sender === this._config.node_name;

    // Skip outgoing messages — they are already shown via the optimistic path.
    // Update delivery status on the existing optimistic message instead.
    if (isOutgoing) {
      if (sender && text) {
        const ackReceived = eventData.ack_received as boolean | undefined;
        const repeaterCount = eventData.repeater_count as number | undefined;
        const rxLogData = eventData.rx_log_data as Array<Record<string, unknown>> | undefined;
        const messageType = eventData.message_type as string | undefined;

        let deliveryStatus: DeliveryStatus;
        if (messageType === 'dm' || messageType === 'direct') {
          deliveryStatus = {
            status: ackReceived === true ? 'delivered' : 'sent',
            ackReceived: ackReceived ?? undefined,
          };
        } else {
          const count = repeaterCount ?? (rxLogData?.length ?? 0);
          deliveryStatus = {
            status: 'sent',
            repeaterCount: count,
          };
        }

        // Update the optimistic message in place
        for (let i = this._messages.length - 1; i >= 0; i--) {
          const m = this._messages[i];
          if (m.id.startsWith('optimistic_') && m.sender === sender && m.text === text) {
            m.deliveryStatus = deliveryStatus;
            if (rxLogData) m.rxLogData = rxLogData;
            this._notify();
            break;
          }
        }
      }
      // Trigger store fetch to replace optimistic with stored version
      if (this._entityId) this._debouncedFetch(this._entityId);
      return;
    }

    // Incoming message — render immediately with rt_ prefix for dedup
    if (sender && text) {
      const strippedText = text.replace(CHANNEL_PREFIX_REGEX, '');
      let displayText = strippedText;
      const senderPrefix = sender + ': ';
      if (displayText.startsWith(senderPrefix)) {
        displayText = displayText.substring(senderPrefix.length);
      }

      // Use the raw timestamp string from the event for ID generation so
      // the hash matches the backend's generate_message_id() exactly.
      // Python's datetime.isoformat() includes microseconds and no 'Z',
      // while JS Date.toISOString() truncates to ms and appends 'Z'.
      const timestampStr = (eventData.timestamp as string) || new Date().toISOString();
      const timestamp = new Date(timestampStr);

      const baseId = generateId(timestampStr, sender, displayText);
      const id = `rt_${baseId}`;

      // Only insert if not already present
      const alreadyExists = this._messages.some(
        (m) => m.id === id || m.id === baseId,
      );
      if (!alreadyExists) {
        const mentions = extractMentions(displayText);
        const rxLogData = eventData.rx_log_data as Array<Record<string, unknown>> | undefined;

        const msg: ChatMessage = {
          id,
          sender,
          text: displayText,
          timestamp,
          isOutgoing: false,
          isSystem: false,
          raw: text,
          mentions,
          rxLogData: rxLogData && rxLogData.length > 0 ? rxLogData : undefined,
        };

        this._messages.push(msg);
        this._messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        this._notify();
      }
    }

    // Trigger debounced store fetch to get the authoritative stored version
    if (this._entityId) {
      this._debouncedFetch(this._entityId);
    }
  }

  /**
   * Debounced fetch — coalesces multiple rapid real-time events into a single store query.
   */
  private _debouncedFetch(entityId: string): void {
    if (this._fetchDebounce) {
      clearTimeout(this._fetchDebounce);
    }
    this._fetchDebounce = setTimeout(async () => {
      this._fetchDebounce = null;
      if (!this._active) return;
      try {
        await this._fetchMessages(entityId);
      } catch {
        // _fetchMessages has its own error handling
      }
    }, 500);
  }

  /**
   * Handle meshcore_delivery_update event (delivery status for messages).
   * Updates in-memory messages directly for instant UI feedback.
   * The store is updated by the backend independently.
   */
  private _handleDeliveryUpdate(eventData: Record<string, unknown>): void {
    // Handle incoming message delivery updates (progressive rx_log_data)
    const rxLogData = eventData.rx_log_data as Array<Record<string, unknown>> | undefined;
    const progressive = eventData.progressive as boolean | undefined;
    if (progressive && rxLogData && rxLogData.length > 0) {
      const senderName = eventData.sender_name as string | undefined;
      const messageText = eventData.message as string | undefined;
      const eventTimestamp = eventData.timestamp as string | undefined;

      if (senderName && messageText) {
        const eventTime = eventTimestamp ? new Date(eventTimestamp).getTime() : 0;
        for (let i = this._messages.length - 1; i >= 0; i--) {
          const m = this._messages[i];
          if (
            !m.isOutgoing &&
            m.sender === senderName &&
            m.text === messageText &&
            (!eventTime || Math.abs(m.timestamp.getTime() - eventTime) < 10000)
          ) {
            m.rxLogData = rxLogData;
            m.repeaterCount = rxLogData.length;
            this._notify();
            return;
          }
        }
      }
    }

    // Handle outgoing message delivery status
    const sendId = eventData.send_id as string | undefined;
    const status = eventData.status as string | undefined;
    const repeaterCount = eventData.repeater_count as number | undefined;
    const ackReceived = eventData.ack_received as boolean | undefined;
    const roundTripMs = eventData.round_trip_ms as number | undefined;
    const isProgressive = eventData.progressive as boolean | undefined;

    if (!sendId) return;

    let derivedStatus: DeliveryStatus['status'];
    if (status) {
      derivedStatus = status as DeliveryStatus['status'];
    } else if (ackReceived === true) {
      derivedStatus = 'delivered';
    } else if (isProgressive && (repeaterCount === undefined || repeaterCount === 0)) {
      derivedStatus = 'waiting';
    } else {
      derivedStatus = 'sent';
    }

    // Find most recent outgoing message
    let msg: ChatMessage | undefined;
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (this._messages[i].isOutgoing) {
        msg = this._messages[i];
        break;
      }
    }

    if (msg) {
      msg.deliveryStatus = {
        status: derivedStatus,
        repeaterCount,
        ackReceived,
        roundTripMs,
      };
      if (repeaterCount !== undefined) {
        msg.repeaterCount = repeaterCount;
      }
      this._notify();
    }
  }

  /**
   * Incremental poll fetch — only requests messages newer than the most
   * recent stored message. Used by the 30s background poll to avoid
   * re-fetching the entire conversation on every cycle.
   */
  private async _pollFetch(entityId: string): Promise<void> {
    if (!this._hass) return;

    try {
      // Find the newest non-temporary message ID for cursor
      let afterId: string | undefined;
      for (let i = this._messages.length - 1; i >= 0; i--) {
        const id = this._messages[i].id;
        if (!id.startsWith('rt_') && !id.startsWith('optimistic_')) {
          afterId = id;
          break;
        }
      }

      const msg: Record<string, unknown> = {
        type: 'meshcore_chat/get_stored_messages',
        entity_id: entityId,
        limit: 50,
      };
      if (afterId) msg.after = afterId;

      const result = await this._hass.callWS<{
        messages: StoredMessage[];
        has_more: boolean;
      }>(msg);

      if (result.messages.length === 0) {
        this._error = null;
        this._retryCount = 0;
        return;
      }

      const fetched = result.messages.map(toClientMessage);

      // Deduplicate and append
      const existingIds = new Set(this._messages.map((m) => m.id));
      const newMessages = fetched.filter((m) => !existingIds.has(m.id));

      if (newMessages.length > 0) {
        // Remove any rt_ versions of these messages
        const newBaseIds = new Set(newMessages.map((m) => m.id));
        this._messages = this._messages.filter(
          (m) => !m.id.startsWith('rt_') || !newBaseIds.has(m.id.substring(3))
        );
        // Remove matched optimistic messages
        this._messages = this._messages.filter((m) => {
          if (!m.id.startsWith('optimistic_')) return true;
          return !newMessages.some((f) => f.sender === m.sender && f.text === m.text);
        });

        this._messages = [...this._messages, ...newMessages];
        this._messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Enforce max_messages limit
        const maxMessages = this._config.max_messages ?? 500;
        if (this._messages.length > maxMessages) {
          this._messages = this._messages.slice(-maxMessages);
          this._hasOlderMessages = true;
        }

        this._notify();
      }

      this._error = null;
      this._retryCount = 0;
    } catch {
      // Don't overwrite error state on poll failures — initial fetch errors are more important
      this._retryCount++;
    }
  }

  /**
   * Start background polling. Uses 30s interval (real-time events handle
   * instant display, polling is an incremental consistency check).
   */
  private _startPolling(entityId: string): void {
    const schedulePoll = () => {
      if (!this._active) return;

      const interval =
        this._retryCount >= FETCH_MAX_RETRIES ? ERROR_POLL_INTERVAL_MS : POLL_INTERVAL_MS;

      this._pollTimer = setTimeout(async () => {
        if (!this._active) return;
        try {
          await this._pollFetch(entityId);
        } catch {
          // _pollFetch has its own error handling
        }
        schedulePoll();
      }, interval);
    };

    schedulePoll();
  }

  /**
   * Stop all real-time updates and polling.
   */
  private _stopUpdates(): void {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    for (const unsub of this._realtimeSubscriptions) {
      unsub();
    }
    this._realtimeSubscriptions = [];
  }

  /**
   * Notify the panel that state changed.
   */
  private _notify(): void {
    if (this._onChange) {
      this._onChange();
    }
  }
}
