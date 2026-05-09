// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { html, render } from 'lit';

// Mock the api module — chat-page imports markConversationRead /
// sendDirectMessage / sendChannelMessage from '../api'. We need to
// observe the markConversationRead call (Phase 4 behaviour assertions
// are entirely about WHEN it does and doesn't fire) while keeping the
// other helpers stub-callable. message-store imports `getMessagesAround`
// from the same module — also mocked here so anchor-based opens don't
// hit a real network path.
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
import { markConversationRead } from '../src/api';
import { MARK_READ_GRACE_PERIOD_MS } from '../src/constants';
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
  _markReadGraceUntil: number;
  _postSwitchMarkReadTimer: ReturnType<typeof setTimeout> | null;
  /** Change 3.2 — set inside `_markActiveRead`, reset in
      `_onConversationSelected` and the entry-id-changed branch of
      `updated()`. Tests in the R9 lifecycle suite read/write this
      field directly. */
  _markReadFiredForEntity: string | null;
  _conversationResolved: boolean;
  _anchorIdAtSelection: string | null;
  _pendingScroll: 'bottom' | 'last-read' | null;
  _scrollInFlight: boolean;
  _markActiveRead(entityId: string | null): void;
  _onConversationSelected(): void;
  _onChatScroll(e: Event): void;
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

  render(
    html`
      <meshcore-chat-page
        .hass=${hass}
        .config=${config}
        .conversations=${conversations}
        .unreadCounts=${unreadCounts}
        .lastRead=${lastRead}
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

describe('Phase 4 — clicking a conversation does NOT call markConversationRead', () => {
  it('selecting a conversation only switches entity, does not mark-read', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0)],
      unreadCounts: { 'binary_sensor.meshcore_aa_ch_0_messages': 5 },
    });
    expect(markConversationRead).not.toHaveBeenCalled();

    // Drive selection via the property — same code path as the
    // conversation-list's `conversation-selected` event handler ends up
    // invoking (`updated()` watches `selectedId` and calls
    // `_onConversationSelected`).
    page.selectedId = '0';
    await page.updateComplete;

    expect(markConversationRead).not.toHaveBeenCalled();
  });
});

describe('Phase 4 — viewport-based mark-read trigger', () => {
  it('scroll near bottom with hasNewerMessages=false fires markConversationRead', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0)],
    });
    page.selectedId = '0';
    await page.updateComplete;
    // Drain the post-switch grace period so the first auto-mark-read
    // is allowed to fire.
    priv(page)._markReadGraceUntil = 0;
    // Bug #2 fix: chat-page now also gates on geometric "last bubble
    // visible". Stub it true since the test environment has no
    // rendered message bubbles (chat-page renders the empty-state
    // when MessageStore.messages is empty).
    stubLastMessageVisible(page, true);
    expect(priv(page)._messageStore?.hasNewerMessages).toBe(false);

    // Build a synthetic scroll event whose `target` reports a viewport
    // sitting at the bottom of the container. Phase 4's
    // `_onChatScroll` reads scrollTop / scrollHeight / clientHeight off
    // `e.target`, so a plain object stand-in is enough — we don't have
    // to render a tall enough <div> to actually overflow.
    const fakeContainer = {
      scrollTop: 1000,
      scrollHeight: 1000,
      clientHeight: 1000,
    } as unknown as HTMLElement;
    priv(page)._onChatScroll({ target: fakeContainer } as unknown as Event);

    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });

  it('scroll near bottom with hasNewerMessages=true does NOT fire markConversationRead', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0)],
    });
    page.selectedId = '0';
    await page.updateComplete;
    priv(page)._markReadGraceUntil = 0;
    // Force the buffer-tail-not-newest condition (R5c carve-out: being
    // at the bottom of an after-window with unloaded newer messages on
    // disk is *not* the same as being caught up).
    const store = priv(page)._messageStore;
    if (store) {
      (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages =
        true;
    }
    // Last bubble would be visible from the geometric standpoint, but
    // the !hasNewerMessages gate should still reject mark-read.
    stubLastMessageVisible(page, true);
    expect(priv(page)._messageStore?.hasNewerMessages).toBe(true);

    const fakeContainer = {
      scrollTop: 1000,
      scrollHeight: 1000,
      clientHeight: 1000,
    } as unknown as HTMLElement;
    priv(page)._onChatScroll({ target: fakeContainer } as unknown as Event);

    expect(markConversationRead).not.toHaveBeenCalled();
  });

  // Bug #2 regression (post-Phase-4 fix). Pre-fix, mark-read fired
  // whenever distFromBottom < 150 px, so the user could be 1-2 message
  // bubbles short of the actual newest message and the cursor would
  // still advance. The geometric `_isLastMessageVisible` gate fixes
  // that — even when distFromBottom looks "near bottom" by pixels,
  // mark-read is suppressed if the last bubble's bottom edge is
  // below the container's bottom edge.
  it('scroll near bottom but last bubble NOT visible does NOT fire markConversationRead (Bug #2)', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0)],
    });
    page.selectedId = '0';
    await page.updateComplete;
    priv(page)._markReadGraceUntil = 0;
    // Geometric gate says: last bubble is below the container bottom
    // (e.g. user is 80 px short of seeing the newest message, but
    // distFromBottom = 80 < 150 still triggers atBottom in the
    // pre-fix code).
    stubLastMessageVisible(page, false);

    const fakeContainer = {
      scrollTop: 1000,
      scrollHeight: 1000,
      clientHeight: 1000,
    } as unknown as HTMLElement;
    priv(page)._onChatScroll({ target: fakeContainer } as unknown as Event);

    expect(markConversationRead).not.toHaveBeenCalled();
  });
});

describe('Phase 4 — mark-read 1000ms grace period after switch', () => {
  it('first auto-mark-read after switch is suppressed for MARK_READ_GRACE_PERIOD_MS', async () => {
    // Anchor the value to the constant so the test name and the
    // assertion drift together. Also pins the proposal's stale "500ms"
    // line in §"Implementation Order" — Phase 4's own commit fixes
    // that to 1000ms.
    expect(MARK_READ_GRACE_PERIOD_MS).toBe(1000);

    const page = await mountChatPage({
      conversations: [makeChannel(0)],
    });
    page.selectedId = '0';
    await page.updateComplete;
    // Bug #2 fix gate — make sure the grace-period gate is the one
    // suppressing the call, not the geometric gate.
    stubLastMessageVisible(page, true);

    // Grace timer is armed by `_onConversationSelected` to roughly
    // `Date.now() + MARK_READ_GRACE_PERIOD_MS`. Give it a small slack
    // window for the time elapsed since the property assignment above.
    const remaining = priv(page)._markReadGraceUntil - Date.now();
    expect(remaining).toBeGreaterThan(MARK_READ_GRACE_PERIOD_MS - 500);
    expect(remaining).toBeLessThanOrEqual(MARK_READ_GRACE_PERIOD_MS);

    // Inside the grace window: scroll-to-bottom does NOT fire mark-read.
    priv(page)._checkAndMarkReadIfAtBottom();
    expect(markConversationRead).not.toHaveBeenCalled();

    // Past the grace window: same call DOES fire mark-read.
    // (Phase 2 / Change 2.1: the user-engagement scroll gate was
    // removed; the grace-period gate is the only one left for this
    // case.)
    priv(page)._markReadGraceUntil = 0;
    priv(page)._checkAndMarkReadIfAtBottom();
    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });
});

// Bug #1 regression (post-Phase-4 fix). Pre-fix, low-unread opens
// would leave the indicator stuck visible because the divider's
// scroll-into-view fires its scroll event INSIDE the grace window,
// the synchronous mark-read gets suppressed, and no further scroll
// events fire on their own. The fix is a deferred re-check
// scheduled in `_onConversationSelected` for
// `MARK_READ_GRACE_PERIOD_MS` later.
describe('Bug #1 — deferred mark-read after grace period elapses', () => {
  it('switchEntity arms a one-shot timer that fires markConversationRead after grace', async () => {
    vi.useFakeTimers();
    try {
      const page = await mountChatPage({
        conversations: [makeChannel(0)],
      });
      // Geometric "last bubble visible" must return true for the
      // deferred re-check to fire — otherwise we'd be testing two
      // gates at once. Real low-unread opens land the user with the
      // last bubble visible (1-2 unread fit in the viewport easily).
      stubLastMessageVisible(page, true);

      page.selectedId = '0';
      await page.updateComplete;

      // Timer is now armed; pre-elapse, nothing has fired.
      expect(priv(page)._postSwitchMarkReadTimer).not.toBeNull();
      expect(markConversationRead).not.toHaveBeenCalled();

      // Advance fake timers past the grace period. The timer's
      // callback runs, _checkAndMarkReadIfAtBottom is called, all
      // gates pass, mark-read fires.
      vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 50);
      expect(markConversationRead).toHaveBeenCalledTimes(1);
      expect(priv(page)._postSwitchMarkReadTimer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a quick conversation flip cancels the in-flight deferred re-check', async () => {
    vi.useFakeTimers();
    try {
      const page = await mountChatPage({
        conversations: [makeChannel(0), makeChannel(1)],
      });
      stubLastMessageVisible(page, true);

      page.selectedId = '0';
      await page.updateComplete;
      const firstTimer = priv(page)._postSwitchMarkReadTimer;
      expect(firstTimer).not.toBeNull();

      // User flips to a different conversation before the grace
      // period elapses. The first timer should be cancelled and a
      // fresh one armed for the new entity.
      page.selectedId = '1';
      await page.updateComplete;
      const secondTimer = priv(page)._postSwitchMarkReadTimer;
      expect(secondTimer).not.toBe(firstTimer);

      // Elapse the grace period. Only ONE mark-read fires (for
      // entity '1'), not two — the entity '0' timer was cancelled.
      vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 50);
      expect(markConversationRead).toHaveBeenCalledTimes(1);
      // The fired call's first arg (entity_id) should be channel 1's
      // entity, confirming the cancelled timer didn't slip through.
      const lastCall = (markConversationRead as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(lastCall[1]).toBe('binary_sensor.meshcore_aa_ch_1_messages');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Phase 4 — _jumpToBottom loads any unloaded newer messages and scrolls', () => {
  it('drains hasNewerMessages, scrolls to bottom, fires mark-read, resets counter', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0)],
    });
    page.selectedId = '0';
    await page.updateComplete;

    const store = priv(page)._messageStore;
    if (!store) throw new Error('expected store');

    // Spy on loadNewerMessages — count how many times the loop iterates.
    // Each call flips _hasNewerMessages closer to false; after 2 calls
    // we report "caught up" so the loop exits.
    let calls = 0;
    const original = store.loadNewerMessages.bind(store);
    store.loadNewerMessages = vi.fn(async () => {
      calls++;
      if (calls >= 2) {
        (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages =
          false;
      }
      // Don't actually invoke the original — it would callWS through
      // hass.callWS and we want this test to be a unit test of the
      // jump-loop only. `original` is held as a no-op fallback.
      void original;
    }) as typeof store.loadNewerMessages;

    // Pre-set state: there are unloaded newer messages on disk AND the
    // counter has accumulated arrivals.
    (store as unknown as { _hasNewerMessages: boolean })._hasNewerMessages =
      true;
    (store as unknown as { _newMessagesWhileAway: number })._newMessagesWhileAway =
      3;
    expect(store.hasNewerMessages).toBe(true);
    expect(store.newMessagesWhileAway).toBe(3);

    // Bypass grace period — _jumpToBottom is a user-explicit action.
    priv(page)._markReadGraceUntil = 0;
    // _jumpToBottom scrolls to scrollHeight which IS the actual
    // bottom; in the real DOM the last bubble would be visible. Stub
    // it true since the test environment has no rendered bubbles.
    stubLastMessageVisible(page, true);

    await priv(page)._jumpToBottom();
    // Yield once for the rAF callback inside _jumpToBottom to run.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 10));

    // Loop iterated until hasNewerMessages flipped false.
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(store.hasNewerMessages).toBe(false);
    // Mark-read fired (confirms _checkAndMarkReadIfAtBottom ran past
    // the now-zero grace timer).
    expect(markConversationRead).toHaveBeenCalled();
    // Counter reset by the chained resetNewMessagesCounter inside
    // _checkAndMarkReadIfAtBottom.
    expect(store.newMessagesWhileAway).toBe(0);
  });
});

// R9 (Phase 2 / Change 3.2). The `_markReadFiredForEntity` field
// replaces the previous draft's misuse of `_postSwitchMarkReadTimer`
// as a "mark_read has not fired" signal. Pin its lifecycle so a
// future refactor can't silently bypass `_markActiveRead` and break
// the late-arriving-`lastRead` block's correctness.
describe('Phase 2 / R9 — _markReadFiredForEntity lifecycle', () => {
  it('starts null', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    expect(priv(page)._markReadFiredForEntity).toBeNull();
  });

  it('_markActiveRead(entityId) sets the flag to that entity', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const entityId = priv(page)._currentEntityId;
    expect(entityId).not.toBeNull();
    expect(priv(page)._markReadFiredForEntity).toBeNull();

    priv(page)._markActiveRead(entityId);
    expect(priv(page)._markReadFiredForEntity).toBe(entityId);
  });

  it('_markActiveRead(null) is a no-op (does NOT set the flag)', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    priv(page)._markReadFiredForEntity = 'preexisting';
    priv(page)._markActiveRead(null);
    // Pre-existing value preserved: the early-return path inside
    // `_markActiveRead` short-circuits before the assignment, which
    // is fine because there's no entity context for the flag to
    // pertain to.
    expect(priv(page)._markReadFiredForEntity).toBe('preexisting');
  });

  it('conversation switch resets the flag', async () => {
    const page = await mountChatPage({
      conversations: [makeChannel(0), makeChannel(1)],
    });
    page.selectedId = '0';
    await page.updateComplete;
    priv(page)._markActiveRead(priv(page)._currentEntityId);
    expect(priv(page)._markReadFiredForEntity).not.toBeNull();

    // Flip to the other conversation — `_onConversationSelected`
    // resets the flag.
    page.selectedId = '1';
    await page.updateComplete;
    expect(priv(page)._markReadFiredForEntity).toBeNull();
  });

  it('entry switch resets the flag and auto-clears selectedId on the child', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    priv(page)._markActiveRead(priv(page)._currentEntityId);
    expect(priv(page)._markReadFiredForEntity).not.toBeNull();
    expect(priv(page)._conversationResolved).toBe(true);

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
    // post-deploy testing).
    page.config = makeConfig({ entry_id: 'other-entry' });
    await page.updateComplete;
    expect(priv(page)._markReadFiredForEntity).toBeNull();
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

  it('late-arriving lastRead re-anchors when the flag is null', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const entityId = priv(page)._currentEntityId!;
    // Simulate the fresh-panel-load race: the user picked the
    // conversation before lastRead arrived, so the anchor was
    // captured as null and pendingScroll fell through to 'bottom'
    // (which the executor already consumed during the initial
    // updated() pass). Force the post-initial-render conditions the
    // re-anchor block expects.
    priv(page)._anchorIdAtSelection = null;
    priv(page)._pendingScroll = null;
    priv(page)._conversationResolved = true;
    priv(page)._markReadFiredForEntity = null;

    // lastRead arrives.
    page.lastRead = { [entityId]: 'msg-anchor-id' };
    await page.updateComplete;

    expect(priv(page)._anchorIdAtSelection).toBe('msg-anchor-id');
  });

  it('late-arriving lastRead does NOT re-anchor when mark_read already fired for this entity', async () => {
    const page = await mountChatPage({ conversations: [makeChannel(0)] });
    page.selectedId = '0';
    await page.updateComplete;
    const entityId = priv(page)._currentEntityId!;
    // Simulate: user opened the conversation, mark_read fired
    // (scroll-driven or otherwise — see _markActiveRead set-site).
    priv(page)._anchorIdAtSelection = null;
    priv(page)._pendingScroll = null;
    priv(page)._conversationResolved = true;
    priv(page)._markReadFiredForEntity = entityId; // <-- fired

    // lastRead arrives — but it now reflects the conversation tail
    // (mark_read advanced it). Re-anchoring here would suppress the
    // divider entirely. The block must decline.
    page.lastRead = { [entityId]: 'msg-tail-id' };
    await page.updateComplete;

    expect(priv(page)._anchorIdAtSelection).toBeNull();
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
    page.lastRead = { [entityId]: 'msg-tail-id' };
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
    // rendered).
    page.lastRead = { [entityId]: 'msg-only' };
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
    // Cursor at older message → newer is unread.
    page.lastRead = { [entityId]: 'msg-older' };
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
