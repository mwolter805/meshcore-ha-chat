import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, CommandDef, CommandParam } from '../types';
import { executeLocal, executeRemote } from '../api';
import { LOCAL_COMMANDS } from '../commands/local-commands';
import { REMOTE_COMMANDS } from '../commands/remote-commands';
import { panelStyles } from '../styles';
import { attachDialogA11y } from '../utils/dialog-a11y';

/**
 * Command dialog for issuing local or remote commands to MeshCore devices
 *
 * Dispatches:
 * - 'close' event when dialog is closed
 */
@customElement('meshcore-command-dialog')
export class CommandDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: String }) entryId?: string;
  @property({ type: String }) targetPrefix?: string;
  @property({ type: Boolean }) isLocal = false;
  @property({ type: Boolean }) narrow = false;

  constructor() {
    super();
    // Phase 5 Q13: focus trap + Escape closes the dialog.
    attachDialogA11y(this, {
      isOpen: () => this.open,
      onEscape: () => this._onClose(),
    });
  }

  @state() private _selectedCommand: CommandDef | null = null;
  @state() private _paramValues: Record<string, unknown> = {};
  @state() private _response: string | null = null;
  @state() private _executing = false;
  @state() private _error: string | null = null;

  private _getCommands(): CommandDef[] {
    return this.isLocal ? LOCAL_COMMANDS : REMOTE_COMMANDS;
  }

  private _getGroupedCommands(): Map<string, CommandDef[]> {
    const commands = this._getCommands();
    const grouped = new Map<string, CommandDef[]>();

    for (const cmd of commands) {
      if (!grouped.has(cmd.category)) {
        grouped.set(cmd.category, []);
      }
      grouped.get(cmd.category)!.push(cmd);
    }

    return grouped;
  }

  static styles = [
    panelStyles,
    css`
      :host {
        display: block;
      }

      :host([narrow]) .dialog {
        max-width: 100%;
      }

      .dialog {
        max-width: 500px;
      }

      .danger-warning {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        margin: 8px 0;
        background: rgba(219, 68, 55, 0.1);
        border: 1px solid var(--error-color, #db4437);
        border-radius: 6px;
        font-size: 12px;
        color: var(--error-color, #db4437);
      }

      .danger-warning-icon {
        font-size: 16px;
        flex-shrink: 0;
      }
    `,
  ];

  render() {
    if (!this.open) return;

    const commands = this._getGroupedCommands();

    return html`
      <div
        class="dialog-overlay"
        @click=${this._onOverlayClick}>
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Issue command">
          <div class="dialog-header">
            <div style="flex: 1;">
              <div class="dialog-header-title">Issue Command</div>
              ${this.targetPrefix
                ? html`<div style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;">
                    Target: ${this.targetPrefix}
                  </div>`
                : ''}
            </div>
          </div>
          <div class="dialog-body">
            <!-- Command Selection -->
            <div class="form-group">
              <label class="form-label">Command</label>
              <select
                class="command-select"
                @change=${this._onCommandSelected}>
                <option value="">-- Select a command --</option>
                ${Array.from(commands.entries()).map(
                  ([category, cmds]) =>
                    html`<optgroup label=${category}>
                      ${cmds.map(
                        (cmd) =>
                          html`<option value=${cmd.name}>
                            ${cmd.name} - ${cmd.description}
                          </option>`,
                      )}
                    </optgroup>`,
                )}
              </select>
            </div>

            <!-- Command Details -->
            ${this._selectedCommand
              ? html`
                  <div class="command-description">
                    <strong>${this._selectedCommand.name}</strong><br />
                    ${this._selectedCommand.description}
                  </div>

                  ${this._selectedCommand.dangerous
                    ? html`<div class="danger-warning">
                        <span class="danger-warning-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg></span>
                        <span>${this._selectedCommand.dangerMessage || 'This is a dangerous operation'}</span>
                      </div>`
                    : ''}

                  <!-- Parameters -->
                  ${this._selectedCommand.params && this._selectedCommand.params.length > 0
                    ? html`
                        <div class="command-params">
                          <label class="form-label">Parameters</label>
                          ${this._selectedCommand.params.map((param) =>
                            this._renderParamInput(param),
                          )}
                        </div>
                      `
                    : ''}

                  <!-- Expected Response -->
                  ${this._selectedCommand.responseFormat
                    ? html`<div style="margin-top: 12px; font-size: 12px; color: var(--secondary-text-color); font-style: italic;">
                        Expected: ${this._selectedCommand.responseFormat}
                      </div>`
                    : ''}

                  <!-- Execute Button -->
                  <button
                    class="apply-button"
                    style="width: 100%; margin-top: 12px;"
                    ?disabled=${this._executing}
                    @click=${this._executeCommand}>
                    ${this._executing ? 'Executing...' : 'Execute'}
                  </button>

                  <!-- Response Display -->
                  ${this._response || this._error
                    ? html`
                        <div class="form-group" style="margin-top: 16px;">
                          <label class="form-label">Response</label>
                          <div
                            class="command-response"
                            style=${this._error ? 'color: var(--error-color, #db4437);' : ''}>
                            ${this._error ? this._error : this._renderFormattedResponse(this._response!)}
                          </div>
                        </div>
                      `
                    : ''}
                `
              : ''}
          </div>
          <div class="dialog-footer">
            <button
              class="dialog-button"
              @click=${this._onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderParamInput(param: CommandParam) {
    const value = this._paramValues[param.name] ?? param.default ?? '';

    switch (param.type) {
      case 'boolean':
        return html`
          <div class="form-group">
            <label class="form-toggle">
              <input
                type="checkbox"
                ?checked=${!!value}
                @change=${(e: Event) => {
                  this._paramValues[param.name] = (e.target as HTMLInputElement).checked;
                }}
              />
              <span class="form-toggle-label">${param.name}</span>
            </label>
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </div>
        `;

      case 'select':
        return html`
          <div class="form-group">
            <label class="form-label">${param.name}</label>
            <select
              class="form-select"
              @change=${(e: Event) => {
                this._paramValues[param.name] = (e.target as HTMLSelectElement).value;
              }}>
              <option value="" ?selected=${!value}>-- Select --</option>
              ${(param.options || []).map((opt) => html`<option value=${opt} ?selected=${String(value) === String(opt)}>${opt}</option>`)}
            </select>
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </div>
        `;

      case 'number':
        return html`
          <div class="form-group">
            <label class="form-label">${param.name}</label>
            <input
              type="number"
              class="form-input"
              ?required=${param.required}
              ?min=${param.min}
              ?max=${param.max}
              .value=${String(value)}
              @input=${(e: Event) => {
                const input = e.target as HTMLInputElement;
                this._paramValues[param.name] = input.value ? Number(input.value) : '';
              }}
            />
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </div>
        `;

      case 'string':
      default:
        return html`
          <div class="form-group">
            <label class="form-label">${param.name}</label>
            <input
              type="text"
              class="form-input"
              ?required=${param.required}
              .value=${String(value)}
              @input=${(e: Event) => {
                this._paramValues[param.name] = (e.target as HTMLInputElement).value;
              }}
            />
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </div>
        `;
    }
  }

  // Human-readable labels for known response keys
  private static _FRIENDLY_LABELS: Record<string, string> = {
    adv_type: 'Device Type',
    tx_power: 'TX Power (dBm)',
    max_tx_power: 'Max TX Power (dBm)',
    public_key: 'Public Key',
    adv_lat: 'Latitude',
    adv_lon: 'Longitude',
    multi_acks: 'Multi-Acks',
    adv_loc_policy: 'Location Ad Policy',
    telemetry_mode_env: 'Telemetry: Environment',
    telemetry_mode_loc: 'Telemetry: Location',
    telemetry_mode_base: 'Telemetry: Base',
    manual_add_contacts: 'Manual Add Contacts',
    radio_freq: 'Frequency (MHz)',
    radio_bw: 'Bandwidth (kHz)',
    radio_sf: 'Spreading Factor',
    radio_cr: 'Coding Rate',
    name: 'Name',
    path_hash_mode: 'Path Hash Mode',
    firmware_ver: 'Firmware Version',
    board_type: 'Board Type',
    suggested_timeout: 'Suggested Timeout (ms)',
    capabilities: 'Capabilities',
    voltage: 'Voltage (mV)',
    percentage: 'Battery (%)',
    uptime: 'Uptime (s)',
    temperature: 'Temperature',
  };

  private _formatValue(value: unknown): string {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string' && value.length > 20) {
      // Truncate long hex strings with ellipsis but show full on hover
      return String(value);
    }
    return String(value);
  }

  private _renderFormattedResponse(response: string) {
    // Try to parse as JSON object
    try {
      const parsed = JSON.parse(response);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed);
        if (entries.length > 0) {
          return html`
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px;">
              ${entries.map(([key, value]) => {
                const label = CommandDialog._FRIENDLY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const displayVal = this._formatValue(value);
                const isLong = typeof value === 'string' && value.length > 24;
                return html`
                  <div style="color: var(--secondary-text-color); white-space: nowrap;">${label}</div>
                  <div style="font-family: var(--code-font-family, monospace); word-break: ${isLong ? 'break-all' : 'normal'};">${displayVal}</div>
                `;
              })}
            </div>
          `;
        }
      }
      if (Array.isArray(parsed)) {
        return html`<pre style="margin: 0; white-space: pre-wrap; font-size: 13px;">${JSON.stringify(parsed, null, 2)}</pre>`;
      }
    } catch {
      // Not JSON — fall through to plain text
    }
    return response;
  }

  private _onCommandSelected(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    const commands = this._getCommands();
    this._selectedCommand = commands.find((c) => c.name === name) || null;
    this._paramValues = {};
    this._response = null;
    this._error = null;
  }

  private async _executeCommand() {
    if (!this._selectedCommand || !this.hass) return;

    this._executing = true;
    this._response = null;
    this._error = null;

    try {
      let result;
      if (this.isLocal) {
        result = await executeLocal(
          this.hass,
          this._selectedCommand.name,
          Object.keys(this._paramValues).length > 0 ? (this._paramValues as Record<string, unknown>) : undefined,
          this.entryId,
        );
      } else {
        if (!this.targetPrefix) {
          this._error = 'No target device specified';
          return;
        }
        const args = this._paramValues;
        let commandStr = this._selectedCommand.name;
        if (Object.keys(args).length > 0) {
          const argStr = Object.entries(args)
            .map(([, v]) => String(v))
            .join(' ');
          commandStr = `${commandStr} ${argStr}`;
        }
        result = await executeRemote(this.hass, this.targetPrefix, commandStr, this.entryId);
      }

      if (result.success) {
        this._response = result.response;
      } else {
        this._error = result.response || 'Command execution failed';
      }
    } catch (error) {
      this._error = `Error: ${String(error)}`;
    } finally {
      this._executing = false;
    }
  }

  private _onOverlayClick(e: Event) {
    if (e.target === e.currentTarget) {
      this._onClose();
    }
  }

  private _onClose() {
    this._selectedCommand = null;
    this._paramValues = {};
    this._response = null;
    this._error = null;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-command-dialog': CommandDialog;
  }
}
