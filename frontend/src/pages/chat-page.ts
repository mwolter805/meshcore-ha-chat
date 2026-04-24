import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, Contact, Channel } from '../types';
import { MessageStore } from '../chat/message-store';
import { buildRenderItems } from '../chat/message-parser';
import { discoverChannelEntity, discoverContactEntity } from '../chat/entity-resolver';
import { markConversationRead, sendDirectMessage, sendChannelMessage } from '../api';
import '../components/conversation-list';
import '../components/manage-dialog';
import '../components/message-bubble';
import '../components/message-search';

@customElement('meshcore-chat-page')
export class ChatPage extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: PanelConfig;
  @property({ type: Array }) conversations: Array<Contact | Channel> = [];
  @property({ type: String }) selectedId: string | null = null;
  @property({ type: Boolean }) narrow = false;
  @property({ type: Object }) unreadCounts: Record<string, number> = {};

  @state() private _messageStore: MessageStore | null = null;
  @state() private _inputText = '';
  @state() private _sending = false;
  @state() private _viewportNarrow = false;
  private _mediaQuery: MediaQueryList | null = null;
  private _mediaHandler: ((e: MediaQueryListEvent) => void) | null = null;
  @state() private _narrowShowMessages = false;
  @state() private _manageOpen = false;
  @state() private _searchOpen = false;
  @state() private _currentEntityId: string | null = null;
  @state() private _conversationResolved = false;
  @state() private _pendingScroll: 'bottom' | 'last-read' | null = null;
  private _scrollInFlight = false;
  private _scrollGuardUntil = 0;
  private _lastMessageCount = 0;
  /** Unread count captured at conversation selection time. Used at render time to place divider. */
  private _unreadCountAtSelection = 0;

  static styles = css`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .chat-layout {
      display: flex;
      width: 100%;
      height: 100%;
      gap: 0;
    }

    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--chat-bg);
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 12px;
      background: var(--chat-bg);
      position: relative;
    }

    .chat-container::-webkit-scrollbar {
      width: 6px;
    }

    .chat-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .chat-container::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .input-area {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 8px 12px 12px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
      background: var(--input-bg);
      flex-shrink: 0;
    }

    .input-area textarea {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--input-border);
      border-radius: 20px;
      background: var(--chat-bg);
      color: var(--primary-text-color);
      font-size: 14px;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 120px;
      min-height: 40px;
      line-height: 1.4;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .input-area textarea:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .input-area textarea::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    .input-area textarea:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .send-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      cursor: pointer;
      flex-shrink: 0;
      transition: opacity 0.15s, transform 0.15s;
    }

    .send-button:hover {
      opacity: 0.9;
    }

    .send-button:active {
      transform: scale(0.95);
    }

    .send-button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .send-button svg {
      width: 20px;
      height: 20px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
      padding: 32px 16px;
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
    }

    .error-state {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      color: var(--error-color, #db4437);
      font-size: 13px;
      background: rgba(219, 68, 55, 0.08);
      border-radius: 8px;
      margin: 8px 12px;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--secondary-text-color, #727272);
      font-size: 14px;
      gap: 8px;
    }

    .loading-older {
      display: flex;
      justify-content: center;
      padding: 12px;
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
      to {
        transform: rotate(360deg);
      }
    }

    .date-separator {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0 12px;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      font-weight: 500;
    }

    .date-separator::before,
    .date-separator::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--divider-color, #e0e0e0);
    }

    .unread-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 12px 0;
      color: var(--error-color, #db4437);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    .unread-divider::before,
    .unread-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--error-color, #db4437);
      opacity: 0.5;
    }

    .narrow-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, #fff);
      flex-shrink: 0;
    }

    .back-button {
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: var(--primary-color, #03a9f4);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .back-button:hover {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
    }

    .narrow-conv-name {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .narrow-full {
      width: 100% !important;
    }

    .narrow-list-only {
      width: 100% !important;
    }

    .narrow-list-only meshcore-conversation-list {
      width: 100% !important;
      flex-shrink: 1;
    }

    .chat-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .header-action-btn {
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
      font-size: 16px;
    }

    .header-action-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: var(--primary-text-color);
    }

    .search-panel {
      width: 300px;
      border-left: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, #fff);
      flex-shrink: 0;
      overflow: hidden;
    }
  `;

  /** Treat as narrow when HA says narrow OR when the viewport is < 600px wide. */
  private get _isNarrow(): boolean {
    return this.narrow || this._viewportNarrow;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.config && !this._messageStore) {
      this._messageStore = new MessageStore(this.config);
      this._messageStore.setOnChange(() => this.requestUpdate());
    }
    // Use matchMedia for reliable viewport-based narrow detection
    // 870px matches HA's own narrow threshold (companion app WebViews report wider CSS viewports)
    this._mediaQuery = window.matchMedia('(max-width: 870px)');
    this._viewportNarrow = this._mediaQuery.matches;
    this._mediaHandler = (e: MediaQueryListEvent) => {
      this._viewportNarrow = e.matches;
    };
    this._mediaQuery.addEventListener('change', this._mediaHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._messageStore) {
      this._messageStore.destroy();
      this._messageStore = null;
    }
    if (this._mediaQuery && this._mediaHandler) {
      this._mediaQuery.removeEventListener('change', this._mediaHandler);
      this._mediaQuery = null;
      this._mediaHandler = null;
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('hass') && this.hass && this._messageStore) {
      this._messageStore.setHass(this.hass);
    }
    if (changedProperties.has('config') && this.config && this._messageStore) {
      this._messageStore.setConfig(this.config);
    }
    if (changedProperties.has('selectedId')) {
      this._onConversationSelected();
    }
    // Auto-select first conversation in wide mode when conversations arrive
    if (changedProperties.has('conversations') && !this.selectedId && !this._isNarrow && this.conversations.length > 0) {
      const first = this.conversations[0];
      const isContact = 'pubkey_prefix' in first;
      this.selectedId = isContact
        ? (first as Contact).pubkey_prefix
        : String((first as Channel).channel_idx);
    }

    // Handle pending scroll after render — wait until the store finishes loading
    // so we scroll against a fully-rendered message list, not an empty container.
    if (this._pendingScroll) {
      const store = this._messageStore;
      const doneLoading = store && !store.loading;
      if (doneLoading && store.messages.length > 0) {
        this._executeScroll(this._pendingScroll);
        this._pendingScroll = null;
        // Sync message count so the auto-scroll branch below doesn't
        // re-trigger on the same batch of messages that just loaded.
        this._lastMessageCount = store.messages.length;
      } else if (doneLoading && store.messages.length === 0) {
        // No messages in this conversation — nothing to scroll to
        this._pendingScroll = null;
      }
      // else: still loading — keep _pendingScroll for the next update cycle
    } else if (this._messageStore) {
      // Auto-scroll to bottom when new messages arrive, but only if user is near bottom
      const currentCount = this._messageStore.messages.length;
      if (currentCount > this._lastMessageCount && this._lastMessageCount > 0) {
        this._scrollToBottomIfNearEnd();
        // New messages arrived while viewing — re-mark as read so badge stays clear
        this._markActiveRead(this._currentEntityId);
      }
      this._lastMessageCount = currentCount;
    }
  }

  render() {
    // Narrow mode: toggle between conversation list and messages
    if (this._isNarrow) {
      if (this._narrowShowMessages) {
        return html`
          <div class="chat-layout">
            <div class="chat-main narrow-full">
              <div class="narrow-header">
                <button class="back-button" @click=${() => (this._narrowShowMessages = false)}>← Back</button>
                <span class="narrow-conv-name">${this._getConversationName()}</span>
                <div class="chat-header-actions">
                  <button class="header-action-btn" title="Search messages" @click=${() => { this._searchOpen = !this._searchOpen; }}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>
                </div>
              </div>
              ${this._renderChatArea()}
            </div>
          </div>
        `;
      } else {
        return html`
          <div class="chat-layout narrow-list-only">
            <meshcore-conversation-list
              .conversations=${this.conversations}
              .activeId=${this.selectedId}
              .unreadCounts=${this.unreadCounts}
              @conversation-selected=${(e: CustomEvent) => {
                const newId = e.detail.id;
                if (newId === this.selectedId) {
                  // Re-selecting same conversation — clear stale divider and scroll to bottom
                  this._unreadCountAtSelection = 0;
                  this._pendingScroll = 'bottom';
                }
                this.selectedId = newId;
                this._narrowShowMessages = true;
              }}
              @manage-requested=${() => this._onManageRequested()}></meshcore-conversation-list>
            ${this._manageOpen ? html`
              <meshcore-manage-dialog
                .hass=${this.hass}
                .entryId=${this.config?.node_prefix}
                .narrow=${this.narrow}
                @manage-closed=${() => this._manageOpen = false}
                @contacts-changed=${this._onContactsChanged}
                @channels-changed=${this._onChannelsChanged}
              ></meshcore-manage-dialog>
            ` : html``}
          </div>
        `;
      }
    }

    // Wide mode: side-by-side
    return html`
      <div class="chat-layout">
        <meshcore-conversation-list
          .conversations=${this.conversations}
          .activeId=${this.selectedId}
          .unreadCounts=${this.unreadCounts}
          @conversation-selected=${(e: CustomEvent) => {
            const newId = e.detail.id;
            if (newId === this.selectedId) {
              // Re-selecting same conversation — clear stale divider and scroll to bottom
              this._unreadCountAtSelection = 0;
              this._pendingScroll = 'bottom';
            }
            this.selectedId = newId;
          }}
          @manage-requested=${() => this._onManageRequested()}></meshcore-conversation-list>
        <div class="chat-main">
          ${this.selectedId ? html`
            <div class="narrow-header" style="display: flex; align-items: center; padding: 8px 16px;">
              <div style="flex: 1; font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
                ${this._getConversationName()}
              </div>
              <div class="chat-header-actions">
                <button class="header-action-btn" title="Search messages" @click=${() => { this._searchOpen = !this._searchOpen; }}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>
              </div>
            </div>
          ` : ''}
          ${this._renderChatArea()}
        </div>
        ${this._searchOpen ? html`
          <div class="search-panel">
            <meshcore-message-search
              .hass=${this.hass}
              .entryId=${this.config?.node_prefix}
              .entityId=${this._currentEntityId || undefined}
              .meshNodeName=${this.config?.node_name}
              @result-selected=${this._onSearchResultSelected}
            ></meshcore-message-search>
          </div>
        ` : ''}
        ${this._manageOpen ? html`
          <meshcore-manage-dialog
            .hass=${this.hass}
            .entryId=${this.config?.node_prefix}
            .narrow=${this.narrow}
            @manage-closed=${() => this._manageOpen = false}
            @contacts-changed=${this._onContactsChanged}
            @channels-changed=${this._onChannelsChanged}
          ></meshcore-manage-dialog>
        ` : html``}
      </div>
    `;
  }

  private _renderChatArea() {
    if (!this._messageStore || !this.selectedId) {
      return html`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg></div>
          <div class="empty-text">Select a conversation to start</div>
          <div class="empty-subtext">Choose a channel or contact from the list</div>
        </div>
      `;
    }

    if (!this._conversationResolved) {
      return html`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
          <div class="empty-text">Conversation unavailable</div>
          <div class="empty-subtext">This contact may no longer be added to the node</div>
        </div>
      `;
    }

    const messages = this._messageStore.messages;
    const renderItems = buildRenderItems(messages, {
      group_messages: this.config?.group_messages ?? true,
      group_timeout: this.config?.group_timeout ?? 300,
      show_date_separators: this.config?.show_date_separators ?? true,
    });

    return html`
      <div class="chat-container" @reply-to-sender=${this._onReplyToSender} @scroll=${this._onChatScroll}>
        ${this._messageStore.loadingOlder
          ? html`<div class="loading-older"><div class="loading-spinner"></div></div>`
          : html``}
        ${this._messageStore.error
          ? html`
              <div class="error-state">
                <span><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg></span>
                <span>${this._messageStore.error}</span>
              </div>
            `
          : html``}
        ${this._messageStore.loading && messages.length === 0
          ? html`
              <div class="loading-state">
                <div class="loading-spinner"></div>
                Loading messages...
              </div>
            `
          : html``}
        ${renderItems.length === 0 && !this._messageStore.loading
          ? html`
              <div class="empty-state">
                <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg></div>
                <div class="empty-text">No messages yet</div>
                <div class="empty-subtext">Be the first to send a message!</div>
              </div>
            `
          : html``}
        ${this._renderItemsWithDivider(renderItems)}
      </div>
      <div class="input-area">
        <textarea
          placeholder="Type a message..."
          .value=${this._inputText}
          @input=${(e: Event) => {
            const ta = e.target as HTMLTextAreaElement;
            this._inputText = ta.value;
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              this._sendMessage();
            }
          }}
          ?disabled=${this._sending || !this.selectedId}></textarea>
        <button
          class="send-button"
          @click=${() => this._sendMessage()}
          ?disabled=${this._sending || !this.selectedId || !this._inputText.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16151496 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4429026 C0.994623095,2.0752101 0.837654326,3.00778453 1.15159189,3.98029867 L3.03521743,10.4212916 C3.03521743,10.5783889 3.19218622,10.7354863 3.50612381,10.7354863 L16.6915026,11.5209733 C16.6915026,11.5209733 17.1624089,11.5209733 17.1624089,12.0492776 C17.1624089,12.5775818 16.6915026,12.4744748 16.6915026,12.4744748 Z"/>
          </svg>
        </button>
      </div>
    `;
  }

  private _renderItemsWithDivider(renderItems: Array<any>) {
    const results: any[] = [];
    let messageIdx = 0;
    let dividerInserted = false;

    // Compute divider position at render time from captured unread count.
    // Count actual message render items (groups), not raw messages, since
    // messageIdx in the loop counts groups (date separators are skipped).
    let dividerAtMessageIdx: number | null = null;
    if (this._unreadCountAtSelection > 0) {
      const totalMessageItems = renderItems.filter(item => item.type !== 'date-separator').length;
      const idx = totalMessageItems - this._unreadCountAtSelection;
      dividerAtMessageIdx = idx >= 0 ? idx : 0;
    }

    for (const item of renderItems) {
      if (item.type === 'date-separator') {
        results.push(html`
          <div class="date-separator">
            <span>${item.label}</span>
          </div>
        `);
        continue;
      }

      // Insert unread divider before the first unread message
      if (!dividerInserted && dividerAtMessageIdx !== null && messageIdx === dividerAtMessageIdx) {
        results.push(html`
          <div class="unread-divider">
            <span>New messages</span>
          </div>
        `);
        dividerInserted = true;
      }

      results.push(html`
        <meshcore-message-bubble
          .group=${item.group}
          .timestampFormat=${this.config?.timestamp_format ?? 'relative'}></meshcore-message-bubble>
      `);
      messageIdx++;
    }

    return results;
  }

  private _onConversationSelected() {
    if (this.selectedId && this._messageStore && this.config && this.hass) {
      const conversation = this.conversations.find((c) => {
        if ('pubkey_prefix' in c) {
          return (c as Contact).pubkey_prefix === this.selectedId;
        }
        return String((c as Channel).channel_idx) === this.selectedId;
      });

      if (!conversation) {
        // Conversation not in the (filtered) list — clear the entity so
        // _renderChatArea shows the unavailable state and sending is blocked.
        this._conversationResolved = false;
        this._currentEntityId = null;
        if (this._messageStore) {
          this._messageStore.switchEntity(null);
        }
        return;
      }

      this._conversationResolved = true;
      const isContact = 'pubkey_prefix' in conversation;
      let entityId: string | null = null;

      if (isContact) {
        const prefix = (conversation as Contact).pubkey_prefix;
        entityId = discoverContactEntity(this.hass, this.config, prefix);
      } else {
        const idx = (conversation as Channel).channel_idx;
        entityId = discoverChannelEntity(this.hass, this.config, idx);
      }

      // entityId may be null if no messages exchanged yet — that's OK,
      // switchEntity(null) clears the message area
      this._currentEntityId = entityId;

      // Notify parent of active entity so it can suppress unread badge updates
      this.dispatchEvent(new CustomEvent('active-entity-changed', {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }));

      // Determine scroll behavior based on unread count
      const unreadCount = this._getUnreadCountForSelected();
      this._pendingScroll = unreadCount > 0 ? 'last-read' : 'bottom';
      this._unreadCountAtSelection = unreadCount;
      this._lastMessageCount = 0; // Reset so auto-scroll doesn't trigger during initial load

      this._messageStore.switchEntity(entityId);

      // Mark as read when switching to a conversation
      this._markActiveRead(entityId);
    }
  }

  private async _sendMessage() {
    if (this._sending || !this._inputText.trim() || !this.selectedId || !this.hass || !this.config) {
      return;
    }
    if (!this._conversationResolved) {
      console.warn('Cannot send — conversation not resolved');
      return;
    }

    this._sending = true;
    const text = this._inputText.trim();
    this._inputText = '';

    try {
      // Add optimistic message
      if (this._messageStore) {
        this._messageStore.addOptimisticMessage(this.config.node_name, text);
        // Always scroll to bottom after sending
        this._pendingScroll = 'bottom';
      }

      // Send via service
      if (this._isContact()) {
        await sendDirectMessage(this.hass, this.selectedId, text);
      } else {
        const idx = parseInt(this.selectedId, 10);
        if (isNaN(idx) || idx < 0 || idx > 255) {
          console.error('Invalid channel index:', this.selectedId);
          this._inputText = text;
          return;
        }
        await sendChannelMessage(this.hass, idx, text);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      this._inputText = text; // Restore text on error
    } finally {
      this._sending = false;
    }
  }

  /**
   * Mark the active conversation as read and notify the parent to clear the badge.
   * Safe to call frequently — the backend and parent both handle redundant calls.
   */
  private _markActiveRead(entityId: string | null): void {
    if (!entityId || !this.hass) return;
    markConversationRead(this.hass, entityId, this.config?.node_prefix).catch(() => {});
    this.dispatchEvent(new CustomEvent('unread-cleared', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Determine whether selectedId refers to a contact or a channel.
   * Channel IDs are small integers ("0", "1", …); contact IDs are hex pubkey
   * prefixes ("FE3AF5…").  Using the ID format is authoritative and does not
   * depend on the conversation being present in the (filtered) conversations
   * array — fixing the bug where an out-of-sync array caused DMs to be
   * routed as channel messages.
   */
  private _isContact(): boolean {
    if (!this.selectedId) return false;
    // Channel indices are purely numeric; anything else is a contact pubkey
    return !/^\d+$/.test(this.selectedId);
  }

  private _onManageRequested() {
    this._manageOpen = true;
  }

  private _onContactsChanged() {
    // Bubble up to parent to refresh conversation list
    this.dispatchEvent(new CustomEvent('contacts-changed', { bubbles: true, composed: true }));
  }

  private _onChannelsChanged() {
    // Bubble up to parent to refresh conversation list
    this.dispatchEvent(new CustomEvent('channels-changed', { bubbles: true, composed: true }));
  }

  private _onReplyToSender(e: CustomEvent) {
    const { mention } = e.detail;
    if (mention) {
      this._inputText = mention + this._inputText;
      this.requestUpdate();
    }
  }

  private _getConversationName(): string {
    if (!this.selectedId) return '';
    const conv = this.conversations.find((c) => {
      if ('pubkey_prefix' in c) return (c as Contact).pubkey_prefix === this.selectedId;
      return String((c as Channel).channel_idx) === this.selectedId;
    });
    if (!conv) return this.selectedId;
    return 'pubkey_prefix' in conv ? (conv as Contact).adv_name : (conv as Channel).name;
  }



  private _getChatContainer(): HTMLElement | null {
    return this.renderRoot?.querySelector('.chat-container') as HTMLElement | null;
  }

  private _isScrollGuarded(): boolean {
    return this._scrollInFlight || Date.now() < this._scrollGuardUntil;
  }

  private _executeScroll(mode: 'bottom' | 'last-read') {
    this._scrollInFlight = true;
    // Keep a time-based guard active for 2s to block any async scroll-to-bottom
    // that might fire from hass updates, polling re-fetches, etc.
    if (mode === 'last-read') {
      this._scrollGuardUntil = Date.now() + 2000;
    }
    this._doScrollWithRetry(mode, 0);
  }

  private _doScrollWithRetry(mode: 'bottom' | 'last-read', attempt: number) {
    // Wait for Lit render, then use double-rAF to ensure full layout
    this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = this._getChatContainer();
          if (!container) {
            this._scrollInFlight = false;
            return;
          }

          if (mode === 'bottom') {
            container.scrollTop = container.scrollHeight;
            this._scrollInFlight = false;
            return;
          }

          // 'last-read' mode: scroll the unread divider into view
          const divider = container.querySelector('.unread-divider') as HTMLElement | null;
          if (divider) {
            // Position the divider at the top of the visible area
            const containerRect = container.getBoundingClientRect();
            const dividerRect = divider.getBoundingClientRect();
            container.scrollTop += dividerRect.top - containerRect.top;
            this._scrollInFlight = false;
          } else if (attempt < 10) {
            // Divider not rendered yet — retry (up to ~500ms total)
            setTimeout(() => this._doScrollWithRetry(mode, attempt + 1), 50);
          } else {
            // Final fallback: scroll to bottom
            container.scrollTop = container.scrollHeight;
            this._scrollInFlight = false;
          }
        });
      });
    });
  }

  private _scrollToBottomIfNearEnd() {
    // Don't auto-scroll while a conversation-switch scroll is in progress
    if (this._isScrollGuarded()) return;
    this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        if (this._isScrollGuarded()) return;
        const container = this._getChatContainer();
        if (!container) return;
        // Only auto-scroll if user is within 100px of bottom
        const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distFromBottom < 100) {
          container.scrollTop = container.scrollHeight;
        }
      });
    });
  }

  private _onChatScroll(e: Event) {
    const container = e.target as HTMLElement;
    if (!container || !this._messageStore) return;

    // Trigger lazy loading when user scrolls near the top (within 150px)
    if (container.scrollTop < 150 && this._messageStore.hasOlderMessages && !this._messageStore.loadingOlder) {
      // Save scroll height before loading so we can preserve position
      const prevScrollHeight = container.scrollHeight;

      this._messageStore.loadOlderMessages().then(() => {
        // After older messages are prepended, adjust scroll to maintain position
        this.updateComplete.then(() => {
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            const addedHeight = newScrollHeight - prevScrollHeight;
            if (addedHeight > 0) {
              container.scrollTop += addedHeight;
            }
          });
        });
      });
    }
  }

  private _getUnreadCountForSelected(): number {
    if (!this.selectedId || !this.unreadCounts) return 0;
    // Check direct match on resolved entity_id first (most reliable)
    if (this._currentEntityId && this.unreadCounts[this._currentEntityId]) {
      return this.unreadCounts[this._currentEntityId];
    }
    // Fallback: match using entity naming patterns
    for (const [entityId, count] of Object.entries(this.unreadCounts)) {
      if (count <= 0) continue;
      if (/^\d+$/.test(this.selectedId)) {
        // Channel: match _ch_{idx}_messages
        if (entityId.endsWith(`_ch_${this.selectedId}_messages`)) return count;
      } else {
        // Contact: match _{first6chars}_messages
        const prefix6 = this.selectedId.substring(0, 6);
        if (entityId.endsWith(`_${prefix6}_messages`)) return count;
      }
    }
    return 0;
  }

  private _onSearchResultSelected(e: CustomEvent) {
    const { entityId, messageId, timestamp } = e.detail;
    // Find the conversation matching this entity and select it
    if (entityId && this._messageStore) {
      this._messageStore.switchEntity(entityId);
      this._currentEntityId = entityId;
    }
    // Scroll to and highlight the matched message
    if (messageId) {
      this._scrollToAndHighlight(messageId, timestamp);
    }
  }

  private _scrollToAndHighlight(messageId: string, timestamp?: string) {
    // Wait for render to complete then search shadow DOMs for the bubble
    this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        const found = this._findAndHighlightBubble(messageId);
        if (found) return;

        // Message not in DOM — fetch around its timestamp, then retry
        if (timestamp && this._messageStore) {
          this._messageStore.fetchAroundTimestamp(timestamp).then((added) => {
            if (!added) return;
            // Wait for the store change to trigger a re-render
            this.updateComplete.then(() => {
              requestAnimationFrame(() => {
                this._findAndHighlightBubble(messageId);
              });
            });
          });
        }
      });
    });
  }

  private _findAndHighlightBubble(messageId: string): boolean {
    const container = this.shadowRoot?.querySelector('.chat-container') as HTMLElement | null;
    if (!container) return false;

    const bubbleElements = container.querySelectorAll('meshcore-message-bubble');
    for (const bubbleEl of Array.from(bubbleElements)) {
      const target = bubbleEl.shadowRoot?.querySelector(`[data-msg-id="${messageId}"]`) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('search-highlight');
        setTimeout(() => target.classList.remove('search-highlight'), 2500);
        return true;
      }
    }
    return false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-chat-page': ChatPage;
  }
}
