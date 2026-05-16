import type { RenderItem } from '../types';
import { MARK_READ_GRACE_PERIOD_MS } from '../constants';

/**
 * Backend payload shape for `meshcore_chat/get_unread_counts`. Phase 1
 * of the Cursor-Derived proposal extended the response from a bare
 * `unread` map to `{ unread, last_read }`; `getUnreadAndLastRead` in
 * `api.ts` returns exactly this shape.
 */
export interface UnreadBackendData {
  unread: Record<string, number>;
  last_read: Record<string, string>;
}

/**
 * Per-active-conversation read-progress state (Phase 3). One instance
 * lives at a time on the controller (`_readProgress`) — created by
 * `beginConversation`, torn down by `endConversation`. Consolidates the
 * scattered chat-page fields the read-progress machine used to be:
 * `_anchorIdAtSelection`, `_unreadCountAtSelection`,
 * `_markReadGraceUntil`, `_postSwitchMarkReadTimer`,
 * `_markReadFiredForEntity`, `_lastMarkReadIdSent`.
 */
export interface ReadProgress {
  /**
   * The conversation's entity_id, or null when no entity is resolved
   * yet (e.g. a contact with no messages exchanged). The mark-read
   * mutators no-op on a null-entity progress.
   */
  entityId: string | null;
  /**
   * Cursor message-id snapshot captured at open — drives the divider
   * via `dividerAfterGroupIdx`. Null on fresh-install / never-marked-
   * read, or when the persisted cursor arrives after selection (the
   * late-arriving case `maybeReanchorOnLateData` retroactively fills).
   */
  anchorId: string | null;
  /**
   * Backend cursor-derived unread count captured at open. Drives the
   * count-based divider fallback when `anchorId` is null or the anchor
   * message is not in the currently-rendered buffer.
   */
  unreadCountAtSelection: number;
  /**
   * Timestamp at which the post-switch grace period ends. The first
   * auto-mark-read after the switch is suppressed until
   * `Date.now() >= graceUntil` (R1 mitigation — gives the user a
   * chance to scroll up before the cursor advances).
   */
  graceUntil: number;
  /**
   * One-shot deferred re-check timer armed by `beginConversation`. The
   * divider's scroll-into-view fires its scroll event INSIDE the grace
   * window, so the synchronous mark-read attempt is suppressed and no
   * further scroll events fire on their own; this timer re-checks once
   * the grace window elapses. Cleared by `endConversation` and by the
   * next `beginConversation`.
   */
  postSwitchTimer: ReturnType<typeof setTimeout> | null;
  /**
   * True once a mark-read has fired for this conversation. Gates
   * `maybeReanchorOnLateData` — re-anchoring against a cursor that has
   * already advanced to the conversation tail would suppress the
   * unread divider entirely. Replaces chat-page's
   * `_markReadFiredForEntity` (a boolean suffices here: `ReadProgress`
   * is already scoped to one conversation).
   */
  markReadFired: boolean;
  /**
   * Buffer-tail message-id the last mark-read was issued against —
   * dedup guard for the chatty scroll path (a single scroll-to-bottom
   * emits ~12 scroll events). A realtime arrival changes the buffer
   * tail and naturally re-arms the gate.
   */
  lastMarkReadIdSent: string | null;
}

