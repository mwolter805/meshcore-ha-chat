import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, Channel } from '../types';
// manage-dialog is loaded by chat-page

type ChatFilter = 'all' | 'unread' | 'dms' | 'channels';

@customElement('meshcore-conversation-list')
export class ConversationList extends LitElement {
  @property({ type: Array }) conversations: Array<Contact | Channel> = [];
  @property({ type: String }) activeId: string | null = null;
  @property({ type: Object }) unreadCounts: Record<string, number> = {};
  @property({ type: String }) nodePrefix: string | null = null;

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

    .filter-bar {
      display: flex;
      padding: 12px 12px 8px;
      gap: 4px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
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
      outline: none;
    }

    .conversation-item:hover,
    .conversation-item:focus-visible {
      background: rgba(0, 0, 0, 0.02);
    }

    .conversation-item:focus-visible {
      outline: 2px solid var(--primary-color, #03a9f4);
      outline-offset: -2px;
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
      changedProperties.has('_activeFilter')
    ) {
      this._updateFiltered();
    }
  }

  render() {
    return html`
      <div class="sidebar-header">
        <span class="sidebar-title">Chats</span>
        <button
          class="compose-btn"
          title="Manage contacts & channels"
          aria-label="Manage contacts and channels"
          @click=${() => this.dispatchEvent(new CustomEvent('manage-requested', { bubbles: true, composed: true }))}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
      <div class="filter-bar" role="tablist" aria-label="Conversation filter">
        ${this._renderFilterBtn('all', 'All')}
        ${this._renderFilterBtn('unread', 'Unread')}
        ${this._renderFilterBtn('dms', 'DMs')}
        ${this._renderFilterBtn('channels', 'Channels')}
      </div>
      <div
        class="conversation-list"
        role="listbox"
        aria-label="Conversations"
        @keydown=${this._onListKeyDown}>
        ${this._filteredConversations.length > 0
          ? this._filteredConversations.map((conv, idx) => this._renderConversation(conv, idx))
          : html`
              <div class="empty-state">
                <div class="empty-text">
                  ${this._emptyMessage()}
                </div>
              </div>
            `}
      </div>
    `;
  }

  /**
   * Phase 5 Q13: arrow-key navigation between conversation rows. Each
   * row is a focusable role="option" (see _renderConversation); arrow
   * keys move focus, Enter/Space selects, Home/End jump to ends.
   */
  private _onListKeyDown(e: KeyboardEvent) {
    const key = e.key;
    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'Home' &&
      key !== 'End' &&
      key !== 'Enter' &&
      key !== ' '
    ) {
      return;
    }

