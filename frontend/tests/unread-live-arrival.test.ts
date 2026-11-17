// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageStore } from '../src/chat/message-store';
import { UnreadController, markReadTailKey } from '../src/chat/unread-controller';
import { MARK_READ_GRACE_PERIOD_MS } from '../src/constants';
import type { HomeAssistant, PanelConfig, StoredMessage } from '../src/types';

// Regression: an incoming message that arrives while the user sits at
// the bottom of an open conversation must advance the backend read
// cursor. It used to stay counted as unread, because the mark-read
// repeat guard ignored the realtime `rt_*` placeholder and the later
// swap to the stored copy ran no mark-read check. The badge then
// showed "1" for the conversation the user had just been reading.
//
// Drives the real MessageStore and UnreadController the way chat-page
// does: the repeat-guard key is `markReadTailKey(store.messages)`, and
// chat-page re-checks after an arrival (auto-scroll) and after a tail
// change that does not grow the buffer (`updated()`).

const ENTITY = 'binary_sensor.meshcore_aa_ch_1_messages';

function stored(
  id: string,
  ts: string,
  sender: string,
  text: string,
  outgoing = false,
): StoredMessage {
  return {
    id,
    sender,
    text,
    timestamp: ts,
    message_type: 'channel',
    outgoing,
    rx_log_data: [],
    delivery_status: 'sent',
  };
}

/** Mirror of the backend's `count_unread_after`: inbound after cursor. */
function backendUnread(all: StoredMessage[], cursor: string): number {
  const i = all.findIndex((m) => m.id === cursor);
  return all.slice(i + 1).filter((m) => !m.outgoing).length;
}

let stores: MessageStore[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stores.forEach((s) => s.destroy());
  stores = [];
  vi.useRealTimers();
});

describe.each([
  ['a long conversation (older history, refreshed by the 30 s poll)', true],
  ['a short conversation (refreshed by the 500 ms refetch)', false],
])('reply arriving while viewing at the bottom of %s', (_label, hasOlder) => {
  it('advances the backend cursor past the reply', async () => {
    const backend: StoredMessage[] = [
      stored('m1', '2026-01-01T10:00:00.000000', 'Alice', 'old'),
      stored('m2', '2026-01-01T10:01:00.000000', 'TestNode', 'ping', true),
      stored('m3', '2026-01-01T10:02:00.000000', 'Bot', 'earlier reply'),
    ];
    const hass = {
      states: {},
      entities: {},
      callApi: async () => ({}),
      callService: async () => {},
      callWS: async (msg: Record<string, unknown>) => {
        if (msg.after) {
          const i = backend.findIndex((m) => m.id === msg.after);
          return { messages: backend.slice(i + 1), has_more: false };
        }
        return { messages: [...backend], has_more: hasOlder };
      },
      connection: {
        subscribeEvents: async () => () => {},
        subscribeMessage: async () => () => {},
      },
    } as unknown as HomeAssistant;
    const store = new MessageStore({
      node_name: 'TestNode',
      max_messages: 500,
    } as PanelConfig);
    stores.push(store);
    store.setHass(hass);
    await store.switchEntity(ENTITY);
    store.setUserAtBottom(true);

    // Panel side: one handler call is one WS mark_read, which moves the
    // backend cursor to the newest STORED message.
    const unread = new UnreadController();
    let cursor = 'm3';
    const markReads: string[] = [];
    unread.onMarkReadRequested((e) => {
      markReads.push(e);
      cursor = backend[backend.length - 1].id;
    });
    unread.ingestBackendData(
      { unread: { [ENTITY]: 0 }, last_read: { [ENTITY]: cursor } },
      ENTITY,
    );
    unread.beginConversation(ENTITY, 0);
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const check = () =>
      unread.onScrollState({
        entityId: ENTITY,
        lastMessageVisible: true,
        hasNewerMessages: false,
        bufferTailId: markReadTailKey(store.messages),
      });

    // Post-switch check at the bottom.
    expect(check()).toBe(true);
    expect(markReads).toHaveLength(1);

    // The reply arrives: the backend stores it and the panel draws an
    // rt_ placeholder.
    const reply = stored('r1', '2026-01-01T10:05:00.000000', 'Bot', 'pong');
    backend.push(reply);
    (store as unknown as {
      _handleRealtimeMessage(d: Record<string, unknown>): void;
    })._handleRealtimeMessage({
      entity_id: ENTITY,
      id: 'r1',
      sender_name: 'Bot',
      message: 'pong',
      timestamp: reply.timestamp,
    });
    expect(store.messages[store.messages.length - 1].id).toBe('rt_r1');

    // Auto-scroll check on arrival: the placeholder re-arms the guard.
    expect(check()).toBe(true);
    expect(markReads).toHaveLength(2);
    expect(backendUnread(backend, cursor)).toBe(0);

    // The stored copy later replaces the placeholder without growing
    // the buffer; chat-page's tail-change check runs once more.
    const keyBefore = markReadTailKey(store.messages);
    const countBefore = store.messages.length;
    await vi.advanceTimersByTimeAsync(31_000);
    expect(store.messages.map((m) => m.id)).toContain('r1');
    expect(store.messages.map((m) => m.id)).not.toContain('rt_r1');
    expect(store.messages.length).toBe(countBefore);
    expect(markReadTailKey(store.messages)).not.toBe(keyBefore);
    expect(check()).toBe(true);
    // Repeated scroll events at the same tail stay suppressed.
    expect(check()).toBe(false);

    expect(backendUnread(backend, cursor)).toBe(0);
  });
});