/**
 * UnreadController — the single panel-owned source of truth for the
 * frontend's "unread" state.
 *
 * Phase 2 surface: the backend-data side and the badge projection —
 * `subscribe` / `onMarkReadRequested` plumbing, the `ingestBackendData`
 * / `clearEntity` mutators, the `counts` / `lastRead` getters, and the
 * `badgeCount` projection that unifies the two pre-refactor badge-
 * lookup implementations (`conversation-list._getUnreadCount` and
 * `chat-page._getUnreadCountForSelected`).
 *
 * Phase 3 surface: the per-conversation read-progress machine — the
 * `ReadProgress` state, the `beginConversation` / `endConversation`
 * lifecycle, `maybeReanchorOnLateData`, the `onScrollState` /
 * `onPillJump` mark-read mutators, the `onPostSwitchTimerFire`
 * registration + the deferred post-switch timer, and the
 * `dividerAfterGroupIdx` projection. chat-page still owns the DOM
 * facts (`_isLastMessageVisible`, scroll geometry) and feeds their
 * results in; the controller owns the gates (grace window, dedup,
 * `hasNewerMessages`) and the cursor mutation.
 *
 * Phase 4 surface: the pill's data needs — the `cursorAtTail` query
 * and the pure `pillLabel` helper (an exported free function below the
 * class). The pill (`_renderNewMessagesIndicator`) stays in chat-page
 * (it depends on chat-page render state + a DOM probe); it only
 * *consults* the controller. See
 * `docs/Proposed - Unify Unread State (Frontend).md`.
 *
 * Lifetime: constructed once by `meshcore-chat-panel.ts` and owned by
 * the panel. The panel is not remounted on tab switch, so the badge
 * map and the `meshcore_unread_updated` subscription state persist
 * correctly. `<chat-page>` (which IS remounted on tab switch)
 * `subscribe`s in `connectedCallback` and unsubscribes — but does NOT
 * destroy — in `disconnectedCallback`.
 */
export class UnreadController {
  /**
   * Authoritative per-entity unread counts, keyed by entity_id. Every
   * mutator assigns a FRESH object here, so the `counts` getter's
   * identity changes on every mutation and is stable between
   * mutations — exactly what Lit's `.prop=` identity check needs.
   * `<conversation-list>` is bound via `.unreadCounts=${unread.counts}`
   * and relies on that identity change to re-render.
   */
  private _counts: Record<string, number> = {};

  /** Authoritative per-entity last-read message-ID cursor map. */
  private _lastRead: Record<string, string> = {};

  /**
   * Re-render subscribers. Multi-subscriber by design: the controller
   * is panel-owned but its primary consumer (`<chat-page>`) has a
   * decoupled mount lifecycle, and a single-callback model would
   * silently break the day a second consumer is added.
   */
  private _subscribers = new Set<() => void>();

  /**
   * Handler the panel registers to own the mark-read WS round-trip +
   * unread bookkeeping. Phase 2 wires the registration plumbing; the
   * emitter (the read-progress mutators that call `requestMarkRead`)
   * lands in Phase 3, so in Phase 2 this is registered-but-unfired.
   */
  private _markReadRequestedHandler: ((entityId: string) => void) | null = null;

  /**
   * Per-active-conversation read-progress state (Phase 3). Null when no
   * conversation is open (initial mount, between conversations after
   * `endConversation`). Created by `beginConversation`.
   */
  private _readProgress: ReadProgress | null = null;

  /**
   * Handler chat-page registers (via `onPostSwitchTimerFire`) to run
   * the deferred post-switch re-check. The controller owns the timer
   * (`ReadProgress.postSwitchTimer`); when it fires the controller
   * invokes this handler, and chat-page — which owns the DOM facts —
   * gathers them and calls back into `onScrollState`. Same registration
   * shape as Phase 2's `onMarkReadRequested` / `requestMarkRead`.
   */
  private _postSwitchTimerHandler: (() => void) | null = null;

  // ---- subscriber plumbing ----------------------------------------------

  /**
   * Register a re-render callback. Returns an unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this._subscribers.add(cb);
    return () => {
      this._subscribers.delete(cb);
    };
  }

  /**
   * Register the panel's mark-read-requested handler — the panel owns
   * the WS round-trip and the unread bookkeeping. Only one handler is
   * supported (the panel is the sole owner).
   */
  onMarkReadRequested(cb: (entityId: string) => void): void {
    this._markReadRequestedHandler = cb;
  }

