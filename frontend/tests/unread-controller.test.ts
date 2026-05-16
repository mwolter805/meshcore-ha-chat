import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnreadController, pillLabel } from '../src/chat/unread-controller';
import { MARK_READ_GRACE_PERIOD_MS } from '../src/constants';
import type { RenderItem } from '../src/types';

// ─── Reference implementations ───────────────────────────────────────────
//
// The two pre-refactor badge-lookup implementations, copied verbatim
// from `conversation-list._getUnreadCount` and
// `chat-page._getUnreadCountForSelected` as of commit 59eaaa3. Phase 2
// unifies them into `UnreadController.badgeCount`; these references
// pin the equivalence — `badgeCount` must match both on a shared
// fixture (Risk 2 / Risk 8, proposal §"Verification pass" #8).

function oldConvListGetUnreadCount(
  unreadCounts: Record<string, number>,
  id: string,
  nodePrefix: string | null,
): number {
  const channelNeedle = nodePrefix
    ? `meshcore_${nodePrefix}_ch_${id}_messages`
    : null;
  for (const [entityId, count] of Object.entries(unreadCounts)) {
    if (count <= 0) continue;
    if (/^\d+$/.test(id)) {
      if (channelNeedle) {
        if (entityId.endsWith(channelNeedle)) return count;
      } else if (entityId.endsWith(`_ch_${id}_messages`)) {
        return count;
      }
    } else {
      const prefix6 = id.substring(0, 6);
      if (entityId.endsWith(`_${prefix6}_messages`)) return count;
    }
  }
  return 0;
}

function oldChatPageGetUnreadCountForSelected(
  unreadCounts: Record<string, number>,
  selectedId: string | null,
  currentEntityId: string | null,
  nodePrefix: string | null | undefined,
): number {
  if (!selectedId || !unreadCounts) return 0;
  if (currentEntityId && unreadCounts[currentEntityId]) {
    return unreadCounts[currentEntityId];
  }
  for (const [entityId, count] of Object.entries(unreadCounts)) {
    if (count <= 0) continue;
    if (/^\d+$/.test(selectedId)) {
      if (nodePrefix) {
        if (entityId.endsWith(`meshcore_${nodePrefix}_ch_${selectedId}_messages`))
          return count;
      } else if (entityId.endsWith(`_ch_${selectedId}_messages`)) {
        return count;
      }
    } else {
      const prefix6 = selectedId.substring(0, 6);
      if (entityId.endsWith(`_${prefix6}_messages`)) return count;
    }
  }
  return 0;
}

// Shared fixture exercising: a channel idx that exists on two
// different upstream entries (entry independence), a zero-count
// channel entry, a contact entry, and an unrelated channel.
const FIXTURE: Record<string, number> = {
  'binary_sensor.meshcore_aa1234_ch_1_messages': 3,
  'binary_sensor.meshcore_bb5678_ch_1_messages': 9,
  'binary_sensor.meshcore_aa1234_ch_2_messages': 0,
  'binary_sensor.meshcore_aa1234_deadbe_messages': 5,
  'binary_sensor.meshcore_aa1234_ch_7_messages': 4,
};

function seeded(counts: Record<string, number> = FIXTURE): UnreadController {
  const c = new UnreadController();
  c.ingestBackendData({ unread: { ...counts }, last_read: {} }, null);
  return c;
}

// ─── subscribe plumbing ──────────────────────────────────────────────────

