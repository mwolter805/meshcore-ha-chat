import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Contact } from '../types';

@customElement('meshcore-contact-card')
export class ContactCard extends LitElement {
  @property({ type: Object }) contact?: Contact;
  @property({ type: Boolean }) selected = false;

  static styles = css`
    :host {
      display: block;
    }

    .contact-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      background: var(--card-background-color, #fff);
    }

    .contact-card:hover {
      background: rgba(0, 0, 0, 0.02);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .contact-card.selected {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
      border-color: var(--primary-color, #03a9f4);
    }

    .contact-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .contact-avatar.client { background: #4caf50; }
    .contact-avatar.repeater { background: #ff9800; }
    .contact-avatar.room-server { background: #9c27b0; }
    .contact-avatar.sensor { background: #607d8b; }
    .contact-avatar.unknown { background: var(--primary-color, #03a9f4); }

    .contact-info {
      flex: 1;
      overflow: hidden;
    }

    .contact-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact-prefix {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-family: monospace;
    }

    .contact-meta {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      margin-top: 2px;
    }

    .category-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 10px;
      white-space: nowrap;
      flex-shrink: 0;
      align-self: center;
    }
    .category-badge.added {
      background: rgba(3, 169, 244, 0.15);
      color: #0277bd;
    }
    .category-badge.discovered {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
    }
  `;

  render() {
    if (!this.contact) return html``;

    const c = this.contact;
    const avatarClass = this._getTypeClass(c.type);
    const { label: catLabel, cls: catCls } = this._getCategoryBadge(c);

    return html`
      <div class=${this.selected ? 'contact-card selected' : 'contact-card'}>
        <div class="contact-avatar ${avatarClass}">
          ${this._getTypeIcon(c.type)}
        </div>
        <div class="contact-info">
          <div class="contact-name">${c.adv_name}</div>
          <div class="contact-prefix">${c.pubkey_prefix}</div>
          <div class="contact-meta">
            ${c.lastmod ? `Last heard ${new Date(c.lastmod * 1000).toLocaleString()}` : ''}
          </div>
        </div>
        <span class="category-badge ${catCls}">${catLabel}</span>
      </div>
    `;
  }

  private _getCategoryBadge(c: Contact): { label: string; cls: string } {
    if (c.added_to_node) return { label: 'Added', cls: 'added' };
    return { label: 'Discovered', cls: 'discovered' };
  }

  private _getTypeClass(type: number): string {
    switch (type) {
      case 1: return 'client';
      case 2: return 'repeater';
      case 3: return 'room-server';
      case 4: return 'sensor';
      default: return 'unknown';
    }
  }

  private _getTypeIcon(type: number) {
    switch (type) {
      // Client — phone/device icon
      case 0:
      case 1:
        return html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`;
      // Repeater — signal/antenna icon
      case 2:
        return html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
      // Room Server — server/chat icon
      case 3:
        return html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;
      // Sensor — sensor/dashboard icon
      case 4:
        return html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`;
      default:
        return html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-contact-card': ContactCard;
  }
}
