// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { html, render } from 'lit';
import '../src/components/message-bubble';
import type { ChatMessage, MessageGroup } from '../src/types';

// Change 6 — inbound region scope in the bubble timestamp line.
// "*" renders as "🌐 all regions", a region name verbatim, nothing when
// absent. Incoming bubbles only — the outbound scope is shown by the
// thread-header chip, so outgoing bubbles are unaffected.

function makeGroup(opts: { floodScope?: string; isOutgoing?: boolean }): MessageGroup {
  const isOutgoing = opts.isOutgoing ?? false;
  const msg: ChatMessage = {
    id: 'scope-msg-1',
    sender: isOutgoing ? 'Me' : 'Alice',
    text: 'hello mesh',
    timestamp: new Date('2026-06-09T12:00:00Z'),
    isOutgoing,
    isSystem: false,
    raw: 'hello mesh',
    mentions: [],
    floodScope: opts.floodScope,
  };
  return {
    sender: msg.sender,
    isOutgoing,
    isSystem: false,
    messages: [msg],
    startTime: msg.timestamp,
    endTime: msg.timestamp,
  };
}

async function mountBubble(group: MessageGroup) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(
    html`<meshcore-message-bubble .group=${group}></meshcore-message-bubble>`,
    container,
  );
  const bubble = container.querySelector('meshcore-message-bubble') as HTMLElement & {
    updateComplete: Promise<unknown>;
  };
  await bubble.updateComplete;
  return bubble;
}

describe('message-bubble inbound scope label', () => {
  it('renders "🌐 all regions" for a global flood on an incoming message', async () => {
    const bubble = await mountBubble(makeGroup({ floodScope: '*' }));
    const scope = bubble.shadowRoot!.querySelector('.flood-scope');
    expect(scope).not.toBeNull();
    expect(scope!.textContent).toBe('🌐 all regions');
  });

  it('renders the region name for a scoped incoming message', async () => {
    const bubble = await mountBubble(makeGroup({ floodScope: 'pl-mz' }));
    const scope = bubble.shadowRoot!.querySelector('.flood-scope');
    expect(scope).not.toBeNull();
    expect(scope!.textContent).toBe('pl-mz');
  });

  it('renders no scope label when floodScope is absent', async () => {
    const bubble = await mountBubble(makeGroup({}));
    expect(bubble.shadowRoot!.querySelector('.flood-scope')).toBeNull();
  });

  it('does not render a scope label on outgoing bubbles', async () => {
    const bubble = await mountBubble(makeGroup({ floodScope: '*', isOutgoing: true }));
    expect(bubble.shadowRoot!.querySelector('.flood-scope')).toBeNull();
  });
});
