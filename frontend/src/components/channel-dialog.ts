import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types';
import { setChannel } from '../api';
import { panelStyles } from '../styles';
import { attachDialogA11y } from '../utils/dialog-a11y';

/**
 * Add/Edit Channel dialog with auto-key / custom-key toggle
 *
 * Dispatches:
 * - 'channel-saved' event when channel is successfully saved
 * - 'close' event when dialog is closed
 */
@customElement('meshcore-channel-dialog')
export class ChannelDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: String }) entryId?: string;
  @property({ type: Boolean }) narrow = false;
  @property({ type: Boolean }) editMode = false;
  @property({ type: Number }) initialChannelIdx = 0;
  @property({ type: String }) initialChannelName = '';
  @property({ type: Array }) availableIndices: number[] = [];

  @state() private _channelIdx = 0;
  @state() private _channelName = '';
  @state() private _customKey = '';
  @state() private _autoKey = true;
  @state() private _saving = false;
  @state() private _error: string | null = null;

  constructor() {
    super();
    // Phase 5 Q13: focus trap + Escape cancels (treated as close).
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

      :host([narrow]) .dialog {
        max-width: 100%;
      }

      .dialog {
        max-width: 500px;
      }

      .hex-input {
        font-family: monospace;
        letter-spacing: 1px;
      }

      .hex-counter {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 4px;
      }
    `,
  ];

  private _initialized = false;

  willUpdate(changedProps: Map<string, unknown>) {
    if (changedProps.has('open') && this.open && !this._initialized) {
      if (this.editMode) {
        this._channelIdx = this.initialChannelIdx;
        this._channelName = this.initialChannelName;
      } else {
        // Default to first available index
        this._channelIdx = this.availableIndices.length > 0 ? this.availableIndices[0] : 0;
      }
      this._initialized = true;
    }
    if (changedProps.has('open') && !this.open) {
      this._initialized = false;
    }
  }

  render() {
    if (!this.open) return;

    const hexLength = this._customKey.length;
    const hexValid = hexLength === 32 || hexLength === 0 || this._autoKey;

    return html`
      <div
        class="dialog-overlay"
        @click=${this._onOverlayClick}>
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-label=${this.editMode ? 'Edit channel' : 'Add channel'}>
          <div class="dialog-header">
            <div class="dialog-header-title">${this.editMode ? 'Edit Channel' : 'Add Channel'}</div>
          </div>
          <div class="dialog-body">
            ${this._error
              ? html`<div style="padding: 12px; background: rgba(219, 68, 55, 0.1); border-radius: 6px; color: var(--error-color, #db4437); font-size: 13px; margin-bottom: 16px;">
                  ${this._error}
                </div>`
              : ''}

            <!-- Channel Index -->
            <div class="form-group">
              <label class="form-label required">Channel Index</label>
              ${this.editMode
                ? html`
                    <select class="form-select" disabled>
                      <option value=${this._channelIdx} selected>${this._channelIdx}</option>
                    </select>`
                : html`
                    <select
                      class="form-select"
                      @change=${(e: Event) => {
                        this._channelIdx = parseInt((e.target as HTMLSelectElement).value, 10);
                      }}>
                      ${this.availableIndices.map((idx) => html`
                        <option value=${idx} ?selected=${idx === this._channelIdx}>${idx}</option>
                      `)}
                    </select>`
              }
              <div class="form-description">${this.editMode ? 'Channel index cannot be changed' : 'Select an available channel slot'}</div>
            </div>

            <!-- Channel Name -->
            <div class="form-group">
              <label class="form-label required">Channel Name</label>
              <input
                type="text"
                class="form-input"
                placeholder="e.g., general, alerts"
                .value=${this._channelName}
                @input=${(e: Event) => {
                  this._channelName = (e.target as HTMLInputElement).value;
                }}
              />
              <div class="form-description">Friendly name for the channel</div>
            </div>

            <!-- Auto Key Toggle -->
            <div class="form-group">
              <label class="form-toggle">
                <input
                  type="checkbox"
                  ?checked=${this._autoKey}
                  @change=${(e: Event) => {
                    this._autoKey = (e.target as HTMLInputElement).checked;
                  }}
                />
                <span class="form-toggle-label">Auto-generate key from name</span>
              </label>
              <div class="form-description">
                Auto-key generates SHA256 hash of the channel name
              </div>
            </div>

            <!-- Custom Key (if not auto) -->
            ${!this._autoKey
              ? html`
                  <div class="form-group">
                    <label class="form-label required">Custom Key</label>
                    <input
                      type="text"
                      class="form-input hex-input"
                      placeholder="32 hex characters (a-f, 0-9)"
                      .value=${this._customKey}
                      @input=${(e: Event) => {
                        const val = (e.target as HTMLInputElement).value
                          .toLowerCase()
                          .replace(/[^a-f0-9]/g, '');
                        this._customKey = val.slice(0, 32);
                      }}
                    />
                    <div class="hex-counter">${this._customKey.length} / 32 hex characters</div>
                    <div class="form-description">
                      ${hexValid
                        ? 'Valid hex key (16 bytes / 128-bit AES)'
                        : `Invalid: expected 32 characters, got ${hexLength}`}
                    </div>
                  </div>
                `
              : ''}
          </div>
          <div class="dialog-footer">
            <button
              class="dialog-button"
              ?disabled=${this._saving}
              @click=${this._onCancel}>
              Cancel
            </button>
            <button
              class="dialog-button primary"
              ?disabled=${!this._channelName || this._saving || (!this._autoKey && !hexValid) || (!this.editMode && this.availableIndices.length === 0)}
              @click=${this._onSave}>
              ${this._saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private async _onSave() {
    if (!this.hass || !this._channelName) {
      return;
    }

    this._saving = true;
    this._error = null;

    try {
      const result = await setChannel(
        this.hass,
        this._channelIdx,
        this._channelName,
        this._autoKey ? undefined : this._customKey,
        this.entryId,
      );

      if (result.success) {
        this.dispatchEvent(
          new CustomEvent('channel-saved', {
            detail: {
              channelIdx: this._channelIdx,
              name: this._channelName,
            },
            bubbles: true,
          }),
        );
        this._reset();
      } else {
        this._error = 'Failed to save channel';
      }
    } catch (error) {
      this._error = `Error: ${String(error)}`;
    } finally {
      this._saving = false;
    }
  }

  private _onCancel() {
    this._reset();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }

  private _onOverlayClick(e: Event) {
    if (e.target === e.currentTarget) {
      this._onCancel();
    }
  }

  private _reset() {
    this._channelIdx = 0;
    this._channelName = '';
    this._customKey = '';
    this._autoKey = true;
    this._error = null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-channel-dialog': ChannelDialog;
  }
}