describe('UnreadController — subscribe', () => {
  it('notifies every subscriber on a mutation', () => {
    const c = new UnreadController();
    const a = vi.fn();
    const b = vi.fn();
    c.subscribe(a);
    c.subscribe(b);

    c.ingestBackendData({ unread: { e1: 1 }, last_read: {} }, null);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('the returned unsubscribe fn stops further notifications', () => {
    const c = new UnreadController();
    const cb = vi.fn();
    const unsub = c.subscribe(cb);

    c.ingestBackendData({ unread: { e1: 1 }, last_read: {} }, null);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    c.ingestBackendData({ unread: { e1: 2 }, last_read: {} }, null);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not block the others', () => {
    const c = new UnreadController();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    c.subscribe(bad);
    c.subscribe(good);

    c.ingestBackendData({ unread: { e1: 1 }, last_read: {} }, null);

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ─── counts identity ─────────────────────────────────────────────────────

describe('UnreadController — counts identity', () => {
  it('counts identity changes on ingestBackendData', () => {
    const c = new UnreadController();
    const before = c.counts;
    c.ingestBackendData({ unread: { e1: 1 }, last_read: {} }, null);
    expect(c.counts).not.toBe(before);
  });

  it('counts identity changes on clearEntity (when it mutates)', () => {
    const c = seeded({ 'binary_sensor.meshcore_aa1234_ch_1_messages': 3 });
    const before = c.counts;
    c.clearEntity('binary_sensor.meshcore_aa1234_ch_1_messages');
    expect(c.counts).not.toBe(before);
  });

  it('counts identity is stable between mutations', () => {
    const c = seeded();
    const a = c.counts;
    const b = c.counts;
    expect(a).toBe(b);
  });

  it('clearEntity is a no-op (no identity change, no notify) for an absent / zero entity', () => {
    const c = seeded({ 'binary_sensor.meshcore_aa1234_ch_1_messages': 0 });
    const cb = vi.fn();
    c.subscribe(cb);
    const before = c.counts;

    c.clearEntity('binary_sensor.meshcore_aa1234_ch_1_messages'); // zero count
    c.clearEntity('binary_sensor.meshcore_does_not_exist_messages'); // absent

    expect(c.counts).toBe(before);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── ingestBackendData ───────────────────────────────────────────────────

describe('UnreadController — ingestBackendData', () => {
  it('zeroes the active entity', () => {
    const c = new UnreadController();
    c.ingestBackendData(
      {
        unread: {
          'binary_sensor.meshcore_aa1234_ch_1_messages': 7,
          'binary_sensor.meshcore_aa1234_ch_2_messages': 2,
        },
        last_read: {},
      },
      'binary_sensor.meshcore_aa1234_ch_1_messages',
    );
    expect(c.counts['binary_sensor.meshcore_aa1234_ch_1_messages']).toBe(0);
    expect(c.counts['binary_sensor.meshcore_aa1234_ch_2_messages']).toBe(2);
  });

  it('leaves counts untouched when the active entity is null or absent', () => {
    const c = new UnreadController();
    c.ingestBackendData(
      { unread: { 'binary_sensor.meshcore_aa1234_ch_1_messages': 7 }, last_read: {} },
      null,
    );
    expect(c.counts['binary_sensor.meshcore_aa1234_ch_1_messages']).toBe(7);

    c.ingestBackendData(
      { unread: { 'binary_sensor.meshcore_aa1234_ch_1_messages': 7 }, last_read: {} },
      'binary_sensor.meshcore_not_in_map_messages',
    );
    expect(c.counts['binary_sensor.meshcore_aa1234_ch_1_messages']).toBe(7);
  });

  it('does not retain a reference to the caller-supplied payload maps', () => {
    const c = new UnreadController();
    const unread = { e1: 1 };
    const last_read = { e1: 'msg-1' };
    c.ingestBackendData({ unread, last_read }, null);
    unread.e1 = 999;
    last_read.e1 = 'mutated';
    expect(c.counts.e1).toBe(1);
    expect(c.lastRead.e1).toBe('msg-1');
  });

  it('exposes last_read via the lastRead getter', () => {
    const c = new UnreadController();
    c.ingestBackendData(
      { unread: {}, last_read: { e1: 'msg-anchor' } },
      null,
    );
    expect(c.lastRead).toEqual({ e1: 'msg-anchor' });
  });
});

// ─── badgeCount equivalence ──────────────────────────────────────────────

describe('UnreadController — badgeCount matches the two pre-refactor impls', () => {
  const cases: Array<{
    name: string;
    id: string;
    nodePrefix: string | null;
    directKey?: string | null;
  }> = [
    { name: 'channel, nodePrefix scoped (entry aa)', id: '1', nodePrefix: 'aa1234' },
    { name: 'channel, nodePrefix scoped (entry bb — entry independence)', id: '1', nodePrefix: 'bb5678' },
    { name: 'channel, no nodePrefix (suffix-only fallback)', id: '1', nodePrefix: null },
    { name: 'channel, unrelated idx', id: '7', nodePrefix: 'aa1234' },
    { name: 'channel, zero-count entry', id: '2', nodePrefix: 'aa1234' },
    { name: 'channel, no match', id: '99', nodePrefix: 'aa1234' },
    { name: 'contact by pubkey prefix', id: 'deadbeef0011', nodePrefix: 'aa1234' },
    { name: 'contact, no match', id: 'ffffffff0000', nodePrefix: 'aa1234' },
  ];

  for (const tc of cases) {
    it(`conversation-list parity — ${tc.name}`, () => {
      const c = seeded();
      expect(c.badgeCount(tc.id, tc.nodePrefix)).toBe(
        oldConvListGetUnreadCount(FIXTURE, tc.id, tc.nodePrefix),
      );
    });

    it(`chat-page parity — ${tc.name}`, () => {
      const c = seeded();
      expect(c.badgeCount(tc.id, tc.nodePrefix, null)).toBe(
        oldChatPageGetUnreadCountForSelected(FIXTURE, tc.id, null, tc.nodePrefix),
      );
    });
  }

  it('chat-page parity — direct-key fast path hit', () => {
    const c = seeded();
    const directKey = 'binary_sensor.meshcore_aa1234_ch_1_messages';
    expect(c.badgeCount('1', 'aa1234', directKey)).toBe(
      oldChatPageGetUnreadCountForSelected(FIXTURE, '1', directKey, 'aa1234'),
    );
    expect(c.badgeCount('1', 'aa1234', directKey)).toBe(3);
  });

  it('chat-page parity — direct-key present but zero falls through to the pattern loop', () => {
    const c = seeded();
    const directKey = 'binary_sensor.meshcore_aa1234_ch_2_messages'; // count 0 in FIXTURE
    expect(c.badgeCount('2', 'aa1234', directKey)).toBe(
      oldChatPageGetUnreadCountForSelected(FIXTURE, '2', directKey, 'aa1234'),
    );
    expect(c.badgeCount('2', 'aa1234', directKey)).toBe(0);
  });

  it('returns 0 for a null / empty conversation id', () => {
    const c = seeded();
    expect(c.badgeCount(null, 'aa1234')).toBe(0);
    expect(c.badgeCount('', 'aa1234')).toBe(0);
  });
});

// ─── mark-read-requested plumbing ────────────────────────────────────────

describe('UnreadController — mark-read-requested plumbing', () => {
  it('requestMarkRead forwards to the registered handler', () => {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    c.requestMarkRead('binary_sensor.meshcore_aa1234_ch_1_messages');
    expect(handler).toHaveBeenCalledWith('binary_sensor.meshcore_aa1234_ch_1_messages');
  });

  it('requestMarkRead is a safe no-op when no handler is registered', () => {
    const c = new UnreadController();
    expect(() => c.requestMarkRead('e1')).not.toThrow();
  });
});

// ─── Phase 3: the read-progress machine ──────────────────────────────────
//
// These exercise the per-conversation read-progress machine that
// Phase 3 moved out of chat-page: the anchor, the R1 grace window, the
// deferred post-switch timer, the mark-read dedup guard, the
// `markReadFired` lifecycle, the late-arriving re-anchor, and the
// `dividerAfterGroupIdx` projection. Behavioral coverage is the
// contract — each test asserts the same observable outcome as the
// chat-page test it replaces (see the commit body's test-to-test
// mapping). All Phase-3 blocks run under fake timers: `beginConversation`
// arms a 1000 ms `setTimeout`, and a fake clock keeps the grace-window
// assertions deterministic (vitest fakes `Date.now()` alongside
// `setTimeout`).

const E = 'binary_sensor.meshcore_aa1234_ch_1_messages';
const E2 = 'binary_sensor.meshcore_bb5678_ch_1_messages';

// Render-item fixtures. `groupMessages` (message-parser.ts) splits on
// sender change, so a render group is single-sender and `isOutgoing`
// is uniform — these fixtures mirror that invariant.
function makeMsg(id: string, isOutgoing: boolean) {
  return {
    id,
    sender: isOutgoing ? 'me' : 'someone',
    text: `msg ${id}`,
    timestamp: new Date('2026-05-14T12:00:00Z'),
    isOutgoing,
    isSystem: false,
    raw: `msg ${id}`,
    mentions: [],
  };
}
function groupItem(id: string, isOutgoing: boolean): RenderItem {
  const messages = [makeMsg(id, isOutgoing)];
  return {
    type: 'group',
    group: {
      sender: messages[0].sender,
      isOutgoing,
      isSystem: false,
      messages,
      startTime: messages[0].timestamp,
      endTime: messages[0].timestamp,
    },
  } as RenderItem;
}
function dateSep(): RenderItem {
  return {
    type: 'date-separator',
    date: new Date('2026-05-14T00:00:00Z'),
    label: 'Today',
  } as RenderItem;
}

// ─── beginConversation / endConversation ─────────────────────────────────

describe('UnreadController — beginConversation / endConversation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures the anchor from the current lastRead map', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'msg-anchor' } }, null);
    c.beginConversation(E, 0);
    // The captured anchor is observable through the divider projection.
    expect(
      c.dividerAfterGroupIdx([
        groupItem('msg-anchor', false),
        groupItem('inbound', false),
      ]),
    ).toBe(1);
  });

  it('captures a null anchor when lastRead has no entry for the entity', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E, 0);
    expect(c.dividerAfterGroupIdx([groupItem('a', false)])).toBeNull();
  });

  it('does not emit a mark-read request on begin (opening must not advance the cursor)', () => {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    c.beginConversation(E, 3);
    expect(handler).not.toHaveBeenCalled();
  });

  it('endConversation tears the read-progress down — dividerAfterGroupIdx returns null', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'msg-anchor' } }, null);
    c.beginConversation(E, 0);
    c.endConversation();
    expect(
      c.dividerAfterGroupIdx([
        groupItem('msg-anchor', false),
        groupItem('inbound', false),
      ]),
    ).toBeNull();
  });

  it('a fresh controller (no conversation begun) has no divider and no-ops the mutators', () => {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    expect(c.dividerAfterGroupIdx([groupItem('a', false)])).toBeNull();
    expect(
      c.onScrollState({
        entityId: E,
        lastMessageVisible: true,
        hasNewerMessages: false,
        bufferTailId: 't',
      }),
    ).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('beginConversation resets markReadFired for the new conversation', () => {
    const c = new UnreadController();
    c.onMarkReadRequested(vi.fn());
    c.beginConversation(E, 0);
    // Fire mark-read in conversation 1 (pill path bypasses grace).
    expect(c.onPillJump({ entityId: E, bufferTailId: 'tail-1' })).toBe(true);
    // Switch to conversation 2 — markReadFired is reset, so a
    // late-arriving cursor for E2 is allowed to re-anchor.
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E2, 0);
    c.ingestBackendData({ unread: {}, last_read: { [E2]: 'late' } }, null);
    expect(c.maybeReanchorOnLateData(E2)).toBe(true);
  });
});

