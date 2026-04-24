import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, ManagedDevice, HomeAssistant } from '../types';

@customElement('meshcore-node-detail-dialog')
export class NodeDetailDialog extends LitElement {
  @property({ type: Object }) node?: Contact | ManagedDevice;
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) hass?: HomeAssistant;
  // Parent-owned pending state; when set, the matching action button is
  // disabled and its label swaps to "Adding…" / "Removing…" so the user
  // gets feedback during the WS round-trip + coordinator refresh.
  @property({ type: String }) pendingAction: 'add-contact' | 'remove-contact' | null = null;

  @state() private _confirming = false;
  @state() private _confirmAction: 'remove-contact' | null = null;

  static styles = css`
    :host {
      display: contents;
    }

    .dialog-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .dialog {
      background: var(--card-background-color, #fff);
      border-radius: 8px;
      max-width: 500px;
      max-height: 80vh;
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
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }

    .dialog-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 24px;
      flex-shrink: 0;
    }

    .dialog-avatar.repeater { background: #ff9800; }
    .dialog-avatar.room-server { background: #9c27b0; }
    .dialog-avatar.sensor { background: #607d8b; }
    .dialog-avatar.client { background: #4caf50; }

    .dialog-title { flex: 1; overflow: hidden; }

    .dialog-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dialog-type {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      margin-top: 2px;
    }

    .dialog-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .dialog-close:hover { color: var(--primary-text-color); }

    .dialog-content { padding: 16px; }

    .section { margin-bottom: 16px; }

    .section-header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--secondary-text-color, #727272);
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .quick-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .quick-actions.full { grid-template-columns: 1fr; }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    .action-btn.warning {
      color: #ff9800;
      border-color: rgba(255, 152, 0, 0.4);
    }

    .action-btn.warning:hover {
      background: #ff9800;
      color: #fff;
      border-color: #ff9800;
    }

    .action-btn.danger {
      color: var(--error-color, #db4437);
      border-color: rgba(219, 68, 55, 0.3);
    }

    .action-btn.danger:hover {
      background: var(--error-color, #db4437);
      color: #fff;
      border-color: var(--error-color, #db4437);
    }

    .action-btn:disabled {
      opacity: 0.6;
      cursor: wait;
      pointer-events: none;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .info-item {
      padding: 8px;
      background: var(--primary-background-color, #fafafa);
      border-radius: 6px;
    }

    .info-label {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .info-value {
      font-size: 13px;
      color: var(--primary-text-color);
      margin-top: 4px;
      word-break: break-all;
      font-family: monospace;
    }

    .confirm-section {
      padding: 12px;
      background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2);
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .confirm-text {
      font-size: 13px;
      color: var(--primary-text-color);
      margin-bottom: 8px;
    }

    .confirm-description {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      margin-bottom: 10px;
    }

    .confirm-actions { display: flex; gap: 6px; }

    .confirm-btn {
      padding: 6px 10px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .confirm-btn.yes { background: var(--error-color, #db4437); color: #fff; }
    .confirm-btn.no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

  `;

  render() {
    if (!this.open || !this.node) return html``;

    const isContact = 'adv_name' in this.node;
    const isRepeater = isContact ? (this.node as Contact).type === 2 : (this.node as ManagedDevice).type === 'repeater';
    const isRoomServer = isContact && (this.node as Contact).type === 3;
    const isClient = isContact ? (this.node as Contact).type === 1 : (this.node as ManagedDevice).type === 'client';
    const isSensor = isContact && (this.node as Contact).type === 4;

    const name = isContact ? (this.node as Contact).adv_name : (this.node as ManagedDevice).name;
    const prefix = isContact ? (this.node as Contact).pubkey_prefix : (this.node as ManagedDevice).pubkey_prefix;

    let avatarSvg = html`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
    let typeLabel = 'Contact';
    let typeClass = '';

    if (isRepeater) { avatarSvg = html`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`; typeLabel = 'Repeater'; typeClass = 'repeater'; }
    else if (isRoomServer) { avatarSvg = html`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`; typeLabel = 'Room Server'; typeClass = 'room-server'; }
    else if (isSensor) { avatarSvg = html`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`; typeLabel = 'Sensor'; typeClass = 'sensor'; }
    else if (isClient) { avatarSvg = html`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`; typeLabel = 'Client'; typeClass = 'client'; }

    return html`
      <div class="dialog-backdrop" @click=${this._close}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <div class=${`dialog-avatar ${typeClass}`}>${avatarSvg}</div>
            <div class="dialog-title">
              <div class="dialog-name">${name}</div>
              <div class="dialog-type">${typeLabel}</div>
            </div>
            <button class="dialog-close" @click=${this._close}>✕</button>
          </div>

          <div class="dialog-content">
            ${this._confirming
              ? html`
                  <div class="confirm-section">
                    <div class="confirm-text">
                      ${this._confirmAction === 'remove-contact' ? 'Remove this as an Added Contact?' : ''}
                    </div>
                    ${this._confirmAction === 'remove-contact' ? html`
                      <div class="confirm-description">Removing the contact will make it a Discovered Contact.</div>
                    ` : html``}
                    <div class="confirm-actions">
                      <button class="confirm-btn yes" @click=${() => this._confirmAction_exec()}>Yes</button>
                      <button class="confirm-btn no" @click=${() => { this._confirming = false; this._confirmAction = null; }}>Cancel</button>
                    </div>
                  </div>
                `
              : html`
                  <div class="section">
                    <div class="section-header">Quick Actions</div>
                    <div class="quick-actions ${isContact ? '' : 'full'}">
                      ${isContact && (this.node as Contact).added_to_node && (isClient || isRoomServer) ? html`
                        <button class="action-btn" @click=${() => this._dispatchEvent('message')}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>Message</button>
                      ` : html``}
                      ${prefix && !isClient ? html`
                        <button class="action-btn" @click=${() => this._dispatchEvent('trace')}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 12a2 2 0 104 0 2 2 0 10-4 0zM10 12a2 2 0 104 0 2 2 0 10-4 0zM18 12a2 2 0 104 0 2 2 0 10-4 0zM7 10l3 2-3 2zM15 10l3 2-3 2z"/></svg>Trace</button>
                      ` : html``}
                      ${isContact && (this.node as Contact).added_to_node
                        ? html`<button class="action-btn warning"
                            ?disabled=${this.pendingAction === 'remove-contact'}
                            @click=${() => { this._confirming = true; this._confirmAction = 'remove-contact'; }}>${this.pendingAction === 'remove-contact' ? 'Removing…' : 'Remove Contact'}</button>`
                        : isContact ? html`<button class="action-btn"
                            ?disabled=${this.pendingAction === 'add-contact'}
                            @click=${() => this._dispatchEvent('add-contact')}>${this.pendingAction === 'add-contact'
                              ? html`Adding…`
                              : html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Add Contact`}</button>`
                        : html``}
                    </div>
                  </div>

                  <div class="section">
                    <div class="section-header">Information</div>
                    <div class="info-grid">
                      <div class="info-item">
                        <div class="info-label">Public Key Prefix</div>
                        <div class="info-value">${prefix}</div>
                      </div>
                      <div class="info-item">
                        <div class="info-label">Type</div>
                        <div class="info-value">${typeLabel}</div>
                      </div>
                      ${isContact ? html`
                        <div class="info-item">
                          <div class="info-label">Last Advert</div>
                          <div class="info-value">
                            ${(this.node as Contact).last_advert
                              ? new Date((this.node as Contact).last_advert * 1000).toLocaleString()
                              : 'Unknown'}
                          </div>
                        </div>
                        <div class="info-item">
                          <div class="info-label">Status</div>
                          <div class="info-value">${(this.node as Contact).added_to_node ? 'Added Contact' : 'Discovered Contact'}</div>
                        </div>
                      ` : html``}
                    </div>
                  </div>

                  ${isContact && ((this.node as Contact).adv_lat !== 0 || (this.node as Contact).adv_lon !== 0)
                    ? html`
                        <div class="section">
                          <div class="section-header">Location</div>
                          <div class="info-grid">
                            <div class="info-item">
                              <div class="info-label">Latitude</div>
                              <div class="info-value">${(this.node as Contact).adv_lat.toFixed(6)}</div>
                            </div>
                            <div class="info-item">
                              <div class="info-label">Longitude</div>
                              <div class="info-value">${(this.node as Contact).adv_lon.toFixed(6)}</div>
                            </div>
                          </div>
                        </div>
                      ` : html``}

                  ${isContact && (this.node as Contact).out_path
                    ? html`
                        <div class="section">
                          <div class="section-header">Network</div>
                          <div class="info-item">
                            <div class="info-label">Route (Outgoing Path)</div>
                            <div class="info-value">${(this.node as Contact).out_path}</div>
                          </div>
                          ${(this.node as Contact).out_path_len
                            ? html`
                                <div class="info-item" style="margin-top: 8px;">
                                  <div class="info-label">Path Length</div>
                                  <div class="info-value">${(this.node as Contact).out_path_len} hops</div>
                                </div>
                              ` : html``}
                        </div>
                      ` : html``}

                `}
          </div>
        </div>
      </div>
    `;
  }

  private _close() {
    this.open = false;
    this._confirming = false;
    this._confirmAction = null;
    this.dispatchEvent(
      new CustomEvent('node-detail-closed', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _dispatchEvent(action: string) {
    this.dispatchEvent(
      new CustomEvent(`node-${action}`, {
        detail: { node: this.node },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _confirmAction_exec() {
    if (this._confirmAction) {
      this._dispatchEvent(this._confirmAction);
    }
    this._close();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-node-detail-dialog': NodeDetailDialog;
  }
}
