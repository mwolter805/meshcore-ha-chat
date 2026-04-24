import type { PanelConfig, HomeAssistant, HassEntity } from '../types';

/**
 * Result of entity resolution
 */
export interface ResolvedEntity {
  /** The resolved binary_sensor entity_id to fetch logbook from (null if no message history yet) */
  entityId: string | null;
  /** Current recipient type (channel or contact) */
  recipientType: 'channel' | 'contact' | null;
  /** Display label for the current selection */
  label: string;
  /** Error message if resolution failed */
  error: string | null;
  /** Contact pubkey prefix — present for contacts even when entityId is null (no message history) */
  contactPrefix: string | null;
}

/**
 * Contact info for builtin mode dropdown.
 * entityId is null when the contact has no message history yet (no _messages entity).
 */
export interface BuiltinContact {
  name: string;
  prefix: string;
  entityId: string | null;
}

/**
 * For builtin mode, tracks internal selector state
 */
export interface BuiltinState {
  recipientType: 'channel' | 'contact';
  /** Available channels from hass states */
  channels: Array<{ name: string; idx: number }>;
  /** Available contacts from hass states */
  contacts: BuiltinContact[];
  /** Currently selected channel index */
  selectedChannelIdx: number;
  /** Currently selected contact prefix */
  selectedContactPrefix: string;
}

/**
 * Resolve the target entity_id based on panel configuration and current HA state.
 * The MeshCore preset always uses external mode.
 */
export function resolveEntity(hass: HomeAssistant, config: PanelConfig): ResolvedEntity {
  return resolveExternal(hass, config);
}

/**
 * External mode: read HA select entities to determine the target.
 */
function resolveExternal(hass: HomeAssistant, config: PanelConfig): ResolvedEntity {
  // If no recipient_type_entity is configured, auto-detect based on what's available
  const typeEntity = config.recipient_type_entity
    ? hass.states[config.recipient_type_entity]
    : undefined;

  let recipientType: 'channel' | 'contact' = 'channel';
  if (typeEntity) {
    const state = typeEntity.state.toLowerCase();
    recipientType = state.includes('contact') || state.includes('direct') ? 'contact' : 'channel';
  }

  if (recipientType === 'channel') {
    return resolveChannel(hass, config);
  } else {
    return resolveContact(hass, config);
  }
}

/**
 * Resolve a channel entity using dynamic discovery.
 */
function resolveChannel(hass: HomeAssistant, config: PanelConfig): ResolvedEntity {
  const channelEntity = config.channel_entity ? hass.states[config.channel_entity] : undefined;

  if (!channelEntity) {
    return {
      entityId: null,
      recipientType: 'channel',
      label: 'No channel selected',
      error: config.channel_entity
        ? `Channel entity ${config.channel_entity} not found`
        : 'No channel_entity configured',
      contactPrefix: null,
    };
  }

  // Extract channel index from entity attributes or state
  const channelIdx = getChannelIndex(channelEntity);
  if (channelIdx === null) {
    return {
      entityId: null,
      recipientType: 'channel',
      label: channelEntity.state,
      error: `Could not determine channel index from ${config.channel_entity}`,
      contactPrefix: null,
    };
  }

  // Dynamic discovery: search for matching binary_sensor entity
  const entityId = discoverChannelEntity(hass, config, channelIdx);
  const label = channelEntity.state || `Channel ${channelIdx}`;

  if (!entityId) {
    return {
      entityId: null,
      recipientType: 'channel',
      label,
      error: `No message entity found for channel ${channelIdx}`,
      contactPrefix: null,
    };
  }

  return { entityId, recipientType: 'channel', label, error: null, contactPrefix: null };
}

/**
 * Resolve a contact entity using dynamic discovery.
 */
function resolveContact(hass: HomeAssistant, config: PanelConfig): ResolvedEntity {
  const contactEntity = config.contact_entity ? hass.states[config.contact_entity] : undefined;

  if (!contactEntity) {
    return {
      entityId: null,
      recipientType: 'contact',
      label: 'No contact selected',
      error: config.contact_entity
        ? `Contact entity ${config.contact_entity} not found`
        : 'No contact_entity configured',
      contactPrefix: null,
    };
  }

  // Extract contact prefix from entity attributes
  const contactPrefix = getContactPrefix(contactEntity);
  if (!contactPrefix) {
    return {
      entityId: null,
      recipientType: 'contact',
      label: contactEntity.state,
      error: `Could not determine contact prefix from ${config.contact_entity}`,
      contactPrefix: null,
    };
  }

  // Dynamic discovery: search for matching binary_sensor entity
  const entityId = discoverContactEntity(hass, config, contactPrefix);
  const contactName =
    (contactEntity.attributes['contact_name'] as string) || contactEntity.state || contactPrefix;

  // Key change: if we have a valid contact prefix but no _messages entity,
  // this is NOT an error — it just means no messages have been exchanged yet.
  // The panel can still send messages using the pubkey prefix.
  return {
    entityId, // null if no message history yet — that's OK
    recipientType: 'contact',
    label: contactName,
    error: null, // no error — contact is valid
    contactPrefix, // always populated for contacts
  };
}

