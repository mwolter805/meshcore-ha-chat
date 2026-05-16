// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { html, render } from 'lit';

// Mock the api module — chat-page imports sendDirectMessage /
// sendChannelMessage from '../api', and message-store imports
// `getMessagesAround` from the same module (mocked here so
// anchor-based opens don't hit a real network path). As of Phase 3
// chat-page no longer calls `markConversationRead` directly — the
// mark-read WS round-trip is the panel's job, fired via the
// controller's `requestMarkRead` — but the export is kept in the
// mock factory since other consumers of '../api' may reference it.
vi.mock('../src/api', () => ({
  markConversationRead: vi.fn(async () => ({ success: true })),
  sendDirectMessage: vi.fn(async () => undefined),
  sendChannelMessage: vi.fn(async () => undefined),
  getMessagesAround: vi.fn(async () => ({
    messages: [],
    anchor_index: 0,
    has_more_before: false,
    has_more_after: false,
    anchor_found: false,
  })),
}));

// Mock entity-resolver — chat-page calls discoverChannelEntity /
// discoverContactEntity to map a (selectedId, conversation) pair to a
// binary_sensor entity_id. The real implementation reads hass.states;
// stubbing it lets us drive the chat-page without populating the
// state map.
vi.mock('../src/chat/entity-resolver', () => ({
  discoverChannelEntity: vi.fn(
    (_hass: unknown, _config: unknown, idx: number) =>
      `binary_sensor.meshcore_aa_ch_${idx}_messages`,
  ),
  discoverContactEntity: vi.fn(
    (_hass: unknown, _config: unknown, prefix: string) =>
      `binary_sensor.meshcore_aa_${prefix.substring(0, 6)}_messages`,
  ),
}));

// Importing chat-page triggers the @customElement decorator side effect
// which registers <meshcore-chat-page>. Must come AFTER the vi.mock
// calls above so the module-graph references resolve to the mocked
// versions.
import '../src/pages/chat-page';
import type { ChatPage } from '../src/pages/chat-page';
import { UnreadController } from '../src/chat/unread-controller';
import type {
  Channel,
  ChatMessage,
  HassEvent,
  HomeAssistant,
  PanelConfig,
} from '../src/types';

// ─── Test fixtures ───────────────────────────────────────────────────────

function makeConfig(overrides: Partial<PanelConfig> = {}): PanelConfig {
  return {
    node_name: 'TestNode',
    node_prefix: 'aa',
    channel_entity_pattern: 'binary_sensor.meshcore_aa_ch_{idx}_messages',
    contact_entity_pattern: 'binary_sensor.meshcore_aa_{contact}_messages',
    recipient_type_entity: 'select.meshcore_recipient_type',
    channel_entity: 'select.meshcore_channel',
    contact_entity: 'select.meshcore_contact',
    domain_filter: 'meshcore',
    hours_to_show: 48,
    initial_hours: 1,
    max_messages: 500,
    show_date_separators: true,
    group_messages: true,
    group_timeout: 300,
    timestamp_format: 'relative',
    update_mode: 'auto',
    refresh_interval: 30,
    enable_cache: true,
    cache_ttl: 86400,
    cache_max_size: 5242880,
    entry_id: 'test-entry',
    ...overrides,
  };
}

function makeMockHass(): HomeAssistant {
  return {
    states: {},
    entities: {},
    callApi: async () => ({}) as never,
    callService: async () => {},
    callWS: vi.fn(async () => ({ messages: [], has_more: false })) as <T>(
      msg: Record<string, unknown>,
    ) => Promise<T>,
    connection: {
      subscribeEvents: async (
        _cb: (event: HassEvent) => void,
        _eventType: string,
      ): Promise<() => void> => () => {},
      subscribeMessage: async <_T>(
        _cb: (event: _T) => void,
        _msg: Record<string, unknown>,
      ): Promise<() => void> => () => {},
    },
    themes: { darkMode: false },
    language: 'en',
    locale: {},
    dockedSidebar: 'auto',
  };
}

