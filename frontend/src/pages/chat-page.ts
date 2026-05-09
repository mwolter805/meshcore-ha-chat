import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, PanelConfig, Contact, Channel, ChatMessage } from '../types';
import { MessageStore } from '../chat/message-store';
import { buildRenderItems } from '../chat/message-parser';
import { discoverChannelEntity, discoverContactEntity } from '../chat/entity-resolver';
import { markConversationRead, sendDirectMessage, sendChannelMessage } from '../api';
import {
  AT_BOTTOM_THRESHOLD_PX,
  LAZY_LOAD_TRIGGER_PX,
  MARK_READ_GRACE_PERIOD_MS,
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
  @property({ type: Object }) unreadCounts: Record<string, number> = {};
  /**
   * Phase 4 (Change 9): per-entity "last-read" message-ID cursor map,
   * sourced from the backend's `meshcore_chat/get_unread_counts`
   * payload. Used by `_onConversationSelected` to drive anchor-based
   * open via `MessageStore.switchEntity(entityId, anchor)`, and by
   * `_renderItemsWithDivider` to position the divider AFTER the anchor
   * message in the rendered list (first item below the divider = first
   * unread message).
   */
  @property({ type: Object }) lastRead: Record<string, string> = {};

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
  /**
   * Phase 4 (Change 8b): anchor message-ID captured at conversation
   * selection time. Drives the anchor-driven divider in
   * `_renderItemsWithDivider` — the divider renders AFTER the message
   * with this id, so the first item below the divider is the first
   * unread message. Falls back to the count-based path when null /
   * absent from the buffer (fresh-install / pruned-anchor cases).
   */
  private _anchorIdAtSelection: string | null = null;
  /**
   * Phase 4 (Change 8d, R1): timestamp at which the post-switch grace
   * period ends. The first auto-mark-read after a conversation switch
   * is suppressed until `Date.now() >= _markReadGraceUntil`. Subsequent
   * mark-reads in the same conversation fire without delay. See
   * `MARK_READ_GRACE_PERIOD_MS` in constants.ts.
   */
  private _markReadGraceUntil = 0;
  /**
   * Phase 4 fix (Bug #1 — low-unread auto-mark-read): one-shot timer
   * scheduled at conversation-switch time to re-check at-bottom +
   * !hasNewerMessages after the R1 grace period elapses. Required
   * because the divider's scroll-into-view fires its scroll event
   * INSIDE the grace window — the synchronous mark-read attempt is
   * suppressed, and no further scroll events fire on their own. This
   * deferred re-check is what makes the proposal's 8g item ("auto-
   * mark-read after initial open settles") actually work.
   *
   * Cleared on every switchEntity (so a quick conversation flip
   * cancels the in-flight check) and on disconnectedCallback.
   */
  private _postSwitchMarkReadTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Tracks the entity_id for which mark_read has fired during the
   * current selection. Used by the late-arriving-`lastRead` block in
   * `updated()` (Change 3.2) to refuse re-anchoring after the cursor
   * has already advanced — once mark_read has fired,
   * `lastRead[entity]` reflects the conversation tail and re-anchoring
   * against it would suppress the unread divider entirely.
   *
   * NOTE: `_postSwitchMarkReadTimer !== null` is NOT a sufficient
   * proxy for "mark_read has not yet fired". The timer is nulled when
   * its setTimeout callback fires, but mark_read can also fire from
   * `_onChatScroll` and `_scrollToBottomIfNearEnd` without touching
   * the timer. This dedicated flag is the authoritative signal.
   *
   * Set in `_markActiveRead`. Reset to null on conversation switch
   * (in `_onConversationSelected`) and on entry switch (in `updated()`'s
   * entry-id-changed branch).
   */
  private _markReadFiredForEntity: string | null = null;

  /**
   * Phase 2 follow-up: idempotency guard for the chatty
   * `_checkAndMarkReadIfAtBottom` path. The proposal noted the
   * backend's `mark_read` is "safe to call frequently" (idempotent),
   * but in practice a single scroll-to-bottom fires ~12 scroll events
   * — each sending a redundant WS round-trip. Guard tracks the
   * non-temporary buffer-tail message id we last asked the backend
   * to mark-read against; subsequent calls with an unchanged buffer
   * tail are skipped. Realtime arrivals naturally re-arm the gate
   * (buffer tail id changes when a new stored message arrives).
   *
   * Reset on conversation switch (in `_onConversationSelected`) and
   * entry switch (in `updated()`'s entry-id-changed branch) so a
   * re-open of the same conversation can fire mark_read once for the
   * fresh anchor capture.
   */
  private _lastMarkReadIdSent: string | null = null;

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

    /* Phase 4 (Change 8f): "↓ N new" indicator. Shown when new messages
       arrived while scrolled away from the bottom OR when the buffer
       tail isn't yet the conversation's newest message. Click loads
       any unloaded newer messages, scrolls to bottom, and fires
       mark-read. Sticky-positioned at the bottom of the chat
       container so it sits above the input area while scrolled. */
    .new-messages-indicator {
      position: sticky;
      bottom: 12px;
      /* F05 fix: 'align-self: center' requires a flex parent (chat-
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
      /* F05 fix: combine the centering transform with the press
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
    if (this._postSwitchMarkReadTimer) {
      clearTimeout(this._postSwitchMarkReadTimer);
      this._postSwitchMarkReadTimer = null;
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('hass') && this.hass && this._messageStore) {
      this._messageStore.setHass(this.hass);
    }
    if (changedProperties.has('config') && this.config && this._messageStore) {
      this._messageStore.setConfig(this.config);
      // Change 3.1: when the panel-header entry switch lands a new
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
        this._anchorIdAtSelection = null;
        this._unreadCountAtSelection = 0;
        this._pendingScroll = null;
        this._lastMessageCount = 0;
        this._markReadFiredForEntity = null;
        this._lastMarkReadIdSent = null;
        if (this._postSwitchMarkReadTimer) {
          clearTimeout(this._postSwitchMarkReadTimer);
          this._postSwitchMarkReadTimer = null;
        }
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
    // Change 3.2: late-arriving `lastRead`. Handles the fresh-panel-
    // load / entry-switch-immediate-click race where the user picks
    // a conversation before `_loadUnreadCounts` has resolved. At
    // click time `_onConversationSelected` ran with an empty (or
    // stale entry's) `lastRead` map, so `_anchorIdAtSelection` was
    // captured as null and `_pendingScroll` fell through to 'bottom'.
    // When the data finally arrives, retroactively capture the anchor
    // and re-execute the scroll iff:
    //
    //   - a conversation is currently selected and resolved,
    //   - the anchor was not captured at selection time,
    //   - `lastRead[entity]` is now defined,
    //   - mark_read has NOT yet fired for this entity in the current
    //     selection (`_markReadFiredForEntity` is the authoritative
    //     signal — `_postSwitchMarkReadTimer` can stay non-null after
    //     scroll-driven mark_read has fired),
    //   - no `_pendingScroll` is queued (avoids racing with the
    //     legitimate first-render scroll).
    //
    // The pending-scroll executor below picks this up on this same
    // render pass.
    if (
      changedProperties.has('lastRead')
      && this._currentEntityId
      && this._conversationResolved
      && this._anchorIdAtSelection === null
      && this.lastRead?.[this._currentEntityId]
      && this._markReadFiredForEntity !== this._currentEntityId
      && this._pendingScroll === null
    ) {
      this._anchorIdAtSelection = this.lastRead[this._currentEntityId];
      this._pendingScroll = 'last-read';
    }
    // Phase 2 / Change 3.1 extension: the auto-select-first-
    // conversation branch was removed entirely. Every entry-point
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
      // Phase 4: new messages arriving doesn't auto-mark-read anymore.
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
              .unreadCounts=${this.unreadCounts}
              .nodePrefix=${this.config?.node_prefix || null}
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
          .unreadCounts=${this.unreadCounts}
          .nodePrefix=${this.config?.node_prefix || null}
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

    // Phase 4 (Change 8b): anchor-driven divider placement.
    //
    // Preferred path: locate the message group whose newest message id
    // matches `_anchorIdAtSelection`, and insert the divider immediately
    // AFTER it — so the first item rendered below the divider is the
    // first unread message. This puts the user's previously-seen
    // newest message at the top of the viewport with the unread band
    // flowing down below it.
    //
    // Fallback path: when `_anchorIdAtSelection` is null (fresh-install
    // / never-marked-read / no unread) OR the anchor is not in the
    // currently rendered buffer (pruned-anchor / not-yet-loaded by
    // lazy-load), fall back to count-based positioning so the divider
    // still appears in the right neighborhood. R6b's "no divider" path
    // is silent — the retry loop in `_doScrollWithRetry` lands the user
    // at the bottom of the buffer, which is correct for the
    // anchor-evicted case anyway.
    let dividerAtMessageIdx: number | null = null;
    let placeAfterAnchor = false;
    let anchorGroupIdx: number | null = null;
    if (this._anchorIdAtSelection) {
      // Walk message groups (skipping date separators) and check if any
      // bubble in each group matches the anchor id. The anchor is a
      // single-message id; it lands in exactly one group.
      let groupIdx = 0;
      for (const item of renderItems) {
        if (item.type === 'date-separator') continue;
        const messages = item.group?.messages as ChatMessage[] | undefined;
        if (messages?.some((m) => m.id === this._anchorIdAtSelection)) {
          anchorGroupIdx = groupIdx;
          break;
        }
        groupIdx++;
      }
    }
    if (anchorGroupIdx !== null) {
      // Place the divider AFTER the anchor's group — first item below
      // the divider is the next group, i.e., the first unread.
      dividerAtMessageIdx = anchorGroupIdx + 1;
      placeAfterAnchor = true;
    } else if (this._unreadCountAtSelection > 0) {
      // Fallback: count-based positioning (pre-Phase-4 behaviour).
      const totalMessageItems = renderItems.filter(item => item.type !== 'date-separator').length;
      const idx = totalMessageItems - this._unreadCountAtSelection;
      dividerAtMessageIdx = idx >= 0 ? idx : 0;
    }

    // If the anchor is the very last group (no unread after it), don't
    // render a divider at all — there's nothing on the unread side.
    if (placeAfterAnchor && dividerAtMessageIdx !== null) {
      const totalMessageItems = renderItems.filter(item => item.type !== 'date-separator').length;
      if (dividerAtMessageIdx >= totalMessageItems) {
        dividerAtMessageIdx = null;
      }
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

  /**
   * Phase 4 (Change 8f): "↓ N new" indicator render.
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
    if (counter === 0 && !hasNewer && !hasContentBelow) return html``;
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
    //
    // Cursor-at-conversation-tail check: `!hasNewer` ensures the buffer
    // tail IS the conversation's newest (no unloaded content past it),
    // and `lastRead[entityId] === latestNonTempId()` confirms the
    // backend cursor matches the buffer tail. The latter uses the
    // parent-bound `lastRead` map, which `_onUnreadCleared` refreshes
    // after every mark_read round-trip.
    let label: string;
    if (counter > 0) {
      label = `↓ ${counter} new`;
    } else {
      const entityId = this._currentEntityId;
      const tailId = this._latestNonTempMessageId();
      const cursorAtTail =
        !hasNewer
        && entityId !== null
        && tailId !== null
        && this.lastRead?.[entityId] === tailId;
      label = cursorAtTail ? `↓ latest` : `↓ unread`;
    }
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

      // Phase 4 (Change 8a): determine open behaviour.
      //
      // Anchor-driven open: when we have a persisted last-read cursor
      // for this entity, hand it to the MessageStore so it routes
      // through `meshcore_chat/get_messages_around` instead of the
      // newest-50 path. The divider then renders AFTER the anchor in
      // `_renderItemsWithDivider` (Change 8b), and `_doScrollWithRetry`
      // scrolls the divider to viewport top — landing the user with
      // the previously-seen newest message at the top and the unread
      // band flowing down below it.
      //
      // Fallback to the pre-Phase-4 unread-count divider when no
      // anchor is available (fresh install / never marked read on this
      // entity).
      const unreadCount = this._getUnreadCountForSelected();
      const anchor = (entityId && this.lastRead?.[entityId]) || null;
      this._anchorIdAtSelection = anchor;
      this._unreadCountAtSelection = unreadCount;
      // Use 'last-read' scroll mode when EITHER the anchor or the
      // unread count is available — both branches in
      // _renderItemsWithDivider can produce a divider for that mode.
      this._pendingScroll = (anchor || unreadCount > 0) ? 'last-read' : 'bottom';
      this._lastMessageCount = 0; // Reset so auto-scroll doesn't trigger during initial load
      // Phase 4 R1: arm the post-switch grace timer so the first
      // auto-mark-read after this open is suppressed for
      // MARK_READ_GRACE_PERIOD_MS. Subsequent mark-reads in this
      // conversation fire without delay.
      this._markReadGraceUntil = Date.now() + MARK_READ_GRACE_PERIOD_MS;
      // Reset the mark-read-fired flag for the new selection. After
      // this runs the late-arriving-lastRead block in `updated()`
      // (Change 3.2) can safely re-anchor on the pre-mark-read cursor
      // for the new conversation.
      this._markReadFiredForEntity = null;
      // Reset the dedup guard so the first scroll-to-bottom in the
      // new conversation can fire mark_read once.
      this._lastMarkReadIdSent = null;

      // Phase 4 fix (Bug #1): the divider's scroll-into-view fires its
      // scroll event INSIDE the grace window — the synchronous
      // mark-read attempt from `_checkAndMarkReadIfAtBottom` gets
      // suppressed, and no further scroll events fire on their own
      // until the user scrolls. Without this deferred re-check, a
      // low-unread open would never advance the cursor, leaving the
      // sidebar badge and the in-chat indicator stuck visible until
      // the user manually scrolls.
      //
      // Cancel any in-flight timer first so a quick
      // conversation-flip doesn't double-fire on the wrong entity.
      if (this._postSwitchMarkReadTimer) {
        clearTimeout(this._postSwitchMarkReadTimer);
      }
      const switchedToEntityId = entityId;
      this._postSwitchMarkReadTimer = setTimeout(() => {
        this._postSwitchMarkReadTimer = null;
        // Skip if the user has switched away to a different
        // conversation in the meantime — `_currentEntityId` is
        // updated synchronously inside `_onConversationSelected`.
        if (this._currentEntityId !== switchedToEntityId) return;
        this._checkAndMarkReadIfAtBottom();
      }, MARK_READ_GRACE_PERIOD_MS);

      // Phase 4 (Change 8a): NO eager mark-read here. Mark-read fires
      // only from `_checkAndMarkReadIfAtBottom`, driven by viewport
      // scroll position (Change 8d) or the "↓ N new" indicator
      // (Change 8f).
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
      // Phase 4.5 (forensics Fix 5): thread the selected entry's id
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
   * Mark the active conversation as read and notify the parent to clear the badge.
   * Safe to call frequently — the backend and parent both handle redundant calls.
   */
  private _markActiveRead(entityId: string | null): void {
    if (!entityId || !this.hass) return;
    markConversationRead(this.hass, entityId, this.config?.entry_id).catch(() => {});
    // Phase 2 follow-up: record the tail id we asked the backend to
    // mark-read against, so the dedup guard inside
    // `_checkAndMarkReadIfAtBottom` skips redundant calls until the
    // buffer tail changes.
    this._lastMarkReadIdSent = this._latestNonTempMessageId();
    // Change 3.2: pin the entity that mark_read has fired against in
    // the current selection so the late-arriving-`lastRead` block in
    // `updated()` refuses to re-anchor against an advanced cursor.
    // Reset on conversation switch (in `_onConversationSelected`) and
    // on entry switch (in `updated()`'s entry-id-changed branch).
    this._markReadFiredForEntity = entityId;
    this.dispatchEvent(new CustomEvent('unread-cleared', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Newest non-temporary buffer message id, or null if the buffer is
   * empty / contains only rt_/optimistic entries. Mirrors the cursor
   * the backend's `mark_read` would advance to: the backend's
   * `ws_mark_read` calls `store.get_messages(entity_id, limit=1)`
   * which returns the chronologically-newest STORED message — `rt_*`
   * and `optimistic_*` placeholders never reach the store. Used by
   * the mark-read dedup guard in `_checkAndMarkReadIfAtBottom`.
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
   * Phase 4 (Change 8e): auto-scroll-on-new-message.
   *
   * Gated on BOTH `!hasNewerMessages` AND user-was-at-bottom — we never
   * auto-jump to the bottom when there are unloaded newer messages
   * (the visual jump would skip past whatever the user was reading
   * mid-buffer; see R2). When auto-scroll fires, we also call
   * `_checkAndMarkReadIfAtBottom` so the cursor advances naturally as
   * each new message arrives while the user is at the tail.
   */
  private _scrollToBottomIfNearEnd() {
    // Don't auto-scroll while a conversation-switch scroll is in progress
    if (this._isScrollGuarded()) return;
    const store = this._messageStore;
    // Phase 4 (Change 8e): skip auto-scroll when buffer tail isn't the
    // conversation's newest. R2 mitigation.
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
   * Phase 4 (Change 8d): unified scroll handler.
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
   *       `_checkAndMarkReadIfAtBottom`. The R1 grace period
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
    // with the viewport on every event. The store's R5c logic (counter
    // reset on transition to at-bottom while caught up) and the
    // realtime path (decide whether to tick the indicator counter or
    // fire mark-read) both depend on this flag being current.
    store.setUserAtBottom(atBottom);

    // (i) Lazy-load older messages near top.
    if (
      distFromTop < LAZY_LOAD_TRIGGER_PX &&
      store.hasOlderMessages &&
      !store.loadingOlder
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
   * Phase 4 fix (Bug #2): geometric "last message visible" check.
   *
   * Replaces the pre-fix pixel-distance check
   * (`distFromBottom < AT_BOTTOM_THRESHOLD_PX = 150`) inside the
   * mark-read trigger. 150 px is roughly 1-2 message-bubble heights,
   * so the user could be that far above the actual newest message
   * and still trigger mark-read prematurely (visible in 2026-05-04
   * Phase 4 manual test, video 2 — 15-unread case marked read with
   * the latest message still off-screen).
   *
   * The intent of the proposal's §"Mark-read semantics" was "user has
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
   * Phase 4 (Change 8d): viewport-based mark-read trigger.
   *
   * Idempotent — the backend's `mark_read` is cheap and
   * `UnreadTracker._schedule_save` debounces persistence, so firing
   * this on every scroll event near the bottom is safe.
   *
   * R1 grace period: the FIRST auto-mark-read after a conversation
   * switch is suppressed until `_markReadGraceUntil` has elapsed,
   * giving the user a chance to start scrolling up before the cursor
   * advances. Subsequent mark-reads in the same conversation fire
   * without delay (the timestamp is in the past from the second call
   * onward).
   *
   * Bug #2 fix (post-Phase-4): also gates on `_isLastMessageVisible()`
   * so mark-read only fires when the chronologically newest bubble is
   * actually within the viewport, not just when the scroll is within
   * 150 px of the buffer bottom.
   *
   * Resets the "↓ N new" indicator counter after firing — the user is
   * caught up, so the badge should clear.
   */
  private _checkAndMarkReadIfAtBottom(): void {
    if (!this._currentEntityId) return;
    if (Date.now() < this._markReadGraceUntil) return;
    // Defensive: also gate on `!hasNewerMessages` here so any caller
    // (the deferred-re-check timer, _jumpToBottom, _onChatScroll) is
    // safe. _onChatScroll already checks this externally; the timer
    // path didn't, which is what made this gate worth duplicating
    // inside the helper.
    if (this._messageStore?.hasNewerMessages) return;
    if (!this._isLastMessageVisible()) return;
    // Phase 2 follow-up: client-side dedup. Skip if we've already
    // asked the backend to mark-read against the current buffer
    // tail. `_jumpToBottom` and `_onChatScroll` both call this
    // helper; a single scroll-to-bottom emits ~12 scroll events, so
    // without this gate every viewport-position-near-bottom would
    // fire a redundant WS round-trip. The id check is against the
    // newest non-temporary buffer entry (matching what the backend
    // sees as the conversation tail at this moment). Realtime
    // arrivals append a new id and re-arm the gate naturally.
    const tailId = this._latestNonTempMessageId();
    if (tailId !== null && tailId === this._lastMarkReadIdSent) return;
    // The 1 s grace period (MARK_READ_GRACE_PERIOD_MS) serves as
    // dwell time — long enough that mistaken-clicks don't auto-mark-
    // read while the user is actively flipping conversations, short
    // enough that opening a low-unread conversation with everything
    // in view clears the badge after a brief pause. Earlier code also
    // gated on a `_userHasScrolledSinceSwitch` flag, but that was
    // over-protective: low-unread / short conversations have nothing
    // to scroll past, so the gate blocked the legitimate path. With
    // it removed, the deferred mark-read timer can fire on switch-
    // away even if the user never scrolled — which is the desired
    // behavior when the entire unread band fits in the viewport.
    // Cursor-derived counts (Phase 1 of this proposal) make the
    // badge self-heal across HA restart, so an over-eager mark-read
    // here is at worst a missed visual landmark on next open
    // (R5 in the proposal).
    this._markActiveRead(this._currentEntityId);
    this._messageStore?.resetNewMessagesCounter();
  }

  /**
   * Phase 4 (Change 8f): "↓ N new" indicator click handler.
   *
   * Loads any unloaded newer messages (50 at a time) until the
   * MessageStore reports `hasNewerMessages === false`, then scrolls
   * to the bottom of the buffer and fires `_checkAndMarkReadIfAtBottom`
   * so the cursor advances.
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
      // Bypass the R1 grace period — the user explicitly clicked the
      // indicator to jump to current, so they're definitionally at the
      // tail and want the mark-read to fire immediately.
      this._markReadGraceUntil = 0;
      this._checkAndMarkReadIfAtBottom();
    });
  }

  private _getUnreadCountForSelected(): number {
    if (!this.selectedId || !this.unreadCounts) return 0;
    // Check direct match on resolved entity_id first (most reliable)
    if (this._currentEntityId && this.unreadCounts[this._currentEntityId]) {
      return this.unreadCounts[this._currentEntityId];
    }
    // Fallback: match using entity naming patterns.
    // Phase 4 (F-B): Channel matches require the node_prefix to avoid
    // cross-entry contamination on same-numbered channels. When node_prefix
    // is unavailable (initial render before config arrives, or single-entry
    // installs), fall back to suffix-only match for back-compat.
    const nodePrefix = this.config?.node_prefix;
    for (const [entityId, count] of Object.entries(this.unreadCounts)) {
      if (count <= 0) continue;
      if (/^\d+$/.test(this.selectedId)) {
        // Channel: match _ch_{idx}_messages, scoped by node_prefix when known
        if (nodePrefix) {
          if (entityId.endsWith(`meshcore_${nodePrefix}_ch_${this.selectedId}_messages`)) return count;
        } else if (entityId.endsWith(`_ch_${this.selectedId}_messages`)) {
          return count;
        }
      } else {
        // Contact: match _{first6chars}_messages (globally unique)
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