  /**
   * Register chat-page's deferred post-switch re-check handler. The
   * controller's post-switch timer (armed in `beginConversation`)
   * invokes this when the R1 grace window elapses; chat-page's handler
   * gathers the current DOM facts and calls `onScrollState`. Only one
   * handler is supported — chat-page is the sole consumer and
   * re-registers on every remount.
   */
  onPostSwitchTimerFire(cb: () => void): void {
    this._postSwitchTimerHandler = cb;
  }

  /**
   * Emit a mark-read request to the panel-registered handler. The
   * Phase 3 read-progress mutators call this; in Phase 2 it exists
   * only to complete the registration plumbing (no caller yet).
   */
  requestMarkRead(entityId: string): void {
    if (entityId && this._markReadRequestedHandler) {
      this._markReadRequestedHandler(entityId);
    }
  }

  private _notify(): void {
    // Iterate a copy so an unsubscribe during notification is safe.
    for (const cb of [...this._subscribers]) {
      try {
        cb();
      } catch (err) {
        console.error('[UnreadController] subscriber callback threw', err);
      }
    }
  }

  // ---- authoritative state ----------------------------------------------

  /**
   * Replace the unread + last-read maps from a fresh backend payload.
   *
   * The backend cursor is the single source of truth for the badge: a
   * conversation has unread iff its persisted cursor is not at the
   * tail. Mark-read (fired from the scroll-driven `onScrollState` and
   * the post-switch deferred re-check) is what advances the cursor and
   * clears the count.
   *
   * Pre-2026-05-15 this method also zeroed `counts[activeEntityId]` to
   * hide the badge while the user was viewing the conversation. That
   * "hide-while-active" heuristic conflicted with the unread-divider
   * semantics — the user can be IN a conversation but have not yet
   * seen its unread messages (they're below the viewport). The
   * heuristic also fired inconsistently: it relied on a
   * `_loadUnreadCounts` refresh running while the conversation was
   * active, and those refreshes only happen on `meshcore_unread_updated`
   * events for *non-active* entities — so the badge zero was
   * mesh-activity-dependent, intermittently hiding genuine unread
   * state. The `activeEntityId` parameter is retained (prefixed with
   * `_` to indicate unused) so call sites in the panel don't have to
   * change.
   */
  ingestBackendData(
    payload: UnreadBackendData,
    _activeEntityId: string | null,
  ): void {
    this._counts = { ...(payload?.unread ?? {}) };
    this._lastRead = { ...(payload?.last_read ?? {}) };
    this._notify();
  }

  /**
   * Optimistically zero a single entity's count without waiting for a
   * backend round-trip. Used by the panel's `_handleMarkReadRequested`
   * (the mark-read-requested handler the controller's read-progress
   * mutators fire via `requestMarkRead`); the panel still issues an
   * authoritative `_loadUnreadCounts` refresh right after — this just
   * removes the visible lag.
   *
   * No-op (no notify) when the entity has no positive count, matching
   * the pre-refactor guard in the panel.
   */
  clearEntity(entityId: string): void {
    if (entityId && this._counts[entityId]) {
      this._counts = { ...this._counts, [entityId]: 0 };
      this._notify();
    }
  }

  /**
   * Fresh-identity snapshot of the unread counts, keyed by entity_id.
   * Identity changes on every mutation and is stable between
   * mutations — see `_counts`.
   */
  get counts(): Record<string, number> {
    return this._counts;
  }

  /** Per-entity last-read message-ID cursor map. */
  get lastRead(): Record<string, string> {
    return this._lastRead;
  }

  // ---- per-conversation read-progress lifecycle (Phase 3) ---------------