    const root = this.shadowRoot;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('.conversation-item'),
    );
    if (items.length === 0) return;

    const current = root.activeElement as HTMLElement | null;
    let idx = current ? items.indexOf(current) : -1;

    if (key === 'Enter' || key === ' ') {
      if (current && idx >= 0) {
        e.preventDefault();
        current.click();
      }
      return;
    }

    e.preventDefault();
    if (key === 'Home') {
      idx = 0;
    } else if (key === 'End') {
      idx = items.length - 1;
    } else if (key === 'ArrowDown') {
      idx = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
    } else if (key === 'ArrowUp') {
      idx = idx < 0 ? items.length - 1 : Math.max(idx - 1, 0);
    }

    items[idx]?.focus();
  }

  private _renderFilterBtn(filter: ChatFilter, label: string) {
    const active = this._activeFilter === filter;
    return html`
      <button
        class="filter-btn ${active ? 'active' : ''}"
        role="tab"
        aria-selected=${active ? 'true' : 'false'}
        @click=${() => { this._activeFilter = filter; }}>
        ${label}
      </button>
    `;
  }

  private _emptyMessage(): string {
    switch (this._activeFilter) {
      case 'unread': return 'No unread conversations';
      case 'dms': return 'No direct messages';
      case 'channels': return 'No channels';
      default: return 'No conversations yet';
    }
  }

  private _renderConversation(conv: Contact | Channel, listIdx: number) {
    const isContact = 'pubkey_prefix' in conv;
    const id = isContact ? (conv as Contact).pubkey_prefix : String((conv as Channel).channel_idx);
    const name = isContact ? (conv as Contact).adv_name : (conv as Channel).name;
    const detail = isContact ? (conv as Contact).pubkey_prefix : `Channel ${(conv as Channel).channel_idx}`;
    const avatar = isContact
      ? (conv as Contact).pubkey_prefix.substring(0, 2).toUpperCase()
      : `#${(conv as Channel).channel_idx}`;

    const isActive = this.activeId === id;

    const unread = this._getUnreadCount(id);
    const ariaLabel = unread > 0
      ? `${name}, ${detail}, ${unread} unread`
      : `${name}, ${detail}`;

    // Roving tabindex: exactly one item in the list is the Tab stop.
    // Prefer the active item; if nothing is active, the first row.
    const hasActiveInList = this._filteredConversations.some(
      (c) =>
        ('pubkey_prefix' in c
          ? (c as Contact).pubkey_prefix
          : String((c as Channel).channel_idx)) === this.activeId,
    );
    const isTabStop = isActive || (!hasActiveInList && listIdx === 0);

    return html`
      <div
        class=${isActive ? 'conversation-item active' : 'conversation-item'}
        role="option"
        tabindex=${isTabStop ? '0' : '-1'}
        aria-selected=${isActive ? 'true' : 'false'}
        aria-label=${ariaLabel}
        @click=${() => this.dispatchEvent(
          new CustomEvent('conversation-selected', { detail: { id, isContact } }),
        )}>
        <div class="conversation-avatar ${isContact ? '' : 'channel'}">${avatar}</div>
        <div class="conversation-info">
          <div class="conversation-name">${name}</div>
          <div class="conversation-detail">${detail}</div>
        </div>
        ${unread > 0
          ? html`<div class="unread-badge" aria-hidden="true">${unread}</div>`
          : html`<span class="chevron" aria-hidden="true">›</span>`}
      </div>
    `;
  }

  private _getUnreadCount(id: string): number {
    // unreadCounts is keyed by entity_id (e.g., binary_sensor.meshcore_1ed4c1_ch_1_messages
    // or binary_sensor.meshcore_1ed4c1_fe3af5_messages).
    // Match using the specific entity suffix pattern to avoid false positives
    // (e.g., channel "1" matching inside any entity containing the digit "1").
    //
    // Phase 4 (F-B): Channel matches additionally require the entry's
    // pubkey-prefix segment; otherwise same-named channels on different
    // upstream entries cross-contaminate (e.g., entry A's #test count
    // appearing on entry B's #test). When nodePrefix is null (single-
    // entry installs, or initial render before config arrives), fall
    // back to the suffix-only match for backwards compatibility.
    const channelNeedle = this.nodePrefix
      ? `meshcore_${this.nodePrefix}_ch_${id}_messages`
      : null;
    for (const [entityId, count] of Object.entries(this.unreadCounts)) {
      if (count <= 0) continue;
      // Channel: id is a numeric string like "1" → match _ch_1_messages
      if (/^\d+$/.test(id)) {
        if (channelNeedle) {
          if (entityId.endsWith(channelNeedle)) return count;
        } else if (entityId.endsWith(`_ch_${id}_messages`)) {
          return count;
        }
      } else {
        // Contact: id is a hex pubkey prefix (12 chars) → match _{first6}_messages.
        // Contact pubkey prefixes are globally unique across entries,
        // so node_prefix scoping is unnecessary here.
        const prefix6 = id.substring(0, 6);
        if (entityId.endsWith(`_${prefix6}_messages`)) return count;
      }
    }
    return 0;
  }

  private _updateFiltered() {
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