function makeChannel(idx: number, name = `Ch${idx}`): Channel {
  return { channel_idx: idx, name } as unknown as Channel;
}

// Type-cast handle for reaching into chat-page's private fields. The
// runtime is plain JS so the cast is a TS-only hatch — same pattern as
// message-store.test.ts's `priv()`.
interface PrivateChatPage {
  _messageStore: {
    setUserAtBottom(v: boolean): void;
    resetNewMessagesCounter(): void;
    loadNewerMessages(): Promise<void>;
    hasNewerMessages: boolean;
    loadingNewer: boolean;
    newMessagesWhileAway: number;
    messages: ChatMessage[];
    _hasNewerMessages?: boolean;
    _newMessagesWhileAway?: number;
  } | null;
  _currentEntityId: string | null;
  _conversationResolved: boolean;
  _pendingScroll: 'bottom' | 'last-read' | null;
  _scrollInFlight: boolean;
  _onConversationSelected(): void;
  _onChatScroll(e: Event): void;
  // Phase 3: still chat-page-owned, but reimplemented as a thin
  // DOM-fact gatherer that delegates the gates to the controller's
  // `onScrollState`. The read-progress machine itself (anchor, grace,
  // deferred timer, dedup, markReadFired) moved into UnreadController
  // — see unread-controller.test.ts for its unit coverage.
  _checkAndMarkReadIfAtBottom(): void;
  _isLastMessageVisible(): boolean;
  _jumpToBottom(): Promise<void>;
}
function priv(page: ChatPage): PrivateChatPage {
  return page as unknown as PrivateChatPage;
}

/**
 * Stub `_isLastMessageVisible` on the instance so chat-page's
 * geometric "last bubble visible" gate (Bug #2 fix) returns the value
 * we want for the test, regardless of whether happy-dom has rendered
 * actual message bubbles.
 *
 * Setting the property on the instance shadows the prototype method
 * — calls to `this._isLastMessageVisible()` from inside the class
 * resolve to the override.
 */
function stubLastMessageVisible(page: ChatPage, value: boolean): void {
  priv(page)._isLastMessageVisible = () => value;
}

/**
 * Clear the conversation-switch scroll-into-place state so pill-
 * visibility assertions reflect the post-settled state (viewport at
 * its intended position) rather than the brief in-flight window where
 * the pill is intentionally suppressed. The async test store-fetch
 * may leave `_pendingScroll` non-null at assertion time; this helper
 * pins both signals off.
 */
function clearScrollSettlingState(page: ChatPage): void {
  priv(page)._pendingScroll = null;
  priv(page)._scrollInFlight = false;
}

let containers: HTMLElement[] = [];

async function mountChatPage(opts: {
  selectedId?: string | null;
  conversations?: Array<Channel>;
  unreadCounts?: Record<string, number>;
  lastRead?: Record<string, string>;
} = {}): Promise<ChatPage> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);

  const hass = makeMockHass();
  const config = makeConfig();
  const conversations = opts.conversations ?? [makeChannel(0)];
  const unreadCounts = opts.unreadCounts ?? {};
  const lastRead = opts.lastRead ?? {};
  const selectedId = opts.selectedId ?? null;

  // Phase 2: chat-page is fed unread state through the panel-owned
  // `UnreadController` rather than `.unreadCounts` / `.lastRead`
  // props. Construct one, seed it with the test's backend snapshot,
  // and bind it. chat-page mirrors `lastRead` off the controller in
  // `connectedCallback`.
  //
  // Phase 4: the pill's cursor-at-tail query (`unread.cursorAtTail`)
  // reads the controller's authoritative `_lastRead` map, not
  // chat-page's mirror — so tests that simulate a cursor position
  // seed it via `page.unread.ingestBackendData({ unread, last_read })`
  // rather than assigning `page.lastRead` directly. (The mirror still
  // exists — the `updated()` late-arriving re-anchor block needs it as
  // its `changedProperties.has('lastRead')` trigger — but it is no
  // longer the pill's input.)
  const unread = new UnreadController();
  unread.ingestBackendData({ unread: unreadCounts, last_read: lastRead }, null);

  render(
    html`
      <meshcore-chat-page
        .hass=${hass}
        .config=${config}
        .conversations=${conversations}
        .unread=${unread}
        .selectedId=${selectedId}
        .narrow=${false}
      ></meshcore-chat-page>
    `,
    container,
  );

  const page = container.querySelector('meshcore-chat-page') as ChatPage;
  await page.updateComplete;
  return page;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  containers.forEach((c) => c.remove());
  containers = [];
});

