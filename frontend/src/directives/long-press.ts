import { directive, Directive, ElementPart, PartType } from 'lit/directive.js';

/**
 * Lit directive that fires a callback on long-press (tap-and-hold) for touch
 * devices, providing parity with the contextmenu (right-click) event on desktop.
 *
 * Usage:
 *   html`<div ${longPress(() => this._onContextAction())}></div>`
 *
 * Pointer Events API is used so it works for both touch and mouse (pen, etc.).
 * A 500 ms hold triggers the callback. Moving more than 10 px cancels (so
 * normal scrolling is unaffected).
 */

const HOLD_MS = 500;
const MOVE_THRESHOLD_PX = 10;

class LongPressDirective extends Directive {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _startX = 0;
  private _startY = 0;
  private _attached = false;
  private _callback: (() => void) | null = null;
  private _element: Element | null = null;

  // Bound handlers (created once per directive instance)
  private _onPointerDown = (e: PointerEvent) => this._handleDown(e);
  private _onPointerUp = () => this._cancelTimer();
  private _onPointerMove = (e: PointerEvent) => this._handleMove(e);
  private _onContextMenu = (e: Event) => {
    // Suppress the native context menu during a long-press.
    if (this._timer !== null) {
      e.preventDefault();
    }
  };

  constructor(partInfo: unknown) {
    super(partInfo as any);
    if ((partInfo as any).type !== PartType.ELEMENT) {
      throw new Error('longPress directive must be used on an element');
    }
  }

  render(_callback: () => void) {
    // Nothing to render — side-effects only.
    return undefined;
  }

  override update(part: ElementPart, [callback]: [() => void]) {
    this._callback = callback;

    if (!this._attached) {
      this._element = part.element;
      const el = this._element;
      el.addEventListener('pointerdown', this._onPointerDown as EventListener);
      el.addEventListener('pointerup', this._onPointerUp);
      el.addEventListener('pointercancel', this._onPointerUp);
      el.addEventListener('pointermove', this._onPointerMove as EventListener);
      el.addEventListener('contextmenu', this._onContextMenu);
      this._attached = true;
    }

    return this.render(callback);
  }

  private _handleDown(e: PointerEvent) {
    // Only trigger on primary pointer (touch or left-click)
    if (e.button !== 0) return;
    this._startX = e.clientX;
    this._startY = e.clientY;
    this._cancelTimer();
    this._timer = setTimeout(() => {
      this._timer = null;
      this._callback?.();
    }, HOLD_MS);
  }

  private _handleMove(e: PointerEvent) {
    if (this._timer === null) return;
    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
      this._cancelTimer();
    }
  }

  private _cancelTimer() {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

export const longPress = directive(LongPressDirective);