// ─── onScrollState — mark-read gates ─────────────────────────────────────

describe('UnreadController — onScrollState mark-read gates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E, 0);
    return { c, handler };
  }

  it('suppresses the first auto-mark-read inside the R1 grace window', () => {
    const { c, handler } = setup();
    const fired = c.onScrollState({
      entityId: E,
      lastMessageVisible: true,
      hasNewerMessages: false,
      bufferTailId: 'tail-1',
    });
    expect(fired).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('admits the mark-read once the grace window has elapsed', () => {
    const { c, handler } = setup();
    // Past the grace window. (The deferred post-switch timer also
    // fires here, into a null `_postSwitchTimerHandler` — a harmless
    // no-op since this suite does not register one.)
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const fired = c.onScrollState({
      entityId: E,
      lastMessageVisible: true,
      hasNewerMessages: false,
      bufferTailId: 'tail-1',
    });
    expect(fired).toBe(true);
    expect(handler).toHaveBeenCalledWith(E);
  });

  it('suppresses when hasNewerMessages is true (buffer tail is not the conversation tail)', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const fired = c.onScrollState({
      entityId: E,
      lastMessageVisible: true,
      hasNewerMessages: true,
      bufferTailId: 'tail-1',
    });
    expect(fired).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('suppresses when the last message is not visible (Bug #2 geometric gate)', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const fired = c.onScrollState({
      entityId: E,
      lastMessageVisible: false,
      hasNewerMessages: false,
      bufferTailId: 'tail-1',
    });
    expect(fired).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('no-ops when the entityId does not match the active conversation', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const fired = c.onScrollState({
      entityId: E2,
      lastMessageVisible: true,
      hasNewerMessages: false,
      bufferTailId: 'tail-1',
    });
    expect(fired).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('no-ops when entityId is null', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    expect(
      c.onScrollState({
        entityId: null,
        lastMessageVisible: true,
        hasNewerMessages: false,
        bufferTailId: 'tail-1',
      }),
    ).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('dedups against the buffer tail — a repeated tail id does not re-fire', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const s = {
      entityId: E,
      lastMessageVisible: true,
      hasNewerMessages: false,
      bufferTailId: 'tail-1',
    };
    expect(c.onScrollState(s)).toBe(true);
    expect(c.onScrollState(s)).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a changed buffer tail re-arms the dedup gate', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    expect(
      c.onScrollState({
        entityId: E,
        lastMessageVisible: true,
        hasNewerMessages: false,
        bufferTailId: 'tail-1',
      }),
    ).toBe(true);
    expect(
      c.onScrollState({
        entityId: E,
        lastMessageVisible: true,
        hasNewerMessages: false,
        bufferTailId: 'tail-2',
      }),
    ).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('a null buffer tail is never treated as a dedup hit', () => {
    const { c, handler } = setup();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    const s = {
      entityId: E,
      lastMessageVisible: true,
      hasNewerMessages: false,
      bufferTailId: null,
    };
    expect(c.onScrollState(s)).toBe(true);
    expect(c.onScrollState(s)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

// ─── onPillJump ──────────────────────────────────────────────────────────

describe('UnreadController — onPillJump', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediately, bypassing the R1 grace window', () => {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    c.beginConversation(E, 0);
    // Still inside the grace window — `onScrollState` would suppress;
    // `onPillJump` (an explicit user "jump to current") must not.
    const fired = c.onPillJump({ entityId: E, bufferTailId: 'tail-1' });
    expect(fired).toBe(true);
    expect(handler).toHaveBeenCalledWith(E);
  });

  it('still dedups against the buffer tail', () => {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    c.beginConversation(E, 0);
    expect(c.onPillJump({ entityId: E, bufferTailId: 'tail-1' })).toBe(true);
    expect(c.onPillJump({ entityId: E, bufferTailId: 'tail-1' })).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('no-ops when entityId is null or does not match the active conversation', () => {
    const c = new UnreadController();
    const handler = vi.fn();
    c.onMarkReadRequested(handler);
    c.beginConversation(E, 0);
    expect(c.onPillJump({ entityId: null, bufferTailId: 'tail-1' })).toBe(false);
    expect(c.onPillJump({ entityId: E2, bufferTailId: 'tail-1' })).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── deferred post-switch timer ──────────────────────────────────────────

describe('UnreadController — deferred post-switch timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes the registered handler once the grace window elapses', () => {
    const c = new UnreadController();
    const timerHandler = vi.fn();
    c.onPostSwitchTimerFire(timerHandler);
    c.beginConversation(E, 0);
    expect(timerHandler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    expect(timerHandler).toHaveBeenCalledTimes(1);
  });

  it('the deferred handler can advance the cursor past the now-elapsed grace window', () => {
    const c = new UnreadController();
    const markRead = vi.fn();
    c.onMarkReadRequested(markRead);
    // Mirrors chat-page's real handler: gather the DOM facts, then
    // call back into `onScrollState`.
    c.onPostSwitchTimerFire(() => {
      c.onScrollState({
        entityId: E,
        lastMessageVisible: true,
        hasNewerMessages: false,
        bufferTailId: 'tail-1',
      });
    });
    c.beginConversation(E, 0);
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    expect(markRead).toHaveBeenCalledWith(E);
  });

  it('a quick conversation flip cancels the in-flight deferred timer', () => {
    const c = new UnreadController();
    const timerHandler = vi.fn();
    c.onPostSwitchTimerFire(timerHandler);
    c.beginConversation(E, 0);
    // Flip to another conversation before the grace window elapses —
    // E's timer is cancelled, E2's is armed fresh.
    c.beginConversation(E2, 0);
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    // Only one invocation — E2's timer; E's was cancelled.
    expect(timerHandler).toHaveBeenCalledTimes(1);
  });

  it('endConversation cancels the in-flight deferred timer', () => {
    const c = new UnreadController();
    const timerHandler = vi.fn();
    c.onPostSwitchTimerFire(timerHandler);
    c.beginConversation(E, 0);
    c.endConversation();
    vi.advanceTimersByTime(MARK_READ_GRACE_PERIOD_MS + 1);
    expect(timerHandler).not.toHaveBeenCalled();
  });
});

// ─── maybeReanchorOnLateData ─────────────────────────────────────────────

describe('UnreadController — maybeReanchorOnLateData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-anchors when the anchor was null and the cursor arrives late', () => {
    const c = new UnreadController();
    // Begin with an empty lastRead map → null anchor captured.
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E, 0);
    // The persisted cursor arrives.
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'late-anchor' } }, null);
    expect(c.maybeReanchorOnLateData(E)).toBe(true);
    // The re-anchor is observable through the divider projection.
    expect(
      c.dividerAfterGroupIdx([
        groupItem('late-anchor', false),
        groupItem('inbound', false),
      ]),
    ).toBe(1);
  });

  it('does not re-anchor when an anchor was already captured at begin', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'orig-anchor' } }, null);
    c.beginConversation(E, 0);
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'different' } }, null);
    expect(c.maybeReanchorOnLateData(E)).toBe(false);
  });

  it('does not re-anchor after mark-read has fired for the conversation', () => {
    const c = new UnreadController();
    c.onMarkReadRequested(vi.fn());
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E, 0);
    // Mark-read fires (pill path bypasses grace).
    expect(c.onPillJump({ entityId: E, bufferTailId: 'tail-1' })).toBe(true);
    // The cursor now reflects the conversation tail — re-anchoring
    // against it would suppress the divider entirely. Must decline.
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'tail-1' } }, null);
    expect(c.maybeReanchorOnLateData(E)).toBe(false);
  });

  it('does not re-anchor when the cursor is still absent', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E, 0);
    expect(c.maybeReanchorOnLateData(E)).toBe(false);
  });

  it('does not re-anchor when the entityId does not match the active conversation', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E2]: 'x' } }, null);
    c.beginConversation(E, 0);
    expect(c.maybeReanchorOnLateData(E2)).toBe(false);
  });

  it('returns false when no conversation is active', () => {
    const c = new UnreadController();
    expect(c.maybeReanchorOnLateData(E)).toBe(false);
  });
});