// ─── Tests ───────────────────────────────────────────────────────────────

// ─── Phase 3 — chat-page drives the UnreadController ─────────────────────
//
// Phase 3 moved the read-progress machine into `UnreadController`.
// chat-page now owns only the DOM facts (scroll geometry,
// `_isLastMessageVisible`, the non-temp buffer tail) and feeds them
// into the controller's gates. These integration tests pin that
// wiring; the gate logic itself (the R1 grace window, the dedup
// guard, the deferred post-switch timer, the divider projection,
// `maybeReanchorOnLateData`) is unit-tested in unread-controller.test.ts
// — see the commit body's test-to-test mapping.
describe('Phase 3 — chat-page drives the UnreadController', () => {
  it('selecting a conversation calls beginConversation and does not request mark-read', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0)],
      unreadCounts: { 'binary_sensor.meshcore_aa_ch_0_messages': 5 },
    });
    const beginSpy = vi.spyOn(page.unread, 'beginConversation');
    const markReadSpy = vi.fn();
    page.unread.onMarkReadRequested(markReadSpy);

    // Drive selection via the property — same code path the
    // conversation-list's `conversation-selected` handler hits
    // (`updated()` watches `selectedId` → `_onConversationSelected`).
    page.selectedId = '0';
    await page.updateComplete;

    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy.mock.calls[0][0]).toBe(
      'binary_sensor.meshcore_aa_ch_0_messages',
    );
    // Opening a conversation must not advance the cursor.
    expect(markReadSpy).not.toHaveBeenCalled();
  });

  it('_onChatScroll near bottom feeds the gathered DOM facts into onScrollState', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    stubLastMessageVisible(page, true);
    expect(priv(page)._messageStore?.hasNewerMessages).toBe(false);
    const spy = vi.spyOn(page.unread, 'onScrollState');

    // Synthetic scroll event whose target reports a viewport sitting
    // at the bottom of the container — `_onChatScroll` reads scrollTop
    // / scrollHeight / clientHeight off `e.target`.
    const fakeContainer = {
      scrollTop: 1000,
      scrollHeight: 1000,
      clientHeight: 1000,
    } as unknown as HTMLElement;
    priv(page)._onChatScroll({ target: fakeContainer } as unknown as Event);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        entityId: 'binary_sensor.meshcore_aa_ch_0_messages',
        lastMessageVisible: true,
        hasNewerMessages: false,
      }),
    );
  });

  it('_onChatScroll near bottom with hasNewerMessages=true does NOT call onScrollState', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (store) {
      (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages =
        true;
    }
    stubLastMessageVisible(page, true);
    const spy = vi.spyOn(page.unread, 'onScrollState');

    const fakeContainer = {
      scrollTop: 1000,
      scrollHeight: 1000,
      clientHeight: 1000,
    } as unknown as HTMLElement;
    priv(page)._onChatScroll({ target: fakeContainer } as unknown as Event);

    // `_onChatScroll`'s near-bottom branch routes to loadNewerMessages
    // when hasNewerMessages is true — the mark-read path is not taken.
    expect(spy).not.toHaveBeenCalled();
  });

  it('_checkAndMarkReadIfAtBottom resets the pill counter when the controller fires a mark-read', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    const resetSpy = vi.spyOn(store, 'resetNewMessagesCounter');
    vi.spyOn(page.unread, 'onScrollState').mockReturnValue(true);

    priv(page)._checkAndMarkReadIfAtBottom();

    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('_checkAndMarkReadIfAtBottom does NOT reset the pill counter when the controller suppresses the mark-read', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    const resetSpy = vi.spyOn(store, 'resetNewMessagesCounter');
    vi.spyOn(page.unread, 'onScrollState').mockReturnValue(false);

    priv(page)._checkAndMarkReadIfAtBottom();

    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('_jumpToBottom drains hasNewerMessages then routes through onPillJump', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');

    // Spy on loadNewerMessages — each call flips _hasNewerMessages
    // closer to false; after 2 calls report "caught up" so the loop
    // exits.
    let calls = 0;
    store.loadNewerMessages = vi.fn(async () => {
      calls++;
      if (calls >= 2) {
        (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages =
          false;
      }
    }) as typeof store.loadNewerMessages;
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages =
      true;

    const pillSpy = vi.spyOn(page.unread, 'onPillJump');

    await priv(page)._jumpToBottom();
    // Yield once for the rAF callback inside _jumpToBottom to run.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 10));

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(store.hasNewerMessages).toBe(false);
    expect(pillSpy).toHaveBeenCalledTimes(1);
    expect(pillSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        entityId: 'binary_sensor.meshcore_aa_ch_0_messages',
      }),
    );
  });

  it('the late-arriving lastRead block delegates the re-anchor decision to the controller', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const entityId = priv(page)._currentEntityId!;
    // Post-initial-render conditions the re-anchor block expects:
    // resolved conversation, no pending scroll already queued.
    priv(page)._pendingScroll = null;
    priv(page)._conversationResolved = true;
    const reanchorSpy = vi
      .spyOn(page.unread, 'maybeReanchorOnLateData')
      .mockReturnValue(true);

    // lastRead arrives → updated()'s late-arriving block fires and
    // hands the decision to the controller.
    page.lastRead = { [entityId]: 'late-anchor' };
    await page.updateComplete;

    expect(reanchorSpy).toHaveBeenCalledWith(entityId);
  });

  it('the late-arriving lastRead block does NOT queue a scroll when the controller declines to re-anchor', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const entityId = priv(page)._currentEntityId!;
    priv(page)._pendingScroll = null;
    priv(page)._conversationResolved = true;
    vi.spyOn(page.unread, 'maybeReanchorOnLateData').mockReturnValue(false);

    page.lastRead = { [entityId]: 'late-anchor' };
    await page.updateComplete;

    expect(priv(page)._pendingScroll).toBeNull();
  });
});

