import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { ChatMessage, MessageGroup, DeliveryStatus } from '../types';
import { formatTimestamp } from '../chat/message-parser';

/**
 * Generate a deterministic color from a string (e.g., pubkey prefix).
 */
function senderColorFromPrefix(prefix: string): string {
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    hash = ((hash << 5) - hash) + prefix.charCodeAt(i);
  }
  const colors = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4dd0e1', '#fff176', '#a1887f'];
  return colors[Math.abs(hash) % colors.length];
}

@customElement('meshcore-message-bubble')
export class MessageBubble extends LitElement {
  @property({ type: Object }) group?: MessageGroup;
  @property({ type: Object }) message?: ChatMessage;
  @property({ type: String }) timestampFormat: 'relative' | 'time' | 'datetime' = 'relative';

  @state() private _selectedMessage: ChatMessage | null = null;

  static styles = css`
    :host {
      display: block;
    }

    .message-group {
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
    }

    .message-group.outgoing {
      align-items: flex-end;
    }

    .message-group.incoming {
      align-items: flex-start;
    }

    .message-group.system {
      align-items: center;
    }

    .sender {
      font-size: 12px;
      font-weight: 600;
      color: var(--sender-color, var(--primary-color, #03a9f4));
      margin-bottom: 2px;
      padding: 0 4px;
      max-width: 85%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .message-group.outgoing .sender {
      display: none;
    }

    .bubble {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 16px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      position: relative;
      cursor: pointer;
      transition: opacity 0.15s;
      line-height: 1.4;
      font-size: 14px;
    }

    .bubble:active {
      opacity: 0.7;
    }

    .bubble.search-highlight {
      animation: highlight-flash 2.5s ease-out;
    }

    @keyframes highlight-flash {
      0%, 20% {
        box-shadow: 0 0 0 3px rgba(var(--rgb-primary-color, 3, 169, 244), 0.6);
      }
      100% {
        box-shadow: 0 0 0 3px transparent;
      }
    }

    .bubble + .bubble {
      margin-top: 2px;
    }

    .bubble.incoming {
      background: var(--bubble-incoming-bg, var(--secondary-background-color, #e8e8e8));
      color: var(--bubble-incoming-text, var(--primary-text-color, #212121));
      border-bottom-left-radius: 4px;
    }

    .bubble.incoming:first-of-type {
      border-top-left-radius: 16px;
    }

    .bubble.outgoing {
      background: var(--bubble-outgoing-bg, var(--primary-color, #03a9f4));
      color: var(--bubble-outgoing-text, #fff);
      border-bottom-right-radius: 4px;
    }

    .bubble.outgoing:first-of-type {
      border-top-right-radius: 16px;
    }

    .bubble.system {
      background: transparent;
      color: var(--system-msg-color, var(--secondary-text-color, #727272));
      font-style: italic;
      font-size: 13px;
      text-align: center;
      cursor: default;
      padding: 4px 12px;
    }

    .message-text {
      white-space: pre-wrap;
    }

    .message-text .mention {
      background: var(--mention-bg, rgba(3, 169, 244, 0.15));
      color: var(--mention-text, var(--primary-color, #03a9f4));
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 4px;
    }

    .bubble.outgoing .message-text .mention {
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
    }

    .timestamp {
      font-size: 11px;
      color: var(--timestamp-color, var(--secondary-text-color, #727272));
      margin-top: 2px;
      padding: 0 4px;
    }

    .bubble.outgoing .timestamp {
      color: rgba(255, 255, 255, 0.6);
    }

    .bubble.incoming .timestamp {
      color: var(--secondary-text-color, #727272);
    }

    .message-group.outgoing .timestamp {
      text-align: right;
    }

    .route-info {
      font-size: 10px;
      color: var(--timestamp-color, var(--secondary-text-color, #727272));
      padding: 2px 4px;
      font-family: monospace;
    }

    .route-info-inline {
      font-size: 11px;
      color: var(--timestamp-color, var(--secondary-text-color, #727272));
      font-family: monospace;
      margin-top: 2px;
      padding: 0 4px;
      opacity: 0.7;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .delivery-status {
      color: inherit;
    }

    .message-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .message-dialog {
      background: #333;
      border: 2px solid var(--primary-color, #03a9f4);
      border-radius: 12px;
      box-shadow: 0 0 20px rgba(var(--rgb-primary-color, 3, 169, 244), 0.3);
      min-width: 240px;
      max-width: 300px;
      overflow: hidden;
      z-index: 21;
    }

    .message-dialog-preview {
      padding: 12px 16px;
      font-size: 13px;
      color: var(--secondary-text-color);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 280px;
    }

    .message-dialog-action {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      min-height: 48px;
      transition: background 0.15s;
    }

    .message-dialog-action:hover,
    .message-dialog-action:active {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
    }

    .message-dialog-action + .message-dialog-action {
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }

    .message-dialog-route {
      padding: 12px 16px;
      font-size: 12px;
      color: var(--secondary-text-color);
      border-top: 1px solid var(--divider-color, #e0e0e0);
      cursor: pointer;
      font-family: monospace;
      word-break: break-all;
      transition: background 0.15s;
    }

    .message-dialog-route:hover,
    .message-dialog-route:active {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
    }
  `;