// ─── dividerAfterGroupIdx ────────────────────────────────────────────────
//
// Subsumes the four Phase-1 divider-projection tests (which used to
// live in chat-page.test.ts against the now-deleted
// `_renderItemsWithDivider` + `_anchorIdAtSelection` privates) and
// adds the cross-entry send-then-switch case Phase 3 folded in.

describe('UnreadController — dividerAfterGroupIdx', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function withAnchor(anchorId: string, unreadCount = 0): UnreadController {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: anchorId } }, null);
    c.beginConversation(E, unreadCount);
    return c;
  }

  it('returns null when no conversation is active', () => {
    expect(
      new UnreadController().dividerAfterGroupIdx([groupItem('a', false)]),
    ).toBeNull();
  });

  it('anchor is the last group → no divider (nothing on the unread side)', () => {
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        groupItem('m1', false),
        groupItem('anchor', false),
      ]),
    ).toBeNull();
  });

  it('only an outgoing group after the anchor → no divider (Phase 1 reported bug)', () => {
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        groupItem('anchor', false),
        groupItem('sent', true),
      ]),
    ).toBeNull();
  });

  it('an inbound group after the anchor → divider renders above it', () => {
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        groupItem('anchor', false),
        groupItem('inbound', false),
      ]),
    ).toBe(1);
  });

  it('inbound then outgoing after the anchor → divider above the inbound group', () => {
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        groupItem('anchor', false),
        groupItem('inbound', false),
        groupItem('reply', true),
      ]),
    ).toBe(1);
  });

  it('outgoing then inbound after the anchor → divider skips the leading outgoing run (send-then-switch fix)', () => {
    // The cross-entry send-then-switch bug: the user sent a message
    // (msg-sent) then navigated away before the cursor advanced, so
    // the anchor sits before their own send. A genuine inbound message
    // (msg-inbound) follows. The divider must land above the inbound
    // message, NOT above the user's own send.
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        groupItem('anchor', false),
        groupItem('msg-sent', true),
        groupItem('msg-inbound', false),
      ]),
    ).toBe(2);
  });

  it('multiple leading outgoing groups after the anchor are all skipped', () => {
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        groupItem('anchor', false),
        groupItem('s1', true),
        groupItem('s2', true),
        groupItem('in', false),
      ]),
    ).toBe(3);
  });

  it('date separators do not count toward the group index', () => {
    const c = withAnchor('anchor');
    expect(
      c.dividerAfterGroupIdx([
        dateSep(),
        groupItem('anchor', false),
        dateSep(),
        groupItem('inbound', false),
      ]),
    ).toBe(1);
  });

  it('falls back to count-based positioning when the anchor is not in the rendered buffer', () => {
    // Anchor 'pruned' is not among the render items → count fallback.
    // 4 message groups, unreadCount 2 → divider at index 4 - 2 = 2.
    const c = withAnchor('pruned', 2);
    expect(
      c.dividerAfterGroupIdx([
        groupItem('a', false),
        groupItem('b', false),
        groupItem('c', false),
        groupItem('d', false),
      ]),
    ).toBe(2);
  });

  it('count-based fallback clamps a negative index to 0', () => {
    const c = withAnchor('pruned', 10);
    expect(
      c.dividerAfterGroupIdx([groupItem('a', false), groupItem('b', false)]),
    ).toBe(0);
  });

  it('no anchor and zero count → no divider', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: {} }, null);
    c.beginConversation(E, 0);
    expect(
      c.dividerAfterGroupIdx([groupItem('a', false), groupItem('b', false)]),
    ).toBeNull();
  });
});

