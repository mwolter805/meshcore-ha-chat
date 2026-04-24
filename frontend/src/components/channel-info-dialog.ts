import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Channel } from '../types';

@customElement('meshcore-channel-info-dialog')
export class ChannelInfoDialog extends LitElement {
  @property({ type: Object }) channel?: Channel;
  @property({ type: Boolean }) open = false;

  @state() private _confirming = false;

  static styles = css`
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
      max-width: 400px;
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

    .confirm-section {
      padding: 12px;
      background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2);
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .confirm-text { font-size: 13px; color: var(--primary-text-color); margin-bottom: 8px; }
    .confirm-actions { display: flex; gap: 6px; }

    .confirm-btn {
      padding: 6px 10px; border: none; border-radius: 4px;
      font-size: 12px; font-weight: 600; cursor: pointer;
    }

    .confirm-btn.yes { background: var(--error-color, #db4437); color: #fff; }
    .confirm-btn.no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

    .remove-button {
      width: 100%; padding: 8px;
      border: 1px solid rgba(219, 68, 55, 0.3);
      border-radius: 6px; background: transparent;
      color: var(--error-color, #db4437);
      font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.15s;
    }

    .remove-button:hover {
      background: var(--error-color, #db4437);
      color: #fff;
    }
  `;

  render() {
    if (!this.open || !this.channel) return html``;

    const channel = this.channel;

    return html`
      <div class="dialog-backdrop" @click=${this._close}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">#${channel.name}</div>
            <button class="dialog-close" @click=${this._close}>✕</button>
          </div>

          <div class="dialog-content">
            ${this._confirming
              ? html`
                  <div class="confirm-section">
                    <div class="confirm-text">Remove this channel?</div>
                    <div class="confirm-actions">
                      <button class="confirm-btn yes" @click=${() => this._confirmRemove()}>Yes</button>
                      <button class="confirm-btn no" @click=${() => { this._confirming = false; }}>Cancel</button>
                    </div>
                  </div>
                `
              : html`
                  <div class="info-item">
                    <div class="info-label">Channel Name</div>
                    <div class="info-value">${channel.name}</div>
                  </div>

                  <div class="info-item">
                    <div class="info-label">Channel Index</div>
                    <div class="info-value">${channel.channel_idx}</div>
                  </div>

                  ${channel.settings && Object.keys(channel.settings).length > 0
                    ? html`
                        <div class="info-item">
                          <div class="info-label">Settings</div>
                          <div class="info-value">
                            ${Object.entries(channel.settings).map(([key, value]) =>
                              html`<div style="margin-top: 4px;">${key}: ${JSON.stringify(value)}</div>`
                            )}
                          </div>
                        </div>
                      ` : html``}

                  <button class="remove-button" @click=${() => { this._confirming = true; }}>
                    Remove Channel
                  </button>
                `}
          </div>
        </div>
      </div>
    `;
  }

  private _close() {
    this.open = false;
    this._confirming = false;
  }

  private _confirmRemove() {
    this.dispatchEvent(
      new CustomEvent('channel-remove', {
        detail: { channel: this.channel },
        bubbles: true,
        composed: true,
      })
    );
    this._close();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-channel-info-dialog': ChannelInfoDialog;
  }
}
