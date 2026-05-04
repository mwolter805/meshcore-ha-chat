// @vitest-environment node

import { describe, expect, it, afterEach } from 'vitest';
import { MessageStore } from '../src/chat/message-store';
import type {
  HomeAssistant,
  HassEvent,
  PanelConfig,
  StoredMessage,
} from '../src/types';

// Phase 3 plumbing tests for MessageStore (Change 7).
//
// Covers the five vitest cases called out in `Proposed - Last-Read Anchor
// and Read-Receipt Refinement for Chat Panel.md` §Testing "Automated —
// frontend":
//
//   1. switchEntity with anchor calls getMessagesAround — verifies WS
//      payload + message hydration + has_more flag wiring.
//   2. loadNewerMessages appends and updates hasNewerMessages — short
//      response flips the flag.
//   3. _pollFetch is a no-op while hasNewerMessages is true — guard
//      verification.
//   4. realtime event counter discipline — increments while away,
//      doesn't while at-bottom + !hasNewerMessages, but DOES while
//      at-bottom + hasNewerMessages (R5c partial-buffer carve-out).
//   5. resetNewMessagesCounter zeros the counter and notifies.
//
// Plus one bonus pair on `setUserAtBottom`'s R5c reset path (counter
// clears on away→at-bottom transition only when caught up).
//
// Tests run in the `node` env (no DOM needed). Vitest's default config
// is `environment: 'node'`; the per-file pragma above pins it explicitly
// so a future config flip to happy-dom doesn't quietly bring jsdom
// timing artefacts into these unit tests.

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
    ...overrides,
  };
}

interface MockHassOpts {
  callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
}

