import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, Contact, Channel } from '../types';
import { MessageStore } from '../chat/message-store';
import { UnreadController, pillLabel } from '../chat/unread-controller';
import { buildRenderItems } from '../chat/message-parser';
import { discoverChannelEntity, discoverContactEntity } from '../chat/entity-resolver';
import { sendDirectMessage, sendChannelMessage } from '../api';
import {
  AT_BOTTOM_THRESHOLD_PX,
  LAZY_LOAD_TRIGGER_PX,
} from '../constants';
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
  /**
   * The panel-owned `UnreadController`.
   * chat-page `subscribe`s to it in `connectedCallback` and
   * unsubscribes — but does NOT destroy it — in
   * `disconnectedCallback` (the controller outlives chat-page, which
   * is remounted on tab switch). The badge projection
   * (`_getUnreadCountForSelected`, and `<conversation-list>` via
   * `unread.counts` / `unread.badgeCount`) reads from it directly.
   */
  @property({ attribute: false }) unread!: UnreadController;
  /**
   * Per-entity "last-read" message-ID cursor map.
   * No longer parent-fed — mirrored from `unread.lastRead`
   * by the controller subscription (and an initial sync in
   * `connectedCallback`). Kept as a reactive property so the
   * late-arriving-`lastRead` re-anchor block in `updated()` still
   * sees `changedProperties.has('lastRead')`. Used by
   * `_onConversationSelected` to drive anchor-based open via
   * `MessageStore.switchEntity(entityId, anchor)`, and by
   * `_renderItemsWithDivider` to position the divider AFTER the
   * anchor message. (The read-progress machine that owns this lives
   * in the controller.)
   */
  @property({ type: Object }) lastRead: Record<string, string> = {};

  @state() private _messageStore: MessageStore | null = null;
  /** Unsubscribe handle for the `UnreadController` subscription. */
  private _unsubUnread: (() => void) | null = null;
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
  /**
   * The per-conversation read-progress machine — the anchor, the grace
   * window, the deferred post-switch mark-read timer, the mark-read
   * dedup guard, and the
   * `markReadFired` lifecycle — moved into `UnreadController`'s
   * `ReadProgress`. chat-page now drives it through `beginConversation`
   * / `endConversation` / `onScrollState` / `onPillJump` /
   * `maybeReanchorOnLateData` and reads the divider position via
   * `dividerAfterGroupIdx`. chat-page still owns the DOM facts
   * (`_isLastMessageVisible`, scroll geometry) and feeds their results
   * into the controller's gates.
   */

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
      /* Disable browser-level scroll anchoring. The lazy-load-older
       * path in _onChatScroll manually preserves scroll position by
       * adding the prepended content height to scrollTop. With the
       * default (overflow-anchor: auto), the browser ALSO shifts
       * scrollTop by the prepended height -- and the two
       * compensations stack, landing the viewport past the divider
       * at the new buffer tail. That misfires mark-read on channel
       * re-entry. See 2026-05-15 unread-clearing investigation. */
      overflow-anchor: none;
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

    /* "↓ N new" indicator. Shown when new messages
       arrived while scrolled away from the bottom OR when the buffer
       tail isn't yet the conversation's newest message. Click loads
       any unloaded newer messages, scrolls to bottom, and fires
       mark-read. Sticky-positioned at the bottom of the chat
       container so it sits above the input area while scrolled. */
    .new-messages-indicator {
      position: sticky;
      bottom: 12px;
      /* 'align-self: center' requires a flex parent (chat-
         container is 'display: block'); 'margin: 0 auto' requires a
         block-level element with finite width (button defaults to
         'inline-block'). Both were no-ops. Using left + transform
         works with sticky positioning regardless of parent layout. */
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 14px;
      border: none;
      border-radius: 16px;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      transition: opacity 0.15s, transform 0.15s;
      z-index: 2;
    }

    .new-messages-indicator:hover {
      opacity: 0.92;
    }

    .new-messages-indicator:active {
      /* Combine the centering transform with the press
         offset. A single 'transform' declaration replaces any prior
         one, so ':active' must restate both. */
      transform: translateX(-50%) translateY(1px);
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
    // Subscribe to the panel-owned UnreadController. Lit
    // commits property bindings before `connectedCallback` runs (same
    // as `this.config` above), so `this.unread` is available here.
    // The controller OUTLIVES chat-page — we subscribe here and
    // unsubscribe (but do NOT destroy) in `disconnectedCallback`.
    if (this.unread && !this._unsubUnread) {
      this._unsubUnread = this.unread.subscribe(() => {
        // Mirror `lastRead` so the late-arriving-anchor block
        // in `updated()` still sees `changedProperties.has('lastRead')`.
        // `ingestBackendData` rebuilds the controller's lastRead map
        // (fresh identity); `clearEntity` does not — so also force a
        // re-render explicitly to keep the badge projection live.
        this.lastRead = this.unread.lastRead;
        this.requestUpdate();
      });
      // The subscription only fires on FUTURE mutations — pull the
      // current cursor map in now so the first render is correct.
      this.lastRead = this.unread.lastRead;
      // Register the deferred post-switch re-check handler.
      // The controller owns the post-switch timer (in `ReadProgress`);
      // when it fires, it calls this handler, and chat-page —
      // owning the DOM facts — re-checks at-bottom via
      // `_checkAndMarkReadIfAtBottom`.
      this.unread.onPostSwitchTimerFire(() => this._checkAndMarkReadIfAtBottom());
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
    // Unsubscribe from the UnreadController — but do NOT
    // destroy it. It is panel-owned and outlives chat-page (chat-page
    // is remounted on every tab switch; the controller is not).
    if (this._unsubUnread) {
      this._unsubUnread();
      this._unsubUnread = null;
    }
    // Tear down the active conversation's read-progress state
    // — this clears the controller's deferred post-switch timer so it
    // cannot fire against a torn-down chat-page. The controller itself
    // is NOT destroyed (it outlives chat-page).
    this.unread?.endConversation();
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
      // When the panel-header entry switch lands a new
      // config here (entry_id changed), reset chat-page's derived
      // selection state so the user lands on the empty-state
      // placeholder for the new entry until they explicitly pick a
      // conversation.
      //
      // We must clear `this.selectedId = null` from the child here.
      // The parent (`meshcore-chat-panel.ts:_selectDevice`) clears
      // `_pendingChatTarget = null` simultaneously, but
      // `_pendingChatTarget` is normally already null — conversation-
      // list clicks set `chat-page.selectedId` directly without
      // writing back to the parent — and Lit's `.prop=` binding
      // elides null→null assignments (`===` check on the rendered
      // value). So a parent-side `_pendingChatTarget = null → null`
      // does NOT trigger the child's `selectedId` setter, leaving
      // the stale id (e.g., "0") in place against the new entry's
      // unresolved state. Result: `_renderChatArea` renders
      // "Conversation unavailable" instead of "Select a
      // conversation to start", and re-clicking the same id is a
      // no-op because `selectedId` didn't change. Clearing here is
      // safe because the parent's null is already in place — the
      // next parent re-render also re-binds null→null and is the
      // same no-op, so there's no bounce-back.
      const previousConfig = changedProperties.get('config') as PanelConfig | undefined;
      if (previousConfig && previousConfig.entry_id !== this.config.entry_id) {
        this.selectedId = null;
        this._currentEntityId = null;
        this._conversationResolved = false;
        this._pendingScroll = null;
        this._lastMessageCount = 0;
        // The anchor, the grace window, the deferred
        // post-switch timer, the mark-read dedup guard, and the
        // markReadFired lifecycle all live in the controller now —
        // `endConversation` tears the active conversation's
        // read-progress state down (and clears the deferred timer).
        this.unread.endConversation();
        this._messageStore.switchEntity(null);
        this.dispatchEvent(new CustomEvent('active-entity-changed', {
          detail: { entityId: null },
          bubbles: true,
          composed: true,
        }));
      }
    }
    if (changedProperties.has('selectedId')) {
      this._onConversationSelected();
    }
    // Late-arriving `lastRead` re-anchor. Handles the fresh-panel-load
    // / entry-switch-immediate-click race where the user picks a
    // conversation before `_loadUnreadCounts` has resolved. At click
    // time `_onConversationSelected` ran with an empty (or stale
    // entry's) `lastRead` map, so the controller captured a null
    // anchor and `_pendingScroll` fell through to 'bottom'. When the
    // data finally arrives (the controller's subscribe callback
    // mirrors `lastRead` here, triggering this `updated()` pass),
    // retroactively capture the anchor and re-execute the scroll.
    //
    // Collaboration, not absorption: chat-page keeps the gate it owns
    // — a conversation is
    // selected and resolved, and no `_pendingScroll` is already queued
    // (avoids racing the legitimate first-render scroll). The
    // controller owns the half it can answer authoritatively (the
    // anchor is still null, mark-read has not fired,
    // `lastRead[entity]` is now populated) inside
    // `maybeReanchorOnLateData`, which re-anchors and returns whether
    // it did. The pending-scroll executor below picks this up on this
    // same render pass.
    if (
      changedProperties.has('lastRead')
      && this._currentEntityId
      && this._conversationResolved
      && this._pendingScroll === null
    ) {
      if (this.unread.maybeReanchorOnLateData(this._currentEntityId)) {
        this._pendingScroll = 'last-read';
      }
    }
    // The auto-select-first-conversation branch was removed entirely.
    // Every entry-point
    // into the chat tab — initial panel mount, switching from another
    // tab back to chat (chat-page is unmounted/remounted on tab
    // switch, so each visit starts fresh), and entry switches via
    // the device dropdown — lands on the "Select a conversation to
    // start" empty-state placeholder. The user explicitly picks
    // from the conversation list. Removing the auto-select makes
    // entry-point behavior uniform and eliminates the entire class
    // of races where lastRead/unreadCounts may not yet be loaded
    // when an automatic selection happens.

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
      // New messages arriving doesn't auto-mark-read anymore.
      // _scrollToBottomIfNearEnd is gated on !hasNewerMessages and
      // user-was-at-bottom; it fires _checkAndMarkReadIfAtBottom itself
      // when it actually performs the scroll.
      const currentCount = this._messageStore.messages.length;
      if (currentCount > this._lastMessageCount && this._lastMessageCount > 0) {
        this._scrollToBottomIfNearEnd();
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
                  <button class="header-action-btn" title="Search messages" aria-label="Search messages" @click=${() => { this._searchOpen = !this._searchOpen; }}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>
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
              .unread=${this.unread}
              .unreadCounts=${this.unread.counts}
              .nodePrefix=${this.config?.node_prefix || null}
              @conversation-selected=${(e: CustomEvent) => {
                const newId = e.detail.id;
                if (newId === this.selectedId) {
                  // Re-selecting same conversation — clear stale divider and scroll to bottom
                  this.unread.resetUnreadCountAtSelection();
                  this._pendingScroll = 'bottom';
                }
                this.selectedId = newId;
                this._narrowShowMessages = true;
              }}
              @manage-requested=${() => this._onManageRequested()}></meshcore-conversation-list>
            ${this._manageOpen ? html`
              <meshcore-manage-dialog
                .hass=${this.hass}
                .entryId=${this.config?.entry_id}
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
          .unread=${this.unread}
          .unreadCounts=${this.unread.counts}
          .nodePrefix=${this.config?.node_prefix || null}
          @conversation-selected=${(e: CustomEvent) => {
            const newId = e.detail.id;
            if (newId === this.selectedId) {
              // Re-selecting same conversation — clear stale divider and scroll to bottom
              this.unread.resetUnreadCountAtSelection();
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
                <button class="header-action-btn" title="Search messages" aria-label="Search messages" @click=${() => { this._searchOpen = !this._searchOpen; }}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>
              </div>
            </div>
          ` : ''}
          ${this._renderChatArea()}
        </div>
        ${this._searchOpen ? html`
          <div class="search-panel">
            <meshcore-message-search
              .hass=${this.hass}
              .entryId=${this.config?.entry_id}
              .entityId=${this._currentEntityId || undefined}
              .meshNodeName=${this.config?.node_name}
              @result-selected=${this._onSearchResultSelected}
              @search-close=${() => { this._searchOpen = false; }}
            ></meshcore-message-search>
          </div>
        ` : ''}
        ${this._manageOpen ? html`
          <meshcore-manage-dialog
            .hass=${this.hass}
            .entryId=${this.config?.entry_id}
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
        ${this._renderNewMessagesIndicator()}
      </div>
      <div class="input-area">
        <textarea
          placeholder="Type a message..."
          aria-label="Message text. Press Enter to send, Shift+Enter for newline."
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
          aria-label="Send message"
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

    // Divider placement is a pure projection over the
    // controller's read-progress state. `dividerAfterGroupIdx` owns
    // both the anchor-driven path — with the "outgoing never counts"
    // suppression and the cross-entry send-then-switch fix folded in
    // (the divider lands above the first genuine INBOUND group past
    // the anchor, skipping the user's own trailing sends) — and the
    // count-based fallback for an absent / pruned anchor. chat-page
    // just consumes the resulting group index.
    const dividerAtMessageIdx = this.unread.dividerAfterGroupIdx(renderItems);

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

  /**
   * "↓ N new" indicator render.
   *
   * Visible when either (a) new realtime arrivals accumulated while the
   * user was scrolled away from the bottom, OR (b) the buffer tail
   * isn't yet the conversation's newest message (i.e., the user opened
   * with an anchor and there are unloaded newer messages on disk). In
   * case (b) the counter may be 0 — the indicator label falls back to
   * a bare "↓ new" so the user still has a visible affordance to jump
   * forward to current messages.
   */
  private _renderNewMessagesIndicator() {
    const store = this._messageStore;
    if (!store) return html``;
    const counter = store.newMessagesWhileAway;
    const hasNewer = store.hasNewerMessages;
    // Suppress the pill during a conversation-switch scroll-into-
    // place. Between buffer-populated and the queued scroll
    // executing, the chat container's `scrollTop` is at 0 (default
    // after re-render) so the last bubble appears below the
    // viewport — `_hasContentBelowViewport()` would return true and
    // the pill would briefly flash "↓ latest" (or "↓ unread") for
    // ~16-32 ms before the rAF-scheduled scroll lands. Two signals
    // identify this settling window:
    //   - `_pendingScroll !== null` — a scroll mode has been queued
    //     in `_onConversationSelected` and the executor in
    //     `updated()` will run it on the next pass once the buffer
    //     is loaded.
    //   - `_scrollInFlight === true` — `_executeScroll` has fired
    //     and `_doScrollWithRetry` is awaiting its updateComplete /
    //     rAF chain.
    // Either condition means viewport is not yet in its intended
    // position; the pill should hide until it settles.
    if (this._pendingScroll !== null || this._scrollInFlight) return html``;
    // Show the pill whenever any of three conditions hold:
    //   - realtime arrival accumulated while user was away from bottom
    //     (`counter > 0`),
    //   - unloaded newer messages exist on disk past the buffer tail
    //     (`hasNewer`),
    //   - the buffer is non-empty AND the last bubble is below the
    //     viewport (`hasContentBelow`) — the user does not currently
    //     see the latest message, so a "jump to current" affordance is
    //     useful. Whether that off-screen content is unread or already
    //     read is decided by the label logic below; the pill itself
    //     just provides the jump.
    const hasContentBelow = this._hasContentBelowViewport();
    // Label semantics:
    //   "↓ N new" — N realtime arrivals accumulated while the user was
    //               not at bottom (most precise; user knows exactly how
    //               many are waiting).
    //   "↓ unread" — there is actual unread content below the user's
    //                viewport: either unloaded newer messages on disk
    //                (`hasNewer`) OR within-buffer bubbles past the
    //                viewport that the cursor hasn't yet advanced past.
    //   "↓ latest" — the user has read everything currently known
    //                (cursor at conversation tail) but has scrolled up,
    //                so the pill is just a "jump to current" affordance.
    //                Avoids the misleading "↓ unread" label after
    //                mark_read fires.
    //   null       — nothing below the viewport (counter 0, no unloaded
    //                newer, last bubble visible) → suppress the pill.
    //
    // The label semantics are centralized in the pure
    // `pillLabel` helper, and the cursor-at-conversation-tail query is
    // the controller's `cursorAtTail` (reading the controller's
    // authoritative `_lastRead` map — the pill no longer consults
    // chat-page's `lastRead` mirror). `!hasNewer` (a `MessageStore`
    // fact, not controller state) stays a `pillLabel` input. The
    // render-state early returns above (`_pendingScroll` /
    // `_scrollInFlight`) cannot move into the pure helper.
    const label = pillLabel({
      counter,
      hasNewer,
      hasContentBelow,
      cursorAtTail: this.unread.cursorAtTail(
        this._currentEntityId,
        this._latestNonTempMessageId(),
      ),
    });
    if (label === null) return html``;
    return html`
      <button class="new-messages-indicator" @click=${this._jumpToBottom}>
        ${label}
      </button>
    `;
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

      // Determine open behaviour.
      //
      // Anchor-driven open: when we have a persisted last-read cursor
      // for this entity, hand it to the MessageStore so it routes
      // through `meshcore_chat/get_messages_around` instead of the
      // newest-50 path. The divider then renders AFTER the anchor in
      // `_renderItemsWithDivider`, and `_doScrollWithRetry`
      // scrolls the divider to viewport top — landing the user with
      // the previously-seen newest message at the top and the unread
      // band flowing down below it.
      //
      // Fallback to the unread-count divider when no
      // anchor is available (fresh install / never marked read on this
      // entity).
      const unreadCount = this._getUnreadCountForSelected();
      const anchor = (entityId && this.lastRead?.[entityId]) || null;
      // Use 'last-read' scroll mode when EITHER the anchor or the
      // unread count is available — both the anchor-driven and the
      // count-based branch of the controller's `dividerAfterGroupIdx`
      // can produce a divider for that mode.
      this._pendingScroll = (anchor || unreadCount > 0) ? 'last-read' : 'bottom';
      this._lastMessageCount = 0; // Reset so auto-scroll doesn't trigger during initial load

      // Hand the read-progress machine to the controller.
      // `beginConversation` captures the anchor from the controller's
      // own `lastRead` map, snapshots the unread count chat-page just
      // computed (the divider's count-based fallback needs it), arms
      // the grace window, and arms the deferred post-switch
      // re-check timer — cancelling any prior conversation's timer
      // first, so a quick conversation flip doesn't double-fire.
      //
      // NO eager mark-read here. Mark-read fires only from the
      // scroll-driven `onScrollState` (via `_checkAndMarkReadIfAtBottom`),
      // the controller's deferred post-switch timer, or the "↓ N new"
      // pill's `onPillJump` (via `_jumpToBottom`).
      this.unread.beginConversation(entityId, unreadCount);
      this._messageStore.switchEntity(entityId, anchor);
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

      // Send via service.
      // Thread the selected entry's id
      // through so upstream `meshcore.send_*` routes to the right
      // coordinator. Without entry_id, the upstream service sends from
      // whichever coordinator is iterated first in `hass.data[meshcore]`.
      const entryId = this.config?.entry_id;
      if (this._isContact()) {
        await sendDirectMessage(this.hass, this.selectedId, text, entryId);
      } else {
        const idx = parseInt(this.selectedId, 10);
        if (isNaN(idx) || idx < 0 || idx > 255) {
          console.error('Invalid channel index:', this.selectedId);
          this._inputText = text;
          return;
        }
        await sendChannelMessage(this.hass, idx, text, entryId);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      this._inputText = text; // Restore text on error
    } finally {
      this._sending = false;
    }
  }

  /**
   * Newest non-temporary buffer message id, or null if the buffer is
   * empty / contains only rt_/optimistic entries. Mirrors the cursor
   * the backend's `mark_read` would advance to: the backend's
   * `ws_mark_read` calls `store.get_messages(entity_id, limit=1)`
   * which returns the chronologically-newest STORED message — `rt_*`
   * and `optimistic_*` placeholders never reach the store. Passed into
   * the controller's mark-read mutators as the buffer-tail dedup key.
   */
  private _latestNonTempMessageId(): string | null {
    const messages = this._messageStore?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const id = messages[i].id;
      if (!id.startsWith('rt_') && !id.startsWith('optimistic_')) {
        return id;
      }
    }
    return null;
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

  /**
   * Auto-scroll-on-new-message.
   *
   * Gated on BOTH `!hasNewerMessages` AND user-was-at-bottom — we never
   * auto-jump to the bottom when there are unloaded newer messages
   * (the visual jump would skip past whatever the user was reading
   * mid-buffer). When auto-scroll fires, we also call
   * `_checkAndMarkReadIfAtBottom` so the cursor advances naturally as
   * each new message arrives while the user is at the tail.
   */
  private _scrollToBottomIfNearEnd() {
    // Don't auto-scroll while a conversation-switch scroll is in progress
    if (this._isScrollGuarded()) return;
    const store = this._messageStore;
    // Skip auto-scroll when buffer tail isn't the
    // conversation's newest.
    if (store?.hasNewerMessages) return;
    this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        if (this._isScrollGuarded()) return;
        const container = this._getChatContainer();
        if (!container) return;
        // Only auto-scroll if user is within AT_BOTTOM_THRESHOLD_PX of bottom
        const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distFromBottom < AT_BOTTOM_THRESHOLD_PX) {
          container.scrollTop = container.scrollHeight;
          this._checkAndMarkReadIfAtBottom();
        }
      });
    });
  }

  /**
   * Unified scroll handler.
   *
   * Three responsibilities on every scroll event:
   *   (i) Lazy-load older messages near top (within
   *       LAZY_LOAD_TRIGGER_PX). Preserves scroll position by
   *       compensating for the added height after the new messages
   *       are prepended.
   *   (ii) Lazy-load newer messages near bottom when
   *       `hasNewerMessages` is true. No scroll correction needed —
   *       newer messages append to the tail.
   *   (iii) Viewport-based mark-read: when near bottom AND
   *       `!hasNewerMessages` (the user has the chronologically
   *       newest message in view), call
   *       `_checkAndMarkReadIfAtBottom`. The grace period
   *       suppresses the FIRST auto-mark-read after each conversation
   *       switch.
   *
   * Also keeps `MessageStore.setUserAtBottom(...)` synchronized with
   * the viewport every event — the store uses that flag to decide
   * whether incoming realtime messages should tick the indicator
   * counter or fire mark-read directly.
   */
  private _onChatScroll(e: Event) {
    const container = e.target as HTMLElement;
    const store = this._messageStore;
    if (!container || !store) return;

    const distFromTop = container.scrollTop;
    const distFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distFromBottom < AT_BOTTOM_THRESHOLD_PX;

    // (iii) prerequisite — keep the store's at-bottom flag synchronized
    // with the viewport on every event. The store's counter logic
    // (counter reset on transition to at-bottom while caught up) and the
    // realtime path (decide whether to tick the indicator counter or
    // fire mark-read) both depend on this flag being current.
    store.setUserAtBottom(atBottom);

    // (i) Lazy-load older messages near top.
    //
    // The `!_isScrollGuarded()` gate is critical for the
    // conversation-switch flow. After `_fetchAroundAnchor` resolves,
    // Lit re-renders the chat container with the new buffer and
    // `scrollTop` resets to 0. A scroll event fires here BEFORE
    // `_doScrollWithRetry` has a chance to position the divider
    // (it runs inside a queued rAF). `distFromTop` reads as 0 → the
    // gate would fire lazy-load prematurely, the prepend + manual
    // `scrollTop += addedHeight` compensation races against the
    // in-flight scroll-to-divider, and the viewport ends up at the
    // new buffer tail instead of at the divider (with mark-read
    // auto-firing for a position the user never engaged with).
    // The scroll-guard window (set by `_executeScroll('last-read')`
    // to +2000ms, plus `_scrollInFlight: true` while the retry runs)
    // suppresses lazy-load through the entire conversation-switch
    // settle, and the divider lands correctly. After the window,
    // user-driven scroll-near-top triggers lazy-load normally.
    if (
      distFromTop < LAZY_LOAD_TRIGGER_PX &&
      store.hasOlderMessages &&
      !store.loadingOlder &&
      !this._isScrollGuarded()
    ) {
      const prevScrollHeight = container.scrollHeight;
      store.loadOlderMessages().then(() => {
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

    // Near-bottom branch: either lazy-load newer (buffer tail not
    // current) or fire mark-read (buffer tail is current).
    if (atBottom) {
      if (store.hasNewerMessages && !store.loadingNewer) {
        // (ii) Append newer messages — no scroll correction needed.
        store.loadNewerMessages();
      } else if (!store.hasNewerMessages) {
        // (iii) Buffer tail IS the conversation's newest message.
        this._checkAndMarkReadIfAtBottom();
      }
    }
  }

  /**
   * Geometric "last message visible" check.
   *
   * Replaces an earlier pixel-distance check
   * (`distFromBottom < AT_BOTTOM_THRESHOLD_PX = 150`) inside the
   * mark-read trigger. 150 px is roughly 1-2 message-bubble heights,
   * so the user could be that far above the actual newest message
   * and still trigger mark-read prematurely (a many-unread conversation
   * could be marked read with the latest message still off-screen).
   *
   * The intended mark-read semantics are "user has
   * the chronologically newest message visible." This helper checks
   * exactly that by comparing the last `meshcore-message-bubble`'s
   * bottom edge against the chat container's bottom edge. 5 px slack
   * absorbs sub-pixel rounding from getBoundingClientRect.
   *
   * `AT_BOTTOM_THRESHOLD_PX = 150` is unchanged for `setUserAtBottom`
   * and lazy-load-newer triggering — those are coarser concerns where
   * pixel-perfect bottom detection isn't required (and is in fact
   * unhelpful for the lazy-load-newer case, where you want to start
   * fetching before the user hits the literal bottom).
   */
  private _isLastMessageVisible(): boolean {
    const container = this._getChatContainer();
    if (!container) return false;
    const bubbles = container.querySelectorAll('meshcore-message-bubble');
    const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
    if (!last) return false;
    const containerBottom = container.getBoundingClientRect().bottom;
    const lastBottom = last.getBoundingClientRect().bottom;
    return lastBottom <= containerBottom + 5;
  }

  /**
   * The pill should show whenever the chronologically-newest message
   * is below the viewport, regardless of whether the conversation has
   * ever had unread on this visit. The label
   * (`_renderNewMessagesIndicator`) decides whether that off-screen
   * content is "↓ N new" (realtime arrivals while away), "↓ unread"
   * (actual unread past the cursor), or "↓ latest" (read everything
   * but scrolled up).
   *
   * Returns true when:
   *   - the buffer is non-empty (there is content to scroll TO), AND
   *   - the buffer's last bubble is below the viewport bottom (the
   *     user does not currently see the latest message).
   *
   * Returns false when the buffer is empty (nothing to indicate) or
   * the last bubble is within the viewport (user is at or near the
   * conversation tail — no jump-to-current affordance needed).
   *
   * Earlier iterations gated this on the unread-divider element
   * existing. That excluded the case where a conversation has never
   * had unread on this visit (no divider rendered) but the user has
   * scrolled up and would benefit from a visible "↓ latest" pill.
   */
  private _hasContentBelowViewport(): boolean {
    const container = this._getChatContainer();
    if (!container) return false;
    const messageCount = this._messageStore?.messages.length ?? 0;
    if (messageCount === 0) return false;
    return !this._isLastMessageVisible();
  }

  /**
   * Viewport-based mark-read trigger — chat-page's side.
   *
   * chat-page owns the DOM facts; it gathers them here
   * (`_isLastMessageVisible`, the MessageStore's `hasNewerMessages`,
   * the non-temp buffer tail id) and feeds them into the controller's
   * `onScrollState`. The controller owns the gates: entity match, the
   * grace window, the `hasNewerMessages` defensive gate, the
   * last-message-visible gate, and the buffer-tail dedup.
   *
   * Called from the scroll handler (`_onChatScroll`), the auto-scroll
   * path (`_scrollToBottomIfNearEnd`), and the controller's deferred
   * post-switch re-check timer (registered via `onPostSwitchTimerFire`).
   * On a true return — a mark-read was emitted — reset the "↓ N new"
   * indicator counter, since the user is now caught up.
   */
  private _checkAndMarkReadIfAtBottom(): void {
    const store = this._messageStore;
    if (!this._currentEntityId || !store) return;
    const fired = this.unread.onScrollState({
      entityId: this._currentEntityId,
      lastMessageVisible: this._isLastMessageVisible(),
      hasNewerMessages: store.hasNewerMessages,
      bufferTailId: this._latestNonTempMessageId(),
    });
    if (fired) store.resetNewMessagesCounter();
  }

  /**
   * "↓ N new" indicator click handler.
   *
   * Loads any unloaded newer messages (50 at a time) until the
   * MessageStore reports `hasNewerMessages === false`, then scrolls
   * to the bottom of the buffer and routes through the controller's
   * `onPillJump` so the cursor advances.
   *
   * `loadNewerMessages` itself is reentrance-guarded by `_loadingNewer`
   * — the `&& !store.loadingNewer` check in the loop is belt-and-
   * suspenders.
   */
  private async _jumpToBottom(): Promise<void> {
    const store = this._messageStore;
    if (!store) return;
    while (store.hasNewerMessages && !store.loadingNewer) {
      await store.loadNewerMessages();
    }
    await this.updateComplete;
    requestAnimationFrame(() => {
      const container = this._getChatContainer();
      if (!container) return;
      container.scrollTop = container.scrollHeight;
      if (!this._currentEntityId) return;
      // `onPillJump` bypasses the grace window — the user
      // explicitly clicked the indicator to jump to current, so
      // they're definitionally at the conversation tail (the loop
      // above drained `hasNewerMessages` and we just scrolled to the
      // buffer bottom). On a true return — mark-read emitted — reset
      // the "↓ N new" counter.
      const fired = this.unread.onPillJump({
        entityId: this._currentEntityId,
        bufferTailId: this._latestNonTempMessageId(),
      });
      if (fired) store.resetNewMessagesCounter();
    });
  }

  private _getUnreadCountForSelected(): number {
    if (!this.selectedId || !this.unread) return 0;
    // Unified badge projection. `badgeCount` folds in the
    // former direct-`_currentEntityId`-key fast path plus the shared
    // node_prefix-scoped pattern fallback (channel
    // matches require the node_prefix to avoid cross-entry
    // contamination on same-numbered channels; null node_prefix →
    // suffix-only match). One implementation now backs both this and
    // `conversation-list._getUnreadCount`.
    return this.unread.badgeCount(
      this.selectedId,
      this.config?.node_prefix ?? null,
      this._currentEntityId,
    );
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
