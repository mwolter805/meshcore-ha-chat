// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { MessageStore } from '../src/chat/message-store';
import { toClientMessage, generateId } from '../src/chat/message-parser';
import { classifyEntity } from '../src/utils/classify-entity';
import type { PanelConfig, ChatMessage, StoredMessage } from '../src/types';

const config = { node_name: 'Radio', entry_id: 'radio-a' } as PanelConfig;
const stores: MessageStore[] = [];
afterEach(() => { stores.forEach(s => s.destroy()); stores.length = 0; });
function store() { const s = new MessageStore(config); stores.push(s); return s as any; }
function outgoing(id: string): ChatMessage { return { id, sender: 'Radio', text: 'same', timestamp: new Date(), isOutgoing: true, isSystem: false, raw: 'same', mentions: [] }; }

describe('message compatibility', () => {
  it('rejects an old subscription that resolves after a conversation switch', async () => {
    const s = store();
    let callback: any;
    let release: (unsub: () => void) => void = () => {};
    let unsubscribed = 0;
    s._hass = { connection: { subscribeEvents: (cb: any) => { callback = cb; return new Promise(resolve => { release = resolve; }); } } };
    s._active = true; s._entityId = 'old';
    const subscribing = s._subscribeRealtime('old');
    s._stopUpdates(); s._entityId = 'new';
    callback({ data: { entity_id: 'old', sender_name: 'Peer', message: 'late', timestamp: '2026-10-30T12:00:00Z' } });
    expect(s.messages).toHaveLength(0);
    release(() => { unsubscribed++; });
    await subscribing;
    expect(unsubscribed).toBe(1);
    expect(s._realtimeSubscriptions).toHaveLength(0);
  });
  it('updates the identified send, never the latest outgoing bubble', () => {
    const s = store(); s._messages = [outgoing('send-a'), outgoing('send-b')];
    s._handleDeliveryUpdate({ send_id: 'send-a', message_type: 'channel', progressive: false, repeater_count: 2 });
    expect(s.messages[0].deliveryStatus?.repeaterCount).toBe(2);
    expect(s.messages[1].deliveryStatus).toBeUndefined();
    s._handleDeliveryUpdate({ send_id: 'unknown', status: 'failed' });
    expect(s.messages[1].deliveryStatus).toBeUndefined();
  });
  it('ignores other radios and never downgrades failed sends', () => {
    const s = store(); const m = outgoing('send-a'); m.deliveryStatus = { status: 'failed' }; s._messages = [m];
    s._handleDeliveryUpdate({ entry_id: 'radio-b', send_id: 'send-a', status: 'delivered' });
    expect(m.deliveryStatus.status).toBe('failed');
    s._handleDeliveryUpdate({ entry_id: 'radio-a', send_id: 'send-a', progressive: true, repeater_count: 0 });
    expect(m.deliveryStatus.status).toBe('failed');
  });
  it('renders and deduplicates unnamed DMs with the same persistent identity', () => {
    const s = store(); const timestamp = '2026-10-30T12:00:00Z';
    const data = { sender_name: null, pubkey_prefix: 'abcdef123456', message: 'hi', timestamp, message_type: 'direct', outgoing: false };
    s._handleRealtimeMessage(data); s._handleRealtimeMessage(data);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].sender).toBe('abcdef123456');
    expect(s.messages[0].id).toBe(`rt_${generateId(timestamp, 'abcdef123456', 'hi')}`);
    s._handleRealtimeMessage({ ...data, entry_id: 'radio-b', message: 'other radio' });
    expect(s.messages).toHaveLength(1);
  });
  it('keeps observation state and send identity after hydration', () => {
    const row = { id: 'send-a', send_id: 'send-a', sender: 'Radio', text: 'hi', timestamp: '2026-10-30T12:00:00Z', outgoing: true, message_type: 'channel', delivery_status: 'sent', repeats_observable: false, collecting: false } as StoredMessage;
    const m = toClientMessage(row);
    expect(m.deliveryStatus?.repeatsObservable).toBe(false);
    expect(m.deliveryStatus?.collecting).toBe(false);
    expect(m.sendId).toBe('send-a');
  });
  it('excludes the optional console counter while retaining telemetry', () => {
    expect(classifyEntity({ entity_id: 'sensor.meshcore_abcdef_cli_console', unique_id: 'radio-a_cli_console' })).toBeNull();
    expect(classifyEntity({ entity_id: 'sensor.renamed_console', unique_id: 'radio-a_cli_console' })).toBeNull();
    expect(classifyEntity({ entity_id: 'sensor.meshcore_abcdef_battery_percentage', device_class: 'battery' })?.label).toBe('Battery');
  });
});