function makeMockHass(opts: MockHassOpts = {}): HomeAssistant {
  const callWS =
    opts.callWS ?? (async () => ({ messages: [], has_more: false }));
  return {
    states: {},
    entities: {},
    callApi: async () => ({}) as never,
    callService: async () => {},
    callWS: callWS as <T>(msg: Record<string, unknown>) => Promise<T>,
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

function makeStored(
  id: string,
  ts: string,
  sender = 'Bob',
  text = 'hi',
): StoredMessage {
  return {
    id,
    sender,
    text,
    timestamp: ts,
    message_type: 'channel',
    outgoing: false,
    rx_log_data: [],
    delivery_status: 'delivered',
  };
}

// Type-cast handle for accessing private fields/methods MessageStore
// keeps under TS's `private` modifier. The runtime is plain JS so the
// cast is purely a TS hatch; it is the cleanest way to test internal
// invariants like `_pollFetch`'s guard without inflating the public
// surface for tests-only use.
interface PrivateMessageStore {
  _handleRealtimeMessage(d: Record<string, unknown>): void;
  _pollFetch(entityId: string): Promise<void>;
  _hasNewerMessages: boolean;
  _userAtBottom: boolean;
  _newMessagesWhileAway: number;
  _entityId: string | null;
}
function priv(store: MessageStore): PrivateMessageStore {
  return store as unknown as PrivateMessageStore;
}

// MessageStore schedules a 30s polling timer inside _startPolling and a
// 500 ms debounce timer inside _debouncedFetch. destroy() clears both.
// Track every store created in a test and tear them down in afterEach so
// no setTimeout leaks across cases.
let stores: MessageStore[] = [];
function track(store: MessageStore): MessageStore {
  stores.push(store);
  return store;
}
afterEach(() => {
  stores.forEach((s) => s.destroy());
  stores = [];
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe('MessageStore Phase 3 — switchEntity with anchor', () => {
  it('routes through meshcore_chat/get_messages_around and hydrates messages', async () => {
    const calls: Record<string, unknown>[] = [];
    const hass = makeMockHass({
      callWS: async (msg) => {
        calls.push(msg);
        if (msg.type === 'meshcore_chat/get_messages_around') {
          return {
            messages: [
              makeStored('id-1', '2026-05-04T12:00:00Z', 'Alice', 'older'),
              makeStored('id-2', '2026-05-04T12:00:01Z', 'Bob', 'anchor'),
              makeStored('id-3', '2026-05-04T12:00:02Z', 'Carol', 'newer'),
            ],
            anchor_index: 1,
            has_more_before: true,
            has_more_after: true,
            anchor_found: true,
          };
        }
        return { messages: [], has_more: false };
      },
    });
    const store = track(new MessageStore(makeConfig()));
    store.setHass(hass);

    await store.switchEntity('binary_sensor.x', 'id-2');

    // 1. Verify the new endpoint was called with the keyed payload from Change 6
    const around = calls.find(
      (c) => c.type === 'meshcore_chat/get_messages_around',
    );
    expect(around).toMatchObject({
      type: 'meshcore_chat/get_messages_around',
      entity_id: 'binary_sensor.x',
      anchor_id: 'id-2',
      before_limit: 25,
      after_limit: 50,
    });

    // 2. The newest-50 path must NOT be hit when an anchor is supplied
    expect(
      calls.find((c) => c.type === 'meshcore_chat/get_stored_messages'),
    ).toBeUndefined();

    // 3. Hydration: 3 messages loaded, sorted chronologically by timestamp
    expect(store.messages.map((m) => m.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(store.messages[1].sender).toBe('Bob');
    expect(store.messages[1].text).toBe('anchor');

    // 4. has_more flags wired from response (proposal Phase 2 caveat
    //    spelled out: BOTH directions must seed for Phase 4 lazy-load
    //    triggers to fire correctly).
    expect(store.hasOlderMessages).toBe(true);
    expect(store.hasNewerMessages).toBe(true);
  });

  it('falls back to newest-50 path when anchorId is omitted (default null)', async () => {
    const calls: Record<string, unknown>[] = [];
    const hass = makeMockHass({
      callWS: async (msg) => {
        calls.push(msg);
        if (msg.type === 'meshcore_chat/get_stored_messages') {
          return { messages: [], has_more: false };
        }
        throw new Error(`unexpected ws call: ${String(msg.type)}`);
      },
    });
    const store = track(new MessageStore(makeConfig()));
    store.setHass(hass);

    await store.switchEntity('binary_sensor.x');

    expect(
      calls.find((c) => c.type === 'meshcore_chat/get_messages_around'),
    ).toBeUndefined();
    expect(
      calls.find((c) => c.type === 'meshcore_chat/get_stored_messages'),
    ).toBeDefined();
    // _fetchMessages only seeds _hasOlderMessages from the response;
    // _hasNewerMessages is left at its `false` default per the
    // newest-50 path's invariant ("buffer tail = conversation newest").
    expect(store.hasNewerMessages).toBe(false);
  });
});

describe('MessageStore Phase 3 — loadNewerMessages', () => {
  it('appends after-cursor batches and flips hasNewerMessages when has_more goes false', async () => {
    const responses: Array<Record<string, unknown>> = [
      // [0] anchor open: 1 message, has_more_after=true
      {
        messages: [makeStored('anchor', '2026-05-04T12:00:00Z', 'Bob', 'a')],
        anchor_index: 0,
        has_more_before: false,
        has_more_after: true,
        anchor_found: true,
      },
      // [1] first loadNewerMessages: 2 newer, has_more still true
      {
        messages: [
          makeStored('newer-1', '2026-05-04T12:00:01Z', 'Bob', 'b'),
          makeStored('newer-2', '2026-05-04T12:00:02Z', 'Bob', 'c'),
        ],
        has_more: true,
      },
      // [2] second loadNewerMessages: 1 newer, has_more flips false
      {
        messages: [makeStored('newer-3', '2026-05-04T12:00:03Z', 'Bob', 'd')],
        has_more: false,
      },
    ];
    const calls: Record<string, unknown>[] = [];
    let storedIdx = 0;
    const hass = makeMockHass({
      callWS: async (msg) => {
        calls.push(msg);
        if (msg.type === 'meshcore_chat/get_messages_around') {
          return responses[0];
        }
        if (msg.type === 'meshcore_chat/get_stored_messages') {
          storedIdx++;
          return responses[storedIdx] ?? { messages: [], has_more: false };
        }
        return { messages: [], has_more: false };
      },
    });
    const store = track(new MessageStore(makeConfig()));
    store.setHass(hass);

    await store.switchEntity('binary_sensor.x', 'anchor');
    expect(store.hasNewerMessages).toBe(true);
    expect(store.messages.map((m) => m.id)).toEqual(['anchor']);

    // First load: appends 2 newer; flag remains true (has_more=true)
    await store.loadNewerMessages();
    expect(store.messages.map((m) => m.id)).toEqual([
      'anchor',
      'newer-1',
      'newer-2',
    ]);
    expect(store.hasNewerMessages).toBe(true);
    // Cursor was the newest non-temporary id at call time (i.e., 'anchor').
    // Reverse-iterate to find the most recent get_stored_messages call —
    // avoids Array#findLast (es2023; tsconfig target may be older).
    let firstAfter: Record<string, unknown> | undefined;
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].type === 'meshcore_chat/get_stored_messages') {
        firstAfter = calls[i];
        break;
      }
    }
    expect(firstAfter).toMatchObject({
      type: 'meshcore_chat/get_stored_messages',
      entity_id: 'binary_sensor.x',
      limit: 50,
      after: 'anchor',
    });

    // Second load: appends 1 newer; flag flips false (caught up)
    await store.loadNewerMessages();
    expect(store.messages.map((m) => m.id)).toEqual([
      'anchor',
      'newer-1',
      'newer-2',
      'newer-3',
    ]);
    expect(store.hasNewerMessages).toBe(false);

    // Third load: short-circuits early (no new WS call issued)
    const callsBefore = calls.length;
    await store.loadNewerMessages();
    expect(calls.length).toBe(callsBefore);
  });
});

describe('MessageStore Phase 3 — _pollFetch guard', () => {
  it('is a no-op while hasNewerMessages is true', async () => {
    const calls: Record<string, unknown>[] = [];
    const hass = makeMockHass({
      callWS: async (msg) => {
        calls.push(msg);
        if (msg.type === 'meshcore_chat/get_messages_around') {
          return {
            messages: [makeStored('a', '2026-05-04T12:00:00Z')],
            anchor_index: 0,
            has_more_before: true,
            has_more_after: true,
            anchor_found: true,
          };
        }
        return { messages: [], has_more: false };
      },
    });
    const store = track(new MessageStore(makeConfig()));
    store.setHass(hass);
    await store.switchEntity('binary_sensor.x', 'a');
    expect(store.hasNewerMessages).toBe(true);

    const baseline = calls.length;
    await priv(store)._pollFetch('binary_sensor.x');
    // The guard short-circuits before any WS round-trip would fire
    expect(calls.length).toBe(baseline);
  });

  it('proceeds normally when hasNewerMessages is false', async () => {
    const calls: Record<string, unknown>[] = [];
    const hass = makeMockHass({
      callWS: async (msg) => {
        calls.push(msg);
        return { messages: [], has_more: false };
      },
    });
    const store = track(new MessageStore(makeConfig()));
    store.setHass(hass);
    await store.switchEntity('binary_sensor.x'); // newest-50 path; hasNewerMessages stays false
    expect(store.hasNewerMessages).toBe(false);

    const baseline = calls.length;
    await priv(store)._pollFetch('binary_sensor.x');
    expect(calls.length).toBe(baseline + 1);
  });
});

describe('MessageStore Phase 3 — _handleRealtimeMessage counter discipline', () => {
  // A bare-bones store fixture that side-steps switchEntity so we can
  // exercise _handleRealtimeMessage in isolation without spinning up
  // polling/subscription side effects. Setting _entityId directly is a
  // narrow private hatch only this test family uses.
  function setupStore(): MessageStore {
    const hass = makeMockHass({
      callWS: async () => ({ messages: [], has_more: false }),
    });
    const store = track(new MessageStore(makeConfig()));
    store.setHass(hass);
    priv(store)._entityId = 'binary_sensor.x';
    return store;
  }

  function fakeIncoming(seq: number): Record<string, unknown> {
    return {
      entity_id: 'binary_sensor.x',
      sender_name: 'Bob',
      message: `hello-${seq}`,
      timestamp: `2026-05-04T12:00:0${seq}.000Z`,
    };
  }

  it('increments newMessagesWhileAway when user is not at-bottom', () => {
    const store = setupStore();
    expect(store.newMessagesWhileAway).toBe(0);
    // Default: _userAtBottom is false, _hasNewerMessages is false
    priv(store)._handleRealtimeMessage(fakeIncoming(1));
    priv(store)._handleRealtimeMessage(fakeIncoming(2));
    expect(store.newMessagesWhileAway).toBe(2);
  });

  it('does NOT increment when user is at-bottom AND !hasNewerMessages', () => {
    const store = setupStore();
    store.setUserAtBottom(true);
    expect(store.hasNewerMessages).toBe(false);
    priv(store)._handleRealtimeMessage(fakeIncoming(1));
    expect(store.newMessagesWhileAway).toBe(0);
  });

  it('DOES increment when user is at-bottom but hasNewerMessages is true (R5c)', () => {
    // R5c carve-out: being at the bottom of a partial buffer with
    // unloaded newer messages on disk is *not* the same as being
    // caught up. The indicator should still tick on incoming arrivals
    // until loadNewerMessages flips _hasNewerMessages false.
    const store = setupStore();
    store.setUserAtBottom(true);
    priv(store)._hasNewerMessages = true;
    priv(store)._handleRealtimeMessage(fakeIncoming(1));
    expect(store.newMessagesWhileAway).toBe(1);
  });

  it('does NOT count outgoing messages from this node', () => {
    const store = setupStore();
    priv(store)._handleRealtimeMessage({
      entity_id: 'binary_sensor.x',
      sender_name: 'TestNode', // matches makeConfig().node_name
      message: 'mine',
      timestamp: '2026-05-04T12:00:00Z',
    });
    expect(store.newMessagesWhileAway).toBe(0);
  });
});

describe('MessageStore Phase 3 — resetNewMessagesCounter', () => {
  it('zeros the counter and notifies', () => {
    const store = track(new MessageStore(makeConfig()));
    let notified = 0;
    store.setOnChange(() => {
      notified++;
    });
    priv(store)._newMessagesWhileAway = 3;
    const baseline = notified;

    store.resetNewMessagesCounter();
    expect(store.newMessagesWhileAway).toBe(0);
    expect(notified).toBe(baseline + 1);

    // Subsequent call when already 0 is a no-op (no extra notify)
    store.resetNewMessagesCounter();
    expect(notified).toBe(baseline + 1);
  });
});

describe('MessageStore Phase 3 — setUserAtBottom R5c reset', () => {
  it('clears the counter on transition to at-bottom when caught up', () => {
    const store = track(new MessageStore(makeConfig()));
    let notified = 0;
    store.setOnChange(() => {
      notified++;
    });
    priv(store)._newMessagesWhileAway = 4;
    expect(priv(store)._hasNewerMessages).toBe(false);

    store.setUserAtBottom(true);
    expect(store.newMessagesWhileAway).toBe(0);
    expect(notified).toBeGreaterThan(0);
  });

  it('does NOT clear counter when at-bottom but hasNewerMessages is still true', () => {
    const store = track(new MessageStore(makeConfig()));
    priv(store)._newMessagesWhileAway = 4;
    priv(store)._hasNewerMessages = true;

    store.setUserAtBottom(true);
    expect(store.newMessagesWhileAway).toBe(4);
  });

  it('is idempotent (same value as current state is a no-op)', () => {
    const store = track(new MessageStore(makeConfig()));
    let notified = 0;
    store.setOnChange(() => {
      notified++;
    });
    priv(store)._newMessagesWhileAway = 2;

    // Counter is 2; default _userAtBottom is false. Re-asserting false
    // should not fire any notify or reset.
    store.setUserAtBottom(false);
    expect(store.newMessagesWhileAway).toBe(2);
    expect(notified).toBe(0);
  });
});