  /**
   * Begin tracking read-progress for a freshly-opened conversation.
   * Called by chat-page's `_onConversationSelected`. Captures the
   * anchor from the current `lastRead` map, snapshots the unread count
   * chat-page already computed, arms the R1 grace window, and arms the
   * one-shot deferred post-switch re-check timer.
   *
   * The unread count is passed in rather than derived here: the
   * controller would need chat-page's `selectedId` / `nodePrefix` /
   * resolved entity_id to call `badgeCount`, and chat-page already has
   * all three. (Interpretation call — the proposal's API sketch shows
   * `beginConversation(entityId)`, but `ReadProgress` needs the count
   * for the divider's count-based fallback and the controller cannot
   * derive it; same kind of sketch-vs-prose gap as Phase 2's three.)
   *
   * Tears down any prior conversation's timer first, so a quick
   * conversation flip cancels the in-flight deferred re-check.
   */
  beginConversation(entityId: string | null, unreadCount: number): void {
    this._clearPostSwitchTimer();
    const anchorId = entityId ? this._lastRead[entityId] ?? null : null;
    const rp: ReadProgress = {
      entityId,
      anchorId,
      unreadCountAtSelection: unreadCount,
      graceUntil: Date.now() + MARK_READ_GRACE_PERIOD_MS,
      postSwitchTimer: null,
      markReadFired: false,
      lastMarkReadIdSent: null,
    };
    this._readProgress = rp;
    // Deferred post-switch re-check: the divider's scroll-into-view
    // fires its scroll event inside the grace window (so the
    // synchronous mark-read is suppressed) and no further scroll
    // events fire on their own. This timer fires once the grace
    // window elapses and asks chat-page to re-check at-bottom. The
    // `_readProgress === rp` guard is belt-and-suspenders: a
    // conversation switch / `endConversation` would already have
    // cleared this timer via `_clearPostSwitchTimer`.
    rp.postSwitchTimer = setTimeout(() => {
      if (this._readProgress === rp) {
        rp.postSwitchTimer = null;
        this._postSwitchTimerHandler?.();
      }
    }, MARK_READ_GRACE_PERIOD_MS);
  }

  /**
   * Tear down the active conversation's read-progress state. Called by
   * chat-page's `disconnectedCallback` and the entry-switch branch in
   * `updated()`. Clears the deferred timer so it cannot fire against a
   * stale conversation.
   */
  endConversation(): void {
    this._clearPostSwitchTimer();
    this._readProgress = null;
  }

  private _clearPostSwitchTimer(): void {
    const rp = this._readProgress;
    if (rp?.postSwitchTimer) {
      clearTimeout(rp.postSwitchTimer);
      rp.postSwitchTimer = null;
    }
  }

  /**
   * Zero the count-based divider fallback for the active conversation
   * without otherwise disturbing read-progress (the anchor, the grace
   * window, the timers, the dedup guard all stay). chat-page calls
   * this when the user re-selects the conversation they're already in
   * — "clear the stale count-based divider and scroll to bottom".
   * Faithfully preserves the pre-Phase-3 `_unreadCountAtSelection = 0`
   * re-select handler (which likewise left the anchor untouched).
   */
  resetUnreadCountAtSelection(): void {
    if (this._readProgress) {
      this._readProgress.unreadCountAtSelection = 0;
    }
  }

  /**
   * Retroactively capture the anchor when the persisted `lastRead`
   * cursor arrives AFTER conversation selection (the fresh-panel-load /
   * entry-switch-immediate-click race). Returns true if it re-anchored.
   *
   * Collaboration, not absorption (proposal §"Verification pass" #6):
   * chat-page keeps the `_conversationResolved` / `_pendingScroll`
   * gate — that's chat-page render state the controller does not own —
   * and only calls this when those are satisfied. The controller owns
   * the half it can answer authoritatively: the anchor is still null,
   * mark-read has not fired (re-anchoring against an advanced cursor
   * would suppress the divider entirely), and `lastRead[entityId]` is
   * now populated.
   */
  maybeReanchorOnLateData(entityId: string): boolean {
    const rp = this._readProgress;
    if (!rp || rp.entityId !== entityId) return false;
    if (rp.anchorId !== null) return false;
    if (rp.markReadFired) return false;
    const cursor = this._lastRead[entityId];
    if (!cursor) return false;
    rp.anchorId = cursor;
    return true;
  }

