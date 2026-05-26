/**
 * Dialog accessibility helper — focus trap + Escape-to-close.
 *
 * The same pattern is needed by every modal dialog in `frontend/src/`,
 * so it is implemented once and adopted via a one-line constructor call.
 *
 * Usage (component-class dialog):
 *
 * ```ts
 * import { attachDialogA11y } from '../utils/dialog-a11y';
 *
 * @customElement('meshcore-some-dialog')
 * export class SomeDialog extends LitElement {
 *   @property({ type: Boolean }) open = false;
 *
 *   constructor() {
 *     super();
 *     attachDialogA11y(this, {
 *       isOpen: () => this.open,
 *       onEscape: () => this._close(),
 *     });
 *   }
 *
 *   private _close() {
 *     this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
 *   }
 * }
 * ```
 *
 * Usage (inline modal inside a page's render output):
 *
 * ```ts
 * @customElement('meshcore-some-page')
 * export class SomePage extends LitElement {
 *   @state() private _settingsOpen = false;
 *
 *   constructor() {
 *     super();
 *     attachDialogA11y(this, {
 *       isOpen: () => this._settingsOpen,
 *       onEscape: () => { this._settingsOpen = false; },
 *       getScope: () => this.shadowRoot?.querySelector('.settings-modal'),
 *     });
 *   }
 * }
 * ```
 *
 * `getScope` lets one host (the page) own multiple inline modals — one
 * `attachDialogA11y` call per modal, each with its own `isOpen` and
 * scope selector. The page's host element listens once via the shared
 * document-level listener (see below).
 *
 * Implementation notes:
 *
 *   - **Single document-level capture-phase listener.** Catches every
 *     keydown before any host-level or app-level bubble listener can
 *     consume it. (HA's frontend has its own keydown handlers; using
 *     bubble-phase here proved unreliable in practice.) The listener
 *     is registered exactly once for the whole panel.
 *   - **Modal stack.** Each open dialog pushes itself onto a global
 *     stack on open, pops on close. Only the top of the stack handles
 *     each keystroke. Nested dialogs (e.g., manage-dialog opens
 *     channel-dialog) get the right semantics: Escape on the inner
 *     dialog closes only the inner one.
 *   - **`shadowRoot.activeElement`** is used to identify the focused
 *     descendant inside a dialog; `document.activeElement` returns the
 *     host across the shadow boundary.
 *   - **Components whose `:host` uses `display: contents`** still work
 *     — the controller doesn't depend on host event listeners.
 */

import type { ReactiveController, ReactiveControllerHost } from 'lit';

/** CSS selector matching elements that participate in the Tab order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogA11yOptions {
  /** Predicate returning true when the dialog is currently open. */
  isOpen: () => boolean;
  /** Called when the user presses Escape inside the open dialog. */
  onEscape: () => void;
  /**
   * Optional focusable-scope override. Defaults to the host's shadow
   * root. For inline modals rendered inside a larger page, return the
   * modal's root element so the focus trap doesn't bleed across the
   * whole page.
   */
  getScope?: () => Element | DocumentFragment | null | undefined;
}

type Host = ReactiveControllerHost & HTMLElement;

// ─── Global modal stack and shared keydown listener ──────────────────

/** Stack of open dialog controllers, newest on top. */
const _openStack: DialogA11yController[] = [];
let _listenerRegistered = false;

function _ensureListener(): void {
  if (_listenerRegistered) return;
  _listenerRegistered = true;
  // Capture phase: fires before any bubble-phase listener (including
  // HA's frontend keydown handlers). Without capture, the event can be
  // consumed before reaching us.
  document.addEventListener('keydown', _onGlobalKeyDown, true);
}

function _onGlobalKeyDown(e: KeyboardEvent): void {
  if (_openStack.length === 0) return;
  const top = _openStack[_openStack.length - 1];
  top._handleKeyDown(e);
}

// ─── Controller ──────────────────────────────────────────────────────

export class DialogA11yController implements ReactiveController {
  private _wasOpen = false;
  private _previousActive: Element | null = null;
  private _inStack = false;

  constructor(private host: Host, private opts: DialogA11yOptions) {
    this.host.addController(this);
    _ensureListener();
  }

  hostConnected(): void {
    // Listener is global; nothing to do per-connection beyond ensuring
    // the global is alive. _ensureListener is idempotent.
    _ensureListener();
  }

  hostDisconnected(): void {
    if (this._inStack) {
      this._popStack();
    }
    this._previousActive = null;
    this._wasOpen = false;
  }

