// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// command-dialog imports executeLocal/executeRemote from api; stub them so
// the module graph resolves. These tests exercise the response feed, not
// command execution.
vi.mock('../src/api', () => ({
  executeLocal: vi.fn(),
  executeRemote: vi.fn(),
}));

import '../src/components/command-dialog';
import type { HomeAssistant, HassEvent } from '../src/types';

type MsgCallback = (event: HassEvent) => void;

interface DialogEl extends HTMLElement {
  hass?: HomeAssistant;
  open: boolean;
  isLocal: boolean;
  targetPrefix?: string;
  nodeName: string;
  _deviceResponses: Array<{ text: string; sender: string; ts: number; snr?: number }>;
  updateComplete: Promise<boolean>;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let capturedCb: MsgCallback | null;
let unsubCalls: number;
let subscribeEventTypes: string[];

function makeHass(): HomeAssistant {
  return {
    states: {},
    entities: {},
    callApi: async () => ({}) as never,
    callService: async () => {},
    callWS: async () => ({}) as never,
    connection: {
      subscribeEvents: (cb: MsgCallback, eventType: string) => {
        capturedCb = cb;
        subscribeEventTypes.push(eventType);
        return Promise.resolve(() => {
          unsubCalls++;
        });
      },
    },
  } as unknown as HomeAssistant;
}

function fireEvent(data: Record<string, unknown>) {
  capturedCb?.({ event_type: 'meshcore_message', data, time_fired: '' } as HassEvent);
}

describe('command-dialog device response feed', () => {
  let el: DialogEl;

  beforeEach(() => {
    capturedCb = null;
    unsubCalls = 0;
    subscribeEventTypes = [];
    el = document.createElement('meshcore-command-dialog') as unknown as DialogEl;
    el.hass = makeHass();
    el.nodeName = 'MyNode';
    el.targetPrefix = 'rpt1deadbeef';
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  async function openRemote() {
    el.isLocal = false;
    el.open = true;
    await el.updateComplete;
    await flush(); // allow the subscribeEvents promise to resolve
  }

  it('subscribes once to meshcore_message when a remote dialog opens', async () => {
    await openRemote();
    expect(subscribeEventTypes).toEqual(['meshcore_message']);
  });

  it('appends a matching inbound device reply to the feed', async () => {
    await openRemote();
    fireEvent({
      pubkey_prefix: 'rpt1deadbeef',
      sender_name: 'TestRepeater',
      message: '> radio: 915.0 250 10 5',
      timestamp: new Date().toISOString(),
      snr: 7,
    });
    await el.updateComplete;
    expect(el._deviceResponses).toHaveLength(1);
    expect(el._deviceResponses[0].text).toContain('radio');
    expect(el._deviceResponses[0].snr).toBe(7);
  });

  it('ignores messages from a different device', async () => {
    await openRemote();
    fireEvent({
      pubkey_prefix: 'otherdevice99',
      sender_name: 'OtherNode',
      message: 'not mine',
      timestamp: new Date().toISOString(),
    });
    await el.updateComplete;
    expect(el._deviceResponses).toHaveLength(0);
  });

  it('ignores the outgoing echo (sender is the companion node)', async () => {
    await openRemote();
    fireEvent({
      pubkey_prefix: 'rpt1deadbeef',
      sender_name: 'MyNode',
      message: 'get radio',
      timestamp: new Date().toISOString(),
    });
    await el.updateComplete;
    expect(el._deviceResponses).toHaveLength(0);
  });

  it('ignores pre-open history (timestamp before the dialog opened)', async () => {
    await openRemote();
    fireEvent({
      pubkey_prefix: 'rpt1deadbeef',
      sender_name: 'TestRepeater',
      message: 'old reply',
      timestamp: new Date(Date.now() - 60000).toISOString(),
    });
    await el.updateComplete;
    expect(el._deviceResponses).toHaveLength(0);
  });

  it('unsubscribes when the dialog closes', async () => {
    await openRemote();
    el.open = false;
    await el.updateComplete;
    expect(unsubCalls).toBe(1);
  });

  it('does not subscribe for the companion (isLocal) dialog', async () => {
    el.isLocal = true;
    el.open = true;
    await el.updateComplete;
    await flush();
    expect(subscribeEventTypes).toHaveLength(0);
  });
});