// ─── Phase 4: the pill's data needs ──────────────────────────────────────
//
// `cursorAtTail` and the pure `pillLabel` helper. The pill itself
// (`_renderNewMessagesIndicator`) stays in chat-page — it depends on
// chat-page render state (`_pendingScroll` / `_scrollInFlight`) and a
// DOM probe (`_hasContentBelowViewport`) — so the chat-page pill
// matrix in chat-page.test.ts §"Phase 4 — indicator visibility" still
// pins the end-to-end render. These unit tests pin the two pieces
// Phase 4 moved into the controller.

describe('UnreadController — cursorAtTail', () => {
  it('returns false when entityId is null', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'tail' } }, null);
    expect(c.cursorAtTail(null, 'tail')).toBe(false);
  });

  it('returns false when bufferTailId is null', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'tail' } }, null);
    expect(c.cursorAtTail(E, null)).toBe(false);
  });

  it('returns true when the cursor equals the buffer tail', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'tail' } }, null);
    expect(c.cursorAtTail(E, 'tail')).toBe(true);
  });

  it('returns false when the cursor is behind the buffer tail', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'older' } }, null);
    expect(c.cursorAtTail(E, 'newer')).toBe(false);
  });

  it('returns false when the entity has no cursor in the map', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E2]: 'tail' } }, null);
    expect(c.cursorAtTail(E, 'tail')).toBe(false);
  });

  it('tracks the latest ingested cursor', () => {
    const c = new UnreadController();
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'old' } }, null);
    expect(c.cursorAtTail(E, 'new')).toBe(false);
    c.ingestBackendData({ unread: {}, last_read: { [E]: 'new' } }, null);
    expect(c.cursorAtTail(E, 'new')).toBe(true);
  });
});

