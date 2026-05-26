import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * Info-icon tooltip — the `ⓘ` button that sits next to a metric label
 * (in hero tiles and in the row's label cell of the sensor table).
 *
 * By design, threshold-bearing values do NOT use
 * native `title=` attributes. Instead, this component renders a focusable
 * button whose hover, focus, and tap state opens a positioned popover
 * with the band-statement prose and an optional citation footer.
 *
 * Tab-focusable so mobile taps surface the same popover desktop hovers
 * give. The popover positions itself below the icon by default and is
 * JS-clamped to the viewport on each open (see _positionPopover) so it
 * never overflows the left/right/bottom edges; it flips above the icon
 * if the below-position would clip. Closes on scroll to avoid visual
 * detachment from the (fixed-positioned) anchor.
 *
 * If/when Home Assistant exposes a built-in `<ha-help-tooltip>` component
 * that offers the same data shape (text + optional source) and the same
 * trigger semantics (hover + focus), this component should be replaced
 * with a thin wrapper around that. For now, no such HA primitive exists
 * in this repo's environment, so we render our own.
 */
@customElement('meshcore-info-tip')
export class InfoTip extends LitElement {
  /** Band-statement prose. Plain text; no embedded HTML. */
  @property({ type: String }) content = '';
  /** Optional citation URL. When omitted, no source line renders. */
  @property({ type: String }) source?: string;

  /** Open state — driven by mouseenter/leave + focus/blur on the button.
   *  Replaces the prior CSS `:hover/:focus` show/hide so JS can measure
   *  and clamp the popover to the viewport on each open. */
  @state() private _open = false;

  static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    button.info-tip {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      margin-left: 4px;
      border-radius: 50%;
      color: var(--secondary-text-color);
      background: var(--divider-color, #e0e0e0);
      cursor: help;
      user-select: none;
      flex-shrink: 0;
      border: none;
      padding: 0;
    }
    /* The "i" glyph is drawn as inline SVG (not a Unicode character) so
       its dot + stem sit on the geometric center of the 14×14 button
       regardless of font metrics. Using a Unicode glyph here previously
       produced two stacked, optically-misaligned rings — the CSS-drawn
       button background plus the glyph's own circled-i ring. */
    button.info-tip svg {
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    button.info-tip:hover,
    button.info-tip:focus {
      color: var(--card-background-color, #fff);
      background: var(--primary-color, #03a9f4);
      outline: none;
    }
    /* Popover is position: fixed so we can clamp it to the viewport on
       open (see _positionPopover). top / left are set by JS each time
       the popover opens; visibility is toggled by the .open class
       rather than :hover/:focus so we control the timing of the
       measurement that drives the clamp. */
    .info-tip-content {
      position: fixed;
      top: 0;
      left: 0;
      display: none;
      width: 260px;
      max-width: calc(100vw - 16px);
      padding: 10px 12px;
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      font-size: 11px;
      font-weight: normal;
      color: var(--primary-text-color);
      text-align: left;
      line-height: 1.45;
      z-index: 100;
      white-space: normal;
      pointer-events: none;
    }
    .info-tip-content.open {
      display: block;
    }
    .info-tip-content .src {
      display: block;
      margin-top: 6px;
      font-size: 10px;
      color: var(--secondary-text-color);
      word-break: break-all;
    }
  `;

  render() {
    if (!this.content) return nothing;
    return html`
      <button class="info-tip"
              type="button"
              aria-label="More information"
              @mouseenter=${this._onOpen}
              @mouseleave=${this._onClose}
              @focus=${this._onOpen}
              @blur=${this._onClose}
              @click=${this._stopPropagation}>
        <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="7" cy="4" r="1.2" fill="currentColor"></circle>
          <rect x="6.1" y="6.2" width="1.8" height="5.2" rx="0.6" fill="currentColor"></rect>
        </svg>
        <span class="info-tip-content ${this._open ? 'open' : ''}" role="tooltip">
          ${this.content}
          ${this.source
            ? html`<span class="src">${this.source}</span>`
            : nothing}
        </span>
      </button>
    `;
  }

  protected updated() {
    if (this._open) this._positionPopover();
  }

  override disconnectedCallback() {
    // Defensive: ensure the scroll listener is detached if the element
    // is removed while open (Lit doesn't guarantee a final re-render).
    window.removeEventListener('scroll', this._onScroll, true);
    super.disconnectedCallback();
  }

  /** Block clicks from bubbling to the parent row's hass-more-info handler. */
  private _stopPropagation(e: Event) {
    e.stopPropagation();
  }

  private _onOpen = () => {
    if (this._open) return;
    this._open = true;
    // Capture-phase so a scroll inside the panel's inner scroll container
    // (not just window) still closes the tip — otherwise a fixed-positioned
    // popover would visually detach from its button as the user scrolls.
    window.addEventListener('scroll', this._onScroll, true);
  };

  private _onClose = () => {
    if (!this._open) return;
    this._open = false;
    window.removeEventListener('scroll', this._onScroll, true);
  };

  private _onScroll = () => this._onClose();

  /** Place the popover below the button by default; clamp to the viewport
   *  horizontally with an 8px margin; flip above if it would overflow the
   *  bottom. Called from updated() each time _open flips to true.       */
  private _positionPopover() {
    const root = this.shadowRoot;
    if (!root) return;
    const button = root.querySelector('.info-tip') as HTMLElement | null;
    const popover = root.querySelector('.info-tip-content') as HTMLElement | null;
    if (!button || !popover) return;

    const margin = 8;
    const gap = 6;
    const buttonRect = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: horizontally centered on the button, vertically below.
    let left = buttonRect.left + buttonRect.width / 2 - popoverRect.width / 2;
    let top = buttonRect.bottom + gap;

    // Horizontal clamp.
    if (left < margin) {
      left = margin;
    } else if (left + popoverRect.width > vw - margin) {
      left = Math.max(margin, vw - margin - popoverRect.width);
    }

    // Flip above if the default below-position would clip the bottom edge.
    if (top + popoverRect.height > vh - margin) {
      top = buttonRect.top - gap - popoverRect.height;
      // Final guard: if flipping above also clips, just clamp to top margin.
      if (top < margin) top = margin;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-info-tip': InfoTip;
  }
}
