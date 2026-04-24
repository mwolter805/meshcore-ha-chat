import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, Channel } from '../types';
import '../components/contact-card';

@customElement('meshcore-contacts-page')
export class ContactsPage extends LitElement {
  @property({ type: Array }) contacts: Contact[] = [];
  @property({ type: Array }) channels: Channel[] = [];
  @property({ type: Boolean }) narrow = false;

  @state() private _activeTab: 'active' | 'channels' = 'active';

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .contacts-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .tab-bar {
      display: flex;
      gap: 0;
      padding: 0;
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

    .content-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      background: var(--primary-background-color, #fafafa);
    }

    .content-area::-webkit-scrollbar {
      width: 6px;
    }

    .content-area::-webkit-scrollbar-track {
      background: transparent;
    }

    .content-area::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .contacts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 12px;
    }

    :host([narrow]) .contacts-grid {
      grid-template-columns: 1fr;
    }

    :host([narrow]) .tab-bar {
      gap: 0;
    }

    :host([narrow]) .tab-bar button {
      font-size: 12px;
      padding: 10px 12px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .empty-subtext {
      font-size: 13px;
      opacity: 0.7;
      max-width: 300px;
    }
  `;

  render() {
    return html`
      <div class="contacts-layout">
        <div class="tab-bar">
          <button
            class=${this._activeTab === 'active' ? 'active' : ''}
            @click=${() => (this._activeTab = 'active')}>
            Active Contacts (${this.contacts.filter((c) => c.online).length})
          </button>
          <button
            class=${this._activeTab === 'channels' ? 'active' : ''}
            @click=${() => (this._activeTab = 'channels')}>
            Channels (${this.channels.length})
          </button>
        </div>
        <div class="content-area">
          ${this._activeTab === 'active' ? this._renderActiveContacts() : html``}
          ${this._activeTab === 'channels' ? this._renderChannels() : html``}
        </div>
      </div>
    `;
  }

  private _renderActiveContacts() {
    const activeContacts = this.contacts.filter((c) => c.added_to_node);

    if (activeContacts.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
          <div class="empty-text">No active contacts</div>
          <div class="empty-subtext">Contacts that are currently online will appear here</div>
        </div>
      `;
    }

    return html`
      <div class="contacts-grid">
        ${activeContacts.map((contact) => html`<meshcore-contact-card .contact=${contact}></meshcore-contact-card>`)}
      </div>
    `;
  }

  private _renderChannels() {
    if (this.channels.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4h4zm-6 4h-4v-4h4v4z"/></svg></div>
          <div class="empty-text">No channels</div>
          <div class="empty-subtext">Channels will appear once you join or create them</div>
        </div>
      `;
    }

    return html`
      <div class="contacts-grid">
        ${this.channels.map(
          (channel) => html`
            <div style="padding: 12px; background: var(--card-background-color, #fff); border-radius: 8px;">
              <div style="font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
                #${channel.name}
              </div>
              <div style="font-size: 12px; color: var(--secondary-text-color, #727272); margin-top: 4px;">
                Channel ${channel.channel_idx}
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-contacts-page': ContactsPage;
  }
}