// ─── chat-page — selection lifecycle ─────────────────────────────────────
//
// chat-page-owned selection-state behavior that survived Phase 3
// unchanged (it never touched the moved read-progress fields). The
// entry-switch test is rewritten to assert the controller teardown
// (`endConversation`) rather than the deleted `_markReadFiredForEntity`
// flag; the never-auto-selects test is verbatim.
describe('chat-page — selection lifecycle', () => {
  it('entry switch tears down read-progress and auto-clears selectedId on the child', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    expect(priv(page)._conversationResolved).toBe(true);
    const endSpy = vi.spyOn(page.unread, 'endConversation');

    // Real-world repro: the parent panel writes
    // `this._pendingChatTarget = null` in `_selectDevice`, but
    // `_pendingChatTarget` is normally already null (conversation-
    // list clicks set `chat-page.selectedId` directly without
    // writing back to the parent). Lit's `.prop=` binding elides
    // null→null assignments, so the child's `selectedId` stays
    // stuck at the previous value unless the entry-id-changed
    // branch in `updated()` clears it explicitly. This test pins
    // that contract — only `config` is mutated here; if the child
    // doesn't self-clear, `selectedId` stays at '0' and
    // `_renderChatArea` falls into the "Conversation unavailable"
    // branch (a stale-selection regression observed during Phase 2
    // post-deploy testing). Phase 3: the entry-switch branch now
    // also calls `this.unread.endConversation()` to tear down the
    // controller's read-progress state.
    page.config = makeConfig({ entry_id: 'other-entry' });
    await page.updateComplete;
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(page.selectedId).toBeNull();
    expect(priv(page)._currentEntityId).toBeNull();
    expect(priv(page)._conversationResolved).toBe(false);
  });

  it('chat-page never auto-selects: empty-state on initial mount, after entry switch, and after channels-updated re-fire', async () => {
    // Phase 2 / Change 3.1 extension: the auto-select-first-
    // conversation branch was removed entirely. Every entry into
    // the chat tab lands on the empty-state placeholder. This test
    // pins all three code paths that historically fired auto-select:
    //   (1) initial mount with conversations populated,
    //   (2) entry switch (config.entry_id transitions),
    //   (3) parent re-firing `_loadDeviceData` after a subscribed
    //       `meshcore_channels_updated` event (config new ref, same
    //       entry_id, conversations new ref).
    // After Phase 2 none of these fire `selectedId`.

    // Path 1: initial mount with conversations populated, no
    // selection. Pre-Phase-2-extension this would auto-select '0'.
    const page = await mountChatPage({
      conversations: [makeChannel(0), makeChannel(1)],
    });
    expect(page.selectedId).toBeNull();
    expect(priv(page)._currentEntityId).toBeNull();

    // Manual selection still works.
    page.selectedId = '0';
    await page.updateComplete;
    expect(priv(page)._conversationResolved).toBe(true);

    // Path 2: entry switch.
    page.config = makeConfig({ entry_id: 'other-entry' });
    await page.updateComplete;
    expect(page.selectedId).toBeNull();

    // Path 3: subscribed event re-fires `_loadDeviceData` →
    // `_config` re-spreads with SAME entry_id; conversations
    // rebuilds. Without the auto-select branch, no automatic
    // selection happens regardless.
    page.config = makeConfig({ entry_id: 'other-entry' });
    page.conversations = [makeChannel(0), makeChannel(1)];
    await page.updateComplete;
    expect(page.selectedId).toBeNull();
    expect(priv(page)._currentEntityId).toBeNull();
  });
});