  render() {
    if (this.group) {
      return html`
        ${this._renderGroup()}
        ${this._selectedMessage ? this._renderMessageDialog(this._selectedMessage) : html``}
      `;
    }
    return html``;
  }

  private _renderGroup() {
    if (!this.group) return html``;

    const g = this.group;
    const classes = {
      'message-group': true,
      incoming: !g.isOutgoing && !g.isSystem,
      outgoing: g.isOutgoing,
      system: g.isSystem,
    };

    // Determine sender color
    let senderColor: string | undefined;
    if (g.messages.length > 0) {
      const firstMsg = g.messages[0];
      senderColor = firstMsg.senderColor || senderColorFromPrefix(g.sender);
    }

    return html`
      <div class=${this._classMap(classes)} style=${senderColor ? `--sender-color: ${senderColor}` : ''}>
        ${!g.isSystem && !g.isOutgoing
          ? html`<div class="sender">${g.sender}</div>`
          : html``}
        ${g.messages.map((msg) => this._renderBubble(msg))}
      </div>
    `;
  }

  private _renderBubble(msg: ChatMessage) {
    const bubbleClasses = {
      bubble: true,
      incoming: !msg.isOutgoing && !msg.isSystem,
      outgoing: msg.isOutgoing,
      system: msg.isSystem,
    };

    const statusLabel = msg.isOutgoing && msg.deliveryStatus ? this._getStatusLabel(msg.deliveryStatus) : '';
    const ts = formatTimestamp(msg.timestamp, this.timestampFormat);

    return html`
      <div class=${this._classMap(bubbleClasses)} data-msg-id=${msg.id} @click=${(e: Event) => { e.stopPropagation(); this._selectedMessage = msg; }}>
        <div class="message-text">${this._renderTextWithMentions(msg.text, msg.mentions)}</div>
        <div class="timestamp">${statusLabel ? html`<span class="delivery-status">${statusLabel}</span> · ` : ''}${ts}</div>
      </div>
    `;
  }

  /**
   * Get inline delivery status label for the timestamp line.
   * Shows "Repeated" for messages heard by repeaters, "No repeats" otherwise.
   * Full details (repeater count, RTT) are in the click-to-open dialog.
   */
  private _getStatusLabel(deliveryStatus: DeliveryStatus): string {
    const status = deliveryStatus.status;
    const repeats = deliveryStatus.repeaterCount ?? 0;

    switch (status) {
      case 'pending':
      case 'waiting':
        return 'Waiting...';
      case 'sent':
        return repeats > 0 ? 'Repeated' : 'Unheard';
      case 'delivered':
        return 'Delivered';
      case 'failed':
        return 'Failed';
      case 'unconfirmed':
      default:
        return 'Sent';
    }
  }

