import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, Contact, Channel, MeshCoreDevice } from './types';
import type { TraceResult } from './api';
import { panelStyles } from './styles';
import { MESHCORE_PRESET, DEFAULT_PANEL_CONFIG } from './constants';
import { getDevices, getContacts, getChannels, getUnreadCounts, removeContact, addContact, traceContact, type TracePathMode } from './api';
import './pages/chat-page';
import './pages/devices-page';
import './pages/nodes-page';
import './pages/settings-page';
import './components/trace-dialog';
import './components/target-picker';

@customElement('meshcore-chat-panel')
export class MeshCorePanel extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Boolean }) narrow = false;
  @property({ type: Object }) panel?: Record<string, unknown>;

  @state() private _config: PanelConfig | null = null;
  @state() private _activeTab: 'chat' | 'devices' | 'nodes' | 'settings' = 'chat';
  // managedDevices removed — devices-page.ts fetches its own data
  @state() private _devices: MeshCoreDevice[] = [];
  @state() private _contacts: Contact[] = [];
  @state() private _channels: Channel[] = [];
  @state() private _selectedEntryId: string | null = null;
  @state() private _loading = true;
  @state() private _loadingStarted = false;
  @state() private _error: string | null = null;
  @state() private _unsubscribeList: Array<() => void> = [];
  @state() private _unreadCounts: Record<string, number> = {};
  @state() private _pendingChatTarget: string | null = null;
  /** Entity ID of the conversation currently being viewed in chat. */
  private _activeChatEntityId: string | null = null;

  // Trace-result dialog state.  Opened from the 'trace' action handler; the
  // dialog closes itself via a trace-dialog-closed event.
  @state() private _traceDialogOpen = false;
  @state() private _traceDialogContactName = '';
  @state() private _traceDialogResult: TraceResult | null = null;
  @state() private _traceDialogError = '';
  // Session 54: trace-dialog has an input phase before running.  Store
  // the target so the `trace-requested` handler can fire traceContact()
  // after the user picks a path type.
  @state() private _traceDialogPubkeyPrefix = '';
  @state() private _traceDialogEntryId: string | undefined = undefined;
  // Session 55: pass the full Contact record through to the dialog so it
  // can pre-populate forwarding-class targets as the last hop.  Null for
  // ManagedDevice invocations or when we have no Contact record.
  @state() private _traceDialogTargetContact: Contact | null = null;

  // Session 56: target-picker is a pre-dialog step that only appears for
  // companion-entry traces (settings-tab Trace button).  Nodes-tab
  // traces come with a pre-chosen target and bypass the picker entirely,
  // opening the trace-dialog directly.  _pendingTraceEntryId caches the
  // entry_id that should be used when the picker resolves.
  @state() private _targetPickerOpen = false;
  @state() private _pendingTraceEntryId: string | undefined = undefined;

  static styles = [
    panelStyles,
    css`
      :host {
        display: block;
        width: 100%;
        height: 100vh;
      }

      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--primary-background-color, #fafafa);
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--card-background-color, #fff);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        flex-shrink: 0;
        gap: 12px;
      }

      .panel-title {
        font-size: 18px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .device-info {
        font-size: 13px;
        color: var(--secondary-text-color);
      }

      .device-switcher {
        padding: 8px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 13px;
        box-sizing: border-box;
        height: 39px;
        min-height: 39px;
        line-height: normal;
        appearance: menulist;
        -webkit-appearance: menulist;
        cursor: pointer;
        max-width: 250px;
      }

      .menu-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--primary-text-color);
        border-radius: 50%;
        padding: 0;
        flex-shrink: 0;
      }

      .menu-icon:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.1));
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }

      .connection-status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid;
      }

      .connection-status.online {
        color: #4caf50;
        border-color: rgba(76, 175, 80, 0.4);
        background: rgba(76, 175, 80, 0.08);
      }

      .connection-status.offline {
        color: var(--error-color, #db4437);
        border-color: rgba(219, 68, 55, 0.4);
        background: rgba(219, 68, 55, 0.08);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .status-dot.online {
        background: #4caf50;
      }

      .status-dot.offline {
        background: var(--error-color, #db4437);
      }

      .battery-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 500;
        color: var(--secondary-text-color);
      }

      .battery-icon {
        position: relative;
        width: 18px;
        height: 10px;
        border: 1.5px solid var(--secondary-text-color, #888);
        border-radius: 2px;
        display: flex;
        align-items: center;
        padding: 1px;
      }

      .battery-icon::after {
        content: '';
        position: absolute;
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        width: 2px;
        height: 5px;
        background: var(--secondary-text-color, #888);
        border-radius: 0 1px 1px 0;
      }

      .battery-fill {
        height: 100%;
        border-radius: 1px;
        transition: width 0.3s ease;
      }

      .battery-fill.high {
        background: #4caf50;
      }

      .battery-fill.medium {
        background: #ff9800;
      }

      .battery-fill.low {
        background: var(--error-color, #db4437);
      }

      .battery-pct {
        min-width: 28px;
        text-align: right;
      }

      /* Mobile: compact header indicators */
      @media (max-width: 870px) {
        .connection-status {
          padding: 0;
          border: none;
          background: none !important;
          gap: 0;
          font-size: 0;
        }

        .connection-status .status-dot {
          width: 8px;
          height: 8px;
        }

        .battery-pct {
          display: none;
        }

        .battery-indicator {
          gap: 0;
        }

        .battery-icon {
          width: 13.5px;
          height: 7.5px;
          border-width: 1.25px;
        }

        .battery-icon::after {
          right: -3px;
          width: 1.5px;
          height: 4px;
        }
      }

      .tab-bar {
        display: flex;
        background: var(--card-background-color, #fff);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        flex-shrink: 0;
      }

      .tab-bar button {
        flex: 1;
        padding: 12px 16px;
        border: none;
        background: transparent;
        color: var(--secondary-text-color, #727272);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border-bottom: 3px solid transparent;
        min-height: 48px;
      }

      .tab-bar button:hover {
        color: var(--primary-text-color);
        background: rgba(0, 0, 0, 0.02);
      }

      .tab-bar button.active {
        color: var(--primary-color, #03a9f4);
        border-bottom-color: var(--primary-color, #03a9f4);
      }

      .page-container {
        flex: 1;
        overflow: hidden;
        display: flex;
      }

      .page-container > * {
        flex: 1;
        overflow: hidden;
      }

      .error-banner {
        padding: 12px 16px;
        background: rgba(219, 68, 55, 0.08);
        color: var(--error-color, #db4437);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        font-size: 13px;
      }

      .center-message {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: var(--secondary-text-color);
        padding: 24px;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--divider-color, #e0e0e0);
        border-top-color: var(--primary-color, #03a9f4);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
    this._setupSubscriptions();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardownSubscriptions();
  }

  /**
   * Subscribe to HA WebSocket events for live updates.
   * Idempotent — tears down existing subscriptions before re-subscribing.
   */
  private _setupSubscriptions() {
    // Clean up any existing subscriptions first
    this._teardownSubscriptions();

    if (!this.hass?.connection?.subscribeEvents) return;

    this.hass.connection.subscribeEvents(
      (event: any) => {
        if (event.data.entry_id === this._selectedEntryId) {
          this._loadDeviceData();
        }
      },
      'meshcore_channels_updated'
    ).then(unsubscribe => {
      this._unsubscribeList.push(unsubscribe);
    });

    this.hass.connection.subscribeEvents(
      (event: any) => {
        if (event.data.entry_id === this._selectedEntryId) {
          this._loadDeviceData();
        }
      },
      'meshcore_channel_removed'
    ).then(unsubscribe => {
      this._unsubscribeList.push(unsubscribe);
    });

    this.hass.connection.subscribeEvents(
      (event: { data?: { entity_id?: string } }) => {
        // Suppress unread updates for the conversation the user is currently viewing
        if (this._activeChatEntityId && event.data?.entity_id === this._activeChatEntityId) {
          return;
        }
        this._loadUnreadCounts();
      },
      'meshcore_unread_updated'
    ).then(unsubscribe => {
      this._unsubscribeList.push(unsubscribe);
    });
  }

  /**
   * Tear down all active WebSocket event subscriptions.
   */
  private _teardownSubscriptions() {
    if (this._unsubscribeList.length > 0) {
      this._unsubscribeList.forEach(unsub => {
        try { unsub(); } catch (_) { /* connection may already be dead */ }
      });
      this._unsubscribeList = [];
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('hass') && this.hass && !this._config && !this._loadingStarted) {
      // hass wasn't available in connectedCallback, try loading now
      this._loadData();
    }
  }

  private get _selectedDevice(): MeshCoreDevice | undefined {
    return this._devices.find((d) => d.entry_id === this._selectedEntryId);
  }

  render() {
    if (this._loading) {
      return html`
        <div class="panel">
          <div class="center-message">
            <div class="spinner"></div>
          </div>
        </div>
      `;
    }

    if (this._error && !this._config) {
      return html`
        <div class="panel">
          <div class="center-message">
            <div>
              <p>${this._error}</p>
              <p style="font-size: 12px; margin-top: 8px;">
                Check that the MeshCore integration is loaded and connected.
              </p>
            </div>
          </div>
        </div>
      `;
    }

    const device = this._selectedDevice;

    return html`
      <div class="panel">
        <div class="panel-header">
          <div class="header-left">
            ${this.narrow || this.hass?.dockedSidebar === 'always_hidden'
              ? html`<button class="menu-icon" @click=${this._toggleMenu} aria-label="Toggle sidebar">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
                </button>`
              : html``}
            <div class="panel-title">MeshCore Chat</div>
          </div>
          <div class="header-right">
            ${device && this._getNodeStatus(device) !== null
              ? html`
                  <span class="connection-status ${this._getNodeStatus(device) === 'online' ? 'online' : 'offline'}">
                    <span class="status-dot ${this._getNodeStatus(device) === 'online' ? 'online' : 'offline'}"></span>
                    ${this._getNodeStatus(device) === 'online' ? 'Connected' : 'Disconnected'}
                  </span>`
              : html``}
            ${device && this._getBatteryLevel(device) !== null
              ? html`
                  <span class="battery-indicator">
                    <span class="battery-icon">
                      <span class="battery-fill ${this._getBatteryLevel(device)! > 50 ? 'high' : this._getBatteryLevel(device)! > 20 ? 'medium' : 'low'}"
                            style="width: ${this._getBatteryLevel(device)}%"></span>
                    </span>
                    <span class="battery-pct">${this._getBatteryLevel(device)}%</span>
                  </span>`
              : html``}
            ${this._devices.length > 1
              ? html`
                  <select
                    class="device-switcher"
                    .value=${this._selectedEntryId || ''}
                    @change=${this._onDeviceChange}>
                    ${this._devices.map(
                      (d) => html`
                        <option value=${d.entry_id}>
                          ${d.name} ${d.connected ? '' : '(offline)'}
                        </option>
                      `,
                    )}
                  </select>
                `
              : html`<span class="device-info">${device?.name || ''}</span>`}
          </div>
        </div>

        ${this._error
          ? html`<div class="error-banner">${this._error}</div>`
          : html``}

        <div class="tab-bar">
          <button
            class=${this._activeTab === 'chat' ? 'active' : ''}
            @click=${() => (this._activeTab = 'chat')}>
            Chat
          </button>
          <button
            class=${this._activeTab === 'devices' ? 'active' : ''}
            @click=${() => (this._activeTab = 'devices')}>
            Devices
          </button>
          <button
            class=${this._activeTab === 'nodes' ? 'active' : ''}
            @click=${() => (this._activeTab = 'nodes')}>
            Nodes
          </button>
          <button
            class=${this._activeTab === 'settings' ? 'active' : ''}
            @click=${() => (this._activeTab = 'settings')}>
            Settings
          </button>
        </div>

        <div class="page-container">
          ${this._renderActivePage()}
        </div>

        <meshcore-trace-dialog
          ?open=${this._traceDialogOpen}
          .contactName=${this._traceDialogContactName}
          .result=${this._traceDialogResult}
          .error=${this._traceDialogError}
          .availableRepeaters=${this._contacts.filter(c => c.type === 2 || c.type === 3 || c.type === 4)}
          .targetContact=${this._traceDialogTargetContact}
          @trace-requested=${this._onTraceRequested}
          @trace-dialog-closed=${() => { this._traceDialogOpen = false; }}>
        </meshcore-trace-dialog>

        <meshcore-target-picker
          ?open=${this._targetPickerOpen}
          .contacts=${this._contacts}
          @target-selected=${this._onTargetPicked}
          @target-picker-closed=${() => { this._targetPickerOpen = false; }}>
        </meshcore-target-picker>
      </div>
    `;
  }

  private _renderActivePage() {
    switch (this._activeTab) {
      case 'chat':
        return html`
          <meshcore-chat-page
            .hass=${this.hass}
            .config=${this._config}
            .conversations=${[...this._channels, ...this._contacts.filter(c => c.added_to_node)]}
            .unreadCounts=${this._unreadCounts}
            .selectedId=${this._pendingChatTarget}
            .narrow=${this.narrow}
            @unread-cleared=${this._onUnreadCleared}
            @active-entity-changed=${this._onActiveEntityChanged}
            @contacts-changed=${() => this._loadDeviceData()}
            @channels-changed=${() => this._loadDeviceData()}></meshcore-chat-page>`;
      case 'devices':
        return html`
          <meshcore-devices-page
            .hass=${this.hass}
            .config=${this._config}
            .selectedDevice=${this._selectedDevice}
            .narrow=${this.narrow}></meshcore-devices-page>`;
      case 'nodes':
        return html`
          <meshcore-nodes-page
            .hass=${this.hass}
            .contacts=${this._contacts}
            .channels=${this._channels}
            .narrow=${this.narrow}
            @node-action=${this._handleNodeAction}
            @contacts-changed=${() => this._loadDeviceData()}></meshcore-nodes-page>`;
      case 'settings':
        return html`
          <meshcore-settings-page
            .hass=${this.hass}
            .config=${this._config}
            .selectedDevice=${this._selectedDevice}
            .narrow=${this.narrow}
            @companion-trace-requested=${this._onCompanionTraceRequested}></meshcore-settings-page>`;
    }
  }

  private _toggleMenu() {
    this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }));
  }

  /**
   * Get the node status for a device by looking up its sensor entity.
   * Entity ID pattern: sensor.meshcore_{prefix6}_node_status_{slugified_name}
   */
  /** Derive the slugified entity suffix for a device (shared by status + battery lookups). */
  private _deviceEntitySuffix(device: MeshCoreDevice): { prefix: string; name: string } {
    const prefix = (device.pubkey_prefix || device.pubkey || '').substring(0, 6).toLowerCase();
    const name = (device.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return { prefix, name };
  }

  /**
   * Get the node status for a device. Returns null if entity is disabled/missing.
   */
  private _getNodeStatus(device: MeshCoreDevice): string | null {
    if (!this.hass) return null;
    const { prefix, name } = this._deviceEntitySuffix(device);
    const entityId = `sensor.meshcore_${prefix}_node_status_${name}`;
    const state = this.hass.states[entityId];
    if (!state) return null;
    return state.state;
  }

  /**
   * Get battery percentage for a device.
   * Returns a number 0-100 or null if unavailable.
   */
  private _getBatteryLevel(device: MeshCoreDevice): number | null {
    if (!this.hass) return null;
    const { prefix, name } = this._deviceEntitySuffix(device);
    const entityId = `sensor.meshcore_${prefix}_battery_percentage_${name}`;
    const state = this.hass.states[entityId];
    if (!state || state.state === 'unknown' || state.state === 'unavailable') return null;
    const val = parseFloat(state.state);
    return isNaN(val) ? null : Math.round(val);
  }

  private _onDeviceChange(e: Event) {
    const sel = e.target as HTMLSelectElement;
    this._selectedEntryId = sel.value || null;
    // Reload contacts and channels for the new device
    this._loadDeviceData();
  }

  private async _loadData() {
    if (!this.hass || this._loadingStarted) return;

    this._loadingStarted = true;
    this._loading = true;
    this._error = null;

    try {
      const devices = await getDevices(this.hass);
      this._devices = devices;

      if (devices.length === 0) {
        this._error = 'No MeshCore devices found';
        this._loading = false;
        return;
      }

      // Auto-select first connected device, or first device
      const connected = devices.find((d) => d.connected);
      this._selectedEntryId = (connected || devices[0]).entry_id;

      // Build config from device info + MeshCore preset defaults
      const device = connected || devices[0];
      this._config = {
        node_name: device.name,
        node_prefix: device.pubkey_prefix?.substring(0, 6) || '',
        entry_id: device.entry_id,
        ...MESHCORE_PRESET,
        ...DEFAULT_PANEL_CONFIG,
      };

      // Load contacts, channels, and unread counts
      await this._loadDeviceData();
      await this._loadUnreadCounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._error = `Failed to load: ${message}`;
      console.error('MeshCore panel load error:', err);
    } finally {
      this._loading = false;
    }
  }

  private async _loadDeviceData() {
    if (!this.hass || !this._selectedEntryId) return;

    try {
      const [contacts, channels] = await Promise.all([
        getContacts(this.hass, this._selectedEntryId),
        getChannels(this.hass, this._selectedEntryId),
      ]);
      this._contacts = contacts;
      this._channels = channels;

      // Update config with selected device info
      const device = this._selectedDevice;
      if (device && this._config) {
        this._config = {
          ...this._config,
          node_name: device.name,
          node_prefix: device.pubkey_prefix?.substring(0, 6) || '',
          entry_id: device.entry_id,
        };
      }
    } catch (err) {
      console.error('Failed to load device data:', err);
    }
  }

  private _onUnreadCleared(e: CustomEvent) {
    const { entityId } = e.detail;
    if (entityId && this._unreadCounts[entityId]) {
      // Immediately zero out the count locally — don't wait for backend event
      this._unreadCounts = { ...this._unreadCounts, [entityId]: 0 };
    }
  }

  private _onActiveEntityChanged(e: CustomEvent) {
    this._activeChatEntityId = e.detail?.entityId || null;
  }

  private async _loadUnreadCounts() {
    if (!this.hass) return;
    try {
      const counts = await getUnreadCounts(this.hass, this._selectedEntryId || undefined);
      // Zero out the actively-viewed conversation — user is already reading it
      if (this._activeChatEntityId && counts[this._activeChatEntityId]) {
        counts[this._activeChatEntityId] = 0;
      }
      this._unreadCounts = counts;
    } catch {
      // Silently fail
    }
  }

  private async _handleNodeAction(e: CustomEvent) {
    const { action, node } = e.detail as { action: string; node: Contact };
    if (!this.hass || !node) return;

    const pubkey = node.public_key || '';
    const pubkeyPrefix = node.pubkey_prefix || '';
    const entryId = this._selectedEntryId || undefined;

    switch (action) {
      case 'message':
        if (pubkeyPrefix) {
          this._pendingChatTarget = pubkeyPrefix;
          this._activeTab = 'chat';
        }
        break;

      case 'remove-contact':
        if (pubkey) {
          try {
            await removeContact(this.hass, pubkey, entryId);
            await this._loadDeviceData();
            await this._refreshNodesPageAfterMutation(pubkey);
          } finally {
            // Always clear pending state, even on API failure, so the
            // Remove Contact button doesn't stay stuck on "Removing…"
            this._clearNodesPagePending();
          }
        }
        break;

      case 'add-contact':
        if (pubkey) {
          try {
            await addContact(this.hass, pubkey, node.adv_name || undefined, entryId);
            await this._loadDeviceData();
            await this._refreshNodesPageAfterMutation(pubkey);
          } finally {
            this._clearNodesPagePending();
          }
        }
        break;

      case 'trace':
        if (pubkeyPrefix) {
          // Session 54: open dialog in input phase.  User picks path type
          // (discovery / select repeaters / enter path) and clicks Run
          // Trace.  The dialog fires `trace-requested`, which is handled
          // by _onTraceRequested below — that's where the actual WS call
          // goes out.  Backend timeout is ~5-18 s depending on device's
          // suggested_timeout, plus path-discovery time for flood contacts.
          this._traceDialogPubkeyPrefix = pubkeyPrefix;
          this._traceDialogEntryId = entryId;
          this._traceDialogContactName = node.adv_name || pubkeyPrefix;
          // Session 55: pass the full Contact record to the dialog so it
          // can pre-populate forwarding-class targets (type 2/3/4) as the
          // single last-hop entry.  Mirrors the `'adv_name' in node` check
          // used in node-detail-dialog.ts:256; ManagedDevice invocations
          // would hit the else branch (null) and the dialog falls back to
          // discovery-mode default.
          this._traceDialogTargetContact =
            'adv_name' in (node as object) ? (node as Contact) : null;
          this._traceDialogResult = null;
          this._traceDialogError = '';
          this._traceDialogOpen = true;
        }
        break;

      case 'delete':
      case 'remove':
        if (pubkey) {
          await removeContact(this.hass, pubkey, entryId);
          await this._loadDeviceData();
        }
        break;

      default:
        console.warn('Unhandled node action:', action);
    }
  }

  // ─── Nodes-page refresh helpers (post-mutation) ─────────────────────
  //
  // After an Add/Remove Contact mutation, the nodes-page's own state
  // (_displayedContacts, _l1Counts, _selectedNode) is stale. The panel-
  // level _loadDeviceData() only refreshes this._contacts, which the
  // nodes-page does not consume for rendering. These helpers reach into
  // the child component to trigger its own refetch + re-resolve.

  private async _refreshNodesPageAfterMutation(pubkey: string) {
    const nodesPage = this.shadowRoot?.querySelector('meshcore-nodes-page') as
      | (HTMLElement & { refreshAfterMutation: (pubkey: string) => Promise<void> })
      | null;
    if (nodesPage && typeof nodesPage.refreshAfterMutation === 'function') {
      try {
        await nodesPage.refreshAfterMutation(pubkey);
      } catch (err) {
        console.error('Failed to refresh nodes-page after mutation:', err);
      }
    }
  }

  private _clearNodesPagePending() {
    const nodesPage = this.shadowRoot?.querySelector('meshcore-nodes-page') as
      | (HTMLElement & { clearPendingAction: () => void })
      | null;
    if (nodesPage && typeof nodesPage.clearPendingAction === 'function') {
      nodesPage.clearPendingAction();
    }
  }

  // ─── Session 54: trace-dialog input-phase handler ──────────────────
  //
  // The trace-dialog now opens in an input phase; when the user clicks
  // Run Trace, the dialog emits `trace-requested` with { pathMode, path }.
  // We pick up the stashed pubkeyPrefix / entryId here and fire the
  // actual WS call.  Dialog transitions to `running` on its own (it sets
  // an internal _running flag before dispatching), then to `done` when
  // we set `.result` or `.error`.

  private _onTraceRequested = async (
    e: CustomEvent<{ pathMode: TracePathMode; path?: string }>,
  ) => {
    if (!this.hass) return;
    const { pathMode, path } = e.detail;
    try {
      const result = await traceContact(
        this.hass,
        this._traceDialogPubkeyPrefix,
        this._traceDialogEntryId,
        pathMode,
        path,
      );
      this._traceDialogResult = result;
    } catch (err: any) {
      // hass.callWS rejects with a plain object like { code, message };
      // prefer the human-readable message, fall back to code, then to
      // a generic string.  Never call String(err) on the raw object —
      // it yields "[object Object]".
      this._traceDialogError = err?.message || err?.code || 'Unknown error';
    }
  };

  // ─── Session 56: companion-trace entry + target-picker handlers ────
  //
  // The settings-tab Trace button dispatches `companion-trace-requested`
  // with the current companion's entry_id.  We cache it and open the
  // target-picker; when the user selects a contact, we populate the
  // trace-dialog fields and open it.  Nodes-tab traces bypass this
  // entirely — they open the trace-dialog directly via _startTrace().
  private _onCompanionTraceRequested = (
    e: CustomEvent<{ entryId?: string }>,
  ) => {
    this._pendingTraceEntryId =
      e.detail?.entryId ?? this._selectedEntryId ?? undefined;
    this._targetPickerOpen = true;
  };

  private _onTargetPicked = (e: CustomEvent<Contact>) => {
    const contact = e.detail;
    this._targetPickerOpen = false;
    if (!contact) return;
    this._traceDialogPubkeyPrefix = contact.pubkey_prefix;
    this._traceDialogEntryId = this._pendingTraceEntryId;
    this._traceDialogContactName = contact.adv_name || contact.pubkey_prefix;
    this._traceDialogTargetContact = contact;
    this._traceDialogResult = null;
    this._traceDialogError = '';
    this._traceDialogOpen = true;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-chat-panel': MeshCorePanel;
  }
}
