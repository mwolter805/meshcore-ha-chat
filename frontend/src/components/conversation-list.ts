import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, Channel } from '../types';
// manage-dialog is loaded by chat-page

type ChatFilter = 'all' | 'unread' | 'dms' | 'channels';

@customElement('meshcore-conversation-list')
export class ConversationList extends LitElement {
  @property({ type: Array }) conversations: Array<Contact | Channel> = [];
  @property({ type: String }) activeId: string | null = null;
  @property({ type: String }) searchQuery = '';
  @property({ type: Object }) unreadCounts: Record<string, number> = {};

  @state() private _activeFilter: ChatFilter = 'all';
  @state() private _filteredConversations: Array<Contact | Channel> = [];

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 280px;
      border-right: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, #fff);
      flex-shrink: 0;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 12px 0;
      gap: 8px;
    }

    .sidebar-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--primary-text-color);
      flex: 1;
    }

    .compose-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    .compose-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: var(--primary-text-color);
    }

    .sidebar-search {
      padding: 12px 12px 8px;
    }

    .sidebar-search input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border: 1px solid var(--input-border);
      border-radius: 20px;
      background: var(--input-bg);
      color: var(--primary-text-color);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .sidebar-search input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .sidebar-search input::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    .filter-bar {
      display: flex;
      padding: 4px 12px 8px;
      gap: 4px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      transition: opacity 0.2s;
    }

    .filter-bar.searching {
      opacity: 0.5;
      pointer-events: none;
    }

    .filter-btn {
      flex: 1;
      padding: 6px 4px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 16px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .filter-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    .filter-btn.active {
      background: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
      color: #fff;
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .conversation-list::-webkit-scrollbar {
      width: 6px;
    }

    .conversation-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .conversation-list::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .conversation-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      cursor: pointer;
      transition: background 0.15s;
    }

    .conversation-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .conversation-item.active {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
      border-left: 3px solid var(--primary-color, #03a9f4);
    }

    .conversation-avatar {
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

    .conversation-avatar.channel {
      background: var(--accent-color, #ff9800);
    }

    .conversation-info {
      flex: 1;
      overflow: hidden;
    }

    .conversation-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conversation-detail {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chevron {
      flex-shrink: 0;
      color: var(--secondary-text-color, #727272);
      font-size: 18px;
      line-height: 1;
      opacity: 0.5;
    }

    .unread-badge {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
      padding: 24px;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }
  `;

  updated(changedProperties: Map<string, unknown>) {
    if (
      changedProperties.has('conversations') ||
      changedProperties.has('searchQuery') ||
      changedProperties.has('_activeFilter')
    ) {
      this._updateFiltered();
    }
  }

  render() {
    const isSearching = this.searchQuery.length > 0;

    return html`
      <div class="sidebar-header">
        <span class="sidebar-title">Chats</span>
        <button
          class="compose-btn"
          title="Manage contacts & channels"
          @click=${() => this.dispatchEvent(new CustomEvent('manage-requested', { bubbles: true, composed: true }))}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
      </div>
      <div class="sidebar-search">
        <input
          type="text"
          placeholder="Search conversations..."
          .value=${this.searchQuery}
          @input=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            this.searchQuery = input.value;
          }} />
      </div>
      <div class="filter-bar ${isSearching ? 'searching' : ''}">
        ${this._renderFilterBtn('all', 'All')}
        ${this._renderFilterBtn('unread', 'Unread')}
        ${this._renderFilterBtn('dms', 'DMs')}
        ${this._renderFilterBtn('channels', 'Channels')}
      </div>
      <div class="conversation-list">
        ${this._filteredConversations.length > 0
          ? this._filteredConversations.map((conv) => this._renderConversation(conv))
          : html`
              <div class="empty-state">
                <div class="empty-text">
                  ${this._emptyMessage(isSearching)}
                </div>
              </div>
            `}
      </div>
    `;
  }

  private _renderFilterBtn(filter: ChatFilter, label: string) {
    return html`
      <button
        class="filter-btn ${this._activeFilter === filter ? 'active' : ''}"
        @click=${() => { this._activeFilter = filter; }}>
        ${label}
      </button>
    `;
  }

  private _emptyMessage(isSearching: boolean): string {
    if (isSearching) return 'No conversations found';
    switch (this._activeFilter) {
      case 'unread': return 'No unread conversations';
      case 'dms': return 'No direct messages';
      case 'channels': return 'No channels';
      default: return 'No conversations yet';
    }
  }

  private _renderConversation(conv: Contact | Channel) {
    const isContact = 'pubkey_prefix' in conv;
    const id = isContact ? (conv as Contact).pubkey_prefix : String((conv as Channel).channel_idx);
    const name = isContact ? (conv as Contact).adv_name : (conv as Channel).name;
    const detail = isContact ? (conv as Contact).pubkey_prefix : `Channel ${(conv as Channel).channel_idx}`;
    const avatar = isContact
      ? (conv as Contact).pubkey_prefix.substring(0, 2).toUpperCase()
      : `#${(conv as Channel).channel_idx}`;

    const isActive = this.activeId === id;

    return html`
      <div
        class=${isActive ? 'conversation-item active' : 'conversation-item'}
        @click=${() => this.dispatchEvent(
          new CustomEvent('conversation-selected', { detail: { id, isContact } }),
        )}>
        <div class="conversation-avatar ${isContact ? '' : 'channel'}">${avatar}</div>
        <div class="conversation-info">
          <div class="conversation-name">${name}</div>
          <div class="conversation-detail">${detail}</div>
        </div>
        ${this._getUnreadCount(id) > 0
          ? html`<div class="unread-badge">${this._getUnreadCount(id)}</div>`
          : html`<span class="chevron">›</span>`}
      </div>
    `;
  }

  private _getUnreadCount(id: string): number {
    // unreadCounts is keyed by entity_id (e.g., binary_sensor.meshcore_1ed4c1_ch_1_messages
    // or binary_sensor.meshcore_1ed4c1_fe3af5_messages).
    // Match using the specific entity suffix pattern to avoid false positives
    // (e.g., channel "1" matching inside any entity containing the digit "1").
    for (const [entityId, count] of Object.entries(this.unreadCounts)) {
      if (count <= 0) continue;
      // Channel: id is a numeric string like "1" → match _ch_1_messages
      if (/^\d+$/.test(id)) {
        if (entityId.endsWith(`_ch_${id}_messages`)) return count;
      } else {
        // Contact: id is a hex pubkey prefix (12 chars) → match _{first6}_messages
        const prefix6 = id.substring(0, 6);
        if (entityId.endsWith(`_${prefix6}_messages`)) return count;
      }
    }
    return 0;
  }

  private _updateFiltered() {
    const query = this.searchQuery.toLowerCase();

    // When searching, ignore the filter and search everything (matches MeshCoreOne behavior)
    if (query) {
      this._filteredConversations = this.conversations.filter((conv) => {
        const isContact = 'pubkey_prefix' in conv;
        const name = isContact ? (conv as Contact).adv_name : (conv as Channel).name;
        return name.toLowerCase().includes(query);
      });
      return;
    }

    // Apply category filter
    switch (this._activeFilter) {
      case 'all':
        this._filteredConversations = [...this.conversations];
        break;
      case 'unread':
        this._filteredConversations = this.conversations.filter((conv) => {
          const isContact = 'pubkey_prefix' in conv;
          const id = isContact ? (conv as Contact).pubkey_prefix : String((conv as Channel).channel_idx);
          return this._getUnreadCount(id) > 0;
        });
        break;
      case 'dms':
        this._filteredConversations = this.conversations.filter(
          (conv) => 'pubkey_prefix' in conv,
        );
        break;
      case 'channels':
        this._filteredConversations = this.conversations.filter(
          (conv) => !('pubkey_prefix' in conv),
        );
        break;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-conversation-list': ConversationList;
  }
}
