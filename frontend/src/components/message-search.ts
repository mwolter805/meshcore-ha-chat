import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types';
import { type SearchResult } from '../api';

/**
 * Message search component — queries the persistent message store via
 * meshcore/search_stored_messages. Server-side text/sender filtering.
 * Fires 'result-selected' when a search result is clicked.
 */
@customElement('meshcore-message-search')
export class MessageSearch extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: String }) entryId?: string;
  @property({ type: String }) entityId?: string;
  @property({ type: String }) meshNodeName?: string;

  @state() private _query = '';
  @state() private _fromDate = '';
  @state() private _toDate = '';
  @state() private _results: SearchResult[] = [];
  @state() private _totalCount = 0;
  @state() private _searching = false;
  @state() private _hasSearched = false;
  @state() private _showFilters = false;

  private _debounceTimer: number | null = null;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .search-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .search-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .search-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .search-input::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    .filter-toggle {
      padding: 6px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--secondary-text-color);
      font-size: 12px;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s;
    }

    .filter-toggle:hover,
    .filter-toggle.active {
      border-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
    }

    .filters {
      display: flex;
      gap: 8px;
    }

    .filter-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 12px;
      outline: none;
    }

    .filter-input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .result-count {
      font-size: 12px;
      color: var(--secondary-text-color);
      padding: 0 4px;
    }

    .results {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .results::-webkit-scrollbar {
      width: 6px;
    }

    .results::-webkit-scrollbar-track {
      background: transparent;
    }

    .results::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .result-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      cursor: pointer;
      transition: background 0.15s;
    }

    .result-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .result-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }

    .result-sender {
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .result-conversation {
      font-style: italic;
    }

    .result-text {
      font-size: 13px;
      color: var(--primary-text-color);
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .result-text mark {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
      color: inherit;
      border-radius: 2px;
      padding: 0 2px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color);
      text-align: center;
      padding: 24px;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--secondary-text-color);
      font-size: 13px;
      gap: 8px;
    }
  `;

  render() {
    return html`
      <div class="search-header">
        <div class="search-row">
          <input
            class="search-input"
            type="text"
            placeholder="Search messages..."
            .value=${this._query}
            @input=${this._onQueryInput}
          />
          <button
            class="filter-toggle ${this._showFilters ? 'active' : ''}"
            @click=${() => { this._showFilters = !this._showFilters; }}>
            Filters
          </button>
        </div>
        ${this._showFilters
          ? html`
              <div class="filters">
                <input
                  class="filter-input"
                  type="date"
                  placeholder="From"
                  .value=${this._fromDate}
                  @change=${(e: Event) => { this._fromDate = (e.target as HTMLInputElement).value; this._doSearch(); }}
                />
                <input
                  class="filter-input"
                  type="date"
                  placeholder="To"
                  .value=${this._toDate}
                  @change=${(e: Event) => { this._toDate = (e.target as HTMLInputElement).value; this._doSearch(); }}
                />
              </div>
            `
          : ''}
        ${this._hasSearched
          ? html`<div class="result-count">${this._totalCount} result${this._totalCount !== 1 ? 's' : ''}</div>`
          : ''}
      </div>

      <div class="results">
        ${this._searching
          ? html`<div class="loading-state">Searching...</div>`
          : !this._hasSearched
            ? html`
                <div class="empty-state">
                  <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></div>
                  <div class="empty-text">Search your message history</div>
                </div>
              `
            : this._results.length === 0
              ? html`
                  <div class="empty-state">
                    <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M20 6H10v6H8V4h6V0H6v6H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 14H4V8h4v2c0 1.1.9 2 2 2h6v2h-2v2h2v2h-2v2h6V10h-4v10h2z"/></svg></div>
                    <div class="empty-text">No messages found</div>
                  </div>
                `
              : this._results.map((r) => this._renderResult(r))}
      </div>
    `;
  }

  private _renderResult(result: SearchResult) {
    const date = new Date(result.timestamp);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const highlightedText = this._highlightQuery(result.text);

    return html`
      <div class="result-item" @click=${() => this._onResultClick(result)}>
        <div class="result-meta">
          <span class="result-sender">${result.sender}</span>
          <span class="result-conversation">${result.conversation_name}</span>
          <span>${dateStr} ${timeStr}</span>
        </div>
        <div class="result-text">${highlightedText}</div>
      </div>
    `;
  }

  private _highlightQuery(text: string) {
    if (!this._query.trim()) return text;
    const escaped = this._query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    // Use case-insensitive string comparison instead of regex.test() to avoid
    // the stateful lastIndex bug with the global flag
    const queryLower = this._query.toLowerCase();
    return parts.map((part) =>
      part.toLowerCase() === queryLower ? html`<mark>${part}</mark>` : part,
    );
  }

  private _onQueryInput(e: Event) {
    this._query = (e.target as HTMLInputElement).value;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }
    if (this._query.trim().length >= 2) {
      this._debounceTimer = window.setTimeout(() => this._doSearch(), 400);
    } else {
      this._results = [];
      this._hasSearched = false;
    }
  }

  private async _doSearch() {
    if (!this.hass || !this._query.trim() || !this.entityId) return;
    this._searching = true;
    this._hasSearched = true;

    try {
      const msg: Record<string, unknown> = {
        type: 'meshcore_chat/search_stored_messages',
        query: this._query.trim(),
        entity_id: this.entityId,
        limit: 100,
      };
      if (this._fromDate) {
        msg.from_date = new Date(this._fromDate).toISOString();
      }
      if (this._toDate) {
        const end = new Date(this._toDate);
        end.setHours(23, 59, 59, 999);
        msg.to_date = end.toISOString();
      }

      const result = await this.hass.callWS<{ results: SearchResult[] }>(msg);

      this._results = result.results || [];
      this._totalCount = this._results.length;
    } catch {
      this._results = [];
      this._totalCount = 0;
    } finally {
      this._searching = false;
    }
  }

  private _onResultClick(result: SearchResult) {
    this.dispatchEvent(
      new CustomEvent('result-selected', {
        detail: {
          entityId: result.entity_id,
          messageId: result.id,
          conversationName: result.conversation_name,
          timestamp: result.timestamp,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-message-search': MessageSearch;
  }
}
