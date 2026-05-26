import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, DeviceConfig, MeshCoreDevice } from '../types';
import {
  getDeviceConfig,
  setDeviceConfig,
  executeLocal,
  subscribeIdentityChange,
  setLocationSource,
} from '../api';
import type { IdentityFlowStep, SetDeviceConfigRenameResult } from '../api';
import '../components/confirm-dialog';
import '../components/command-dialog';
import '../components/sensor-tile';
import '../components/node-summary';
import { attachDialogA11y } from '../utils/dialog-a11y';
import type { CompanionDeviceDescriptor } from '../components/node-summary';
import { panelStyles } from '../styles';
import { loadMeshcoreEntityRegistry, type EntityInfo } from '../utils/classify-entity';

interface ConfirmAction {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  requireTyped?: string;
}

/**
 * State for the streaming-progress identity-change modal.
 *
 * The Regenerate / Import flow takes ~5-10s end-to-end (host-side seed
 * generate + clamp, SDK ``import_private_key``, device reboot, transport
 * reconnect, config-entry reload, post-reload pubkey verify). A
 * single-toast UX is insufficient for an irreversible
 * change of this duration; this state machine drives a step checklist
 * during the flow and a terminal panel afterward (success or failure).
 */
type IdentityFlowKind = 'regenerate' | 'import';

type IdentityFlowState =
  | { kind: 'closed' }
  | {
      kind: 'progress';
      flow: IdentityFlowKind;
      currentStep: IdentityFlowStep;
      completedSteps: Set<IdentityFlowStep>;
    }
  | {
      kind: 'success';
      flow: IdentityFlowKind;
      oldPubkey: string;
      newPubkey: string;
      warning?: string;
    }
  | {
      kind: 'failure';
      flow: IdentityFlowKind;
      code: string;
      message: string;
    };

/**
 * Ordered checklist for the progress panel. Each entry is one step
 * the backend emits as a ``{step}`` event_message; the UI marks it as
 * completed when a *later* step arrives (or as the current spinner if
 * it's the most recent event). Order matches
 * ``ws_api._do_identity_change`` and the regenerate/import handlers'
 * initial ``generating`` event.
 */
const IDENTITY_FLOW_STEP_ORDER: ReadonlyArray<{
  step: IdentityFlowStep;
  label: string;
}> = [
  { step: 'generating', label: 'Generating new key' },
  { step: 'importing', label: 'Sending key to device' },
  { step: 'rebooting', label: 'Rebooting device' },
  { step: 'reconnecting', label: 'Waiting for device reconnect' },
  { step: 'reloading', label: 'Reloading MeshCore integration' },
  { step: 'verifying', label: 'Verifying new identity' },
];

/**
 * Full settings page with multiple collapsible sections and companion device card at top
 */
