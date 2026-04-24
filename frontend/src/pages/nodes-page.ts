import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, Channel, HomeAssistant } from '../types';
import {
  getContactsPaginated, getNodeCounts, clearDiscoveredContacts,
} from '../api';
import type {
  PrimaryCategory, TypeCounts, NodeCounts,
} from '../api';
import '../components/contact-card';
import '../components/node-card';
import '../components/node-detail-dialog';

const PAGE_SIZE = 50;

type NodeType = 'clients' | 'repeaters' | 'room_servers' | 'sensors';
const NODE_TYPE_MAP: Record<NodeType, number> = {
  clients: 1,
  repeaters: 2,
  room_servers: 3,
  sensors: 4,
};

const TYPE_COLORS: Record<NodeType, string> = {
  clients: '#4caf50',
  repeaters: '#ff9800',
  room_servers: '#9c27b0',
  sensors: '#607d8b',
};

const TYPE_LABELS: Record<NodeType, string> = {
  clients: 'Clients',
  repeaters: 'Repeaters',
  room_servers: 'Room Servers',
  sensors: 'Sensors',
};

const CATEGORY_COLORS: Record<PrimaryCategory, string> = {
  all: '',
  added: '#03a9f4',
  discovered: '#4caf50',
};

@customElement('meshcore-nodes-page')
export class NodesPage extends LitElement {
  @property({ type: Array }) contacts: Contact[] = [];
  @property({ type: Array }) channels: Channel[] = [];
  // managedDevices removed — devices now live on the Devices tab
  @property({ type: Boolean }) narrow = false;
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) config?: any;
  private _mediaQuery?: MediaQueryList;
  @state() private _viewportNarrow = false;

  // ─── Two-level filter state ─────────────────────────────────────────
  @state() private _primaryFilter: PrimaryCategory = 'all';
  @state() private _typeFilter: NodeType | null = null;
  @state() private _searchQuery = '';

  // ─── Results state ──────────────────────────────────────────────────
  @state() private _displayedContacts: Contact[] = [];
  @state() private _totalCount = 0;
  @state() private _typeCounts: TypeCounts = { clients: 0, repeaters: 0, room_servers: 0, sensors: 0 };
  @state() private _l1Counts: NodeCounts = { all: 0, added: 0, discovered: 0 };
  @state() private _loading = false;

  // ─── Node detail dialog state ───────────────────────────────────────
  @state() private _selectedNode?: Contact;
  @state() private _nodeDetailDialogOpen = false;
  // Pending state for in-flight Add/Remove contact actions triggered from
  // the modal. Set when the action is dispatched, cleared by the parent
  // panel's try/finally after the WS call resolves.
  @state() private _pendingAction: 'add-contact' | 'remove-contact' | null = null;

  // ─── Sort state ─────────────────────────────────────────────────────
  @state() private _sortBy: 'last_heard' | 'name' | 'prefix' = 'last_heard';

  private _searchTimer?: ReturnType<typeof setTimeout>;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .nodes-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .nodes-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--card-background-color, #fff);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    /* ─── Level 1 filter buttons ────────────────────────────────────── */

    .l1-filters {
      display: flex;
      gap: 6px;
    }

    .l1-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 14px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }

    .l1-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    .l1-btn.active {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
      border-left-color: var(--primary-color, #03a9f4);
    }

    .l1-count {
      font-size: 11px;
      opacity: 0.8;
    }

    /* ─── Level 2 filter buttons ────────────────────────────────────── */

    .l2-bar {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .l2-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 14px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .l2-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    .l2-btn.active {
      color: #fff;
      border-color: transparent;
    }

    .l2-count {
      font-size: 10px;
      opacity: 0.8;
    }

    .l2-spacer {
      flex: 1;
    }

    /* ─── Search bar ────────────────────────────────────────────────── */

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--primary-background-color, #fafafa);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      padding: 6px 10px;
    }

    .search-icon {
      flex-shrink: 0;
      color: var(--secondary-text-color, #727272);
      display: flex;
    }

    .search-bar input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 13px;
      color: var(--primary-text-color);
      outline: none;
    }

    .clear-search {
      border: none;
      background: none;
      cursor: pointer;
      color: var(--secondary-text-color, #727272);
      font-size: 16px;
      padding: 0 2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sync-btn {
      padding: 6px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .sync-btn:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    .sort-select {
      padding: 4px 8px; border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px; background: var(--card-background-color, #fff);
      color: var(--primary-text-color); font-size: 11px; cursor: pointer;
      box-sizing: border-box;
      height: 28px;
      min-height: 28px;
      line-height: normal;
      appearance: menulist;
      -webkit-appearance: menulist;
    }

    /* ─── Content area ──────────────────────────────────────────────── */

    .content-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      background: var(--primary-background-color, #fafafa);
    }

    .content-area::-webkit-scrollbar { width: 6px; }
    .content-area::-webkit-scrollbar-track { background: transparent; }
    .content-area::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .nodes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 8px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
    .empty-text { font-size: 16px; margin-bottom: 8px; }
    .empty-subtext { font-size: 13px; opacity: 0.7; max-width: 300px; }

    .clear-btn {
      padding: 4px 10px; border: 1px solid rgba(219, 68, 55, 0.3);
      border-radius: 4px; background: transparent;
      color: var(--error-color, #db4437); font-size: 11px;
      font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .clear-btn:hover {
      background: var(--error-color, #db4437); color: #fff;
      border-color: var(--error-color, #db4437);
    }

    .confirm-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2); border-radius: 6px;
      margin-bottom: 12px; font-size: 12px;
    }
    .confirm-bar button {
      padding: 4px 10px; border: none; border-radius: 4px;
      font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .confirm-bar .yes { background: var(--error-color, #db4437); color: #fff; }
    .confirm-bar .no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

    .category-badge {
      font-size: 10px; font-weight: 500; padding: 2px 8px;
      border-radius: 10px; white-space: nowrap; flex-shrink: 0; align-self: center;
    }

    .load-more {
      display: flex; justify-content: center; padding: 12px;
    }
    .load-more button {
      padding: 8px 20px; border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px; background: transparent;
      color: var(--primary-text-color); font-size: 12px;
      cursor: pointer; transition: all 0.15s;
    }
    .load-more button:hover {
      background: var(--primary-color, #03a9f4); color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    /* ─── Narrow overrides ──────────────────────────────────────────── */

    :host([narrow]) .l1-filters { gap: 4px; flex-wrap: wrap; }
    :host([narrow]) .l1-btn { font-size: 11px; padding: 5px 10px; }
    :host([narrow]) .l2-btn { font-size: 11px; padding: 5px 10px; }
    :host([narrow]) .nodes-grid { grid-template-columns: 1fr; }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Use matchMedia for reliable viewport-based narrow detection
    // 870px matches HA's own narrow threshold (companion app WebViews report wider CSS viewports)
    this._mediaQuery = window.matchMedia('(max-width: 870px)');
    this._viewportNarrow = this._mediaQuery.matches;
    this._mediaQuery.addEventListener('change', this._onMediaChange);
    this._loadCounts();
    this._loadPage(true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._mediaQuery?.removeEventListener('change', this._onMediaChange);
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = undefined;
    }
  }

  private _onMediaChange = (e: MediaQueryListEvent) => {
    this._viewportNarrow = e.matches;
  };

  private get _isNarrow(): boolean {
    return this.narrow || this._viewportNarrow;
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    // Sync the narrow attribute on the host so :host([narrow]) CSS selectors work
    if (this._isNarrow) {
      this.setAttribute('narrow', '');
    } else {
      this.removeAttribute('narrow');
    }
  }

  render() {
    return html`
      <div class="nodes-layout">
        <div class="nodes-header">
          <!-- Level 1 filters -->
          <div class="l1-filters">
            ${this._renderL1Button('all', 'All')}
            ${this._renderL1Button('added', '★ Added')}
            ${this._renderL1Button('discovered', 'Discovered')}
          </div>

          <!-- Level 2 filters (hidden when L1 = All) -->
          ${this._primaryFilter !== 'all' ? html`
            <div class="l2-bar">
              ${this._renderL2Buttons()}
            </div>
          ` : nothing}

          <!-- Search + actions row -->
          <div class="header-actions">
            <div class="search-bar" style="flex: 1;">
              <span class="search-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span>
              <input
                type="text"
                placeholder=${this._getSearchPlaceholder()}
                .value=${this._searchQuery}
                @input=${this._onSearchInput}>
              ${this._searchQuery
                ? html`<button class="clear-search" @click=${() => { this._searchQuery = ''; this._loadPage(true); }}>✕</button>`
                : nothing}
            </div>
            <select class="sort-select"
              .value=${this._sortBy}
              @change=${(e: Event) => {
                this._sortBy = (e.target as HTMLSelectElement).value as 'last_heard' | 'name' | 'prefix';
                this._loadPage(true);
              }}>
              <option value="last_heard">Last Heard</option>
              <option value="name">Name</option>
              <option value="prefix">Pub Prefix</option>
            </select>
            <button class="clear-btn"
              @click=${() => this._clearStaleContacts()}
              title="Remove discovered contacts older than the configured threshold">
              Clear Stale
            </button>
            <button class="sync-btn"
              @click=${() => this._syncAll()}>
              ⟳ Sync
            </button>
          </div>
        </div>

        <!-- Content area -->
        <div class="content-area">
          ${this._renderContactsContent()}
        </div>
      </div>

      <!-- Node detail dialog -->
      <meshcore-node-detail-dialog
        .hass=${this.hass}
        .node=${this._selectedNode}
        .pendingAction=${this._pendingAction}
        ?open=${this._nodeDetailDialogOpen}
        @node-detail-closed=${() => { this._nodeDetailDialogOpen = false; }}
        @node-message=${() => this._dispatchNodeAction('message')}
        @node-trace=${() => this._dispatchNodeAction('trace')}
        @node-add-contact=${() => this._dispatchNodeAction('add-contact')}
        @node-remove-contact=${() => this._dispatchNodeAction('remove-contact')}>
      </meshcore-node-detail-dialog>

    `;
  }

  // ─── Level 1 button rendering ─────────────────────────────────────

  private _renderL1Button(category: PrimaryCategory, label: string) {
    const count = this._l1Counts[category];
    const isActive = this._primaryFilter === category;
    const classes = `l1-btn ${isActive ? 'active' : ''}`;
    const accentColor = CATEGORY_COLORS[category];

    return html`
      <button
        class=${classes}
        style=${!isActive && accentColor ? `border-left-color: ${accentColor}` : ''}
        @click=${() => this._setPrimaryFilter(category)}>
        ${label} <span class="l1-count">(${count})</span>
      </button>
    `;
  }

  // ─── Level 2 button rendering ─────────────────────────────────────

  private _renderL2Buttons() {
    const types: NodeType[] = ['clients', 'repeaters', 'room_servers', 'sensors'];
    return types
      .filter((t) => this._typeCounts[t] > 0)
      .map((t) => {
        const isActive = this._typeFilter === t;
        const color = TYPE_COLORS[t];
        return html`
          <button
            class=${`l2-btn ${isActive ? 'active' : ''}`}
            style=${isActive ? `background: ${color}; border-color: ${color};` : `border-left: 2px solid ${color};`}
            @click=${() => this._setTypeFilter(t)}>
            ${TYPE_LABELS[t]} <span class="l2-count">(${this._typeCounts[t]})</span>
          </button>
        `;
      });
  }

  // ─── Filter actions ───────────────────────────────────────────────

  private _setPrimaryFilter(category: PrimaryCategory) {
    if (this._primaryFilter === category) return;
    this._primaryFilter = category;
    this._typeFilter = null;
    this._displayedContacts = [];
    this._totalCount = 0;
    this._loadPage(true);
  }

  private _setTypeFilter(type: NodeType) {
    if (this._typeFilter === type) {
      // Toggle off
      this._typeFilter = null;
    } else {
      this._typeFilter = type;
    }
    this._displayedContacts = [];
    this._totalCount = 0;
    this._loadPage(true);
  }

  // ─── Search ───────────────────────────────────────────────────────

  private _onSearchInput(e: Event) {
    this._searchQuery = (e.target as HTMLInputElement).value;
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._loadPage(true), 300);
  }

  private _getSearchPlaceholder(): string {
    const cat = this._primaryFilter;
    const type = this._typeFilter ? TYPE_LABELS[this._typeFilter].toLowerCase() : 'nodes';
    if (cat === 'all') return 'Search all nodes...';
    return `Search ${cat} ${type}...`;
  }

  // ─── Data loading ─────────────────────────────────────────────────

  private async _loadPage(reset = false) {
    if (!this.hass) return;
    this._loading = true;

    try {
      const offset = reset ? 0 : this._displayedContacts.length;
      const nodeType = this._typeFilter ? NODE_TYPE_MAP[this._typeFilter] : undefined;
      const search = this._searchQuery.trim() || undefined;

      const result = await getContactsPaginated(this.hass, this._primaryFilter, {
        nodeType,
        search,
        limit: PAGE_SIZE,
        offset,
        entryId: this.config?.entry_id,
        sortBy: this._sortBy,
      });

      if (reset) {
        this._displayedContacts = result.contacts;
      } else {
        this._displayedContacts = [...this._displayedContacts, ...result.contacts];
      }
      this._totalCount = result.total;
      this._typeCounts = result.counts;
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      this._loading = false;
    }
  }

  private async _loadCounts() {
    if (!this.hass) return;
    try {
      this._l1Counts = await getNodeCounts(this.hass, this.config?.entry_id);
    } catch (err) {
      console.error('Failed to load node counts:', err);
    }
  }

  private async _clearStaleContacts() {
    if (!this.hass) return;
    const days = prompt('Remove discovered contacts older than how many days?', '30');
    if (!days) return;
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) return;
    const result = await clearDiscoveredContacts(this.hass, daysNum, this.config?.entry_id);
    if (result.removed > 0) {
      this._loadPage(true);
      this._loadCounts();
      this.dispatchEvent(new CustomEvent('contacts-changed', { bubbles: true, composed: true }));
    }
  }

  private _syncAll() {
    this._loadPage(true);
    this._loadCounts();
    this.dispatchEvent(new CustomEvent('contacts-changed', { bubbles: true, composed: true }));
  }

  // ─── Contact cards rendering ──────────────────────────────────────

  private _renderContactsContent() {
    if (this._loading && this._displayedContacts.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-text">Loading...</div>
        </div>
      `;
    }

    if (this._displayedContacts.length === 0) {
      return this._renderEmptyState();
    }

    // Order comes from the server (see get_contacts_paginated in coordinator.py).
    // Sorting is selected via the sort-select above; @change triggers _loadPage(true)
    // so the visible page always reflects the chosen sort across the entire
    // filtered dataset — not just the first page.
    return html`
      <div class="nodes-grid">
        ${this._displayedContacts.map((c) => html`
          <div @click=${() => this._openNodeDetail(c)}>
            <meshcore-contact-card .contact=${c as Contact}></meshcore-contact-card>
          </div>
        `)}
      </div>
      ${this._displayedContacts.length < this._totalCount ? html`
        <div class="load-more">
          <button ?disabled=${this._loading} @click=${() => this._loadPage()}>
            ${this._loading ? 'Loading...' : `Load More (${this._displayedContacts.length} of ${this._totalCount})`}
          </button>
        </div>
      ` : nothing}
    `;
  }

  private _renderEmptyState() {
    const cat = this._primaryFilter;
    const type = this._typeFilter;

    let icon = html`<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
    let text = 'No nodes found';
    let subtext = '';

    if (this._searchQuery) {
      text = 'No matching nodes';
      subtext = `No results for "${this._searchQuery}"`;
    } else if (cat === 'added') {
      text = 'No added contacts';
      subtext = type ? `No added ${TYPE_LABELS[type].toLowerCase()}` : 'Add discovered contacts to see them here';
    } else if (cat === 'discovered') {
      text = 'No discovered nodes';
      subtext = type ? `No discovered ${TYPE_LABELS[type].toLowerCase()}` : 'Nodes seen on the mesh will appear here';
    } else if (cat === 'all') {
      text = 'No nodes';
      subtext = 'No contacts or discovered nodes yet';
    }

    return html`
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <div class="empty-text">${text}</div>
        ${subtext ? html`<div class="empty-subtext">${subtext}</div>` : nothing}
      </div>
    `;
  }

  // ─── Node detail actions ──────────────────────────────────────────

  private _openNodeDetail(node: Contact) {
    this._selectedNode = node;
    this._nodeDetailDialogOpen = true;
  }

  private _dispatchNodeAction(action: string) {
    // Mark the in-flight mutation so the still-visible button can show
    // "Adding…" / "Removing…". The parent panel clears this in try/finally
    // after the WS call + coordinator refresh resolve.
    if (action === 'add-contact' || action === 'remove-contact') {
      this._pendingAction = action;
    }
    this.dispatchEvent(
      new CustomEvent('node-action', {
        detail: { action, node: this._selectedNode },
        bubbles: true,
        composed: true,
      })
    );
    // 'remove-contact' intentionally dropped: the dialog's own _close()
    // (called synchronously from _confirmAction_exec) already fires
    // 'node-detail-closed' which sets _nodeDetailDialogOpen = false.
    if (action === 'message' || action === 'delete') {
      this._nodeDetailDialogOpen = false;
    }
  }

  // ─── Public API for parent panel (called after WS mutation resolves) ─

  /**
   * Clear the pending-action flag. Called by the parent panel's finally
   * block regardless of whether the mutation succeeded or failed, so the
   * button never stays stuck in "Adding…" / "Removing…" state.
   */
  public clearPendingAction() {
    this._pendingAction = null;
  }

  /**
   * Re-fetch the paginated contact list + L1 counts, then re-resolve
   * _selectedNode from the fresh data so a still-open modal reflects
   * the mutation (e.g. Add Contact → Status field flips to "Added").
   */
  public async refreshAfterMutation(pubkey: string) {
    await Promise.all([this._loadPage(true), this._loadCounts()]);
    // Only matters for add-contact, where the modal stays open. Remove-
    // contact closes the modal synchronously via the dialog's _close().
    if (this._nodeDetailDialogOpen && this._selectedNode && pubkey) {
      const match = this._displayedContacts.find((c) => {
        if (c.public_key && c.public_key === pubkey) return true;
        if (c.pubkey_prefix && pubkey.startsWith(c.pubkey_prefix)) return true;
        return false;
      });
      if (match) {
        // Trigger re-render by replacing the reference
        this._selectedNode = { ...match };
      } else {
        // Contact fell outside current filter (e.g. user has "Discovered"
        // filter active and just added the contact). Close the modal.
        this._nodeDetailDialogOpen = false;
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-nodes-page': NodesPage;
  }
}
