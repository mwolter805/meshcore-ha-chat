import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { panelStyles } from '../styles';
import { attachDialogA11y } from '../utils/dialog-a11y';

/**
 * Reusable confirmation dialog component
 *
 * Dispatches:
 * - 'confirm' event when user confirms
 * - 'cancel' event when user cancels
 */
@customElement('meshcore-confirm-dialog')
export class ConfirmDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) title = 'Confirm';
  @property({ type: String }) message = '';
  @property({ type: String }) confirmLabel = 'Confirm';
  @property({ type: String }) cancelLabel = 'Cancel';
  @property({ type: Boolean }) dangerous = false;
  @property({ type: String }) requireTyped?: string;

  @state() private _typedValue = '';

  constructor() {
    super();
    // Phase 5 Q13: focus trap + Escape closes the dialog (treated as cancel).
    attachDialogA11y(this, {
      isOpen: () => this.open,
      onEscape: () => this._onCancel(),
    });
  }

  static styles = [
    panelStyles,
    css`
      :host {
        display: block;
      }
    `,
  ];

  render() {
    if (!this.open) return;

    const confirmDisabled =
      this.requireTyped && this._typedValue !== this.requireTyped;

    return html`
      <div class="dialog-overlay" @click=${this._onOverlayClick}>
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-label=${this.title}>
          <div class="dialog-header">
            <div class="dialog-header-title">${this.title}</div>
          </div>
          <div class="dialog-body">
            <div style="margin-bottom: 16px;">${this.message}</div>
            ${this.requireTyped
              ? html`
                  <div class="form-group">
                    <label class="form-label">Type to confirm</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="Type '${this.requireTyped}'"
                      .value=${this._typedValue}
                      @input=${(e: Event) => {
                        this._typedValue = (e.target as HTMLInputElement).value;
                      }}
                    />
                    <div class="form-description">
                      Type '${this.requireTyped}' to enable confirmation
                    </div>
                  </div>
                `
              : ''}
          </div>
          <div class="dialog-footer">
            <button
              class="dialog-button"
              @click=${this._onCancel}>
              ${this.cancelLabel}
            </button>
            <button
              class="dialog-button primary ${this.dangerous
                ? 'danger-button'
                : ''}"
              ?disabled=${confirmDisabled}
              @click=${this._onConfirm}>
              ${this.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _onOverlayClick(e: Event) {
    if (e.target === e.currentTarget) {
      this._onCancel();
    }
  }

  private _onCancel() {
    this._typedValue = '';
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true }));
  }

  private _onConfirm() {
    this.dispatchEvent(new CustomEvent('confirm', { bubbles: true }));
    this._typedValue = '';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-confirm-dialog': ConfirmDialog;
  }
}