describe('pillLabel', () => {
  it('counter > 0 → "↓ N new" regardless of the other inputs', () => {
    expect(
      pillLabel({
        counter: 4,
        hasNewer: false,
        hasContentBelow: false,
        cursorAtTail: true,
      }),
    ).toBe('↓ 4 new');
    expect(
      pillLabel({
        counter: 1,
        hasNewer: true,
        hasContentBelow: true,
        cursorAtTail: false,
      }),
    ).toBe('↓ 1 new');
  });

  it('counter 0, no unloaded newer, nothing below the viewport → null (suppress)', () => {
    expect(
      pillLabel({
        counter: 0,
        hasNewer: false,
        hasContentBelow: false,
        cursorAtTail: false,
      }),
    ).toBeNull();
    // cursorAtTail does not rescue a suppressed pill.
    expect(
      pillLabel({
        counter: 0,
        hasNewer: false,
        hasContentBelow: false,
        cursorAtTail: true,
      }),
    ).toBeNull();
  });

  it('counter 0, cursor at tail, content below, no unloaded newer → "↓ latest"', () => {
    expect(
      pillLabel({
        counter: 0,
        hasNewer: false,
        hasContentBelow: true,
        cursorAtTail: true,
      }),
    ).toBe('↓ latest');
  });

  it('counter 0, cursor NOT at tail, content below → "↓ unread"', () => {
    expect(
      pillLabel({
        counter: 0,
        hasNewer: false,
        hasContentBelow: true,
        cursorAtTail: false,
      }),
    ).toBe('↓ unread');
  });

  it('counter 0, hasNewer true → "↓ unread" even when cursorAtTail is true', () => {
    // Unloaded newer messages exist on disk past the buffer tail, so
    // the cursor matching the *buffer* tail does not mean "caught up".
    expect(
      pillLabel({
        counter: 0,
        hasNewer: true,
        hasContentBelow: false,
        cursorAtTail: true,
      }),
    ).toBe('↓ unread');
    expect(
      pillLabel({
        counter: 0,
        hasNewer: true,
        hasContentBelow: true,
        cursorAtTail: true,
      }),
    ).toBe('↓ unread');
  });
});
