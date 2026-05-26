import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { panelStyles } from '../styles';
import type { Contact } from '../types';
import { attachDialogA11y } from '../utils/dialog-a11y';

/**
 * Target-picker.
 *
 * Modal that appears when the user invokes Trace from the settings-tab
 * Companion quick-actions row.  Lets the user pick any contact by type
 * (All / Companion or Client / Repeater / Room Server / Sensor) and by
 * free-text search against adv_name (substring) OR pubkey_prefix
 * (prefix).  Clicking a row dispatches `target-selected` with the chosen
 * Contact; the picker does NOT open the trace dialog itself — the panel
 * handles that transition so the same trace-dialog open code path is
 * used for both entry points.
 *
 * Nodes-tab entry to trace bypasses this picker entirely — clicking
 * Trace in the node-detail dialog opens the trace-dialog directly with
 * the already-known contact as the target.
 *
 * Contact type numbers (source of truth: coordinator.py contact-type
 * constants, also reflected in types.ts:199):
 *   1 = client (companion)
 *   2 = repeater
 *   3 = room server
 *   4 = sensor
 * If contact types are ever renumbered this picker's filter mapping
 * would silently mis-categorize — but renumbering would break much
 * more than a UI filter, so no dynamic source-of-truth import is used.
 */
@customElement('meshcore-target-picker')
export class TargetPicker extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) contacts: Contact[] = [];

  @state() private _typeFilter: 'all' | 'client' | 'repeater' | 'room_server' | 'sensor' = 'all';
  @state() private _search = '';

  constructor() {
    super();
    // Focus trap + Escape closes the dialog. Replaces the
    // document-level keydown listener previously installed in
    // connectedCallback() — the controller's host-scoped listener
    // handles both Escape and Tab cycling, with no leak risk on
    // disconnect.
    attachDialogA11y(this, {
      isOpen: () => this.open,
      onEscape: () => this._close(),
    });
  }

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
        max-width: 560px;
        width: 90%;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
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

      .dialog-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .dialog-close {
        background: none; border: none; font-size: 20px; cursor: pointer;
        color: var(--secondary-text-color); padding: 0;
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
      }

      .dialog-close:hover { color: var(--primary-text-color); }

      .dialog-content {
        padding: 16px;
        overflow-y: auto;
      }

      .filter-row {
        display: grid;
        grid-template-columns: minmax(140px, 200px) 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }

      @media (max-width: 520px) {
        .filter-row { grid-template-columns: 1fr; }
      }

      .results-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 50vh;
        overflow-y: auto;
        padding: 4px;
        background: var(--primary-background-color, #fafafa);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 6px;
      }

      .result-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--card-background-color, #fff);
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        font-size: 14px;
        transition: background 0.15s;
      }

      .result-row:hover {
        background: var(--secondary-background-color, #eef);
      }

      .result-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        color: var(--primary-color, #03a9f4);
        flex-shrink: 0;
      }

      .result-name {
        flex: 1;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .result-hex {
        font-family: monospace;
        font-size: 12px;
        color: var(--secondary-text-color, #727272);
        flex-shrink: 0;
      }

      .empty {
        padding: 24px 12px;
        text-align: center;
        color: var(--secondary-text-color, #727272);
        font-style: italic;
        font-size: 13px;
      }
    `,
  ];

  // Escape handling moved to DialogA11yController above.

  willUpdate(changed: Map<string, unknown>) {
    // Fresh-open reset: clear filters so each open starts clean.
    if (changed.has('open') && this.open && !changed.get('open')) {
      this._typeFilter = 'all';
      this._search = '';
    }
  }

  render() {
    if (!this.open) return html``;

    const typeMatch = (c: Contact) => {
      switch (this._typeFilter) {
        case 'all': return true;
        case 'client': return c.type === 1;
        case 'repeater': return c.type === 2;
        case 'room_server': return c.type === 3;
        case 'sensor': return c.type === 4;
        default: return true;
      }
    };

    const q = this._search.trim().toLowerCase();
    const searchMatch = (c: Contact) => {
      if (!q) return true;
      const name = (c.adv_name || '').toLowerCase();
      const prefix = (c.pubkey_prefix || '').toLowerCase();
      return name.includes(q) || prefix.startsWith(q);
    };

    const filtered = this.contacts
      .filter(typeMatch)
      .filter(searchMatch)
      .sort((a, b) => (a.adv_name || '').localeCompare(b.adv_name || ''));

    return html`
      <div class="dialog-backdrop" @click=${this._close}>
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Choose trace target"
          @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Choose Trace Target</div>
            <button class="dialog-close" aria-label="Close" @click=${this._close} title="Close">✕</button>
          </div>
          <div class="dialog-content">
            <div class="filter-row">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Type</label>
                <select
                  class="form-select"
                  .value=${this._typeFilter}
                  @change=${this._onTypeChange}
                >
                  <option value="all">All</option>
                  <option value="client">Companion / Client</option>
                  <option value="repeater">Repeater</option>
                  <option value="room_server">Room Server</option>
                  <option value="sensor">Sensor</option>
                </select>
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Search</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="Name or pubkey prefix…"
                  .value=${this._search}
                  @input=${this._onSearchInput}
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>
            <div class="results-list">
              ${filtered.length === 0
                ? html`<div class="empty">No matching contacts</div>`
                : filtered.map(c => html`
                    <div
                      class="result-row"
                      @click=${() => this._select(c)}
                      title="Trace to ${c.adv_name || c.pubkey_prefix}"
                    >
                      <span class="result-icon">${this._iconFor(c.type)}</span>
                      <span class="result-name">${c.adv_name || c.pubkey_prefix}</span>
                      <span class="result-hex">${(c.pubkey_prefix || '').substring(0, 2).toUpperCase()}</span>
                    </div>
                  `)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _iconFor(type: number) {
    // Simple visual hints — no hard dependency on any icon library.
    switch (type) {
      case 2: // repeater
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V10h4.27c.15-.86.45-1.66.87-2.36l-1.82-1.06a.5.5 0 01-.18-.68l.5-.87a.5.5 0 01.68-.18l1.81 1.05C19.66 4.66 20.78 4 22 4v2c-.8 0-1.54.32-2.08.84l1.5 2.6a.5.5 0 01-.18.68l-.87.5a.5.5 0 01-.68-.18L18.2 7.92c-.14.65-.2 1.33-.2 2.08 0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6z"/></svg>`;
      case 3: // room server
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 6h16v4H4V6zm0 8h16v4H4v-4zm2-6.5A.5.5 0 116 7a.5.5 0 010 .5zm0 8A.5.5 0 116 15a.5.5 0 010 .5z"/></svg>`;
      case 4: // sensor
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a4 4 0 00-4 4v7.55A5.5 5.5 0 1015.5 20a5.47 5.47 0 00.5-2.45V6a4 4 0 00-4-4zm0 2a2 2 0 012 2v8.1a3.5 3.5 0 11-4 0V6a2 2 0 012-2z"/></svg>`;
      case 1: // client
      default:
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
    }
  }

  private _onTypeChange = (e: Event) => {
    this._typeFilter = (e.target as HTMLSelectElement).value as typeof this._typeFilter;
  };

  private _onSearchInput = (e: Event) => {
    this._search = (e.target as HTMLInputElement).value;
  };

  private _select(contact: Contact) {
    this.dispatchEvent(new CustomEvent('target-selected', {
      detail: contact,
      bubbles: true,
      composed: true,
    }));
  }

  private _close = () => {
    this.dispatchEvent(new CustomEvent('target-picker-closed', {
      bubbles: true,
      composed: true,
    }));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-target-picker': TargetPicker;
  }
}