@customElement('meshcore-settings-page')
export class SettingsPage extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  @property({ type: Boolean }) narrow = false;
  @property({ type: Object }) selectedDevice?: MeshCoreDevice;

  @state() private _deviceConfig: DeviceConfig | null = null;
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _editValues: Record<string, unknown> = {};
  @state() private _saving = false;
  @state() private _commandDialogOpen = false;
  @state() private _confirmAction: ConfirmAction | null = null;
  @state() private _confirmDialogOpen = false;
  @state() private _locationSource: 'gps' | 'manual' | 'ha_location' = 'manual';
  @state() private _importKeyValue = '';

  // Entity registry cache and companion device entities
  @state() private _deviceEntities: Record<string, EntityInfo[]> = {};
  @state() private _meshcoreDeviceMap: Record<string, string> = {};
  @state() private _entityRegistryLoaded = false;
  @state() private _hiddenSensors: Record<string, string[]> = {};

  // Context menu modal state
  @state() private _contextMenu: { entityId: string; label: string; deviceKey: string } | null = null;
  private _overlayPointerStarted = false;

  // Settings modal
  @state() private _settingsModalOpen = false;

  // Key management modal
  @state() private _keyManagementModalOpen = false;

  // Streaming identity-change flow (Regenerate / Import).
  @state() private _identityFlowState: IdentityFlowState = { kind: 'closed' };
  private _identityFlowUnsubscribe: (() => void) | null = null;

  // Post-rename persistent dialog. Toast was too easy to
  // miss for an op that rewrites N entity_ids and triggers a
  // config-entry reload. When set, the panel renders a modal the user
  // must explicitly close; on close, we refresh device config so the
  // panel reflects the new name immediately.
  @state() private _renameSuccess: SetDeviceConfigRenameResult | null = null;

  // Hidden sensors modal
  @state() private _hiddenSensorsModalKey: string | null = null;

  // Status toast
  @state() private _statusMessage: { text: string; type: 'success' | 'error' } | null = null;
  private _statusMessageTimeout: number | null = null;

  constructor() {
    super();
    // Focus trap + Escape closes inline modals.
    attachDialogA11y(this, {
      isOpen: () => this._contextMenu !== null,
      onEscape: () => this._closeContextMenu(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="tile-context"]'),
    });
    attachDialogA11y(this, {
      isOpen: () => this._settingsModalOpen,
      onEscape: () => this._closeSettingsModal(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="companion-settings"]'),
    });
    attachDialogA11y(this, {
      isOpen: () => this._keyManagementModalOpen,
      onEscape: () => this._closeKeyManagementModal(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="key-management"]'),
    });
    attachDialogA11y(this, {
      isOpen: () => this._hiddenSensorsModalKey !== null,
      onEscape: () => this._closeHiddenSensorsModal(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="hidden-sensors"]'),
    });
    attachDialogA11y(this, {
      // Identity-flow modal is non-dismissible while in-flight; only
      // terminal states (success / failure) accept Escape via the
      // close button. The a11y attach still focus-traps the panel
      // when open.
      isOpen: () => this._identityFlowState.kind !== 'closed',
      onEscape: () => {
        if (
          this._identityFlowState.kind === 'success' ||
          this._identityFlowState.kind === 'failure'
        ) {
          this._closeIdentityFlowModal();
        }
      },
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="identity-flow"]'),
    });
    // Rename success modal: focus-trap, Escape closes
    // and triggers the same refresh path as the Close button.
    attachDialogA11y(this, {
      isOpen: () => this._renameSuccess !== null,
      onEscape: () => this._closeRenameSuccessModal(),
      getScope: () => this.shadowRoot?.querySelector('[data-a11y="rename-success"]'),
    });
  }

  static styles = [
    panelStyles,
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .settings-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--primary-background-color, #fafafa);
      }

      .settings-container {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .settings-container::-webkit-scrollbar {
        width: 6px;
      }

      .settings-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .settings-container::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
        border-radius: 3px;
      }

      .section-row {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }

      .section-row.full {
        flex: 1;
      }

      .form-group-inline {
        flex: 1;
      }

      .danger-zone {
        margin-top: 16px;
        padding: 12px;
        border: 2px solid var(--error-color, #db4437);
        border-radius: 8px;
        background: rgba(219, 68, 55, 0.05);
      }

      .danger-zone-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--error-color, #db4437);
        margin-bottom: 12px;
      }

      .danger-zone-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .info-row:last-child {
        border-bottom: none;
      }

      .info-label {
        font-size: 13px;
        color: var(--secondary-text-color);
        font-weight: 500;
      }

      .info-value {
        font-size: 13px;
        color: var(--primary-text-color);
        font-family: monospace;
        font-weight: 500;
        word-break: break-all;
      }

      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        margin-bottom: 16px;
      }

      .settings-grid > .device-section {
        margin-bottom: 0;
      }

      @media (max-width: 768px) {
        .settings-grid {
          grid-template-columns: 1fr;
        }
      }

      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 16px;
      }

      /* ─── Companion Device Card Styles ─── */

      .device-section {
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
      }

      .companion-header {
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

      .status-dot.online {
        background: #4caf50;
      }

      .status-dot.offline {
        background: #9e9e9e;
      }

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
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
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

      /* Status toast */
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

      .status-toast.success {
        border-left: 4px solid #4caf50;
      }

      .status-toast.error {
        border-left: 4px solid var(--error-color, #db4437);
        color: var(--error-color, #db4437);
      }

      @keyframes slideIn {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this._loadDeviceConfig();
    this._loadHiddenSensors();
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
      this._loadDeviceConfig();
    }
    // Load entity registry once hass is available
    if (changedProperties.has('hass') && this.hass && !this._entityRegistryLoaded) {
      this._loadEntityRegistry();
    }
  }

  private async _loadDeviceConfig() {
    if (!this.hass) return;

    this._loading = true;
    this._error = null;

    try {
      this._deviceConfig = await getDeviceConfig(this.hass, this.config?.entry_id);
      // Initialize location source from backend instead of defaulting to 'manual'
      if (this._deviceConfig?.location_source) {
        this._locationSource = this._deviceConfig.location_source as 'gps' | 'manual' | 'ha_location';
      }
    } catch (error) {
      this._error = `Failed to load device configuration: ${String(error)}`;
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (this._loading) {
      return html`
        <div class="settings-page">
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--secondary-text-color);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="loading-spinner"></div>
              <span>Loading settings...</span>
            </div>
          </div>
        </div>
      `;
    }

    if (this._error) {
      return html`
        <div class="settings-page">
          <div style="padding: 16px; color: var(--error-color); font-size: 14px;">
            ${this._error}
          </div>
        </div>
      `;
    }

    if (!this._deviceConfig) {
      return html`<div>No device config loaded</div>`;
    }

    return html`
      <div class="settings-page">
        <div class="settings-container">
          <!-- Companion Device Card (full width at top) -->
          ${this.selectedDevice ? this._renderCompanionCard() : nothing}

          <!-- Two-column grid for settings cards -->
          <div class="settings-grid">
            <!-- Companion Information -->
            <div class="device-section">
              <div class="card-title">General</div>
              ${this._renderDeviceInfo()}
            </div>

            <!-- Radio & RF Settings -->
            <div class="device-section">
              <div class="card-title">Radio</div>
              ${this._renderRadioSettings()}
            </div>

            <!-- Location -->
            <div class="device-section">
              <div class="card-title">Location</div>
              ${this._renderLocation()}
            </div>



          </div>

        </div>
      </div>

      <!-- Modals & Dialogs -->
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
              <button class="modal-close" aria-label="Close" @click=${this._closeContextMenu}
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

      <!-- Settings Modal -->
      ${this._settingsModalOpen ? html`
        <div class="modal-overlay" @click=${this._closeSettingsModal}>
          <div class="modal-card" data-a11y="companion-settings"
               role="dialog" aria-modal="true" aria-label="Companion settings"
               @click=${(e: Event) => e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">Companion Settings</span>
              <button class="modal-close" aria-label="Close" @click=${this._closeSettingsModal}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action" @click=${this._openHiddenSensorsList}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                View Hidden Sensors (${(this._hiddenSensors[this._getCompanionDeviceKey()] || []).length})
              </button>

              <button class="modal-action" @click=${this._openCommandDialogForCompanion}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 19V7H4v12h16m0-16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h16m-7 14v-2h5v2h-5m-3.42-4L5.57 9H8.4l3.3 3.3c.39.39.39 1.03 0 1.42L8.42 17H5.59l4-4z"/></svg></span>
                Issue Command
              </button>

              <div class="modal-divider"></div>

              <button class="modal-action danger" @click=${this._handleRebootFromModal}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></span>
                Reboot Device
              </button>

              <button class="modal-action danger" @click=${this._openKeyManagementModal}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.65 10a6 6 0 110 4H10v2H8v-2H6v-2h6.65zM17 14a2 2 0 100-4 2 2 0 000 4z"/></svg></span>
                Key Management
              </button>
            </div>
          </div>
        </div>
      ` : nothing}

      <!-- Key Management Modal -->
      ${this._keyManagementModalOpen ? html`
        <div class="modal-overlay" @click=${this._closeKeyManagementModal}>
          <div class="modal-card" data-a11y="key-management"
               role="dialog" aria-modal="true" aria-label="Key management"
               style="max-width: 440px;"
               @click=${(e: Event) => e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">Key Management</span>
              <button class="modal-close" aria-label="Close" @click=${this._closeKeyManagementModal}>&times;</button>
            </div>
            <div class="modal-body" style="padding: 16px 20px;">
              ${this._renderIdentityManagement()}
            </div>
          </div>
        </div>
      ` : nothing}

      <!-- Hidden Sensors Modal -->
      ${this._hiddenSensorsModalKey ? this._renderHiddenSensorsModal() : nothing}

      <!-- Identity Flow Modal (streaming progress) -->
      ${this._renderIdentityFlowModal()}

      <!-- Rename Success Modal (persistent dialog) -->
      ${this._renderRenameSuccessModal()}

      <!-- Status Toast -->
      ${this._statusMessage ? html`
        <div class="status-toast ${this._statusMessage.type}">
          ${this._statusMessage.text}
        </div>
      ` : nothing}

      <!-- Dialogs -->
      <meshcore-confirm-dialog
        .open=${this._confirmDialogOpen}
        .title=${this._confirmAction?.title || ''}
        .message=${this._confirmAction?.message || ''}
        .requireTyped=${this._confirmAction?.requireTyped}
        ?dangerous=${!!this._confirmAction?.requireTyped}
        @confirm=${this._onConfirmAction}
        @cancel=${this._onConfirmCancel}>
      </meshcore-confirm-dialog>

      <meshcore-command-dialog
        .open=${this._commandDialogOpen}
        .hass=${this.hass}
        .entryId=${this.config?.entry_id}
        ?isLocal=${true}
        ?narrow=${this.narrow}
        @close=${this._onCommandDialogClose}>
      </meshcore-command-dialog>
    `;
  }

  private _renderCompanionCard() {
    if (!this.selectedDevice) return nothing;

    const d = this.selectedDevice;
    const isOnline = d.connected;
    const deviceKey = this._getCompanionDeviceKey();
    const entities = this._getCompanionEntities();
    const hiddenCount = (this._hiddenSensors[deviceKey] || []).length;

    return html`
      <div class="device-section" @tile-context-menu=${(e: CustomEvent) => this._onTileContextMenu(e, deviceKey)}>
        <div class="companion-header">
          <div class="section-title">
            <div class="section-icon companion">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9,2A1,1 0 0,0 8,3C8,8.67 8,14.33 8,20C8,21.11 8.89,22 10,22H15C16.11,22 17,21.11 17,20V9C17,7.89 16.11,7 15,7H10V3A1,1 0 0,0 9,2M10,9H15V13H10V9Z"/></svg>
            </div>
            <div>
              <div class="device-name">${d.name}</div>
              <div class="device-meta">
                <span>Companion</span>
                <span>Firmware: ${d.firmware || 'unknown'}</span>
                <span>Key: ${d.pubkey_prefix}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="settings-btn" @click=${() => (this._settingsModalOpen = true)} title="Device settings" aria-label="Device settings">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
            <div class="status-badge ${isOnline ? 'online' : 'offline'}">
              <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
              ${isOnline ? 'Connected' : 'Offline'}
            </div>
          </div>
        </div>

        ${entities.length > 0
          ? html`
              <meshcore-node-summary
                .hass=${this.hass}
                .device=${this._companionDescriptor(d)}
                .entities=${entities}
                .hiddenCount=${hiddenCount}>
              </meshcore-node-summary>
            `
          : nothing}

        <div class="actions-row">
          <button class="action-btn" ?disabled=${!isOnline} @click=${() => this._executeCompanionAction('send_advert', undefined, 'Local Advert')}>Local Advert</button>
          <button class="action-btn" ?disabled=${!isOnline} @click=${() => this._executeCompanionAction('send_advert', {flood: true}, 'Flood Advert')}>Flood Advert</button>
          <button class="action-btn" ?disabled=${!isOnline} @click=${() => this._executeCompanionAction('get_bat', undefined, 'Get Battery')}>Get Battery</button>
          <button class="action-btn" ?disabled=${!isOnline} @click=${() => this._executeCompanionAction('set_time', {val: Math.floor(Date.now() / 1000)}, 'Sync Clock')}>Sync Clock</button>
          <button class="action-btn" ?disabled=${!isOnline} @click=${this._onCompanionTrace}>Trace</button>
        </div>
      </div>
    `;
  }

  private _renderHiddenSensorsModal() {
    const deviceKey = this._hiddenSensorsModalKey!;
    const hiddenIds = this._hiddenSensors[deviceKey] || [];

    const hiddenItems = hiddenIds.map(eid => {
      let label = eid;
      for (const entities of Object.values(this._deviceEntities)) {
        const found = entities.find(e => e.entity_id === eid);
        if (found) {
          label = found.label;
          break;
        }
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
                  <button class="action-btn" @click=${() => {
                    this._unhideAllSensors(deviceKey);
                  }}>Unhide All</button>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  // _renderSection removed — replaced with always-visible card layout

  private _renderDeviceInfo() {
    if (!this._deviceConfig) return;

    return html`
      <div class="info-row">
        <span class="info-label">Hardware Model</span>
        <span class="info-value">${this._deviceConfig.hardware_model}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Public Key</span>
        <span class="info-value" style="display: flex; align-items: center; gap: 6px;">
          ${this._deviceConfig.pubkey}
          <button
            style="border: none; background: none; cursor: pointer; padding: 2px; color: var(--secondary-text-color); display: flex; align-items: center;"
            title="Copy public key"
            @click=${() => this._copyToClipboard(this._deviceConfig!.pubkey)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
        </span>
      </div>

      ${this._deviceConfig.connection_type ? html`
        <div class="info-row">
          <span class="info-label">Connection</span>
          <span class="info-value">${this._deviceConfig.connection_type.toUpperCase()}${this._deviceConfig.connection_address ? html` — ${this._deviceConfig.connection_address}` : ''}</span>
        </div>
      ` : ''}

      <div class="danger-zone" style="margin-top: 16px;">
        <div class="danger-zone-title">Rename Device</div>
        <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">
          Changing the device name will change all entity IDs. Automations, scripts, and dashboards using current entity IDs will need to be updated.
        </div>
        <div style="display: flex; gap: 8px;">
          <input
            type="text"
            class="form-input"
            style="flex: 1;"
            .value=${this._editValues['name'] ?? this._deviceConfig.name}
            @input=${(e: Event) => {
              this._editValues['name'] = (e.target as HTMLInputElement).value;
            }}
          />
          <button class="danger-button"
            ?disabled=${!this._editValues['name'] || this._editValues['name'] === this._deviceConfig.name}
            @click=${this._handleNameSave}>
            Rename
          </button>
        </div>
      </div>
    `;
  }

  private _renderRadioSettings() {
    if (!this._deviceConfig) return;

    const changed = this._hasChanges('radio-settings', [
      'tx_power',
      'frequency',
      'bandwidth',
      'spreading_factor',
      'coding_rate',
      'path_hash_mode',
    ]);

    return html`
      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">TX Power (dBm)</label>
          <input
            type="number"
            class="form-input"
            min="2"
            max="22"
            .value=${String(this._editValues['tx_power'] ?? this._deviceConfig.tx_power ?? 17)}
            @input=${(e: Event) => {
              this._editValues['tx_power'] = Number((e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <div class="form-group-inline">
          <label class="form-label">Frequency (MHz)</label>
          <input
            type="number"
            class="form-input"
            step="0.001"
            .value=${String(this._editValues['frequency'] ?? this._deviceConfig.frequency ?? 906.875)}
            @input=${(e: Event) => {
              this._editValues['frequency'] = Number((e.target as HTMLInputElement).value);
            }}
          />
        </div>
      </div>

      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Bandwidth (kHz)</label>
          <select
            class="form-select"
            @change=${(e: Event) => {
              this._editValues['bandwidth'] = Number((e.target as HTMLSelectElement).value);
            }}>
            ${[7.8, 10.4, 15.6, 20.8, 31.25, 41.7, 62.5, 125, 250, 500].map((bw) => {
              const current = this._editValues['bandwidth'] ?? this._deviceConfig!.bandwidth ?? 250;
              return html`<option value=${bw} ?selected=${Number(current) === bw}>${bw}</option>`;
            })}
          </select>
        </div>
        <div class="form-group-inline">
          <label class="form-label">Spreading Factor</label>
          <select
            class="form-select"
            @change=${(e: Event) => {
              this._editValues['spreading_factor'] = Number((e.target as HTMLSelectElement).value);
            }}>
            ${[7, 8, 9, 10, 11, 12].map((sf) => {
              const current = this._editValues['spreading_factor'] ?? this._deviceConfig!.spreading_factor ?? 11;
              return html`<option value=${sf} ?selected=${Number(current) === sf}>${sf}</option>`;
            })}
          </select>
        </div>
      </div>

      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Coding Rate</label>
          <select
            class="form-select"
            @change=${(e: Event) => {
              this._editValues['coding_rate'] = Number((e.target as HTMLSelectElement).value);
            }}>
            ${[5, 6, 7, 8].map((cr) => {
              const current = this._editValues['coding_rate'] ?? this._deviceConfig!.coding_rate ?? 5;
              return html`<option value=${cr} ?selected=${Number(current) === cr}>${cr}</option>`;
            })}
          </select>
        </div>
        <div class="form-group-inline">
          <label class="form-label">Path Hash Mode</label>
          <select
            class="form-select"
            @change=${(e: Event) => {
              this._editValues['path_hash_mode'] = Number((e.target as HTMLSelectElement).value);
            }}>
            ${[[0, '0 - 1 byte'], [1, '1 - 2 byte'], [2, '2 - 3 byte']].map(([val, label]) => {
              const current = this._editValues['path_hash_mode'] ?? this._deviceConfig!.path_hash_mode ?? 0;
              return html`<option value=${val} ?selected=${Number(current) === val}>${label}</option>`;
            })}
          </select>
        </div>
      </div>

      <button
        class="apply-button"
        style="width: 100%; margin-top: 12px;"
        ?disabled=${!changed || this._saving}
        @click=${() => this._handleApply('radio-settings')}>
        ${this._saving ? 'Applying...' : 'Apply Radio Settings'}
      </button>

      <div style="margin-top: 12px; padding: 8px; background: rgba(0, 0, 0, 0.02); border-radius: 6px; font-size: 12px; color: var(--secondary-text-color);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>Radio changes require device reboot to take effect
      </div>
    `;
  }

  private _renderLocation() {
    if (!this._deviceConfig) return;

    const isHaLocation = this._locationSource === 'ha_location';
    const zoneHome = isHaLocation ? this.hass?.states['zone.home'] : null;
    const sourceChanged = this._locationSource !== (this._deviceConfig.location_source ?? 'manual');
    const coordsChanged = this._hasChanges('location', ['latitude', 'longitude']);
    const locationChanged = sourceChanged || coordsChanged;
    const displayLat = isHaLocation && zoneHome
      ? String(zoneHome.attributes.latitude ?? 0)
      : String(this._editValues['latitude'] ?? this._deviceConfig.latitude ?? 0);
    const displayLon = isHaLocation && zoneHome
      ? String(zoneHome.attributes.longitude ?? 0)
      : String(this._editValues['longitude'] ?? this._deviceConfig.longitude ?? 0);

    return html`
      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Latitude</label>
          <input
            type="number"
            class="form-input"
            step="0.000001"
            min="-90"
            max="90"
            .value=${displayLat}
            ?disabled=${isHaLocation}
            @input=${(e: Event) => {
              this._editValues['latitude'] = Number((e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <div class="form-group-inline">
          <label class="form-label">Longitude</label>
          <input
            type="number"
            class="form-input"
            step="0.000001"
            min="-180"
            max="180"
            .value=${displayLon}
            ?disabled=${isHaLocation}
            @input=${(e: Event) => {
              this._editValues['longitude'] = Number((e.target as HTMLInputElement).value);
            }}
          />
        </div>
      </div>
      ${isHaLocation ? html`
        <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: -8px; margin-bottom: 8px;">
          Using coordinates from Home Assistant zone.home
        </div>
      ` : ''}

      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Location Source</label>
          <select
            class="form-select"
            .value=${this._locationSource}
            @change=${(e: Event) => {
              this._locationSource = (e.target as HTMLSelectElement).value as 'gps' | 'manual' | 'ha_location';
            }}>
            <option value="manual">Manual (coordinates above)</option>
            <option value="gps">GPS (device hardware)</option>
            <option value="ha_location">Home Assistant Zone</option>
          </select>
          <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 4px;">
            How the device determines its coordinates
          </div>
        </div>
      </div>

      <button
        class="apply-button"
        style="width: 100%; margin-top: 12px;"
        ?disabled=${!locationChanged || this._saving}
        @click=${this._applyLocation}>
        ${this._saving ? 'Applying...' : 'Apply Location Settings'}
      </button>
    `;
  }

  // _renderAdvancedSettings removed — path hash mode moved to Radio & RF Settings
  // _renderLocationSource removed — merged into _renderLocation

  // Config backup, diagnostics, and backup & recovery removed — low value

  private _renderIdentityManagement() {
    return html`
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div class="danger-zone" style="margin-top: 0;">
          <div class="danger-zone-title">Regenerate Identity</div>
          <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">
            Creates a new key pair. All contacts will need to re-add you. This will change all entity IDs — automations, scripts, and dashboards using current entity IDs will need to be updated.
          </div>
          <button class="danger-button" @click=${this._showRegenIdentityConfirm}>
            Regenerate Identity
          </button>
        </div>
        <div class="danger-zone" style="margin-top: 0;">
          <div class="danger-zone-title">Import Private Key</div>
          <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">
            Importing a key changes the device identity. This will change all entity IDs — automations, scripts, and dashboards using current entity IDs will need to be updated.
          </div>
          <div style="display: flex; gap: 8px;">
            <input
              type="text"
              class="form-input"
              style="flex: 1; font-family: monospace;"
              placeholder="Hex private key"
              .value=${this._importKeyValue}
              @input=${(e: Event) => { this._importKeyValue = (e.target as HTMLInputElement).value; }}
            />
            <button
              class="danger-button"
              ?disabled=${!this._importKeyValue.trim()}
              @click=${this._handleImportKeyConfirm}>
              Import
            </button>
          </div>
        </div>
      </div>
    `;
  }


  private _hasChanges(_sectionId: string, keys: string[]): boolean {
    if (!this._deviceConfig) return false;
    return keys.some(
      (key) =>
        this._editValues[key] !== undefined &&
        this._editValues[key] !== (this._deviceConfig as Record<string, unknown>)[key],
    );
  }

  private async _handleApply(sectionId: string) {
    if (!this.hass || !this._deviceConfig) return;

    let keysToApply: string[] = [];

    switch (sectionId) {
      case 'device-name':
        keysToApply = ['name'];
        break;
      case 'radio-settings':
        keysToApply = ['tx_power', 'frequency', 'bandwidth', 'spreading_factor', 'coding_rate', 'path_hash_mode'];
        break;
    }

    const settings: Record<string, unknown> = {};
    for (const key of keysToApply) {
      if (this._editValues[key] !== undefined) {
        settings[key] = this._editValues[key];
      }
    }

    this._saving = true;

    try {
      const result = await setDeviceConfig(this.hass, settings, this.config?.entry_id);
      if (result.success) {
        // Optimistically update local config with the values just applied.
        // Radio settings won't be reflected by send_appstart() until a reboot,
        // so we apply them locally to keep the UI in sync.
        if (this._deviceConfig) {
          this._deviceConfig = { ...this._deviceConfig, ...settings };
        }

        // Clear edit values for applied keys
        for (const key of keysToApply) {
          delete this._editValues[key];
        }
        this._editValues = { ...this._editValues };

        if (result.rename) {
          // Rename triggers a persistent post-rename dialog
          // with old/new names + suffix + count. Toast is too easy to
          // miss for an op that rewrites N entity_ids and reloads the
          // integration. The Close handler refreshes _deviceConfig so
          // the page shows the new name immediately.
          this._renameSuccess = result.rename;
        } else {
          // Non-rename saves keep the existing toast UX.
          this._showStatusMessage(`Saved: ${keysToApply.join(', ')}`, 'success');
        }
      } else {
        this._showStatusMessage('Save failed', 'error');
      }
    } catch (error) {
      this._showStatusMessage(`Error: ${String(error)}`, 'error');
    } finally {
      this._saving = false;
    }
  }

  private async _copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this._showStatusMessage('Copied to clipboard', 'success');
    } catch {
      this._showStatusMessage('Failed to copy', 'error');
    }
  }

  private _showStatusMessage(text: string, type: 'success' | 'error') {
    this._statusMessage = { text, type };
    if (this._statusMessageTimeout !== null) clearTimeout(this._statusMessageTimeout);
    this._statusMessageTimeout = window.setTimeout(() => {
      this._statusMessage = null;
      this._statusMessageTimeout = null;
    }, 5000);
  }

  private _handleNameSave() {
    const newName = this._editValues['name'];
    const oldName = this._deviceConfig?.name;
    if (newName === undefined || newName === oldName) return;
    // The dialog describes what the migration
    // actually does. Server-side `_migrate_entity_ids_name_suffix` in
    // ws_api.py rewrites entity_ids ending in `_<sanitized-old>` to end
    // in `_<sanitized-new>`. The local `sanitize` mirror approximates
    // meshcore-ha's `utils.py:sanitize_name` closely enough for the
    // preview — the server-side migration uses the canonical sanitize.
    const sanitize = (s: string) =>
      (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const oldSuffix = sanitize(oldName ?? '');
    const newSuffix = sanitize(String(newName));
    this._confirmAction = {
      title: 'Rename Device',
      message:
        `Renaming the device will rename all entity IDs ending in _${oldSuffix} to _${newSuffix}. ` +
        `Any automations, scripts, or dashboards referencing entity IDs by the old name will need updating. ` +
        `A repair issue will list every renamed entity. Continue?`,
      onConfirm: async () => {
        await this._handleApply('device-name');
      },
    };
    this._confirmDialogOpen = true;
  }

  private _handleRebootFromModal() {
    this._settingsModalOpen = false;
    this._confirmAction = {
      title: 'Reboot Device',
      message: 'Are you sure you want to reboot the device? The device will be temporarily unavailable.',
      onConfirm: () => this._executeDeviceCommand('reboot'),
    };
    this._confirmDialogOpen = true;
  }

  private async _executeDeviceCommand(command: string) {
    if (!this.hass) return;
    try {
      const result = await executeLocal(this.hass, command, undefined, this.config?.entry_id);
      if (!result.success) {
        this._showStatusMessage(`Command failed: ${result.response}`, 'error');
      } else {
        this._showStatusMessage(`Device ${command} initiated`, 'success');
      }
    } catch (error) {
      this._showStatusMessage(`Error: ${String(error)}`, 'error');
    }
  }

  private async _applyLocation() {
    if (!this.hass || !this._deviceConfig) return;
    this._saving = true;

    try {
      // Determine coordinates based on source
      const coordKeys = ['latitude', 'longitude'];
      const settings: Record<string, unknown> = {};

      if (this._locationSource === 'ha_location') {
        // Fetch coordinates from HA zone.home
        const zoneHome = this.hass.states['zone.home'];
        if (!zoneHome || zoneHome.attributes.latitude == null || zoneHome.attributes.longitude == null) {
          this._showStatusMessage('Could not read zone.home coordinates from Home Assistant', 'error');
          return;
        }
        settings['latitude'] = zoneHome.attributes.latitude;
        settings['longitude'] = zoneHome.attributes.longitude;
      } else {
        // Manual/GPS: apply user-edited coordinate changes if any
        for (const key of coordKeys) {
          if (this._editValues[key] !== undefined) {
            settings[key] = this._editValues[key];
          }
        }
      }

      if (Object.keys(settings).length > 0) {
        const result = await setDeviceConfig(this.hass, settings, this.config?.entry_id);
        if (!result.success) {
          this._showStatusMessage('Failed to save coordinates', 'error');
          return;
        }
        // Optimistically update local device config so fields reflect new values
        // (self_info on the coordinator may not be refreshed yet)
        if (this._deviceConfig) {
          this._deviceConfig = {
            ...this._deviceConfig,
            ...settings,
          };
        }
        for (const key of coordKeys) {
          delete this._editValues[key];
        }
        this._editValues = { ...this._editValues };
      }

      // Apply location source
      const sourceResult = await setLocationSource(this.hass, this._locationSource, this.config?.entry_id);
      if (!sourceResult.success) {
        this._showStatusMessage('Failed to update location source', 'error');
        return;
      }

      await this._loadDeviceConfig();
      this._showStatusMessage('Location settings applied', 'success');
    } catch (error) {
      this._showStatusMessage(`Error: ${String(error)}`, 'error');
    } finally {
      this._saving = false;
    }
  }

  private _showRegenIdentityConfirm() {
    this._confirmAction = {
      title: 'Regenerate Identity',
      message: 'This will create a new cryptographic identity, reboot the device, and migrate all entity IDs to the new key prefix. Existing automations referencing entity IDs by the old prefix will need updating. All contacts must re-add this device. This cannot be undone.',
      requireTyped: 'REGENERATE',
      onConfirm: async () => {
        if (!this.hass) return;
        // Close the Key Management modal so the progress modal isn't
        // stacked on top of a stale UI (the confirm dialog already
        // closes via _onConfirmAction).
        this._closeKeyManagementModal();
        this._startIdentityFlow('regenerate', {
          type: 'meshcore_chat/regenerate_identity',
          payload: this.config?.entry_id
            ? { entry_id: this.config.entry_id }
            : {},
        });
      },
    };
    this._confirmDialogOpen = true;
  }

  private _handleImportKeyConfirm() {
    const raw = this._importKeyValue.trim().replace(/\s+/g, '');
    if (!raw) return;
    if (raw.length !== 64 && raw.length !== 128) {
      this._showStatusMessage('Private key must be 64 or 128 hex characters', 'error');
      return;
    }
    if (!/^[0-9a-fA-F]+$/.test(raw)) {
      this._showStatusMessage('Private key must be hex (0-9, a-f)', 'error');
      return;
    }
    this._confirmAction = {
      title: 'Import Private Key',
      message: 'Importing a private key will replace the device identity, reboot the device, and migrate all entity IDs to the new key prefix. Existing automations referencing entity IDs by the old prefix will need updating. All contacts must re-add this device.',
      requireTyped: 'IMPORT',
      onConfirm: () => this._importIdentityKey(),
    };
    this._confirmDialogOpen = true;
  }

  private async _importIdentityKey() {
    if (!this.hass || !this._importKeyValue.trim()) return;
    const sanitized = this._importKeyValue.trim().replace(/\s+/g, '');
    // Close the Key Management modal so the progress modal isn't
    // stacked on top of a stale UI.
    this._closeKeyManagementModal();
    this._importKeyValue = '';
    const payload: Record<string, unknown> = { private_key: sanitized };
    if (this.config?.entry_id) payload.entry_id = this.config.entry_id;
    this._startIdentityFlow('import', {
      type: 'meshcore_chat/import_identity',
      payload,
    });
  }

  /**
   * Open the streaming-progress identity modal and wire the WS
   * subscription. The modal is non-dismissible while in-flight; the
   * Close button only renders on terminal panels.
   *
   * Each ``progress`` event marks the previous step as completed and
   * advances ``currentStep``. ``result`` and ``error`` events
   * transition to the corresponding terminal panel.
   */
  private _startIdentityFlow(
    flow: IdentityFlowKind,
    request: { type: 'meshcore_chat/regenerate_identity' | 'meshcore_chat/import_identity'; payload: Record<string, unknown> },
  ) {
    if (!this.hass) return;
    // Reset any leftover subscription from a previous flow.
    if (this._identityFlowUnsubscribe) {
      this._identityFlowUnsubscribe();
      this._identityFlowUnsubscribe = null;
    }
    this._identityFlowState = {
      kind: 'progress',
      flow,
      currentStep: 'generating',
      completedSteps: new Set(),
    };
    const { unsubscribe } = subscribeIdentityChange(
      this.hass,
      request.type,
      request.payload,
      (event) => {
        if (event.type === 'progress') {
          if (this._identityFlowState.kind !== 'progress') return;
          const completed = new Set(this._identityFlowState.completedSteps);
          // Mark the previous currentStep as completed.
          completed.add(this._identityFlowState.currentStep);
          this._identityFlowState = {
            ...this._identityFlowState,
            currentStep: event.step,
            completedSteps: completed,
          };
        } else if (event.type === 'result') {
          this._identityFlowState = {
            kind: 'success',
            flow,
            oldPubkey: event.data.old_pubkey,
            newPubkey: event.data.new_pubkey,
            warning: event.data.warning,
          };
        } else if (event.type === 'error') {
          this._identityFlowState = {
            kind: 'failure',
            flow,
            code: event.data.code,
            message: event.data.message,
          };
        }
      },
    );
    this._identityFlowUnsubscribe = unsubscribe;
  }

  private _closeIdentityFlowModal() {
    if (this._identityFlowUnsubscribe) {
      this._identityFlowUnsubscribe();
      this._identityFlowUnsubscribe = null;
    }
    const wasSuccess = this._identityFlowState.kind === 'success';
    this._identityFlowState = { kind: 'closed' };
    // Refresh the parent settings panel so the new pubkey is reflected
    // even if the user closed without re-opening Key Management.
    if (wasSuccess) {
      void this._loadDeviceConfig();
    }
  }

  private _renderIdentityFlowModal() {
    const state = this._identityFlowState;
    if (state.kind === 'closed') return nothing;

    const flowLabel = state.flow === 'regenerate' ? 'Regenerate Identity' : 'Import Private Key';
    const inFlightTitle = state.flow === 'regenerate' ? 'Regenerating Identity' : 'Importing Identity';
    const successTitle = state.flow === 'regenerate' ? 'Identity Regenerated' : 'Identity Imported';
    const failureTitle = state.flow === 'regenerate' ? 'Identity Regeneration Failed' : 'Identity Import Failed';

    let body;
    let footer;

    if (state.kind === 'progress') {
      body = html`
        <div style="font-size: 13px; color: var(--secondary-text-color); margin-bottom: 16px;">
          This typically takes 5–10 seconds. Please don't close this dialog.
        </div>
        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">
          ${IDENTITY_FLOW_STEP_ORDER.map((entry) => {
            const isCompleted = state.completedSteps.has(entry.step);
            const isCurrent = state.currentStep === entry.step;
            let icon = '○';
            let color = 'var(--secondary-text-color)';
            if (isCompleted) {
              icon = '✓';
              color = 'var(--success-color, #28a745)';
            } else if (isCurrent) {
              icon = '⏳';
              color = 'var(--primary-color)';
            }
            return html`
              <li style="display: flex; align-items: center; gap: 8px; color: ${color}; font-size: 14px;">
                <span style="font-family: monospace; width: 1em;">${icon}</span>
                <span>${entry.label}</span>
              </li>
            `;
          })}
        </ul>
      `;
      footer = nothing; // No Close button while in-flight.
    } else if (state.kind === 'success') {
      body = html`
        <div style="font-size: 32px; text-align: center; margin-bottom: 8px;">✅</div>
        <div style="font-size: 14px; margin-bottom: 16px;">
          The device's identity has been replaced and verified.
        </div>
        <div style="font-family: monospace; font-size: 12px; background: var(--card-background-color, #f5f5f5); padding: 8px 12px; border-radius: 4px; margin-bottom: 12px;">
          <div><span style="color: var(--secondary-text-color);">Old key:</span> ${state.oldPubkey.slice(0, 12)}…</div>
          <div><span style="color: var(--secondary-text-color);">New key:</span> ${state.newPubkey.slice(0, 12)}… <span style="color: var(--success-color, #28a745); font-size: 11px;">(verified after reload)</span></div>
        </div>
        ${state.warning ? html`
          <div style="font-size: 13px; color: var(--secondary-text-color); margin-top: 12px; padding: 8px 12px; border-left: 3px solid var(--warning-color, #f0ad4e); background: var(--warning-color-bg, rgba(240, 173, 78, 0.08));">
            <strong>Follow-up:</strong>
            <ul style="margin: 4px 0 0 16px; padding: 0;">
              <li>${state.warning}</li>
              <li>Check Settings → Repairs for the entity-ID migration list.</li>
            </ul>
          </div>
        ` : nothing}
      `;
      footer = html`
        <button class="modal-action" @click=${this._closeIdentityFlowModal}>Close</button>
      `;
    } else {
      // failure
      body = html`
        <div style="font-size: 32px; text-align: center; margin-bottom: 8px;">❌</div>
        <div style="font-size: 14px; margin-bottom: 12px;">
          ${state.flow === 'regenerate'
            ? 'The device firmware rejected the new key. Your device identity is unchanged.'
            : 'The import did not take effect. Your device identity may be unchanged.'}
        </div>
        <div style="font-family: monospace; font-size: 12px; background: var(--card-background-color, #f5f5f5); padding: 8px 12px; border-radius: 4px;">
          <div><span style="color: var(--secondary-text-color);">Error code:</span> ${state.code}</div>
          <div style="margin-top: 4px; word-break: break-word;"><span style="color: var(--secondary-text-color);">Message:</span> ${state.message}</div>
        </div>
      `;
      footer = html`
        <button class="modal-action" @click=${this._closeIdentityFlowModal}>Close</button>
      `;
    }

    const headerTitle =
      state.kind === 'progress' ? inFlightTitle :
      state.kind === 'success' ? successTitle : failureTitle;

    return html`
      <div class="modal-overlay">
        <div class="modal-card" data-a11y="identity-flow"
             role="dialog" aria-modal="true" aria-label=${flowLabel}
             style="max-width: 480px;"
             @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <span class="modal-title">${headerTitle}</span>
            ${state.kind === 'progress' ? nothing : html`
              <button class="modal-close" aria-label="Close" @click=${this._closeIdentityFlowModal}>&times;</button>
            `}
          </div>
          <div class="modal-body" style="padding: 20px;">
            ${body}
            ${footer ? html`<div style="margin-top: 20px; display: flex; justify-content: flex-end;">${footer}</div>` : nothing}
          </div>
        </div>
      </div>
    `;
  }

  private _closeRenameSuccessModal() {
    // Clear the modal state and refresh the device config so the
    // settings page's "Device Name" input reflects the new value.
    this._renameSuccess = null;
    void this._loadDeviceConfig();
    // The companion-card title elsewhere on this page (and the
    // panel's header) reads from `selectedDevice.name`, which is
    // owned by the parent panel's `_devices` array — NOT from
    // `_deviceConfig`. Notify the parent so it can re-fetch
    // `getDevices(...)` and refresh `_devices` (which makes the
    // computed `_selectedDevice` reflect the new name).
    this.dispatchEvent(
      new CustomEvent('device-renamed', { bubbles: true, composed: true }),
    );
  }

  private _renderRenameSuccessModal() {
    const r = this._renameSuccess;
    if (!r) return nothing;

    // Uses the canonical `.dialog-*` pattern (same as
    // `meshcore-confirm-dialog`) rather than the `.modal-*` pattern
    // (which is for full-width left-aligned menu-list items, e.g.
    // the Companion Settings overflow menu). Visual consistency
    // with the rename CONFIRM dialog the user just clicked through.
    //
    // Body matches the `name_changed` repair-issue text minus the
    // bullet list of (old_id → new_id) pairs — that list lives in
    // Settings → Repairs (one issue per rename, timestamped) and
    // would dwarf the dialog.
    return html`
      <div class="dialog-overlay">
        <div class="dialog"
             role="dialog" aria-modal="true" aria-label="Device renamed"
             data-a11y="rename-success"
             @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-header-title">Device renamed</div>
          </div>
          <div class="dialog-body">
            <p style="margin: 0 0 12px 0;">
              The MeshCore device was renamed from
              <code>${r.old_name}</code> to <code>${r.new_name}</code>.
            </p>
            <p style="margin: 0 0 12px 0;">
              ${r.count}
              ${r.count === 1 ? 'entity ID was' : 'entity IDs were'}
              automatically migrated from the
              <code>_${r.old_suffix}</code> suffix to
              <code>_${r.new_suffix}</code>.
            </p>
            <p style="margin: 0 0 12px 0;">
              If you have automations, scripts, or dashboards
              referencing the old entity IDs, you will need to
              update them manually to use the new suffix.
            </p>
            <p style="margin: 0; color: var(--secondary-text-color); font-size: 13px;">
              The full list of renamed entity IDs is available in
              Settings → Repairs.
            </p>
          </div>
          <div class="dialog-footer">
            <button class="dialog-button primary"
                    @click=${this._closeRenameSuccessModal}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  private async _onConfirmAction() {
    this._confirmDialogOpen = false;
    if (this._confirmAction) {
      try {
        await this._confirmAction.onConfirm();
      } catch (error) {
        this._error = `Error: ${String(error)}`;
      }
    }
    this._confirmAction = null;
  }

  private _onConfirmCancel() {
    this._confirmDialogOpen = false;
    this._confirmAction = null;
  }

  private _onCommandDialogClose() {
    this._commandDialogOpen = false;
  }

  // ─── Companion Device Methods ──────────────────────────────────────

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

  private _getCompanionEntities(): EntityInfo[] {
    if (!this.hass || !this.selectedDevice) return [];

    const deviceKey = this._getCompanionDeviceKey();
    const hidden = new Set(this._hiddenSensors[deviceKey] || []);

    const entryId = this.selectedDevice.entry_id;
    const haDeviceId = this._meshcoreDeviceMap[entryId];
    if (haDeviceId && this._deviceEntities[haDeviceId]) {
      return this._deviceEntities[haDeviceId].filter(e => !hidden.has(e.entity_id));
    }

    const prefix = this.selectedDevice.pubkey_prefix?.substring(0, 6)?.toLowerCase() || '';
    if (!prefix) return [];

    const results: EntityInfo[] = [];
    for (const [deviceId, entities] of Object.entries(this._deviceEntities)) {
      const isManagedDevice = Object.entries(this._meshcoreDeviceMap).some(
        ([key, id]) => id === deviceId && (key.includes('_repeater_') || key.includes('_client_'))
      );
      if (isManagedDevice) continue;

      for (const entity of entities) {
        if (entity.entity_id.toLowerCase().includes(prefix) && !hidden.has(entity.entity_id)) {
          results.push(entity);
        }
      }
    }
    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private _getCompanionDeviceKey(): string {
    return this.selectedDevice?.entry_id || 'companion';
  }

  /** Build the discriminated-union descriptor that node-summary expects.
   *  selectedDevice is a MeshCoreDevice (different shape than ManagedDevice);
   *  the synthesized object below adds the `type: 'companion'` discriminator
   *  and projects the fields node-summary actually reads. */
  private _companionDescriptor(d: MeshCoreDevice): CompanionDeviceDescriptor {
    return {
      type: 'companion',
      name: d.name,
      pubkey_prefix: d.pubkey_prefix,
      connected: d.connected,
      firmware: d.firmware,
      entry_id: d.entry_id,
    };
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
      // localStorage full or unavailable
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

  private async _executeCompanionAction(command: string, args?: Record<string, unknown>, label?: string) {
    if (!this.hass) return;
    const displayName = label || command;

    try {
      const result = await executeLocal(this.hass, command, args, this.config?.entry_id);
      this._showStatusMessage(`Companion: ${displayName} → ${result.response || 'OK'}`, 'success');
    } catch (error) {
      this._showStatusMessage(`Companion: ${displayName} failed — ${String(error)}`, 'error');
    }
  }

  // Trace button on the Companion quick-actions row.  Rather
  // than reach into the contact list (which lives on meshcore-chat-panel),
  // the page dispatches an event upward.  The panel opens the target-
  // picker dialog, and on selection routes through the same trace-
  // dialog open code path that nodes-tab uses.
  private _onCompanionTrace = () => {
    const entryId = this.selectedDevice?.entry_id;
    this.dispatchEvent(new CustomEvent('companion-trace-requested', {
      detail: { entryId },
      bubbles: true,
      composed: true,
    }));
  };

  private _onTileContextMenu(e: CustomEvent, deviceKey: string) {
    const { entityId, label } = e.detail;
    this._contextMenu = { entityId, label, deviceKey };
    this._overlayPointerStarted = false;
  }

  private _onOverlayPointerDown() {
    this._overlayPointerStarted = true;
  }

  private _closeContextMenu() {
    if (!this._overlayPointerStarted) return;
    this._overlayPointerStarted = false;
    this._contextMenu = null;
  }

  private _hideSensorFromContext() {
    if (!this._contextMenu) return;
    this._hideSensor(this._contextMenu.deviceKey, this._contextMenu.entityId);
    this._showStatusMessage(`Hidden: ${this._contextMenu.label}`, 'success');
    this._contextMenu = null;
  }

  private _closeSettingsModal() {
    this._settingsModalOpen = false;
  }

  private _openHiddenSensorsList() {
    this._hiddenSensorsModalKey = this._getCompanionDeviceKey();
    this._settingsModalOpen = false;
  }

  private _closeHiddenSensorsModal() {
    this._hiddenSensorsModalKey = null;
  }

  private _openCommandDialogForCompanion() {
    this._commandDialogOpen = true;
    this._settingsModalOpen = false;
  }

  private _openKeyManagementModal() {
    this._keyManagementModalOpen = true;
    this._settingsModalOpen = false;
  }

  private _closeKeyManagementModal() {
    this._keyManagementModalOpen = false;
  }

  // _fireMoreInfo removed — not currently used in settings context
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-settings-page': SettingsPage;
  }
}