  // ---- mark-read mutators (Phase 3) -------------------------------------

  /**
   * Viewport-driven mark-read trigger. chat-page calls this from its
   * scroll handler / auto-scroll path / the deferred post-switch
   * re-check, passing in the DOM-derived facts. The controller owns
   * the gates: entity match, R1 grace window, `hasNewerMessages`,
   * last-message-visible, and the buffer-tail dedup.
   *
   * Returns true if a mark-read was emitted — chat-page resets the
   * MessageStore "↓ N new" counter on a true return.
   */
  onScrollState(s: {
    entityId: string | null;
    lastMessageVisible: boolean;
    hasNewerMessages: boolean;
    bufferTailId: string | null;
  }): boolean {
    return this._tryAdvanceCursor(
      s.entityId,
      s.lastMessageVisible,
      s.hasNewerMessages,
      s.bufferTailId,
      false,
    );
  }

  /**
   * Mark-read trigger for the "↓ N new" pill jump. The pill click
   * drains `hasNewerMessages` and scrolls to the buffer bottom before
   * calling this, so the user is at the conversation tail by
   * construction — the `lastMessageVisible` / `hasNewerMessages` gates
   * are satisfied, and the R1 grace window is bypassed (the click is
   * an explicit "I want to be caught up"). Returns true if a mark-read
   * was emitted.
   */
  onPillJump(s: { entityId: string | null; bufferTailId: string | null }): boolean {
    return this._tryAdvanceCursor(s.entityId, true, false, s.bufferTailId, true);
  }

  /**
   * Shared gate logic for the mark-read mutators. Emits a mark-read
   * request (which the panel's registered handler turns into the WS
   * round-trip + optimistic `clearEntity` + authoritative refresh).
   */
  private _tryAdvanceCursor(
    entityId: string | null,
    lastMessageVisible: boolean,
    hasNewerMessages: boolean,
    bufferTailId: string | null,
    bypassGrace: boolean,
  ): boolean {
    if (!entityId) return false;
    const rp = this._readProgress;
    if (!rp || rp.entityId !== entityId) return false;
    if (!bypassGrace && Date.now() < rp.graceUntil) return false;
    if (hasNewerMessages) return false;
    if (!lastMessageVisible) return false;
    // Dedup: skip if we already asked the backend to mark-read against
    // this exact buffer tail. A realtime arrival changes the tail id
    // and re-arms the gate.
    if (bufferTailId !== null && bufferTailId === rp.lastMarkReadIdSent) {
      return false;
    }
    rp.lastMarkReadIdSent = bufferTailId;
    rp.markReadFired = true;
    this.requestMarkRead(entityId);
    return true;
  }

  // ---- projections ------------------------------------------------------