describe('Phase 4 — indicator visibility', () => {
  function indicatorVisible(page: ChatPage): boolean {
    return !!page.shadowRoot?.querySelector('.new-messages-indicator');
  }

  it('hidden when newMessagesWhileAway=0 AND hasNewerMessages=false', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    expect(priv(page)._messageStore?.newMessagesWhileAway).toBe(0);
    expect(priv(page)._messageStore?.hasNewerMessages).toBe(false);
    expect(indicatorVisible(page)).toBe(false);
  });

  it('visible when newMessagesWhileAway > 0', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 4;
    clearScrollSettlingState(page);
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
    const text = page.shadowRoot?.querySelector('.new-messages-indicator')?.textContent ?? '';
    expect(text).toContain('4');
    expect(text).toContain('new');
  });

  it('visible when hasNewerMessages=true (even with counter=0)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = true;
    clearScrollSettlingState(page);
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
  });

  // Phase 2 follow-up regression: pre-fix, the pill flashed for a
  // split-second on anchor-open then disappeared because the
  // pill-visibility helper flipped false the moment the anchor-scroll
  // landed the divider at the viewport top. The corrected
  // `_hasContentBelowViewport` semantic stays true while the latest
  // message is below the viewport, regardless of where the divider
  // is. Stub-based test: drive the helper return value directly
  // (happy-dom doesn't reliably compute getBoundingClientRect for the
  // chat container's scroll math).
  it('visible when last bubble is below viewport (anchor-open with all unread in after-window)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Stub the helper to return true (mimics: divider rendered AND
    // last bubble below viewport).
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => true;
    clearScrollSettlingState(page);
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
    const text =
      page.shadowRoot?.querySelector('.new-messages-indicator')?.textContent ?? '';
    expect(text).toContain('unread');
  });

  it('hidden when last bubble IS visible (user has reached conversation tail)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Stub the helper to return false (mimics: divider rendered but
    // last bubble at or within viewport).
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => false;
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(false);
  });

  // Phase 2 follow-up: label is "↓ latest" (not "↓ unread") when the
  // user has read everything currently known but is scrolled up. The
  // divider is preserved through the visit (anchor captured once, per
  // the proposal), so after mark_read advances the cursor and the
  // user scrolls back up the divider is still rendered and the last
  // bubble is below the viewport — but nothing is actually unread.
  // Avoids the misleading "↓ unread" label in this state.
  it('label is "↓ latest" when cursor is at the conversation tail (read everything, scrolled up)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    const entityId = priv(page)._currentEntityId!;
    expect(entityId).not.toBeNull();
    // Inject a single non-temp message and pin lastRead to its id —
    // mimics: cursor at conversation tail (latest visible), no
    // unloaded newer.
    (store as unknown as { _messages: ChatMessage[] })._messages = [
      {
        id: 'msg-tail-id',
        sender: 'someone',
        text: 'hello',
        timestamp: new Date(),
        isOutgoing: false,
        isSystem: false,
        raw: 'someone: hello',
        mentions: [],
      },
    ];
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Cursor at the buffer tail — seed the controller (the pill's
    // `cursorAtTail` query reads the controller, not the mirror).
    page.unread.ingestBackendData(
      { unread: {}, last_read: { [entityId]: 'msg-tail-id' } },
      null,
    );
    // Stub the unread-below-viewport check to true (user is scrolled
    // up; the divider is still rendered above the viewport, last
    // bubble below).
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => true;
    clearScrollSettlingState(page);
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
    const text =
      page.shadowRoot?.querySelector('.new-messages-indicator')?.textContent ?? '';
    expect(text).toContain('latest');
    expect(text).not.toContain('unread');
  });

  // No-unread-ever case: conversation has never had unread on this
  // visit (no divider rendered), but the user has scrolled up so the
  // latest message is off-screen. Pill should appear with label
  // "↓ latest" — a pure jump-to-current affordance. Earlier iterations
  // gated this on the divider element existing, which excluded this
  // case.
  it('label is "↓ latest" when no divider exists but the last bubble is below viewport', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    const entityId = priv(page)._currentEntityId!;
    (store as unknown as { _messages: ChatMessage[] })._messages = [
      {
        id: 'msg-only',
        sender: 'someone',
        text: 'hi',
        timestamp: new Date(),
        isOutgoing: false,
        isSystem: false,
        raw: 'someone: hi',
        mentions: [],
      },
    ];
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Cursor is at the buffer tail (conversation has been fully read
    // — possibly never had unread on this visit, so no divider was
    // rendered). Seed the controller — the pill's `cursorAtTail` query
    // reads the controller's `_lastRead`, not chat-page's mirror.
    page.unread.ingestBackendData(
      { unread: {}, last_read: { [entityId]: 'msg-only' } },
      null,
    );
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => true;
    clearScrollSettlingState(page);
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
    const text =
      page.shadowRoot?.querySelector('.new-messages-indicator')?.textContent ?? '';
    expect(text).toContain('latest');
  });

  // Phase 2 follow-up: suppress the pill during the conversation-
  // switch scroll-into-place window. Between buffer-populated and
  // the rAF-scheduled scroll executing, `scrollTop=0` makes the
  // last bubble appear below viewport — without this gate the pill
  // briefly flashes "↓ latest" or "↓ unread" for one or two frames
  // before the scroll lands. Two signals are checked: `_pendingScroll`
  // (a scroll mode is queued in `_onConversationSelected`) and
  // `_scrollInFlight` (`_executeScroll` is in the middle of its
  // rAF chain). Either means the viewport hasn't settled.
  it('hidden when _pendingScroll is set (queued scroll-to-bottom on conversation switch)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _messages: ChatMessage[] })._messages = [
      {
        id: 'msg-1',
        sender: 'someone',
        text: 'hi',
        timestamp: new Date(),
        isOutgoing: false,
        isSystem: false,
        raw: 'someone: hi',
        mentions: [],
      },
    ];
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Stub the visibility gate to true (last bubble below viewport,
    // pre-scroll state) — without the pendingScroll guard this would
    // make the pill render.
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => true;
    // Pre-scroll: queued mode set, scroll not yet in flight.
    priv(page)._pendingScroll = 'bottom';
    priv(page)._scrollInFlight = false;
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(false);
  });

  it('hidden when _scrollInFlight is true (executor running, viewport not yet at target)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _messages: ChatMessage[] })._messages = [
      {
        id: 'msg-1',
        sender: 'someone',
        text: 'hi',
        timestamp: new Date(),
        isOutgoing: false,
        isSystem: false,
        raw: 'someone: hi',
        mentions: [],
      },
    ];
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => true;
    // Mid-scroll: pendingScroll cleared, scroll executor still running.
    priv(page)._pendingScroll = null;
    priv(page)._scrollInFlight = true;
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(false);
  });

  // Empty buffer guard: even if some other gate would suggest pill
  // visibility, an empty buffer has nothing to scroll TO, so the pill
  // must hide.
  it('hidden when buffer is empty even with last-bubble-not-visible', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    (store as unknown as { _messages: ChatMessage[] })._messages = [];
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Don't stub _hasContentBelowViewport — let it run normally with
    // an empty buffer; it should return false on its own.
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(false);
  });

  // Companion to the test above: when the cursor is NOT at the
  // conversation tail (lastRead < buffer's last id), label stays
  // "↓ unread".
  it('label is "↓ unread" when buffer has unread past the cursor', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');
    const entityId = priv(page)._currentEntityId!;
    (store as unknown as { _messages: ChatMessage[] })._messages = [
      {
        id: 'msg-older',
        sender: 'someone',
        text: 'older',
        timestamp: new Date(),
        isOutgoing: false,
        isSystem: false,
        raw: 'someone: older',
        mentions: [],
      },
      {
        id: 'msg-newer',
        sender: 'someone',
        text: 'newer',
        timestamp: new Date(),
        isOutgoing: false,
        isSystem: false,
        raw: 'someone: newer',
        mentions: [],
      },
    ];
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages = false;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway = 0;
    // Cursor at older message → newer is unread. Seed the controller —
    // the pill's `cursorAtTail` query reads the controller's
    // `_lastRead`, not chat-page's mirror.
    page.unread.ingestBackendData(
      { unread: {}, last_read: { [entityId]: 'msg-older' } },
      null,
    );
    (page as unknown as { _hasContentBelowViewport: () => boolean })._hasContentBelowViewport =
      () => true;
    clearScrollSettlingState(page);
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
    const text =
      page.shadowRoot?.querySelector('.new-messages-indicator')?.textContent ?? '';
    expect(text).toContain('unread');
    expect(text).not.toContain('latest');
  });
});

// The Phase 1 divider-projection tests that used to live here moved
// into unread-controller.test.ts §"dividerAfterGroupIdx" — they poked
// the now-deleted `_renderItemsWithDivider` + `_anchorIdAtSelection` /
// `_unreadCountAtSelection` privates, and the divider logic is now a
// pure projection on the controller. The Phase 3 send-then-switch
// fix is covered there too (the leading-outgoing-skip case).
