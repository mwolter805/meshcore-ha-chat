import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, Contact, Channel } from '../types';
import { getContacts, getChannels, getDeviceConfig, addContact, removeContact, removeChannel } from '../api';
import './channel-dialog';

type ManageTab = 'contacts' | 'channels';

/**
 * Unified contact and channel management dialog.
 *
 * Dispatches:
 * - 'manage-closed' when the dialog is dismissed
 * - 'contacts-changed' after a contact is added or removed
 * - 'channels-changed' after a channel is added, edited, or removed
 */
@customElement('meshcore-manage-dialog')
export class ManageDialog extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: String }) entryId?: string;
  @property({ type: Boolean }) narrow = false;

  @state() private _activeTab: ManageTab = 'contacts';
  @state() private _contacts: Contact[] = [];
  @state() private _channels: Channel[] = [];
  @state() private _searchQuery = '';
  @state() private _loading = false;
  @state() private _actionInProgress: string | null = null;
  @state() private _confirmingRemoveContact: string | null = null;
  @state() private _confirmingRemoveChannel: number | null = null;
  @state() private _channelDialogOpen = false;
  @state() private _editingChannel: Channel | null = null;
  @state() private _maxChannels = 4;

  static styles = css`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      padding: 16px;
    }

    .dialog {
      display: flex;
      flex-direction: column;
      max-width: 500px;
      width: 100%;
      max-height: 80vh;
      border-radius: 12px;
      background: var(--card-background-color, #fff);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.2s ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    :host([narrow]) .dialog {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
      height: 100%;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .dialog-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.15s;
    }

    .close-btn:hover {
      color: var(--primary-text-color);
      background: rgba(0, 0, 0, 0.05);
    }

    /* Tab bar */
    .tab-bar {
      display: flex;
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
    }

    .tab-bar button:hover {
      color: var(--primary-text-color);
      background: rgba(0, 0, 0, 0.02);
    }

    .tab-bar button.active {
      color: var(--primary-color, #03a9f4);
      border-bottom-color: var(--primary-color, #03a9f4);
    }

    /* Search */
    .search-bar {
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .search-bar input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: var(--primary-background-color, #fafafa);
      color: var(--primary-text-color);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-bar input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .search-bar input::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    /* List area */
    .list-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .list-area::-webkit-scrollbar {
      width: 6px;
    }

    .list-area::-webkit-scrollbar-track {
      background: transparent;
    }

    .list-area::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb-color, #c1c1c1);
      border-radius: 3px;
    }

    /* Contact items */
    .contact-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      transition: background 0.15s;
    }

    .contact-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .contact-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }

    .contact-info {
      flex: 1;
      overflow: hidden;
    }

    .contact-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
    }

    .contact-prefix {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .badge.added {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
      color: var(--primary-color, #03a9f4);
    }

    .badge.discovered {
      background: rgba(0, 0, 0, 0.06);
      color: var(--secondary-text-color, #727272);
    }

    /* Action buttons */
    .action-btn {
      padding: 6px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .action-btn:hover {
      border-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
    }

    .action-btn.add {
      border-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
    }

    .action-btn.add:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }

    .action-btn.remove {
      border-color: var(--error-color, #db4437);
      color: var(--error-color, #db4437);
    }

    .action-btn.remove:hover {
      background: var(--error-color, #db4437);
      color: #fff;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Confirm inline */
    .confirm-inline {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .confirm-inline .confirm-text {
      font-size: 12px;
      color: var(--error-color, #db4437);
      font-weight: 500;
    }

    .confirm-inline .confirm-btn {
      padding: 4px 10px;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .confirm-inline .confirm-btn.yes {
      background: var(--error-color, #db4437);
      color: #fff;
    }

    .confirm-inline .confirm-btn.no {
      background: var(--divider-color, #e0e0e0);
      color: var(--primary-text-color);
    }

    /* Channel items */
    .channel-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      transition: background 0.15s;
    }

    .channel-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .channel-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
      color: var(--primary-color, #03a9f4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 16px;
      flex-shrink: 0;
    }

    .channel-info {
      flex: 1;
      overflow: hidden;
    }

    .channel-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .channel-idx {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-family: monospace;
    }

    .channel-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    /* Add channel button at bottom */
    .add-channel-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 12px 16px;
      padding: 10px 16px;
      border: 2px dashed var(--divider-color, #e0e0e0);
      border-radius: 8px;
      background: transparent;
      color: var(--primary-color, #03a9f4);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .add-channel-btn:hover {
      border-color: var(--primary-color, #03a9f4);
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.05);
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--secondary-text-color, #727272);
      text-align: center;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }

    /* Loading */
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: var(--secondary-text-color);
      font-size: 13px;
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

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
  }

  render() {
    return html`
      <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">Manage</span>
          <button class="close-btn" @click=${this._close}>✕</button>
        </div>

        <div class="tab-bar">
          <button
            class=${this._activeTab === 'contacts' ? 'active' : ''}
            @click=${() => this._switchTab('contacts')}>
            Contacts
          </button>
          <button
            class=${this._activeTab === 'channels' ? 'active' : ''}
            @click=${() => this._switchTab('channels')}>
            Channels
          </button>
        </div>

        ${this._activeTab === 'contacts'
          ? html`
              <div class="search-bar">
                <input
                  type="text"
                  placeholder="Search contacts..."
                  .value=${this._searchQuery}
                  @input=${(e: Event) => {
                    this._searchQuery = (e.target as HTMLInputElement).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Escape') this._close();
                  }}
                />
              </div>
            `
          : ''}

        <div class="list-area">
          ${this._loading
            ? html`<div class="loading-state">
                <div class="loading-spinner"></div>
                Loading...
              </div>`
            : this._activeTab === 'contacts'
              ? this._renderContacts()
              : this._renderChannels()}
        </div>
      </div>

      ${this._channelDialogOpen
        ? html`
            <meshcore-channel-dialog
              .open=${true}
              .hass=${this.hass}
              .entryId=${this.entryId}
              .narrow=${this.narrow}
              .editMode=${!!this._editingChannel}
              .initialChannelIdx=${this._editingChannel?.channel_idx ?? 0}
              .initialChannelName=${this._editingChannel?.name ?? ''}
              .availableIndices=${this._getAvailableIndices()}
              @channel-saved=${this._onChannelSaved}
              @close=${() => { this._channelDialogOpen = false; this._editingChannel = null; }}
            ></meshcore-channel-dialog>
          `
        : ''}
    `;
  }

  private _renderContacts() {
    const filtered = this._filterContacts();

    if (filtered.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
          <div class="empty-text">
            ${this._searchQuery ? 'No contacts found' : 'No contacts discovered'}
          </div>
        </div>
      `;
    }

    // Sort: added contacts first, then alphabetical
    const sorted = [...filtered].sort((a, b) => {
      if (a.added_to_node !== b.added_to_node) {
        return a.added_to_node ? -1 : 1;
      }
      return a.adv_name.localeCompare(b.adv_name);
    });

    return sorted.map((contact) => this._renderContactItem(contact));
  }

  private _renderContactItem(contact: Contact) {
    const avatar = contact.pubkey_prefix.substring(0, 2).toUpperCase();
    const isAdded = contact.added_to_node;
    const isConfirming = this._confirmingRemoveContact === contact.public_key;
    const isActing = this._actionInProgress === contact.public_key;

    return html`
      <div class="contact-item">
        <div class="contact-avatar">${avatar}</div>
        <div class="contact-info">
          <div class="contact-name">${contact.adv_name || 'Unknown'}</div>
          <div class="contact-meta">
            <span class="contact-prefix">${contact.pubkey_prefix}</span>
            <span class="badge ${isAdded ? 'added' : 'discovered'}">
              ${isAdded ? html`<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="vertical-align: -1px; margin-right: 2px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Added` : 'Discovered'}
            </span>
          </div>
        </div>
        ${isConfirming
          ? html`
              <div class="confirm-inline">
                <span class="confirm-text">Remove?</span>
                <button class="confirm-btn yes" @click=${() => this._doRemoveContact(contact)}>Yes</button>
                <button class="confirm-btn no" @click=${() => { this._confirmingRemoveContact = null; }}>No</button>
              </div>
            `
          : isAdded
            ? html`
                <button
                  class="action-btn remove"
                  ?disabled=${isActing}
                  @click=${() => { this._confirmingRemoveContact = contact.public_key; }}>
                  ${isActing ? '...' : 'Remove'}
                </button>
              `
            : html`
                <button
                  class="action-btn add"
                  ?disabled=${isActing}
                  @click=${() => this._doAddContact(contact)}>
                  ${isActing ? '...' : html`<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: -1px; margin-right: 4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Add`}
                </button>
              `}
      </div>
    `;
  }

  private _renderChannels() {
    if (this._channels.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-icon">#</div>
          <div class="empty-text">No channels configured</div>
        </div>
        <button class="add-channel-btn" @click=${this._openAddChannel}>
          + Add Channel
        </button>
      `;
    }

    const isConfirming = this._confirmingRemoveChannel;

    return html`
      ${this._channels.map((channel) => {
        const confirming = isConfirming === channel.channel_idx;
        const isActing = this._actionInProgress === `ch-${channel.channel_idx}`;

        return html`
          <div class="channel-item">
            <div class="channel-icon">#</div>
            <div class="channel-info">
              <div class="channel-name">${channel.name}</div>
              <div class="channel-idx">Index ${channel.channel_idx}</div>
            </div>
            ${confirming
              ? html`
                  <div class="confirm-inline">
                    <span class="confirm-text">Remove?</span>
                    <button class="confirm-btn yes" @click=${() => this._doRemoveChannel(channel)}>Yes</button>
                    <button class="confirm-btn no" @click=${() => { this._confirmingRemoveChannel = null; }}>No</button>
                  </div>
                `
              : html`
                  <div class="channel-actions">
                    <button
                      class="action-btn"
                      ?disabled=${isActing}
                      @click=${() => this._openEditChannel(channel)}>
                      Edit
                    </button>
                    <button
                      class="action-btn remove"
                      ?disabled=${isActing}
                      @click=${() => { this._confirmingRemoveChannel = channel.channel_idx; }}>
                      ${isActing ? '...' : 'Remove'}
                    </button>
                  </div>
                `}
          </div>
        `;
      })}
      <button class="add-channel-btn" @click=${this._openAddChannel}>
        + Add Channel
      </button>
    `;
  }

  // ─── Data Loading ──────────────────────────────────────────────────

  private async _loadData() {
    if (!this.hass) return;
    this._loading = true;
    try {
      const [contacts, channels] = await Promise.all([
        getContacts(this.hass, this.entryId),
        getChannels(this.hass, this.entryId),
      ]);
      this._contacts = contacts;
      this._channels = channels;
      try {
        const deviceConfig = await getDeviceConfig(this.hass!, this.entryId);
        if (deviceConfig?.max_channels) {
          this._maxChannels = deviceConfig.max_channels;
        }
      } catch {
        // Non-critical — fall back to default max_channels
      }
    } finally {
      this._loading = false;
    }
  }

  // ─── Tab Switching ─────────────────────────────────────────────────

  private _switchTab(tab: ManageTab) {
    this._activeTab = tab;
    this._searchQuery = '';
    this._confirmingRemoveContact = null;
    this._confirmingRemoveChannel = null;
  }

  // ─── Contact Actions ───────────────────────────────────────────────

  private _filterContacts(): Contact[] {
    if (!this._searchQuery) return this._contacts;
    const query = this._searchQuery.toLowerCase();
    return this._contacts.filter(
      (c) =>
        (c.adv_name || '').toLowerCase().includes(query) ||
        (c.pubkey_prefix || '').toLowerCase().includes(query),
    );
  }

  private async _doAddContact(contact: Contact) {
    if (!this.hass) return;
    this._actionInProgress = contact.public_key;
    try {
      const result = await addContact(
        this.hass,
        contact.public_key,
        contact.adv_name,
        this.entryId,
      );
      if (result.success) {
        // Refresh contacts list
        const contacts = await getContacts(this.hass, this.entryId);
        this._contacts = contacts;
        this.dispatchEvent(
          new CustomEvent('contacts-changed', { bubbles: true, composed: true }),
        );
      }
    } finally {
      this._actionInProgress = null;
    }
  }

  private async _doRemoveContact(contact: Contact) {
    if (!this.hass) return;
    this._confirmingRemoveContact = null;
    this._actionInProgress = contact.public_key;
    try {
      const result = await removeContact(
        this.hass,
        contact.public_key,
        this.entryId,
      );
      if (result.success) {
        const contacts = await getContacts(this.hass, this.entryId);
        this._contacts = contacts;
        this.dispatchEvent(
          new CustomEvent('contacts-changed', { bubbles: true, composed: true }),
        );
      }
    } finally {
      this._actionInProgress = null;
    }
  }

  // ─── Channel Actions ──────────────────────────────────────────────

  private _openAddChannel() {
    this._editingChannel = null;
    this._channelDialogOpen = true;
  }

  private _openEditChannel(channel: Channel) {
    this._editingChannel = channel;
    this._channelDialogOpen = true;
  }

  private _getAvailableIndices(): number[] {
    const usedIndices = new Set(this._channels.map((ch) => ch.channel_idx));
    const available: number[] = [];
    for (let i = 0; i < this._maxChannels; i++) {
      if (!usedIndices.has(i)) available.push(i);
    }
    return available;
  }

  private async _doRemoveChannel(channel: Channel) {
    if (!this.hass) return;
    this._confirmingRemoveChannel = null;
    this._actionInProgress = `ch-${channel.channel_idx}`;
    try {
      const result = await removeChannel(
        this.hass,
        channel.channel_idx,
        this.entryId,
      );
      if (result.success) {
        const channels = await getChannels(this.hass, this.entryId);
        this._channels = channels;
        this.dispatchEvent(
          new CustomEvent('channels-changed', { bubbles: true, composed: true }),
        );
      }
    } finally {
      this._actionInProgress = null;
    }
  }

  private async _onChannelSaved() {
    this._channelDialogOpen = false;
    this._editingChannel = null;
    if (this.hass) {
      const channels = await getChannels(this.hass, this.entryId);
      this._channels = channels;
      this.dispatchEvent(
        new CustomEvent('channels-changed', { bubbles: true, composed: true }),
      );
    }
  }

  // ─── Dialog Close ─────────────────────────────────────────────────

  private _close() {
    // Use 'manage-closed' instead of 'dialog-closed' to avoid colliding with
    // HA's quick-bar-mixin which listens for 'dialog-closed' and expects
    // e.detail.dialog to exist (causing TypeError when it's null).
    this.dispatchEvent(new CustomEvent('manage-closed', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-manage-dialog': ManageDialog;
  }
}