  hostUpdated(): void {
    const open = this.opts.isOpen();
    if (open && !this._wasOpen) {
      this._previousActive = this._currentDocumentActive();
      this._pushStack();
      this._focusFirstSoon();
    } else if (!open && this._wasOpen) {
      this._popStack();
      const prev = this._previousActive as HTMLElement | null;
      this._previousActive = null;
      if (prev && prev.isConnected && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          /* ignore */
        }
      }
    }
    this._wasOpen = open;
  }

  // ─── Stack management ─────────────────────────────────────────────

  private _pushStack(): void {
    if (this._inStack) return;
    _openStack.push(this);
    this._inStack = true;
  }

  private _popStack(): void {
    const idx = _openStack.indexOf(this);
    if (idx >= 0) _openStack.splice(idx, 1);
    this._inStack = false;
  }

  // ─── Focusable discovery ──────────────────────────────────────────

  /** Focusable descendants in DOM order (visible only). */
  private _getFocusables(): HTMLElement[] {
    const scope = this.opts.getScope?.() ?? this.host.shadowRoot;
    if (!scope) return [];
    return Array.from(
      (scope as ParentNode).querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => {
      if (el.hasAttribute('aria-hidden')) return false;
      if (el.hidden) return false;
      // `offsetParent === null` skips display:none / hidden ancestors.
      // For position:fixed elements (and descendants of them) we fall
      // back to getClientRects() since their offsetParent is also null.
      if (el.offsetParent === null && el.getClientRects().length === 0) {
        return false;
      }
      return true;
    });
  }

  private _focusFirstSoon(): void {
    // Wait one microtask so Lit has finished committing the open-state
    // render to DOM before we measure focusables.
    queueMicrotask(() => {
      if (!this.opts.isOpen()) return;
      // If focus is already inside the dialog (e.g., the user clicked
      // an element that opened it via .focus()), respect that.
      const scope = this.opts.getScope?.() ?? this.host.shadowRoot;
      if (scope && this._scopeContainsFocus(scope as ParentNode)) return;
      const items = this._getFocusables();
      if (items.length === 0) return;
      try {
        items[0].focus();
      } catch {
        /* ignore */
      }
    });
  }

  /** True when document focus is currently inside the given scope. */
  private _scopeContainsFocus(scope: ParentNode): boolean {
    // Walk through shadow roots from document.activeElement down.
    let active: Element | null = document.activeElement;
    while (active) {
      if (active === scope) return true;
      if ((scope as ShadowRoot).host === active) return true;
      // For ParentNode that's an Element, .contains works; for a
      // ShadowRoot, fall back to checking ancestor chain manually.
      if ('contains' in scope && (scope as Element).contains(active)) {
        return true;
      }
      const ar = active.shadowRoot;
      if (ar && ar.activeElement) {
        active = ar.activeElement;
      } else {
        break;
      }
    }
    return false;
  }

  private _currentDocumentActive(): Element | null {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  // ─── Keydown handler (called by the global dispatcher) ───────────

  /** @internal — invoked by the shared document-level listener. */
  _handleKeyDown(e: KeyboardEvent): void {
    if (!this.opts.isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onEscape();
      return;
    }

    if (e.key !== 'Tab') return;

    const items = this._getFocusables();
    if (items.length === 0) return;
    const scope = this.opts.getScope?.() ?? this.host.shadowRoot;
    const focusedInScope = scope
      ? this._findFocusedInScope(scope as ParentNode)
      : null;

    // Handle Tab navigation entirely ourselves rather than letting the
    // browser advance focus natively. This makes Tab cycle through
    // every focusable in `items` (including buttons) regardless of the
    // user's macOS "keyboard navigation" system preference, which by
    // default restricts native Tab to text inputs and dropdowns in
    // Safari and other system-Tab-respecting apps. Cycling our own
    // items list also guarantees the trap stays inside the dialog
    // even mid-list when the next browser-native focusable would be
    // outside our scope.
    const currentIdx = focusedInScope ? items.indexOf(focusedInScope) : -1;
    let nextIdx: number;
    if (e.shiftKey) {
      // Shift+Tab: previous item; wrap from first to last; if focus is
      // outside the scope, land on the last item.
      nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
    } else {
      // Tab: next item; wrap from last to first; if focus is outside
      // the scope, land on the first item.
      nextIdx =
        currentIdx === -1 || currentIdx >= items.length - 1
          ? 0
          : currentIdx + 1;
    }

    e.preventDefault();
    e.stopPropagation();
    try {
      items[nextIdx].focus();
    } catch {
      /* ignore */
    }
  }

  /**
   * Return the focused element inside the given scope, walking shadow
   * roots if needed. Returns null when focus is outside the scope.
   */
  private _findFocusedInScope(scope: ParentNode): HTMLElement | null {
    // Start at document.activeElement and walk into shadow roots.
    let active: Element | null = document.activeElement;
    while (active) {
      // If active is inside scope (light DOM), match.
      if (
        scope === active ||
        ('contains' in scope && (scope as Element).contains(active))
      ) {
        // If active has its own shadow root with a focused descendant,
        // walk in.
        if (active.shadowRoot && active.shadowRoot.activeElement) {
          active = active.shadowRoot.activeElement;
          continue;
        }
        return active as HTMLElement;
      }
      // If scope is a ShadowRoot whose host equals active, descend.
      if ((scope as ShadowRoot).host === active) {
        active = (scope as ShadowRoot).activeElement;
        continue;
      }
      // Try descending into active's shadow root.
      const ar = active.shadowRoot;
      if (ar && ar.activeElement) {
        active = ar.activeElement;
      } else {
        break;
      }
    }
    return null;
  }
}

/**
 * Attach a {@link DialogA11yController} to a host as a side effect.
 *
 * Equivalent to `new DialogA11yController(host, opts)` but doesn't
 * return the instance, so callers don't need to store an unused field
 * (which trips `noUnusedLocals`).
 *
 * Call from the host's constructor. Multiple calls on the same host
 * are supported — useful for pages that own several inline modals,
 * each with its own `isOpen` predicate and scope.
 */
export function attachDialogA11y(
  host: ReactiveControllerHost & HTMLElement,
  opts: DialogA11yOptions,
): void {
  // eslint-disable-next-line @typescript-eslint/no-new
  new DialogA11yController(host, opts);
}
