// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { html, render } from 'lit';
import '../src/components/message-bubble';
import type { ChatMessage, MessageGroup } from '../src/types';

// Regression coverage for F01 (pre-public-release audit, 2026-05-01).
//
// Before the fix, _renderTextWithMentions handed peer-supplied message
// text to unsafeHTML — any peer on a meshcore channel could deliver a
// `<script>` / `<img onerror>` payload that ran in the receiving HA
// user's panel. The fix tokenises into a (string | TemplateResult)[]
// array; Lit auto-escapes the plain-string slices and the mention-name
// interpolation. These tests pin that behaviour: untrusted text never
// becomes a real <script>/<img> element in the rendered shadow DOM.

function makeGroup(text: string, mentions: string[]): MessageGroup {
  const msg: ChatMessage = {
    id: 'test-msg-1',
    sender: 'Alice',
    text,
    timestamp: new Date('2026-05-01T12:00:00Z'),
    isOutgoing: false,
    isSystem: false,
    raw: text,
    mentions,
  };
  return {
    sender: 'Alice',
    isOutgoing: false,
    isSystem: false,
    messages: [msg],
    startTime: msg.timestamp,
    endTime: msg.timestamp,
  };
}

describe('message-bubble XSS regression (F01)', () => {
  it('renders <script> tags from message text as inert text', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const group = makeGroup(
      '<script>window.__pwned = true;</script>HELLO',
      [],
    );
    render(
      html`<meshcore-message-bubble .group=${group}></meshcore-message-bubble>`,
      container,
    );

    const bubble = container.querySelector('meshcore-message-bubble') as
      | (HTMLElement & { updateComplete: Promise<unknown> })
      | null;
    await bubble?.updateComplete;
    expect(bubble).not.toBeNull();
    const shadowText = bubble?.shadowRoot?.textContent ?? '';
    // The literal payload appears as text content...
    expect(shadowText).toContain('<script>window.__pwned = true;</script>HELLO');
    // ...and NOT as a real <script> element.
    expect(bubble?.shadowRoot?.querySelector('script')).toBeNull();
    // ...and the script body never executed.
    expect(
      (window as unknown as { __pwned?: boolean }).__pwned,
    ).toBeUndefined();
  });

  it('renders <img onerror> in message text as inert text', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const group = makeGroup(
      'see this: <img src=x onerror="window.__pwned=2">',
      [],
    );
    render(
      html`<meshcore-message-bubble .group=${group}></meshcore-message-bubble>`,
      container,
    );

    const bubble = container.querySelector('meshcore-message-bubble') as
      | (HTMLElement & { updateComplete: Promise<unknown> })
      | null;
    await bubble?.updateComplete;
    expect(bubble?.shadowRoot?.querySelector('img')).toBeNull();
    expect(
      (window as unknown as { __pwned?: number }).__pwned,
    ).toBeUndefined();
  });

  it('escapes mention names containing HTML payloads', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    // Mention name itself contains an injection payload. The fix's
    // regex-special-char escape on the name keeps the regex valid; Lit
    // auto-escapes the name when it interpolates @${name} into the
    // mention span template.
    const group = makeGroup(
      'Hi @[<img src=x onerror=alert(1)>]',
      ['<img src=x onerror=alert(1)>'],
    );
    render(
      html`<meshcore-message-bubble .group=${group}></meshcore-message-bubble>`,
      container,
    );

    const bubble = container.querySelector('meshcore-message-bubble') as
      | (HTMLElement & { updateComplete: Promise<unknown> })
      | null;
    await bubble?.updateComplete;
    // No real <img> regardless of where the payload appears.
    expect(bubble?.shadowRoot?.querySelector('img')).toBeNull();
    // The mention span is rendered with class="mention" — verify the
    // span exists and its text content is the literal payload (escaped),
    // not the HTML structure.
    const mention = bubble?.shadowRoot?.querySelector('.mention');
    expect(mention).not.toBeNull();
    expect(mention?.textContent).toBe('@<img src=x onerror=alert(1)>');
  });

  it('renders a normal mention as a styled span', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const group = makeGroup('Hi @Bob, how are you?', ['Bob']);
    render(
      html`<meshcore-message-bubble .group=${group}></meshcore-message-bubble>`,
      container,
    );

    const bubble = container.querySelector('meshcore-message-bubble') as
      | (HTMLElement & { updateComplete: Promise<unknown> })
      | null;
    await bubble?.updateComplete;
    const mention = bubble?.shadowRoot?.querySelector('.mention');
    expect(mention).not.toBeNull();
    expect(mention?.textContent).toBe('@Bob');
    // Surrounding plain text still renders as text content.
    const fullText = bubble?.shadowRoot?.textContent ?? '';
    expect(fullText).toContain('Hi @Bob');
    expect(fullText).toContain(', how are you?');
  });
});
