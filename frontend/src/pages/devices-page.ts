import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { panelStyles } from '../styles';
import type { HomeAssistant, PanelConfig, ManagedDevice, MeshCoreDevice, NeighborInfo, Contact } from '../types';
import { getManagedDevices, executeRemote, getNeighbors, getContacts } from '../api';
import '../components/sensor-tile';
import '../components/node-summary';
import '../components/snr-chart';
import '../components/confirm-dialog';
import '../components/command-dialog';
import { longPress } from '../directives/long-press';
import { loadMeshcoreEntityRegistry, type EntityInfo } from '../utils/classify-entity';
import { attachDialogA11y } from '../utils/dialog-a11y';

@customElement('meshcore-devices-page')
export class DevicesPage extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  @property({ type: Boolean }) narrow = false;
  @property({ type: Object }) selectedDevice?: MeshCoreDevice;

  @state() private _managedDevices: { repeaters: ManagedDevice[]; clients: ManagedDevice[] } = {
    repeaters: [],
    clients: [],
  };

  /** Contacts indexed by pubkey_prefix for cheap location-fallback
   *  lookup at render time. Loaded once after device fetch. */
  @state() private _contactsByPrefix: Record<string, Contact> = {};

  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _confirmAction: { title: string; message: string; onConfirm: () => void } | null = null;
  @state() private _confirmDialogOpen = false;
  @state() private _commandDialogOpen = false;
  @state() private _commandDialogTarget = '';
  @state() private _commandDialogIsLocal = false;
  @state() private _statusMessage: { text: string; type: 'success' | 'error' } | null = null;
  @state() private _statusMessageTimeout: number | null = null;

  // Entity registry cache: HA device_id → entity list
  @state() private _deviceEntities: Record<string, EntityInfo[]> = {};
  // Map: meshcore identifier key → HA device_id
  @state() private _meshcoreDeviceMap: Record<string, string> = {};
  @state() private _entityRegistryLoaded = false;

  // Hidden sensors: device identifier key → set of hidden entity_ids
  // Persisted to localStorage under 'meshcore-hidden-sensors'
  @state() private _hiddenSensors: Record<string, string[]> = {};

  // Context menu modal state (right-click / long-press on tile)
  @state() private _contextMenu: { entityId: string; label: string; deviceKey: string } | null = null;
  /** True when a pointerdown started on the modal overlay itself — used to
   *  require a full tap (down + up) on the overlay to dismiss the modal,
   *  preventing the trailing touch-release from a long-press from closing it. */
  private _overlayPointerStarted = false;

  // Settings modal: which device key's settings modal is open
  @state() private _settingsDeviceKey: string | null = null;

  // Hidden sensors list modal: which device key's hidden list is showing
  @state() private _hiddenSensorsModalKey: string | null = null;

  // Neighbor context menu (right-click on neighbor row)
  @state() private _neighborContextMenu: {
    name: string;
    neighborPubkey: string;
    repeaterPubkey: string;
  } | null = null;

  // Neighbor data per repeater: pubkey_prefix → { neighbors, chartData, loading }
  @state() private _neighborData: Record<string, {
    neighbors: NeighborInfo[];
    chartData: Array<{ timestamp: number; values: Record<string, number> }>;
    loading: boolean;
    loaded: boolean;
  }> = {};

  constructor() {
    super();
    // Focus trap + Escape closes inline modals. One
    // controller per modal-state pair. getScope targets a unique
    // wrapper class (added below) so the focus trap is scoped to the
    // open modal, not the whole page.
    attachDialogA11y(this, {
      isOpen: () => this._contextMenu !== null,
      onEscape: () => this._dismissContextMenu(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="tile-context"]'),
    });
    attachDialogA11y(this, {
      isOpen: () => this._neighborContextMenu !== null,
      onEscape: () => this._dismissNeighborContextMenu(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="neighbor-context"]'),
    });
    attachDialogA11y(this, {
      isOpen: () => this._settingsDeviceKey !== null,
      onEscape: () => this._closeSettingsModal(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="device-settings"]'),
    });
    attachDialogA11y(this, {
      isOpen: () => this._hiddenSensorsModalKey !== null,
      onEscape: () => this._closeHiddenSensorsModal(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="hidden-sensors"]'),
    });
  }

  static styles = [
    panelStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .devices-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .content-area {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 16px;
        background: var(--primary-background-color, #fafafa);
      }

      .content-area::-webkit-scrollbar { width: 6px; }
      .content-area::-webkit-scrollbar-track { background: transparent; }
      .content-area::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
        border-radius: 3px;
      }

      /* Dashboard sections */
      .device-section {
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
      }

      .device-section:last-child {
        margin-bottom: 0;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        gap: 8px;
        flex-wrap: wrap;
      }

      .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .section-title > div:last-child {
        min-width: 0;
        flex: 1 1 auto;
      }

      .section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .section-icon.companion {
        background: rgba(3, 169, 244, 0.12);
        color: #0288d1;
      }

      .section-icon.repeater {
        background: rgba(255, 152, 0, 0.12);
        color: #f57c00;
      }

      .section-icon.client {
        background: rgba(76, 175, 80, 0.12);
        color: #388e3c;
      }

      .device-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .device-meta {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .device-meta span {
        margin-right: 12px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
        white-space: nowrap;
        max-width: 100%;
      }

      .status-badge.online {
        background: rgba(76, 175, 80, 0.12);
        color: #2e7d32;
      }

      .status-badge.offline {
        background: rgba(114, 114, 114, 0.12);
        color: #616161;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }

      .status-dot.online { background: #4caf50; }
      .status-dot.offline { background: #9e9e9e; }
      .status-dot.unknown { background: #ff9800; }

      .status-badge.unknown {
        background: rgba(255, 152, 0, 0.12);
        color: #e65100;
      }

      /* Sensor tiles grid */
      .subsection-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        margin-top: 16px;
      }

      .sensor-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }

      /* Neighbor section */
      .neighbor-section {
        margin-top: 16px;
      }

      .neighbor-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        margin-top: 8px;
      }

      .neighbor-table th {
        text-align: left;
        padding: 6px 8px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        color: var(--secondary-text-color);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .neighbor-table tbody tr {
        cursor: context-menu;
      }

      .neighbor-table tbody tr:hover {
        background: var(--table-row-alternative-background-color, rgba(255,255,255,0.05));
      }

      .neighbor-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        color: var(--primary-text-color);
      }

      .neighbor-table code {
        font-size: 12px;
        background: var(--secondary-background-color, #f5f5f5);
        padding: 1px 4px;
        border-radius: 3px;
      }

      .snr-good { color: #4caf50; font-weight: 600; }
      .snr-fair { color: #ff9800; font-weight: 600; }
      .snr-poor { color: #f44336; font-weight: 600; }

      .neighbor-table .clickable-value {
        cursor: pointer;
        border-radius: 4px;
        padding: 2px 4px;
        margin: -2px -4px;
        transition: background 0.15s;
      }

      .neighbor-table .clickable-value:hover {
        background: var(--secondary-background-color, rgba(0,0,0,0.05));
      }

      /* Action buttons */
      .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 16px;
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 6px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .action-btn:hover:not(:disabled) {
        background: var(--secondary-background-color, #f5f5f5);
        border-color: var(--primary-color, #03a9f4);
      }

      .action-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .action-btn.primary {
        background: var(--primary-color, #03a9f4);
        color: #fff;
        border-color: var(--primary-color, #03a9f4);
      }

      .action-btn.primary:hover:not(:disabled) {
        opacity: 0.9;
      }

      /* Loading / empty / error */
      .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--secondary-text-color);
        font-size: 14px;
        gap: 8px;
      }

      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--divider-color, #e0e0e0);
        border-top-color: var(--primary-color, #03a9f4);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .neighbor-loading {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 12px 0;
        color: var(--secondary-text-color);
        font-size: 13px;
      }

      .neighbor-loading .loading-spinner {
        width: 14px;
        height: 14px;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .error-state {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        color: var(--error-color, #db4437);
        font-size: 13px;
        background: rgba(219, 68, 55, 0.08);
        border-radius: 8px;
        margin-bottom: 16px;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--secondary-text-color);
        text-align: center;
      }

      .empty-text { font-size: 14px; }
      .empty-subtext { font-size: 12px; margin-top: 8px; opacity: 0.7; }

      /* Toast */
      .status-toast {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 13px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
      }

      .status-toast.success { border-left: 4px solid #4caf50; }
      .status-toast.error { border-left: 4px solid var(--error-color, #db4437); color: var(--error-color, #db4437); }

      @keyframes slideIn {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* Settings gear button */
      .settings-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 8px;
        flex-shrink: 0;
      }

      .settings-btn:hover {
        background: var(--secondary-background-color, #f0f0f0);
        color: var(--primary-text-color);
      }

      /* Modal overlay */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.15s ease-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .modal-card {
        background: var(--card-background-color, #fff);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        min-width: 260px;
        max-width: 400px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .modal-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .modal-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 18px;
      }

      .modal-close:hover {
        background: var(--secondary-background-color, #f0f0f0);
      }

      .modal-body {
        padding: 8px 0;
        overflow-y: auto;
      }

      .modal-action {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        cursor: pointer;
        transition: background 0.15s;
        color: var(--primary-text-color);
        font-size: 14px;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
      }

      .modal-action:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .modal-action.danger {
        color: var(--error-color, #db4437);
      }

      .modal-action-icon {
        display: flex;
        align-items: center;
        color: var(--secondary-text-color);
        flex-shrink: 0;
      }

      .modal-action.danger .modal-action-icon {
        color: var(--error-color, #db4437);
      }

      .modal-action:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .modal-action:disabled:hover {
        background: none;
      }

      .modal-divider {
        height: 1px;
        background: var(--divider-color, #e0e0e0);
        margin: 4px 0;
      }

      /* Hidden sensors list */
      .hidden-sensor-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 20px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .hidden-sensor-item:last-child {
        border-bottom: none;
      }

      .hidden-sensor-name {
        font-size: 13px;
        color: var(--primary-text-color);
      }

      .hidden-sensor-id {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .unhide-btn {
        padding: 4px 10px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 4px;
        background: var(--card-background-color, #fff);
        color: var(--primary-color, #03a9f4);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }

      .unhide-btn:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .modal-footer {
        padding: 12px 20px;
        border-top: 1px solid var(--divider-color, #e0e0e0);
        display: flex;
        justify-content: flex-end;
      }

      .empty-hidden {
        padding: 20px;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: 13px;
      }

      /* Chart container */
      .chart-container {
        margin-top: 8px;
        overflow-x: auto;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this._loadHiddenSensors();
    this._loadManagedDevices();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._statusMessageTimeout !== null) {
      clearTimeout(this._statusMessageTimeout);
      this._statusMessageTimeout = null;
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('config')) {
      this._loadManagedDevices();
    }
    // Load entity registry once hass is available
    if (changedProperties.has('hass') && this.hass && !this._entityRegistryLoaded) {
      this._loadEntityRegistry();
    }
  }

  render() {
    if (!this.hass) {
      return html`<div class="content-area"><div class="loading-state"><div class="loading-spinner"></div> Initializing...</div></div>`;
    }

    return html`
      <div class="devices-layout">
        <div class="content-area">
          ${this._error ? html`<div class="error-state"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg> ${this._error}</div>` : nothing}

          ${this._loading
            ? html`<div class="loading-state"><div class="loading-spinner"></div> Loading devices...</div>`
            : html`
                ${this._renderDeviceSections(this._managedDevices.repeaters, 'repeater')}
                ${this._renderDeviceSections(this._managedDevices.clients, 'client')}
                ${this._managedDevices.repeaters.length === 0 && this._managedDevices.clients.length === 0
                  ? html`
                      <div class="empty-state">
                        <div class="empty-text">No managed devices</div>
                        <div class="empty-subtext">Add repeaters or clients in Settings → Integration to manage them here.</div>
                      </div>
                    `
                  : nothing}
              `}
        </div>
      </div>

      <!-- Confirmation Dialog -->
      <meshcore-confirm-dialog
        .open=${this._confirmDialogOpen}
        .title=${this._confirmAction?.title || ''}
        .message=${this._confirmAction?.message || ''}
        @confirm=${this._onConfirmAction}
        @cancel=${this._onConfirmCancel}>
      </meshcore-confirm-dialog>

      <!-- Command Dialog -->
      <meshcore-command-dialog
        .open=${this._commandDialogOpen}
        .hass=${this.hass}
        .entryId=${this.config?.entry_id}
        .targetPrefix=${this._commandDialogTarget}
        .nodeName=${this.config?.node_name ?? ''}
        ?isLocal=${this._commandDialogIsLocal}
        ?narrow=${this.narrow}
        @close=${this._onCommandDialogClose}>
      </meshcore-command-dialog>

      <!-- Tile Context Menu Modal -->
      ${this._contextMenu ? html`
        <div class="modal-overlay"
             @pointerdown=${this._onOverlayPointerDown}
             @click=${this._closeContextMenu}>
          <div class="modal-card" data-a11y="tile-context"
               role="dialog" aria-modal="true" aria-label="${this._contextMenu.label} actions"
               @click=${(e: Event) => e.stopPropagation()}
               @pointerdown=${(e: Event) => e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${this._contextMenu.label}</span>
              <button class="modal-close" aria-label="Close" @click=${this._dismissContextMenu}
                      @pointerdown=${(e: Event) => e.stopPropagation()}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action danger" @click=${this._hideSensorFromContext}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                Hide Sensor
              </button>
            </div>
          </div>
        </div>
      ` : nothing}

      <!-- Neighbor Context Menu Modal -->
      ${this._neighborContextMenu ? html`
        <div class="modal-overlay"
             @pointerdown=${this._onOverlayPointerDown}
             @click=${this._closeNeighborContextMenu}>
          <div class="modal-card" data-a11y="neighbor-context"
               role="dialog" aria-modal="true" aria-label="${this._neighborContextMenu.name} actions"
               @click=${(e: Event) => e.stopPropagation()}
               @pointerdown=${(e: Event) => e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${this._neighborContextMenu.name}</span>
              <button class="modal-close" aria-label="Close" @click=${this._dismissNeighborContextMenu}
                      @pointerdown=${(e: Event) => e.stopPropagation()}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action danger" @click=${this._removeNeighborFromContext}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></span>
                Remove Neighbor
              </button>
            </div>
          </div>
        </div>
      ` : nothing}

      <!-- Settings Modal -->
      ${this._settingsDeviceKey ? (() => {
        const ctx = this._getSettingsDeviceContext();
        return ctx ? html`
        <div class="modal-overlay" @click=${this._closeSettingsModal}>
          <div class="modal-card" data-a11y="device-settings"
               role="dialog" aria-modal="true" aria-label="${ctx.name} settings"
               @click=${(e: Event) => e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${ctx.name} Settings</span>
              <button class="modal-close" aria-label="Close" @click=${this._closeSettingsModal}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action" @click=${this._openHiddenSensorsList}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                View Hidden Sensors (${(this._hiddenSensors[this._settingsDeviceKey!] || []).length})
              </button>

              <!-- Issue Command -->
              <button class="modal-action" ?disabled=${!ctx.isOnline} @click=${() => { this._closeSettingsModal(); this._openCommandDialog(ctx.device!, false); }}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 19V7H4v12h16m0-16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h16m-7 14v-2h5v2h-5m-3.42-4L5.57 9H8.4l3.3 3.3c.39.39.39 1.03 0 1.42L8.42 17H5.59l4-4z"/></svg></span>
                Issue Command
              </button>

              <div class="modal-divider"></div>

              <!-- Reboot -->
              <button class="modal-action danger" ?disabled=${!ctx.isOnline} @click=${() => { this._closeSettingsModal(); this._confirmActionDialog(`Reboot ${ctx.name}?`, 'The device will restart.', () => this._executeRemoteAction(ctx.device!, 'reboot')); }}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></span>
                Reboot Device
              </button>

              <!-- Start OTA (repeaters only) -->
              ${ctx.type === 'repeater' ? html`
                <button class="modal-action danger" ?disabled=${!ctx.isOnline} @click=${() => { this._closeSettingsModal(); this._confirmActionDialog(`Start OTA on ${ctx.name}?`, 'The device will enter update mode.', () => this._executeRemoteAction(ctx.device!, 'start ota')); }}>
                  <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 18h14v2H5v-2zm4.6-2.7L5 10.7l2-1.9 2.6 2.6L17 4l2 2-9.4 9.3z"/></svg></span>
                  Start OTA Update
                </button>
              ` : nothing}
            </div>
          </div>
        </div>
      ` : nothing; })() : nothing}

      <!-- Hidden Sensors List Modal -->
      ${this._hiddenSensorsModalKey ? this._renderHiddenSensorsModal() : nothing}

      <!-- Status Toast -->
      ${this._statusMessage
        ? html`<div class="status-toast ${this._statusMessage.type}">${this._statusMessage.type === 'success' ? '✓ ' : '✗ '}${this._statusMessage.text}</div>`
        : nothing}
    `;
  }

  // ─── Managed Device Sections ──────────────────────────────────────

  private _renderDeviceSections(devices: ManagedDevice[], type: 'repeater' | 'client') {
    return devices.map(device => this._renderDeviceSection(device, type));
  }

  private _renderDeviceSection(device: ManagedDevice, type: 'repeater' | 'client') {
    // Derive status from the entity if available, fall back to ws_api status field
    let statusClass: 'online' | 'offline' | 'unknown' = 'unknown';
    let statusLabel = 'Unknown';
    if (device.status_entity_id && this.hass?.states[device.status_entity_id]) {
      const entityState = this.hass.states[device.status_entity_id].state;
      if (entityState === 'on') { statusClass = 'online'; statusLabel = 'Online'; }
      else if (entityState === 'off') { statusClass = 'offline'; statusLabel = 'Offline'; }
    } else if (device.status) {
      statusClass = device.status === 'online' ? 'online' : device.status === 'offline' ? 'offline' : 'unknown';
      statusLabel = device.status === 'online' ? 'Online' : device.status === 'offline' ? 'Offline' : 'Unknown';
    }
    const isOnline = statusClass === 'online';
    const deviceKey = this._getManagedDeviceKey(device, type);
    const entities = this._getDeviceEntities(device, type);
    const hiddenCount = (this._hiddenSensors[deviceKey] || []).length;
    const showNeighbors = type === 'repeater' && device.neighbors_enabled;
    const neighborState = this._neighborData[device.pubkey_prefix];

    // Append uptime to the status label when online ("Online · 12d 19h").
    // node-summary hides the uptime row from the table because the value
    // lives here. Look up the uptime entity via the entity classifier's
    // metricKey tag.
    const uptimeInfo = entities.find(e => e.metricKey === 'uptime_hours');
    const uptimeLabel = isOnline && uptimeInfo
      ? this._formatUptimeFromEntity(uptimeInfo.entity_id)
      : '';

    // Look up the contact for this device by pubkey_prefix to surface its
    // lat/lon as the Location hero tile fallback when no dedicated
    // location sensors exist (typical for managed repeaters/clients).
    // Also pass last_advert so the "Updated X ago" line under the coords
    // reflects when the contact was last heard (Unix seconds).
    const contact = this._contactsByPrefix[device.pubkey_prefix?.toLowerCase()];
    const fallbackLat = contact?.adv_lat;
    const fallbackLon = contact?.adv_lon;
    const fallbackUpdated = contact?.last_advert;

    // Lazy-load neighbors on first render if enabled
    if (showNeighbors && !neighborState) {
      this._loadNeighbors(device);
    }

    return html`
      <div class="device-section" @tile-context-menu=${(e: CustomEvent) => this._onTileContextMenu(e, deviceKey)}>
        <div class="section-header">
          <div class="section-title">
            <div class="section-icon ${type}">
              ${type === 'repeater'
                ? html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
                : html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`}
            </div>
            <div>
              <div class="device-name">${device.name}</div>
              <div class="device-meta">
                <span>${type === 'repeater' ? 'Repeater' : 'Client'}</span>
                ${device.firmware_version ? html`<span>Firmware: v${device.firmware_version.match(/(\d+\.\d+\.\d+)/)?.[1] ?? device.firmware_version}</span>` : nothing}
                <span>Key: ${device.pubkey_prefix}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="settings-btn" @click=${() => this._settingsDeviceKey = deviceKey} title="Device settings" aria-label="Device settings">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
            <div class="status-badge ${statusClass}"
                 @click=${() => device.status_entity_id && this._fireMoreInfo(device.status_entity_id)}
                 style="${device.status_entity_id ? 'cursor:pointer' : ''}">
              <span class="status-dot ${statusClass}"></span>
              ${statusLabel}${uptimeLabel ? html` · ${uptimeLabel}` : nothing}
            </div>
          </div>
        </div>

        ${entities.length > 0
          ? html`
              <meshcore-node-summary
                .hass=${this.hass}
                .device=${{ ...device, type }}
                .entities=${entities}
                .hiddenCount=${hiddenCount}
                .fallbackLatitude=${fallbackLat}
                .fallbackLongitude=${fallbackLon}
                .fallbackUpdated=${fallbackUpdated}>
              </meshcore-node-summary>
            `
          : nothing}

        ${showNeighbors ? this._renderInlineNeighbors(device, neighborState) : nothing}

        <div class="actions-row">
          <button class="action-btn" ?disabled=${!isOnline} @click=${() => this._executeRemoteAction(device, 'advert')}>Flood Advert</button>
          <button class="action-btn" ?disabled=${!isOnline} @click=${() => this._executeRemoteAction(device, 'clock sync')}>Sync Clock</button>
        </div>
      </div>
    `;
  }

  // ─── Inline Neighbors ─────────────────────────────────────────────

  private _renderInlineNeighbors(
    device: ManagedDevice,
    state?: { neighbors: NeighborInfo[]; chartData: any[]; loading: boolean; loaded: boolean },
  ) {
    if (!state || state.loading) {
      return html`
        <div class="neighbor-section">
          <div class="subsection-label">Neighbors</div>
          <div class="neighbor-loading"><div class="loading-spinner"></div> Loading neighbors...</div>
        </div>
      `;
    }

    if (state.neighbors.length === 0) {
      return html`
        <div class="neighbor-section">
          <div class="subsection-label">Neighbors</div>
          <div style="font-size: 13px; color: var(--secondary-text-color); padding: 8px 0;">No neighbors found</div>
        </div>
      `;
    }

    return html`
      <div class="neighbor-section">
        <div class="subsection-label">Neighbors (${state.neighbors.length})</div>

        ${state.chartData.length > 0
          ? html`
              <div class="chart-container">
                <meshcore-snr-chart
                  .data=${state.chartData}
                  .neighbors=${state.neighbors.map(n => n.pubkey_prefix)}
                  width="550"
                  height="200"
                  timeRange="24">
                </meshcore-snr-chart>
              </div>
            `
          : nothing}

        <table class="neighbor-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SNR</th>
              <th>Seen (48h)</th>
              <th>Last Heard</th>
            </tr>
          </thead>
          <tbody>
            ${state.neighbors.map(n => html`
              <tr @contextmenu=${(e: MouseEvent) => this._onNeighborRightClick(e, n, device.pubkey_prefix)}
                  ${longPress(() => this._onNeighborRightClick(new MouseEvent('contextmenu'), n, device.pubkey_prefix))}>
                <td><code>${n.name && n.name !== n.pubkey_prefix.substring(0, 6).toUpperCase() ? `${n.name} (${n.pubkey_prefix.substring(0, 6).toUpperCase()})` : n.pubkey_prefix.substring(0, 6).toUpperCase()}</code></td>
                <td class=${n.snr > 5 ? 'snr-good' : n.snr >= 0 ? 'snr-fair' : 'snr-poor'}>
                  <span class="clickable-value"
                        @click=${(e: Event) => { e.stopPropagation(); this._openNeighborMoreInfo(device.pubkey_prefix, n.pubkey_prefix, 'snr'); }}>
                    ${n.snr.toFixed(1)} dB
                  </span>
                </td>
                <td>
                  <span class="clickable-value"
                        @click=${(e: Event) => { e.stopPropagation(); this._openNeighborMoreInfo(device.pubkey_prefix, n.pubkey_prefix, 'seen'); }}>
                    ${n.seen_48h ?? 0}×
                  </span>
                </td>
                <td>${this._formatRelativeTime(n.last_seen)}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }

  // ─── Entity Registry & Sensor Tiles ───────────────────────────────

  private async _loadEntityRegistry() {
    if (!this.hass || this._entityRegistryLoaded) return;
    this._entityRegistryLoaded = true;

    try {
      const { meshcoreDeviceMap, deviceEntities } = await loadMeshcoreEntityRegistry(this.hass);
      this._meshcoreDeviceMap = meshcoreDeviceMap;
      this._deviceEntities = deviceEntities;
    } catch (err) {
      console.error('Failed to load entity registry:', err);
    }
  }

  // Companion entities and actions moved to settings-page.ts

  /**
   * Find HA entities for a managed device (repeater or client).
   * Looks up by "{entry_id}_{type}_{pubkey_prefix}" in the meshcore device map.
   */
  private _getDeviceEntities(device: ManagedDevice, type: string): EntityInfo[] {
    if (!this.hass || !this.config) return [];

    const deviceKey = this._getManagedDeviceKey(device, type);
    const hidden = new Set(this._hiddenSensors[deviceKey] || []);

    const entryId = this.selectedDevice?.entry_id || '';
    const pubkey = device.pubkey_prefix || '';

    // Try exact match first
    const key = `${entryId}_${type}_${pubkey}`;
    const haDeviceId = this._meshcoreDeviceMap[key];
    if (haDeviceId && this._deviceEntities[haDeviceId]) {
      return this._deviceEntities[haDeviceId].filter(e => !hidden.has(e.entity_id));
    }

    // Fallback: search meshcore device map keys that contain the pubkey prefix
    for (const [mapKey, devId] of Object.entries(this._meshcoreDeviceMap)) {
      if (mapKey.includes(pubkey) && mapKey.includes(type)) {
        if (this._deviceEntities[devId]) {
          return this._deviceEntities[devId].filter(e => !hidden.has(e.entity_id));
        }
      }
    }

    // Last resort fallback: search entity IDs by pubkey prefix
    const prefix6 = pubkey.substring(0, 6).toLowerCase();
    if (!prefix6) return [];

    const results: EntityInfo[] = [];
    for (const entities of Object.values(this._deviceEntities)) {
      for (const entity of entities) {
        if (entity.entity_id.toLowerCase().includes(prefix6) && !hidden.has(entity.entity_id)) {
          results.push(entity);
        }
      }
    }
    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // ─── Neighbor Data Loading ────────────────────────────────────────

  private async _loadNeighbors(device: ManagedDevice) {
    if (!this.hass) return;

    // Set loading state
    this._neighborData = {
      ...this._neighborData,
      [device.pubkey_prefix]: { neighbors: [], chartData: [], loading: true, loaded: false },
    };

    try {
      const neighbors = await getNeighbors(this.hass, device.pubkey_prefix, this.config?.entry_id);
      let chartData: Array<{ timestamp: number; values: Record<string, number> }> = [];

      // Fetch SNR history if neighbors have entity_ids
      if (neighbors.length > 0) {
        chartData = await this._fetchSNRHistory(neighbors);
      }

      this._neighborData = {
        ...this._neighborData,
        [device.pubkey_prefix]: { neighbors, chartData, loading: false, loaded: true },
      };
    } catch (err) {
      console.error(`Failed to load neighbors for ${device.name}:`, err);
      this._neighborData = {
        ...this._neighborData,
        [device.pubkey_prefix]: { neighbors: [], chartData: [], loading: false, loaded: true },
      };
    }
  }

  private async _fetchSNRHistory(neighbors: NeighborInfo[]): Promise<Array<{ timestamp: number; values: Record<string, number> }>> {
    if (!this.hass) return [];

    try {
      const entityIds = neighbors
        .filter(n => n.entity_ids?.snr)
        .map(n => n.entity_ids!.snr);

      if (entityIds.length === 0) return [];

      const stats = await this.hass.callWS<Record<string, any[]>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        statistic_ids: entityIds,
        period: 'hour',
      });

      const chartDataMap: Record<number, Record<string, number>> = {};

      Object.entries(stats).forEach(([entityId, points]) => {
        const neighbor = neighbors.find(n => n.entity_ids?.snr === entityId);
        if (!neighbor || !Array.isArray(points)) return;

        points.forEach((point: any) => {
          if (point.start && point.mean != null) {
            const timestamp = new Date(point.start).getTime();
            if (!chartDataMap[timestamp]) chartDataMap[timestamp] = {};
            chartDataMap[timestamp][neighbor.pubkey_prefix] = point.mean;
          }
        });
      });

      return Object.entries(chartDataMap)
        .map(([ts, values]) => ({ timestamp: parseInt(ts, 10), values }))
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
  }

  // ─── Data Loading ─────────────────────────────────────────────────

  private async _loadManagedDevices() {
    if (!this.hass) return;

    try {
      this._loading = true;
      this._error = null;
      const result = await getManagedDevices(this.hass, this.config?.entry_id);
      this._managedDevices = result;
      // Load contacts in parallel so the Location hero tile has fallback
      // lat/lon for managed devices that don't expose location sensors.
      // Failure is non-fatal — Location tile will just render "—".
      this._loadContacts();
    } catch (error) {
      this._error = `Failed to load devices: ${String(error)}`;
    } finally {
      this._loading = false;
    }
  }

  private async _loadContacts() {
    if (!this.hass) return;
    try {
      const entryId = this.selectedDevice?.entry_id || this.config?.entry_id;
      const contacts = await getContacts(this.hass, entryId);
      const indexed: Record<string, Contact> = {};
      for (const c of contacts) {
        if (c.pubkey_prefix) indexed[c.pubkey_prefix.toLowerCase()] = c;
      }
      this._contactsByPrefix = indexed;
    } catch {
      // Best-effort; absence just means no fallback location.
    }
  }

  // ─── Command Execution ────────────────────────────────────────────

  private async _executeRemoteAction(device: ManagedDevice, command: string) {
    if (!this.hass) return;

    try {
      const result = await executeRemote(this.hass, device.pubkey_prefix, command, this.config?.entry_id);
      // executeRemote() catches WS errors and returns { success: false, response }
      // rather than throwing, so we must check result.success here — a thrown
      // error only happens for client-side exceptions (caught below).
      if (result.success) {
        this._showStatusMessage(`${device.name}: ${command} → ${result.response || 'OK'}`, 'success');
      } else {
        this._showStatusMessage(`${device.name}: ${command} failed — ${result.response || 'error'}`, 'error');
      }
    } catch (error) {
      this._showStatusMessage(`${device.name}: ${command} failed — ${String(error)}`, 'error');
    }
  }

  // _executeCompanionAction moved to settings-page.ts

  // ─── More-Info ─────────────────────────────────────────────────────

  private _fireMoreInfo(entityId: string) {
    const event = new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  /** Format an uptime sensor's value as "12d 19h" / "5h 30m" / "47s".
   *  Reads the unit_of_measurement attribute to handle d/h/min/s. */
  private _formatUptimeFromEntity(entityId: string): string {
    const s = this.hass?.states[entityId];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return '';
    const raw = parseFloat(s.state);
    if (!Number.isFinite(raw)) return '';
    const unit = (s.attributes?.unit_of_measurement as string) ?? 's';
    let totalSec: number;
    switch (unit) {
      case 'd':   totalSec = raw * 86400; break;
      case 'h':   totalSec = raw * 3600; break;
      case 'min': totalSec = raw * 60; break;
      case 's':
      default:    totalSec = raw; break;
    }
    if (totalSec < 60) return `${Math.floor(totalSec)}s`;
    if (totalSec < 3600) return `${Math.floor(totalSec / 60)}m`;
    if (totalSec < 86400) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }

  // ─── Dialogs ──────────────────────────────────────────────────────

  private _confirmActionDialog(title: string, message: string, onConfirm: () => void) {
    this._confirmAction = { title, message, onConfirm };
    this._confirmDialogOpen = true;
  }

  private async _onConfirmAction() {
    this._confirmDialogOpen = false;
    if (this._confirmAction) {
      try {
        await this._confirmAction.onConfirm();
      } catch (error) {
        this._showStatusMessage(`Error: ${String(error)}`, 'error');
      }
    }
    this._confirmAction = null;
  }

  private _onConfirmCancel() {
    this._confirmDialogOpen = false;
    this._confirmAction = null;
  }

  private _openCommandDialog(device: ManagedDevice, isLocal: boolean) {
    this._commandDialogTarget = device.pubkey_prefix;
    this._commandDialogIsLocal = isLocal;
    this._commandDialogOpen = true;
  }

  // _openCommandDialogForCompanion moved to settings-page.ts

  private _onCommandDialogClose() {
    this._commandDialogOpen = false;
    this._commandDialogTarget = '';
    this._commandDialogIsLocal = false;
  }

  // ─── Hidden Sensors Persistence ────────────────────────────────

  // _getCompanionDeviceKey moved to settings-page.ts

  private _getManagedDeviceKey(device: ManagedDevice, type: string): string {
    const entryId = this.selectedDevice?.entry_id || '';
    return `${entryId}_${type}_${device.pubkey_prefix}`;
  }

  private _loadHiddenSensors() {
    try {
      const stored = localStorage.getItem('meshcore-hidden-sensors');
      if (stored) {
        this._hiddenSensors = JSON.parse(stored);
      }
    } catch {
      this._hiddenSensors = {};
    }
  }

  private _saveHiddenSensors() {
    try {
      localStorage.setItem('meshcore-hidden-sensors', JSON.stringify(this._hiddenSensors));
    } catch {
      // localStorage full or unavailable — silent fail
    }
  }

  private _hideSensor(deviceKey: string, entityId: string) {
    const current = this._hiddenSensors[deviceKey] || [];
    if (!current.includes(entityId)) {
      this._hiddenSensors = {
        ...this._hiddenSensors,
        [deviceKey]: [...current, entityId],
      };
      this._saveHiddenSensors();
    }
  }

  private _unhideSensor(deviceKey: string, entityId: string) {
    const current = this._hiddenSensors[deviceKey] || [];
    this._hiddenSensors = {
      ...this._hiddenSensors,
      [deviceKey]: current.filter(id => id !== entityId),
    };
    // Clean up empty arrays
    if (this._hiddenSensors[deviceKey].length === 0) {
      const copy = { ...this._hiddenSensors };
      delete copy[deviceKey];
      this._hiddenSensors = copy;
    }
    this._saveHiddenSensors();
  }

  private _unhideAllSensors(deviceKey: string) {
    const copy = { ...this._hiddenSensors };
    delete copy[deviceKey];
    this._hiddenSensors = copy;
    this._saveHiddenSensors();
  }

  // ─── Context Menu Modal ───────────────────────────────────────

  private _onTileContextMenu(e: CustomEvent, deviceKey: string) {
    const { entityId, label } = e.detail;
    this._contextMenu = { entityId, label, deviceKey };
    this._overlayPointerStarted = false;
  }

  /** Track that a pointerdown originated on the overlay background itself. */
  private _onOverlayPointerDown() {
    this._overlayPointerStarted = true;
  }

  /** Unconditional dismiss — for the close button or any explicit close affordance. */
  private _dismissContextMenu() {
    this._overlayPointerStarted = false;
    this._contextMenu = null;
  }

  /** Overlay-backdrop click — guarded so a touch-release that started on a tile
   *  doesn't immediately re-close the menu it just opened. */
  private _closeContextMenu() {
    if (!this._overlayPointerStarted) return;
    this._dismissContextMenu();
  }

  private _hideSensorFromContext() {
    if (!this._contextMenu) return;
    this._hideSensor(this._contextMenu.deviceKey, this._contextMenu.entityId);
    this._showStatusMessage(`Hidden: ${this._contextMenu.label}`, 'success');
    this._contextMenu = null;
  }

  // ─── Neighbor Context Menu ───────────────────────────────────

  private _onNeighborRightClick(e: MouseEvent, neighbor: NeighborInfo, repeaterPubkey: string) {
    e.preventDefault();
    this._neighborContextMenu = {
      name: neighbor.name || neighbor.pubkey_prefix,
      neighborPubkey: neighbor.pubkey_prefix,
      repeaterPubkey,
    };
    this._overlayPointerStarted = false;
  }

  /** Unconditional dismiss — for the close button or any explicit close affordance. */
  private _dismissNeighborContextMenu() {
    this._overlayPointerStarted = false;
    this._neighborContextMenu = null;
  }

  /** Overlay-backdrop click — guarded so a touch-release that started on a neighbor row
   *  doesn't immediately re-close the menu it just opened. */
  private _closeNeighborContextMenu() {
    if (!this._overlayPointerStarted) return;
    this._dismissNeighborContextMenu();
  }

  private _removeNeighborFromContext() {
    if (!this._neighborContextMenu) return;
    const { name, neighborPubkey, repeaterPubkey } = this._neighborContextMenu;
    this._neighborContextMenu = null;
    this._confirmActionDialog(
      `Remove neighbor ${name}?`,
      'This will remove the neighbor from the repeater and delete its sensors from HA. This cannot be undone.',
      () => this._executeRemoveNeighbor(repeaterPubkey, neighborPubkey, name),
    );
  }

  // ─── Neighbor More-Info ──────────────────────────────────────

  /**
   * Open HA's more-info dialog for a neighbor's SNR or Seen sensor entity.
   * Entity ID pattern matches sensor.py's format_entity_id() output.
   */
  private _openNeighborMoreInfo(repeaterPubkey: string, neighborPubkey: string, type: 'snr' | 'seen') {
    const rShort = repeaterPubkey.substring(0, 10).toLowerCase();
    const nShort = neighborPubkey.substring(0, 6).toLowerCase();
    const entityId = type === 'snr'
      ? `sensor.meshcore_${rShort}_neighbor_${nShort}`
      : `sensor.meshcore_${rShort}_neighbor_${nShort}_seen`;

    // Only open if the entity actually exists in HA
    if (this.hass?.states[entityId]) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private async _executeRemoveNeighbor(repeaterPubkey: string, neighborPubkey: string, name: string) {
    if (!this.hass) return;
    try {
      const result: any = await this.hass.callWS({
        type: 'meshcore_chat/remove_neighbor',
        entry_id: this.config?.entry_id,
        target_prefix: repeaterPubkey,
        neighbor_pubkey: neighborPubkey,
      });
      const entitiesRemoved = result?.entities_removed ?? 0;
      this._showStatusMessage(`Removed ${name} (${entitiesRemoved} sensors deleted)`, 'success');
      // Refresh the neighbor list — find the device and reload
      const device = this._managedDevices.repeaters.find(r => r.pubkey_prefix === repeaterPubkey);
      if (device) await this._loadNeighbors(device);
    } catch (err: any) {
      this._showStatusMessage(`Failed to remove ${name}: ${err.message || err}`, 'error');
    }
  }

  // ─── Settings Modal ───────────────────────────────────────────

  /**
   * Resolve _settingsDeviceKey to device context for rendering settings modal actions.
   * Returns null if the key doesn't match any known device.
   */
  private _getSettingsDeviceContext(): {
    device: ManagedDevice;
    type: 'repeater' | 'client';
    name: string;
    isOnline: boolean;
  } | null {
    const key = this._settingsDeviceKey;
    if (!key) return null;

    // Check managed devices
    const allDevices: Array<{ device: ManagedDevice; type: 'repeater' | 'client' }> = [
      ...this._managedDevices.repeaters.map(d => ({ device: d, type: 'repeater' as const })),
      ...this._managedDevices.clients.map(d => ({ device: d, type: 'client' as const })),
    ];
    for (const { device, type } of allDevices) {
      if (this._getManagedDeviceKey(device, type) === key) {
        // Derive online from entity state if available, fall back to ws_api status
        let isOnline = false;
        if (device.status_entity_id && this.hass?.states[device.status_entity_id]) {
          isOnline = this.hass.states[device.status_entity_id].state === 'on';
        } else {
          isOnline = device.status === 'online';
        }
        return { device, type, name: device.name, isOnline };
      }
    }
    return null;
  }

  private _closeSettingsModal() {
    this._settingsDeviceKey = null;
  }

  private _openHiddenSensorsList() {
    this._hiddenSensorsModalKey = this._settingsDeviceKey;
    this._settingsDeviceKey = null;
  }

  // ─── Hidden Sensors List Modal ────────────────────────────────

  private _renderHiddenSensorsModal() {
    const deviceKey = this._hiddenSensorsModalKey!;
    const hiddenIds = this._hiddenSensors[deviceKey] || [];

    // Resolve labels from entity registry cache
    const hiddenItems = hiddenIds.map(eid => {
      // Search through _deviceEntities to find the label
      let label = eid;
      for (const entities of Object.values(this._deviceEntities)) {
        const found = entities.find(e => e.entity_id === eid);
        if (found) { label = found.label; break; }
      }
      return { entityId: eid, label };
    });

    return html`
      <div class="modal-overlay" @click=${this._closeHiddenSensorsModal}>
        <div class="modal-card" data-a11y="hidden-sensors"
             role="dialog" aria-modal="true" aria-label="Hidden sensors"
             @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <span class="modal-title">Hidden Sensors</span>
            <button class="modal-close" aria-label="Close" @click=${this._closeHiddenSensorsModal}>&times;</button>
          </div>
          <div class="modal-body">
            ${hiddenItems.length === 0
              ? html`<div class="empty-hidden">No hidden sensors</div>`
              : hiddenItems.map(item => html`
                  <div class="hidden-sensor-item">
                    <div>
                      <div class="hidden-sensor-name">${item.label}</div>
                      <div class="hidden-sensor-id">${item.entityId}</div>
                    </div>
                    <button class="unhide-btn" @click=${() => this._unhideSensor(deviceKey, item.entityId)}>Unhide</button>
                  </div>
                `)}
          </div>
          ${hiddenItems.length > 1
            ? html`
                <div class="modal-footer">
                  <button class="action-btn" @click=${() => { this._unhideAllSensors(deviceKey); }}>Unhide All</button>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  private _closeHiddenSensorsModal() {
    this._hiddenSensorsModalKey = null;
  }

  // ─── Utilities ────────────────────────────────────────────────────

  private _showStatusMessage(text: string, type: 'success' | 'error') {
    this._statusMessage = { text, type };
    if (this._statusMessageTimeout !== null) clearTimeout(this._statusMessageTimeout);
    this._statusMessageTimeout = window.setTimeout(() => {
      this._statusMessage = null;
      this._statusMessageTimeout = null;
    }, 5000);
  }

  private _formatRelativeTime(timestamp: string): string {
    try {
      const diff = Date.now() - new Date(timestamp).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    } catch {
      return 'unknown';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-devices-page': DevicesPage;
  }
}