  /**
   * Unified badge-count lookup — one implementation replacing both
   * `conversation-list._getUnreadCount` and
   * `chat-page._getUnreadCountForSelected`.
   *
   * @param idOrSelectedId  Conversation id: a numeric string for a
   *   channel (e.g. "1"), or a hex pubkey prefix for a contact.
   * @param nodePrefix  The entry's 6-char pubkey prefix, used to scope
   *   channel matches so same-named channels on different upstream
   *   entries don't cross-contaminate (Phase 4 F-B). `null` on
   *   single-entry installs / before config arrives → suffix-only
   *   match, as before.
   * @param directKey  Optional resolved entity_id for a direct-key
   *   fast path. `chat-page._getUnreadCountForSelected` had this
   *   (`_currentEntityId`); `conversation-list._getUnreadCount` did
   *   not — callers that lack it pass nothing.
   */
  badgeCount(
    idOrSelectedId: string | null,
    nodePrefix: string | null,
    directKey?: string | null,
  ): number {
    if (!idOrSelectedId) return 0;
    const counts = this._counts;

    // Direct match on a resolved entity_id (most reliable). Folds in
    // `_getUnreadCountForSelected`'s fast path; the `> 0` truthy check
    // matches the pre-refactor behavior (a 0 count falls through to
    // the pattern loop, which also skips it).
    if (directKey && counts[directKey]) {
      return counts[directKey];
    }

    const isChannel = /^\d+$/.test(idOrSelectedId);
    const channelNeedle = nodePrefix
      ? `meshcore_${nodePrefix}_ch_${idOrSelectedId}_messages`
      : null;

    for (const [entityId, count] of Object.entries(counts)) {
      if (count <= 0) continue;
      if (isChannel) {
        // Channel: numeric id → match `_ch_{id}_messages`, scoped by
        // nodePrefix when known.
        if (channelNeedle) {
          if (entityId.endsWith(channelNeedle)) return count;
        } else if (entityId.endsWith(`_ch_${idOrSelectedId}_messages`)) {
          return count;
        }
      } else {
        // Contact: hex pubkey prefix → match `_{first6}_messages`.
        // Contact prefixes are globally unique across entries, so no
        // nodePrefix scoping is needed.
        const prefix6 = idOrSelectedId.substring(0, 6);
        if (entityId.endsWith(`_${prefix6}_messages`)) return count;
      }
    }
    return 0;
  }

  /**
   * Divider placement projection — the group index the "New messages"
   * divider should render immediately above, or null for no divider.
   * Pure read over `_readProgress` + the passed render items; chat-page
   * owns the render loop and just consumes the index.
   *
   * Preferred path: locate the group containing the anchor message,
   * then place the divider above the FIRST INBOUND group at or after
   * the group right after the anchor. Skipping the user's own trailing
   * outgoing groups does two things at once:
   *
   *   - "outgoing never counts" — mirrors the backend's
   *     `count_unread_after` (`message_store.py:432`, counts only
   *     `not outgoing`); this subsumes the old anchor-is-last-group
   *     suppression check (Phase 1).
   *   - the cross-entry send-then-switch fix
   *     (`meshcore-ha-chat_issue_log.md` 2026-05-14): when the user
   *     sent a message then navigated away before the cursor advanced,
   *     the anchor sits before their own sent message. Walking PAST
   *     the leading outgoing run lands the divider above the first
   *     genuine inbound message, not above the user's own send — a
   *     "mark read up to my own just-sent message, but no further"
   *     rule expressed purely as a projection (no cursor mutation, no
   *     `onMessageSent` mutator — proposal §"Verification pass" #1).
   *
   * If no inbound group exists past the anchor, the divider is
   * suppressed entirely.
   *
   * Fallback path: count-based positioning when `anchorId` is null
   * (fresh-install / never-marked-read) or the anchor message is not
   * in the currently-rendered buffer (pruned / not-yet-lazy-loaded).
   * Preserved unchanged — the backend's `count_unread_after` docstring
   * states the orphaned-cursor fallback deliberately mirrors this.
   */
  dividerAfterGroupIdx(renderItems: RenderItem[]): number | null {
    const rp = this._readProgress;
    if (!rp) return null;

    // Locate the anchor's group (date separators don't count toward
    // the group index — they're skipped in chat-page's render loop too).
    let anchorGroupIdx: number | null = null;
    if (rp.anchorId) {
      let groupIdx = 0;
      for (const item of renderItems) {
        if (item.type === 'date-separator') continue;
        if (item.group.messages.some((m) => m.id === rp.anchorId)) {
          anchorGroupIdx = groupIdx;
          break;
        }
        groupIdx++;
      }
    }

    if (anchorGroupIdx !== null) {
      // Walk past the anchor's group and any contiguous outgoing run;
      // the divider lands above the first inbound group found.
      let groupIdx = 0;
      for (const item of renderItems) {
        if (item.type === 'date-separator') continue;
        if (groupIdx > anchorGroupIdx && !item.group.isOutgoing) {
          return groupIdx;
        }
        groupIdx++;
      }
      return null;
    }

    // Fallback: count-based positioning (no anchor available).
    if (rp.unreadCountAtSelection > 0) {
      const totalMessageItems = renderItems.filter(
        (i) => i.type !== 'date-separator',
      ).length;
      const idx = totalMessageItems - rp.unreadCountAtSelection;
      return idx >= 0 ? idx : 0;
    }

    return null;
  }

