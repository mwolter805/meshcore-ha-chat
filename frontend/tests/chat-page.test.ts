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
    page.requestUpdate();
    await page.updateComplete;
    expect(indicatorVisible(page)).toBe(true);
  });
});
