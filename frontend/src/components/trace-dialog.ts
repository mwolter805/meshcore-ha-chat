import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TraceResult } from '../api';
import type { TracePathMode } from '../api';
import type { Contact } from '../types';
import { panelStyles } from '../styles';

/**
 * Modal dialog for tracing a contact.
 *
 * Session 54: the dialog now has three phases:
 *   - input:    user selects path type (discovery / select repeaters /
 *               enter path) and, for non-discovery modes, supplies the
 *               outbound hop sequence.  Emits `trace-requested` on Run.
 *   - running:  brief "Tracing…" state while the WS call is in flight.
 *   - done:     renders success (RTT / hops / final SNR / per-hop SNRs)
 *               or error, matching the pre-Session-54 layout.
 *
 * The panel owns `traceContact()` invocation; this component just emits
 * `trace-requested` with `{ pathMode, path }` and waits for the panel to
 * set `.result` or `.error`, which transitions the dialog to `done`.
 *
 * Firmware auto-handles the return path (reverse of outbound), so the
 * user only supplies the outbound route.
 */
@customElement('meshcore-trace-dialog')
export class TraceDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) contactName = '';
  @property({ type: Object }) result: TraceResult | null = null;
  @property({ type: String }) error = '';
  @property({ type: Array }) availableRepeaters: Contact[] = [];
  /**
   * Session 55: the target the dialog was opened against.  Passed through
   * from the panel so the dialog can pre-populate a forwarding-class
   * target as the last hop in Select mode (see willUpdate).  Null for
   * ManagedDevice invocations or when we have no target record.
   */
  @property({ type: Object }) targetContact: Contact | null = null;

  // Session 54 input-phase state
  @state() private pathMode: TracePathMode = 'discovery';
  @state() private pathHops: Contact[] = [];
  @state() private enteredPath = '';
  // Session 55: free-text filter for the Select Repeaters Available column.
  @state() private _repeaterFilter = '';

  /**
   * Derived phase: when a request is in flight, result/error are both
   * null — if .open flipped true but neither is set, we might be either
   * in `input` (just opened) or `running` (user clicked Run Trace).  We
   * distinguish via the explicit _running flag set by _onRunTrace.
   */
  @state() private _running = false;

  static styles = [
    panelStyles,
    css`
    :host { display: contents; }

    .dialog-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .dialog {
      background: var(--card-background-color, #fff);
      border-radius: 8px;
      max-width: 700px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 5px 25px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.3s;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }

    .dialog-title { font-size: 18px; font-weight: 600; color: var(--primary-text-color); }

    .dialog-close {
      background: none; border: none; font-size: 20px; cursor: pointer;
      color: var(--secondary-text-color); padding: 0;
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
    }

    .dialog-close:hover { color: var(--primary-text-color); }

    .dialog-content { padding: 16px; }

    .info-item {
      padding: 8px;
      background: var(--primary-background-color, #fafafa);
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .info-label {
      font-size: 11px; color: var(--secondary-text-color, #727272);
      text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;
    }

    .info-value {
      font-size: 13px; color: var(--primary-text-color);
      margin-top: 4px; font-family: monospace;
    }

    .rtt-value {
      font-size: 24px; font-weight: 600;
      font-family: inherit;
      color: var(--primary-color, #03a9f4);
    }

    .hop-list {
      margin-top: 4px;
      font-family: monospace;
      font-size: 12px;
    }

    .hop-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }

    .hop-row + .hop-row {
      border-top: 1px dashed var(--divider-color, #e0e0e0);
    }

    .error-box {
      padding: 12px;
      background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2);
      border-radius: 6px;
      color: var(--error-color, #db4437);
      font-size: 13px;
    }

    /* Session 54 — input phase */

    select, input[type="text"] {
      width: 100%;
      padding: 8px 10px;
      margin-top: 4px;
      font-size: 14px;
      color: var(--primary-text-color);
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      box-sizing: border-box;
      font-family: inherit;
    }

    select:focus, input[type="text"]:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
    }

    input[type="text"] {
      font-family: monospace;
    }

    .path-hint {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-style: italic;
      padding: 8px;
    }

    .path-error {
      margin-top: 6px;
      font-size: 12px;
      color: var(--error-color, #db4437);
    }

    .repeater-picker {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .picker-column {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .picker-column-label {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .picker-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 60px;
      max-height: 200px;
      overflow-y: auto;
      padding: 4px;
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
    }

    /* Session 56: picker-search now uses .form-input for sizing / padding
       / border / border-radius (panel-wide form convention).  Local
       .picker-search only supplies picker-column-specific spacing. */
    .picker-search {
      margin-bottom: 4px;
    }

    .picker-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      background: var(--primary-background-color, #fafafa);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }

    .picker-item:hover {
      background: var(--secondary-background-color, #eef);
    }

    .picker-item[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .picker-item .name {
      flex: 1;
      font-family: inherit;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .picker-item .hop-hex {
      font-family: monospace;
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
    }

    .picker-item .ordinal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
    }

    .picker-item-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 2px 4px;
      font-size: 14px;
      line-height: 1;
    }

    .picker-item-btn:hover:not(:disabled) {
      color: var(--primary-text-color);
    }

    .picker-item-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .picker-empty {
      padding: 12px 8px;
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-style: italic;
      text-align: center;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 8px;
    }

    .btn-primary {
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color, #03a9f4);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-primary:hover:not(:disabled) {
      filter: brightness(0.95);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .resolved-path {
      margin-top: 4px;
      font-family: monospace;
      font-size: 12px;
      color: var(--primary-text-color);
      background: var(--primary-background-color, #fafafa);
      padding: 6px 8px;
      border-radius: 4px;
      word-break: break-all;
    }

    /* Session 56: Target row for both Select and Enter-path modes. */
    .target-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(3, 169, 244, 0.08);
      border: 1px solid rgba(3, 169, 244, 0.25);
      border-radius: 6px;
      font-size: 13px;
      margin-top: 4px;
    }

    .target-row .target-name {
      flex: 1;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .target-row .target-hex {
      font-family: monospace;
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
    }
  `,
  ];

  /**
   * Reset input-phase state whenever the dialog (re-)opens fresh for a
   * new target.  Lit calls willUpdate before render, so changing the
   * `open` prop from the parent triggers this cleanly.
   */
  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('open') && this.open && !changed.get('open')) {
      // Fresh-open reset.  Session 55: if the target is a forwarding-class
      // node (repeater=2, room-server=3, sensor=4), pre-populate it as the
      // single last-hop entry and switch to 'select' mode so the user sees
      // the intent "trace to this node" reflected immediately.  Clients
      // (type=1) can't be TRACE hops — Mesh::onTraceRecv is an empty
      // virtual (Mesh.h:106), only companion_radio overrides it
      // (MyMesh.cpp:804), and clients don't forward packets by default
      // (allowPacketForward: _prefs.client_repeat != 0).  For clients and
      // null targets we fall back to the existing discovery default.
      const target = this.targetContact;
      const isForwardingClass =
        !!target && (target.type === 2 || target.type === 3 || target.type === 4);
      if (isForwardingClass) {
        this.pathMode = 'select';
        // Session 56: pathHops is intermediate hops only; the target
        // sits in its own Target row driven by this.targetContact.
        // If the device has a cached outbound route for this contact,
        // resolve each hop hash against availableRepeaters and pre-
        // populate the picker.  For a direct-neighbor forwarding-class
        // target (or when out_path doesn't resolve) pathHops starts
        // empty — a single-hop target-only trace is still valid.
        const hops = this._resolveCachedHops(target!);
        this.pathHops = hops ? hops : [];
      } else {
        this.pathMode = 'discovery';
        this.pathHops = [];
      }
      this.enteredPath = '';
      this._repeaterFilter = '';
      this._running = false;
    }
    // When result or error lands, we're done with the running state.
    if ((changed.has('result') && this.result) ||
        (changed.has('error') && this.error)) {
      this._running = false;
    }
  }

  /**
   * Session 55 addendum: resolve a contact's cached out_path hex string
   * into an ordered list of Contact objects from availableRepeaters.
   * Returns null when mapping is ambiguous or unresolvable; the caller
   * then falls back to [target] alone.
   *
   * Matches on pubkey_prefix.startsWith(hopHex) since pubkey_prefix is
   * wider than the hop hash width.  For mode 1 (2-byte = 4 hex chars)
   * collisions across pubkeys in a realistic mesh are negligible; mode
   * 0 (1-byte) is treated as too ambiguous and returns null.
   */
  private _resolveCachedHops(target: Contact): Contact[] | null {
    const mode = (target.out_path_hash_mode as number | undefined) ?? 0;
    if (mode !== 1) return null;
    const pathHex = ((target.out_path as string | undefined) || '').toLowerCase();
    const len = (target.out_path_len as number | undefined) ?? 0;
    if (!pathHex || len <= 0) return null;
    const hopWidth = 4;
    if (pathHex.length < len * hopWidth) return null;
    const result: Contact[] = [];
    for (let i = 0; i < len; i++) {
      const hopHex = pathHex.substring(i * hopWidth, (i + 1) * hopWidth);
      const match = this.availableRepeaters.find(r =>
        (r.pubkey_prefix || '').toLowerCase().startsWith(hopHex),
      );
      if (!match) return null;
      result.push(match);
    }
    return result;
  }

  render() {
    if (!this.open) return html``;

    return html`
      <div class="dialog-backdrop" @click=${this._close}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Trace ${this.contactName}</div>
            <button class="dialog-close" @click=${this._close}>✕</button>
          </div>
          <div class="dialog-content">
            ${this._renderBody()}
          </div>
        </div>
      </div>
    `;
  }

  private _renderBody() {
    // error / result always take precedence if set, regardless of phase
    if (this.error) return html`<div class="error-box">${this.error}</div>`;
    if (this.result) return this._renderResult(this.result);
    if (this._running) return html`<div class="info-value">Tracing…</div>`;
    return this._renderInput();
  }

  // --- input phase ----------------------------------------------------

  private _renderInput() {
    return html`
      <div class="form-group">
        <label class="form-label">Path Type</label>
        <select
          class="form-select"
          .value=${this.pathMode}
          @change=${this._onPathModeChange}
        >
          <option value="discovery">Path discovery (auto)</option>
          <option value="select">Select repeaters</option>
          <option value="explicit">Enter path</option>
        </select>
      </div>

      ${this.pathMode === 'discovery'
        ? html`<div class="info-item path-hint">
            Flood path discovery will find a route automatically. May time
            out if the target is many hops away or unreachable by flood.
          </div>`
        : this.pathMode === 'select'
          ? this._renderRepeaterPicker()
          : this._renderExplicitInput()}

      ${this.pathMode !== 'discovery' && this._canRunTrace()
        ? html`<div class="info-item">
            <div class="info-label">Resolved Path</div>
            <div class="resolved-path">${this._buildPathString()}</div>
          </div>`
        : html``}

      <div class="dialog-actions">
        <button
          class="btn-primary"
          ?disabled=${!this._canRunTrace()}
          @click=${this._onRunTrace}
        >
          Run Trace
        </button>
      </div>
    `;
  }

  private _renderRepeaterPicker() {
    const selectedSet = new Set(this.pathHops.map(r => r.public_key));
    // Session 55: two-axis filter — case-insensitive substring match against
    // adv_name OR hex-prefix match against pubkey_prefix.  Prefix-match
    // accepts raw hex the user is typing (1-char, 2-char, etc.).
    const filter = this._repeaterFilter.trim().toLowerCase();
    const sortedAvailable = [...this.availableRepeaters]
      .filter(r => !selectedSet.has(r.public_key))
      .filter(r => {
        if (!filter) return true;
        const name = (r.adv_name || '').toLowerCase();
        const prefix = (r.pubkey_prefix || '').toLowerCase();
        return name.includes(filter) || prefix.startsWith(filter);
      })
      .sort((a, b) => (a.adv_name || '').localeCompare(b.adv_name || ''));

    const targetName =
      this.targetContact?.adv_name || this.targetContact?.pubkey_prefix || '(no target)';
    const targetHex =
      this.targetContact?.pubkey_prefix?.substring(0, 2).toUpperCase() || '--';

    return html`
      <div class="info-item">
        <div class="info-label">Repeaters (in order, source → target)</div>
        <div class="repeater-picker">
          <div class="picker-column">
            <div class="picker-column-label">Available</div>
            <input
              type="text"
              class="form-input picker-search"
              placeholder="Filter by name or pubkey prefix…"
              .value=${this._repeaterFilter}
              @input=${(e: Event) => { this._repeaterFilter = (e.target as HTMLInputElement).value; }}
              autocomplete="off"
              spellcheck="false"
            />
            <div class="picker-list">
              ${sortedAvailable.length === 0
                ? html`<div class="picker-empty">${filter ? 'No matches' : 'No repeaters available'}</div>`
                : sortedAvailable.map(
                    r => html`
                      <div
                        class="picker-item"
                        @click=${() => this._addRepeater(r)}
                        title="Add ${r.adv_name}"
                      >
                        <span class="name">${r.adv_name || r.pubkey_prefix}</span>
                        <span class="hop-hex">${r.pubkey_prefix.substring(0, 2).toUpperCase()}</span>
                      </div>
                    `,
                  )}
            </div>
          </div>
          <div class="picker-column">
            <div class="picker-column-label">Path</div>
            <div class="picker-list">
              ${this.pathHops.length === 0
                ? html`<div class="picker-empty">Click a repeater to add (or leave empty for direct-neighbor)</div>`
                : this.pathHops.map(
                    (r, i) => html`
                      <div class="picker-item">
                        <span class="ordinal">${i + 1}</span>
                        <span class="name">${r.adv_name || r.pubkey_prefix}</span>
                        <span class="hop-hex">${r.pubkey_prefix.substring(0, 2).toUpperCase()}</span>
                        <button
                          class="picker-item-btn"
                          ?disabled=${i === 0}
                          @click=${() => this._moveRepeater(i, -1)}
                          title="Move up"
                        >▲</button>
                        <button
                          class="picker-item-btn"
                          ?disabled=${i === this.pathHops.length - 1}
                          @click=${() => this._moveRepeater(i, 1)}
                          title="Move down"
                        >▼</button>
                        <button
                          class="picker-item-btn"
                          @click=${() => this._removeRepeater(i)}
                          title="Remove"
                        >✕</button>
                      </div>
                    `,
                  )}
            </div>
          </div>
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Target</div>
        <div class="target-row">
          <span class="target-name">${targetName}</span>
          <span class="target-hex">${targetHex}</span>
        </div>
      </div>
    `;
  }

  private _renderExplicitInput() {
    const showError = !!this.enteredPath && !this._isValidExplicitHops();
    const targetName =
      this.targetContact?.adv_name || this.targetContact?.pubkey_prefix || '(no target)';
    const targetHex =
      this.targetContact?.pubkey_prefix?.substring(0, 2).toUpperCase() || '--';
    return html`
      <div class="info-item">
        <div class="info-label">Outbound Hops (comma-separated hex)</div>
        <input
          type="text"
          class="form-input"
          placeholder="AE  (or AE,CD for multiple hops, or empty for direct neighbor)"
          .value=${this.enteredPath}
          @input=${this._onExplicitPathInput}
          autocomplete="off"
          spellcheck="false"
        />
        <div class="path-hint">
          Enter outbound hops only — the target and return hops are added
          automatically.  For a direct-neighbor target, leave this empty.
          Each hop is 2, 4, or 8 hex chars (1, 2, or 4 bytes); all hops
          must be the same width.  1 byte is recommended — 2-byte and
          4-byte hashes may not complete round-trip in some meshes.
        </div>
        ${showError
          ? html`<div class="path-error">
              Invalid format — hex pairs separated by commas, all
              the same width (2, 4, or 8 chars).
            </div>`
          : html``}
      </div>
      <div class="info-item">
        <div class="info-label">Target</div>
        <div class="target-row">
          <span class="target-name">${targetName}</span>
          <span class="target-hex">${targetHex}</span>
        </div>
      </div>
    `;
  }

  // --- event handlers -------------------------------------------------

  private _onPathModeChange = (e: Event) => {
    this.pathMode = (e.target as HTMLSelectElement).value as TracePathMode;
  };

  private _onExplicitPathInput = (e: Event) => {
    this.enteredPath = (e.target as HTMLInputElement).value;
  };

  private _addRepeater(r: Contact) {
    this.pathHops = [...this.pathHops, r];
  }

  private _removeRepeater(idx: number) {
    this.pathHops = this.pathHops.filter((_, i) => i !== idx);
  }

  private _moveRepeater(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this.pathHops.length) return;
    const next = [...this.pathHops];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    this.pathHops = next;
  }

  private _onRunTrace = () => {
    if (!this._canRunTrace()) return;
    const path = this.pathMode === 'discovery' ? undefined : this._buildPathString();
    this._running = true;
    this.dispatchEvent(
      new CustomEvent('trace-requested', {
        detail: { pathMode: this.pathMode, path },
        bubbles: true,
        composed: true,
      }),
    );
  };

  // --- validation / derivation ---------------------------------------

  private _isValidExplicitHops(): boolean {
    // Session 56: Enter-path input is now outbound hops only.  Empty
    // input is valid — it means a direct-neighbor target-only trace,
    // assembled by _buildPathString as just the target byte.
    const s = this.enteredPath.trim();
    if (!s) return true;
    const hops = s.split(',').map(h => h.trim());
    if (hops.length === 0) return false;
    // Every hop must be an even-length hex string of the same length
    // (1, 2, or 4 bytes → 2, 4, or 8 hex chars).  send_trace() derives
    // flags from this length.
    const firstLen = hops[0].length;
    if (![2, 4, 8].includes(firstLen)) return false;
    const hexRe = /^[0-9a-fA-F]+$/;
    return hops.every(h => h.length === firstLen && hexRe.test(h));
  }

  private _canRunTrace(): boolean {
    if (this.pathMode === 'discovery') return true;
    if (this.pathMode === 'select') return !!this.targetContact;
    if (this.pathMode === 'explicit')
      return !!this.targetContact && this._isValidExplicitHops();
    return false;
  }

  private _buildPathString(): string {
    if (this.pathMode === 'select') {
      // Session 55 Addendum 2: 2 hex chars = 1 byte per hop.
      // send_trace() derives flags=0 from this length (meshcore_py
      // messaging.py:253-254), matching MeshCoreOne's wire format.
      //
      // Empirical finding (Session 55 Addendum 2): 2-byte hashes
      // (flags=1) do NOT complete TRACE round-trip in production
      // meshes — the target node's retransmit either doesn't happen
      // or isn't heard on the return leg.  1-byte hashes (flags=0)
      // do complete.  Root cause in firmware not identified; switch
      // decided based on MeshCoreOne-matches-works, 2-byte-fails.
      //
      // Round-trip path construction (Addendum 1).  TRACE protocol
      // (Mesh.cpp:41-66) fires onTraceRecv only on nodes where
      // (path_len << path_sz) >= len.  For the sender to be that
      // node, the hash list must end back at the sender's radio
      // range — outbound hops, target, reverse(outbound hops).
      // Packet.cpp:41-50 mixes path_len into the TRACE packet hash,
      // so repeated hashes don't trigger hasSeen dedup at mirror
      // hops.
      //
      // Session 56: pathHops holds intermediate hops only; target
      // is pulled from this.targetContact separately.  Empty
      // pathHops → single target byte (direct-neighbor trace).
      if (!this.targetContact) return '';
      const targetHex = this.targetContact.pubkey_prefix.substring(0, 2).toUpperCase();
      const hopHexes = this.pathHops.map(r => r.pubkey_prefix.substring(0, 2).toUpperCase());
      if (hopHexes.length === 0) return targetHex;
      return [...hopHexes, targetHex, ...[...hopHexes].reverse()].join(',');
    }
    if (this.pathMode === 'explicit') {
      // Session 56: user enters outbound hops only; build round-trip
      // here (outbound + target + reverse(outbound)).  Matches
      // Select mode semantics.  Empty input → direct-neighbor
      // target-only trace.
      if (!this.targetContact) return '';
      const targetHex = this.targetContact.pubkey_prefix.substring(0, 2).toUpperCase();
      const s = this.enteredPath.trim();
      if (!s) return targetHex;
      const hops = s.split(',').map(h => h.trim().toUpperCase());
      return [...hops, targetHex, ...[...hops].reverse()].join(',');
    }
    return '';
  }

  // --- result / close --------------------------------------------------

  private _renderResult(result: TraceResult) {
    // Intermediate hops = entries with a `hash` field; the final entry
    // (no hash) is this device, reported separately as final_snr.
    const intermediateHops = (result.path || []).filter(n => n.hash);

    return html`
      <div class="info-item">
        <div class="info-label">Round Trip</div>
        <div class="info-value rtt-value">${result.response_time}</div>
      </div>

      <div class="info-item">
        <div class="info-label">Hops</div>
        <div class="info-value">
          ${result.hops === 0 ? 'Direct (0 hops)' : `${result.hops}`}
        </div>
      </div>

      ${result.final_snr !== null && result.final_snr !== undefined
        ? html`
            <div class="info-item">
              <div class="info-label">Final SNR (at this device)</div>
              <div class="info-value">${result.final_snr.toFixed(2)} dB</div>
            </div>
          `
        : html``}

      ${intermediateHops.length > 0
        ? html`
            <div class="info-item">
              <div class="info-label">Return Path (per-hop SNR)</div>
              <div class="hop-list">
                ${intermediateHops.map(
                  (node, i) => html`
                    <div class="hop-row">
                      <span>Hop ${i + 1}: ${node.hash}</span>
                      <span>${node.snr.toFixed(2)} dB</span>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : html``}
    `;
  }

  private _close() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('trace-dialog-closed', { bubbles: true, composed: true }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-trace-dialog': TraceDialog;
  }
}