  /**
   * Pill projection (Phase 4): is the backend last-read cursor already
   * at the buffer tail? "At tail" means the persisted cursor for
   * `entityId` equals `bufferTailId` — the newest non-temp message id
   * chat-page passes in (`_latestNonTempMessageId()`).
   *
   * `_renderNewMessagesIndicator` consults this to pick the pill's
   * "↓ latest" (caught up, just scrolled away) vs "↓ unread" (real
   * unread below the viewport) label. It replaces the inline
   * `lastRead[entityId] === _latestNonTempMessageId()` check the pill
   * used to run against chat-page's `lastRead` reactive-property
   * mirror — the controller's `_lastRead` map is the authoritative
   * source, so the pill no longer depends on the mirror. (The mirror
   * itself stays: the `updated()` late-arriving-`lastRead` re-anchor
   * block still needs it as its `changedProperties.has('lastRead')`
   * reactive trigger — see chat-page `updated()`.)
   *
   * The `!hasNewerMessages` half of the old composite stays in
   * chat-page / `pillLabel`: `hasNewerMessages` is `MessageStore`
   * state, not controller state. Returns false on a null entity or
   * null buffer tail — cannot be "at tail" with no tail to be at;
   * matches the pre-refactor `entityId !== null && tailId !== null`
   * guard.
   */
  cursorAtTail(entityId: string | null, bufferTailId: string | null): boolean {
    if (!entityId || bufferTailId === null) return false;
    return this._lastRead[entityId] === bufferTailId;
  }
}

/**
 * Pure label-selection helper for the "↓ N new" / "↓ unread" /
 * "↓ latest" jump-to-current pill (Phase 4). Centralizes the label
 * semantics that used to be inlined in chat-page's
 * `_renderNewMessagesIndicator`. A free function, not a method: it
 * touches no controller state — every input is a chat-page-gathered
 * fact passed in.
 *
 * Inputs:
 *   - counter:         `MessageStore.newMessagesWhileAway`
 *   - hasNewer:        `MessageStore.hasNewerMessages`
 *   - hasContentBelow: chat-page's `_hasContentBelowViewport()` DOM probe
 *   - cursorAtTail:    `UnreadController.cursorAtTail(entityId, bufferTailId)`
 *
 * Returns the label string, or `null` when the pill should be
 * suppressed. Semantics preserved verbatim from the pre-Phase-4 inline
 * logic:
 *   - counter > 0                          → "↓ {counter} new"
 *   - counter 0, !hasNewer, !hasContentBelow → null (nothing below the
 *                                             viewport — suppress)
 *   - counter 0, cursorAtTail, !hasNewer    → "↓ latest" (caught up,
 *                                             scrolled away — a pure
 *                                             jump affordance)
 *   - otherwise                             → "↓ unread" (real unread
 *                                             below the viewport)
 *
 * The render-state early returns (`_pendingScroll` / `_scrollInFlight`)
 * stay in `_renderNewMessagesIndicator` — they are chat-page render
 * state this pure helper cannot see.
 */
export function pillLabel(s: {
  counter: number;
  hasNewer: boolean;
  hasContentBelow: boolean;
  cursorAtTail: boolean;
}): string | null {
  if (s.counter > 0) return `↓ ${s.counter} new`;
  if (!s.hasNewer && !s.hasContentBelow) return null;
  return s.cursorAtTail && !s.hasNewer ? `↓ latest` : `↓ unread`;
}