/**
 * Extract channel index from a select entity.
 * Checks attributes first (channel_idx), then parses from state (e.g., "Public (0)").
 */
function getChannelIndex(entity: HassEntity): number | null {
  // Check attributes
  const attrIdx = entity.attributes['channel_idx'];
  if (attrIdx !== undefined && attrIdx !== null) {
    const num = Number(attrIdx);
    if (!isNaN(num)) return num;
  }

  // Parse from state string like "Public (0)" or "#test (1)"
  const match = entity.state.match(/\((\d+)\)\s*$/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Extract contact prefix from a select entity.
 * Returns the first 6 characters of the public_key_prefix attribute.
 */
function getContactPrefix(entity: HassEntity): string | null {
  const prefix = entity.attributes['public_key_prefix'] as string | undefined;
  if (prefix && prefix.length >= 6) {
    return prefix.substring(0, 6);
  }

  // Try to parse from state string like "Heltec V4 Test (ce7a01412722)"
  const match = entity.state.match(/\(([0-9a-f]{6,})\)\s*$/i);
  if (match) {
    return match[1].substring(0, 6);
  }

  return null;
}

/**
 * Search hass.states for a binary_sensor matching the channel pattern.
 * Uses dynamic discovery: looks for entities ending in _ch_{idx}_messages.
 * Exported so the main panel can detect mid-session _messages entity appearance.
 */
export function discoverChannelEntity(
  hass: HomeAssistant,
  config: PanelConfig,
  channelIdx: number,
): string | null {
  // If a pattern is configured, try it first
  if (config.channel_entity_pattern && config.node_prefix) {
    const patternId = config.channel_entity_pattern
      .replace('{prefix}', config.node_prefix)
      .replace('{idx}', String(channelIdx));
    if (hass.states[patternId]) {
      return patternId;
    }
  }

  // Dynamic discovery: search for matching entities
  const suffix = `_ch_${channelIdx}_messages`;
  const prefixFilter = config.node_prefix ? `_${config.node_prefix}_` : '';

  for (const entityId of Object.keys(hass.states)) {
    if (
      entityId.startsWith('binary_sensor.') &&
      entityId.endsWith(suffix) &&
      (!prefixFilter || entityId.includes(prefixFilter))
    ) {
      return entityId;
    }
  }

  return null;
}

/**
 * Search hass.states for a binary_sensor matching the contact pattern.
 * Uses dynamic discovery: looks for entities containing _{prefix6char}_messages.
 * Exported so the main panel can detect mid-session _messages entity appearance.
 */
export function discoverContactEntity(
  hass: HomeAssistant,
  config: PanelConfig,
  contactPrefix: string,
): string | null {
  // Backend uses first 6 chars of pubkey for entity IDs — normalize to match
  const prefix6 = contactPrefix.substring(0, 6);

  // If a pattern is configured, try it first
  if (config.contact_entity_pattern && config.node_prefix) {
    const patternId = config.contact_entity_pattern
      .replace('{prefix}', config.node_prefix)
      .replace('{contact}', prefix6);
    if (hass.states[patternId]) {
      return patternId;
    }
  }

  // Dynamic discovery: search for matching entities
  const contactSuffix = `_${prefix6}_messages`;
  const prefixFilter = config.node_prefix ? `_${config.node_prefix}_` : '';

  for (const entityId of Object.keys(hass.states)) {
    if (
      entityId.startsWith('binary_sensor.') &&
      entityId.endsWith(contactSuffix) &&
      (!prefixFilter || entityId.includes(prefixFilter))
    ) {
      return entityId;
    }
  }

  return null;
}

/**
 * Discover available channels from hass states for builtin mode.
 *
 * For MeshCore preset: reads from select.meshcore_channel options, which contains
 * ALL configured channels immediately. Cross-references _messages entities for those
 * that have message history.
 *
 * Legacy fallback: scans hass states for _messages entities (old behavior).
 */
export function discoverChannels(
  hass: HomeAssistant,
  config: PanelConfig,
): Array<{ name: string; idx: number; entityId: string | null }> {
  // Try select-based discovery first (MeshCore preset)
  const selectChannels = discoverChannelsFromSelect(hass, config);
  if (selectChannels !== null) {
    return selectChannels;
  }

  // Legacy fallback: scan for _messages entities
  return discoverChannelsLegacy(hass, config);
}

/**
 * Discover channels from select.meshcore_channel options.
 * Returns null if the select entity doesn't exist (legacy fallback needed).
 */
function discoverChannelsFromSelect(
  hass: HomeAssistant,
  config: PanelConfig,
): Array<{ name: string; idx: number; entityId: string | null }> | null {
  const selectEntityId = config.channel_entity;
  if (!selectEntityId) return null;

  const selectEntity = hass.states[selectEntityId];
  if (!selectEntity) return null;

  const options = selectEntity.attributes['options'] as string[] | undefined;
  if (!options || options.length === 0) return null;

  const channels: Array<{ name: string; idx: number; entityId: string | null }> = [];
  const idxRegex = /\((\d+)\)\s*$/;

  for (const option of options) {
    const match = option.match(idxRegex);
    if (!match) continue; // Skip non-channel options

    const idx = parseInt(match[1], 10);
    const name = option.replace(/\s*\(\d+\)\s*$/, '').trim() || `Channel ${idx}`;

    // Cross-reference: try to find a _messages entity for this channel
    const entityId = discoverChannelEntity(hass, config, idx);

    channels.push({ name, idx, entityId });
  }

  return channels.sort((a, b) => a.idx - b.idx);
}

/**
 * Legacy channel discovery: scan hass states for _messages entities.
 * Only finds channels that have received at least one message.
 */
function discoverChannelsLegacy(
  hass: HomeAssistant,
  config: PanelConfig,
): Array<{ name: string; idx: number; entityId: string | null }> {
  const channels: Array<{ name: string; idx: number; entityId: string | null }> = [];
  const channelRegex = /_ch_(\d+)_messages$/;
  const prefixFilter = config.node_prefix ? `_${config.node_prefix}_` : '';

  for (const [entityId, entity] of Object.entries(hass.states)) {
    if (!entityId.startsWith('binary_sensor.')) continue;
    if (prefixFilter && !entityId.includes(prefixFilter)) continue;

    const match = entityId.match(channelRegex);
    if (match) {
      const idx = parseInt(match[1], 10);
      const name = (entity.attributes['friendly_name'] as string) || `Channel ${idx}`;
      channels.push({ name, idx, entityId });
    }
  }

  return channels.sort((a, b) => a.idx - b.idx);
}

/**
 * Discover available contacts for builtin mode.
 *
 * For MeshCore preset: reads from select.meshcore_contact options, which contains
 * ALL saved contacts immediately. Cross-references _messages entities for those
 * that have message history.
 *
 * Legacy fallback: scans hass states for _messages entities (old behavior).
 */
export function discoverContacts(hass: HomeAssistant, config: PanelConfig): BuiltinContact[] {
  // Try select-based discovery first (MeshCore preset)
  const selectContacts = discoverContactsFromSelect(hass, config);
  if (selectContacts !== null) {
    return selectContacts;
  }

  // Legacy fallback: scan for _messages entities
  return discoverContactsLegacy(hass, config);
}

/**
 * Discover contacts from select.meshcore_contact options.
 * Returns null if the select entity doesn't exist (legacy fallback needed).
 */
function discoverContactsFromSelect(
  hass: HomeAssistant,
  config: PanelConfig,
): BuiltinContact[] | null {
  const selectEntityId = config.contact_entity;
  if (!selectEntityId) return null;

  const selectEntity = hass.states[selectEntityId];
  if (!selectEntity) return null;

  const options = selectEntity.attributes['options'] as string[] | undefined;
  if (!options || options.length === 0) return null;

  const contacts: BuiltinContact[] = [];
  const prefixRegex = /\(([0-9a-f]{6,})\)\s*$/i;

  for (const option of options) {
    const match = option.match(prefixRegex);
    if (!match) continue; // Skip non-contact options (e.g., "No contacts")

    const fullPrefix = match[1];
    const prefix6 = fullPrefix.substring(0, 6);
    // Extract name: everything before the " (prefix)" part
    const name = option.replace(/\s*\([0-9a-f]{6,}\)\s*$/i, '').trim() || prefix6;

    // Cross-reference: try to find a _messages entity for this contact
    const entityId = discoverContactEntity(hass, config, prefix6);

    contacts.push({ name, prefix: prefix6, entityId });
  }

  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Legacy contact discovery: scan hass states for _messages entities.
 * Only finds contacts that have exchanged at least one message.
 */
function discoverContactsLegacy(hass: HomeAssistant, config: PanelConfig): BuiltinContact[] {
  const contacts: BuiltinContact[] = [];
  const prefixFilter = config.node_prefix ? `_${config.node_prefix}_` : '';
  // Contact entities end with _messages but NOT _ch_N_messages and NOT _rx_messages
  const channelRegex = /_ch_\d+_messages$/;
  const rxRegex = /_rx_messages$/;

  for (const [entityId, entity] of Object.entries(hass.states)) {
    if (!entityId.startsWith('binary_sensor.')) continue;
    if (!entityId.endsWith('_messages')) continue;
    if (channelRegex.test(entityId)) continue;
    if (rxRegex.test(entityId)) continue;
    if (prefixFilter && !entityId.includes(prefixFilter)) continue;

    // Extract the contact prefix from the entity_id
    const parts = entityId.replace('binary_sensor.', '').replace('_messages', '').split('_');
    const contactPrefix = parts[parts.length - 1];
    if (contactPrefix && /^[0-9a-f]{6,}$/i.test(contactPrefix)) {
      const name = (entity.attributes['friendly_name'] as string) || contactPrefix;
      contacts.push({ name, prefix: contactPrefix, entityId });
    }
  }

  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}