  private _renderTextWithMentions(text: string, mentions: string[]) {
    let rendered = text;
    const mentionSet = new Set(mentions);

    // Replace @[Name] mentions
    for (const mention of mentionSet) {
      const pattern = new RegExp(`@\\[${mention}\\]`, 'g');
      rendered = rendered.replace(pattern, `<span class="mention">@${mention}</span>`);
    }

    // Replace @Word mentions
    for (const mention of mentionSet) {
      const pattern = new RegExp(`@${mention}\\b`, 'g');
      rendered = rendered.replace(pattern, `<span class="mention">@${mention}</span>`);
    }

    return unsafeHTML(rendered);
  }

  private _renderMessageDialog(msg: ChatMessage) {
    const hasRoute = msg.rxLogData && msg.rxLogData.length > 0;
    const routeText = hasRoute
      ? msg.rxLogData!
          .map((e) => {
            const nodes = e.path_nodes as string[] | undefined;
            const hops = e.hop_count as number | undefined;
            const snr = e.snr as number | undefined;
            const rssi = e.rssi as number | undefined;
            const parts: string[] = [];
            if (nodes && nodes.length > 0) {
              parts.push(nodes.map((n: string) => n.substring(0, 4).toUpperCase()).join(' > '));
            } else if (hops !== undefined) {
              parts.push(`${hops} hop${hops !== 1 ? 's' : ''}`);
            } else {
              // No path_nodes / hop_count → packet was heard directly by
              // the local node. Label as "0 hops" rather than "direct" so
              // it isn't confusable with the "direct message" message-type
              // for channel broadcasts that happened to be in radio range.
              parts.push('0 hops');
            }
            if (snr !== undefined) parts.push(`SNR: ${snr}`);
            if (rssi !== undefined) parts.push(`RSSI: ${rssi}`);
            return parts.join(' · ');
          })
          .join(' | ')
      : '';

    const fullDateTime = msg.timestamp.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    const footerStyle = 'padding: 8px 16px; font-size: 12px; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color, #e0e0e0);';

    return html`
      <div class="message-dialog-overlay" @click=${() => { this._selectedMessage = null; }}>
        <div class="message-dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="message-dialog-preview">${msg.text}</div>
          <button class="message-dialog-action" @click=${() => this._copyText(msg.text)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>Copy Text
          </button>
          ${!msg.isOutgoing && !msg.isSystem
            ? html`
                <button class="message-dialog-action" @click=${() => this._replyToSender(msg.sender)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>Reply
                </button>
              `
            : html``}
          ${hasRoute
            ? html`
                <div class="message-dialog-route" @click=${() => this._copyText(routeText)}>
                  Route: ${routeText}
                </div>
              `
            : html``}
          <div style=${footerStyle}>
            ${msg.isOutgoing ? 'Sent' : 'Received'}: ${fullDateTime}
          </div>
          ${msg.isOutgoing && msg.deliveryStatus
            ? html`
                <div style=${footerStyle}>
                  ${(msg.deliveryStatus.repeaterCount ?? 0) > 0
                    ? `${msg.deliveryStatus.repeaterCount} repeater${msg.deliveryStatus.repeaterCount === 1 ? '' : 's'} responded`
                    : 'No repeaters responded'}${msg.deliveryStatus.ackReceived ? ' · ACK received' : ''}${msg.deliveryStatus.roundTripMs ? ` · ${msg.deliveryStatus.roundTripMs}ms RTT` : ''}
                </div>
              `
            : html``}
        </div>
      </div>
    `;
  }

  private async _copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    this._selectedMessage = null;
  }

  private _replyToSender(sender: string) {
    this.dispatchEvent(
      new CustomEvent('reply-to-sender', {
        detail: { mention: `@[${sender}] ` },
        bubbles: true,
        composed: true,
      }),
    );
    this._selectedMessage = null;
  }

  private _classMap(obj: Record<string, boolean>): string {
    return Object.entries(obj)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .join(' ');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-message-bubble': MessageBubble;
  }
}
