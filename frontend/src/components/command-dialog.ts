import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, CommandDef, CommandParam, HassEvent } from '../types';
import { executeLocal, executeRemote } from '../api';
import { LOCAL_COMMANDS } from '../commands/local-commands';
import { REMOTE_COMMANDS } from '../commands/remote-commands';
import { panelStyles } from '../styles';
import { attachDialogA11y } from '../utils/dialog-a11y';
import {
  ENUMS,
  AUTOADD_BITS,
  decodeEnum,
  decodeBitmask,
  num,
  type DecodedBitmask,
} from '../firmware-vocabulary';

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
  /** Companion node name — used to suppress the outgoing echo in the
   *  device response feed (only meaningful when isLocal is false). */
  @property({ type: String }) nodeName = '';

  constructor() {
    super();
    // Focus trap + Escape closes the dialog.
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

  // Live device-response feed (remote dialogs only). Replies arrive over the
  // mesh as ordinary meshcore_message events while the dialog is open.
  @state() private _deviceResponses: Array<{ text: string; sender: string; ts: number; snr?: number }> = [];
  private _unsubMsg: (() => void) | null = null;
  private _feedActive = false;
  private _feedSince = 0;

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

      .device-response-feed {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 180px;
        overflow-y: auto;
        font-family: var(--code-font-family, monospace);
        font-size: 12px;
      }

      .device-response-row {
        padding: 4px 8px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
        border-radius: 4px;
        word-break: break-word;
      }

      .drr-time,
      .drr-snr {
        color: var(--secondary-text-color);
      }

      .drr-time {
        margin-right: 6px;
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

            <!-- Live Device Response Feed (remote dialogs only) -->
            ${!this.isLocal && this._deviceResponses.length > 0
              ? html`
                  <div class="form-group" style="margin-top: 16px;">
                    <label class="form-label">Responses from device</label>
                    <div class="device-response-feed">
                      ${this._deviceResponses.map(
                        (r) => html`<div class="device-response-row">
                          <span class="drr-time">${new Date(r.ts).toLocaleTimeString()}</span><span class="drr-text">${r.text}</span>${r.snr !== undefined
                            ? html`<span class="drr-snr"> · SNR ${r.snr}</span>`
                            : ''}
                        </div>`,
                      )}
                    </div>
                  </div>
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
    const label = param.label ?? param.name;

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
              <span class="form-toggle-label">${label}</span>
            </label>
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </div>
        `;

      case 'select': {
        // Prefer structured selectOptions (label/value separable, value type
        // preserved); fall back to the legacy string[] options. The change
        // handler stores the option's typed value — NOT the raw DOM string —
        // so a numeric enum reaches a local SDK command as a number, not "1".
        const opts = param.selectOptions
          ? param.selectOptions
          : (param.options || []).map((o) => ({ label: o, value: o }));
        return html`
          <div class="form-group">
            <label class="form-label">${label}</label>
            <select
              class="form-select"
              @change=${(e: Event) => {
                const domVal = (e.target as HTMLSelectElement).value;
                const match = opts.find((o) => String(o.value) === domVal);
                this._paramValues[param.name] = match ? match.value : domVal;
              }}>
              <option value="" ?selected=${value === '' || value === undefined}>-- Select --</option>
              ${opts.map((opt) => html`<option value=${String(opt.value)} ?selected=${String(value) === String(opt.value)}>${opt.label}</option>`)}
            </select>
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </div>
        `;
      }

      case 'bitmask': {
        // One checkbox per bit; the submitted value is the OR of selected bit
        // values as a number (matching the firmware wire format). requestUpdate
        // is needed because _paramValues is a @state object mutated in place —
        // Lit change-detects on reference identity, so the checkbox-checked and
        // running-Value displays won't refresh without it.
        return html`
          <fieldset class="form-group">
            <legend class="form-label">${label}</legend>
            ${(param.bits || []).map((bit) => {
              const current = Number(this._paramValues[param.name] ?? param.default ?? 0);
              return html`
                <label class="form-toggle">
                  <input
                    type="checkbox"
                    ?checked=${(current & bit.value) === bit.value}
                    @change=${(e: Event) => {
                      const on = (e.target as HTMLInputElement).checked;
                      const prev = Number(this._paramValues[param.name] ?? param.default ?? 0);
                      this._paramValues[param.name] = on ? prev | bit.value : prev & ~bit.value;
                      this.requestUpdate();
                    }}
                  />
                  <span class="form-toggle-label">${bit.label}</span>
                </label>
              `;
            })}
            <div class="form-description">Value: ${Number(this._paramValues[param.name] ?? param.default ?? 0)}</div>
            ${param.description ? html`<div class="form-description">${param.description}</div>` : ''}
          </fieldset>
        `;
      }

      case 'number':
        return html`
          <div class="form-group">
            <label class="form-label">${label}</label>
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
            <label class="form-label">${label}</label>
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
    max_hops: 'Max Hops (0 = unlimited)',
    config: 'Auto-Add Config',
  };

  // Value decoders for known response keys, parallel to _FRIENDLY_LABELS (which
  // only translates keys). A formatter returns either a display string or a
  // DecodedBitmask object (rendered as a checkmark sub-list). Keys without a
  // formatter fall back to _formatValue, so unmapped keys render as today.
  //
  // Latitude/longitude are NOT rescaled here — the SDK already divides by 1e6,
  // so the value arrives in decimal degrees (likewise radio freq/bw arrive in
  // MHz/kHz). Every numeric formatter routes through num() so a malformed or
  // partial frame renders a visible raw fallback rather than NaN or
  // all-flags-false.
  private static _VALUE_FORMATTERS: Record<string, (raw: unknown) => string | DecodedBitmask> = {
    adv_loc_policy: (v) => decodeEnum(v, ENUMS.LOC_POLICY),
    path_hash_mode: (v) => decodeEnum(v, ENUMS.PATH_HASH_MODE),
    telemetry_mode_env: (v) => decodeEnum(v, ENUMS.TELEMETRY_MODE),
    telemetry_mode_loc: (v) => decodeEnum(v, ENUMS.TELEMETRY_MODE),
    telemetry_mode_base: (v) => decodeEnum(v, ENUMS.TELEMETRY_MODE),
    // SDK emits this as a boolean (reader.py: `dbuf.read(1)[0] > 0`).
    manual_add_contacts: (v) => {
      if (v === true) return 'Manual Mode';
      if (v === false) return 'Auto-Add Enabled';
      const n = num(v);
      if (n === undefined) return `Unknown (${v})`;
      return n ? 'Manual Mode' : 'Auto-Add Enabled';
    },
    multi_acks: (v) => {
      const n = num(v);
      return n === undefined ? `Unknown (${v})` : n ? 'Yes' : 'No';
    },
    // Already decimal degrees from the SDK — append the unit, do not rescale.
    adv_lat: (v) => {
      const n = num(v);
      return n === undefined ? `${v}` : `${n.toFixed(6)}°`;
    },
    adv_lon: (v) => {
      const n = num(v);
      return n === undefined ? `${v}` : `${n.toFixed(6)}°`;
    },
    // Auto-add config bitmask → checkmark sub-list of named flags.
    config: (v) => {
      const n = num(v);
      return n === undefined ? `Unknown (${v})` : decodeBitmask(n, AUTOADD_BITS);
    },
  };

  private _formatValue(value: unknown): string {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') {
      // Nested object/array (e.g. telemetry LPP payload, frequency ranges):
      // render compact JSON rather than the useless "[object Object]".
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
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
                const formatter = CommandDialog._VALUE_FORMATTERS[key];
                const formatted = formatter ? formatter(value) : undefined;
                if (formatted && typeof formatted === 'object') {
                  // DecodedBitmask → a header row spanning both columns, then one
                  // grid row per flag (name left, ✓/✗ right) so it matches the
                  // label-then-value layout of every other response row.
                  return html`
                    <div style="grid-column: 1 / -1; color: var(--secondary-text-color);">${label}</div>
                    ${Object.entries(formatted).map(([flag, on]) => html`
                      <div style="padding-left: 12px; white-space: nowrap;">${flag}</div>
                      <div style="font-family: var(--code-font-family, monospace);">${on ? '✓' : '✗'}</div>`)}
                  `;
                }
                const displayVal = formatted !== undefined ? String(formatted) : this._formatValue(value);
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
    // Plain text (e.g. remote CLI output): wrap in an explicit pre-wrap span so
    // newlines/spacing survive — the container itself is white-space: normal so
    // the structured/grid path doesn't render template indentation as blanks.
    return html`<span style="white-space: pre-wrap;">${response}</span>`;
  }

  private _onCommandSelected(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    const commands = this._getCommands();
    this._selectedCommand = commands.find((c) => c.name === name) || null;
    // Seed declared defaults so a param the user never interacts with (e.g. an
    // unchecked boolean whose intended state is its default) still submits its
    // value, rather than being omitted from the args dict.
    const seeded: Record<string, unknown> = {};
    for (const p of this._selectedCommand?.params ?? []) {
      if (p.default !== undefined) seeded[p.name] = p.default;
    }
    this._paramValues = seeded;
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

  updated(changed: Map<string, unknown>) {
    if (changed.has('open') || changed.has('targetPrefix') || changed.has('isLocal')) {
      // Restart the feed on any relevant change: stop the old subscription,
      // then (re)subscribe if the dialog is open against a remote device.
      this._stopResponseFeed();
      if (this.open && !this.isLocal) {
        this._startResponseFeed();
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopResponseFeed();
  }

  /** Subscribe to incoming meshcore_message events while a remote device
   *  dialog is open and show the device's replies as a live feed. Mesh
   *  replies are ordinary inbound messages with no protocol-level
   *  request/response correlation, so this surfaces "responses from the
   *  device since the command was issued," not a guaranteed reply to a
   *  specific command. */
  private async _startResponseFeed() {
    if (this._feedActive || this.isLocal || !this.open || !this.hass?.connection) return;
    this._feedActive = true;
    this._feedSince = Date.now();
    // Avoid a redundant reactive write (and the resulting extra update cycle)
    // when the feed is already empty — assigning a fresh [] always differs by
    // reference and would otherwise re-trigger updated().
    if (this._deviceResponses.length) this._deviceResponses = [];
    try {
      const unsub = await this.hass.connection.subscribeEvents((event: HassEvent) => {
        const d = event.data;
        if (!this._prefixMatches(d.pubkey_prefix as string | undefined)) return;
        if ((d.sender_name as string) === this.nodeName) return; // skip outgoing echo
        const ts = Date.parse((d.timestamp as string) ?? '') || Date.now();
        if (ts < this._feedSince - 1000) return; // ignore pre-open history
        this._deviceResponses = [
          ...this._deviceResponses,
          {
            text: (d.message as string) ?? '',
            sender: (d.sender_name as string) ?? '',
            ts,
            snr: typeof d.snr === 'number' ? (d.snr as number) : undefined,
          },
        ];
      }, 'meshcore_message');
      // The dialog may have closed while subscribeEvents was awaiting.
      if (!this.open || this.isLocal) {
        unsub();
        this._feedActive = false;
        return;
      }
      this._unsubMsg = unsub;
    } catch {
      this._feedActive = false;
    }
  }

  private _stopResponseFeed() {
    if (this._unsubMsg) {
      this._unsubMsg();
      this._unsubMsg = null;
    }
    this._feedActive = false;
  }

  /** Compare the event's sender pubkey_prefix against the dialog target on a
   *  common width (<=12 hex), case-insensitive. */
  private _prefixMatches(eventPrefix?: string): boolean {
    if (!eventPrefix || !this.targetPrefix) return false;
    const n = Math.min(eventPrefix.length, this.targetPrefix.length, 12);
    return eventPrefix.slice(0, n).toLowerCase() === this.targetPrefix.slice(0, n).toLowerCase();
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
    this._stopResponseFeed();
    this._deviceResponses = [];
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-command-dialog': CommandDialog;
  }
}
