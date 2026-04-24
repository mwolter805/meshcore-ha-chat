"""Constants for the MeshCore Chat companion integration."""
from __future__ import annotations

from typing import Final

# This integration's own domain.
DOMAIN: Final = "meshcore_chat"

# Domain of the upstream meshcore integration we listen to and consume from.
# Used for: filtering binary_sensor entities by their source integration,
# subscribing to events fired on hass.bus, and as the prefix on services
# we call (`meshcore.send_message`, etc.) — never appears in our own
# data namespace, only as a reference to the producer.
MESHCORE_DOMAIN: Final = "meshcore"

# Events fired on hass.bus by the upstream meshcore integration that we
# subscribe to from __init__.py.
EVENT_MESHCORE_MESSAGE: Final = "meshcore_message"
EVENT_MESHCORE_DELIVERY_UPDATE: Final = "meshcore_delivery_update"
EVENT_MESHCORE_CONNECTED: Final = "meshcore_connected"
EVENT_MESHCORE_DISCONNECTED: Final = "meshcore_disconnected"

# ─── Storage keys ──────────────────────────────────────────────────────────
# Per-conversation file naming. Distinct from the upstream `meshcore.*` namespace
# to avoid file collisions if a similar feature ever lands in the core integration.
# Substitute the per-entry id and a sanitized entity_id (dots → underscores).
STORAGE_KEY_INDEX: Final = "meshcore_chat.{entry_id}.message_index"
STORAGE_KEY_CONVERSATION: Final = "meshcore_chat.{entry_id}.msgs.{safe_entity_id}"

STORAGE_VERSION: Final = 1

# ─── Message store tunables ────────────────────────────────────────────────
# Per-conversation cap (messages); excess is trimmed FIFO.
DEFAULT_MAX_MESSAGES_PER_CONVERSATION: Final = 500
# Retention window before cleanup_old_messages prunes by timestamp.
DEFAULT_MESSAGE_RETENTION_DAYS: Final = 90
# Debounce window for per-conversation/index disk writes.
MESSAGE_STORE_SAVE_DELAY_SECONDS: Final = 5.0
# Inactivity window before a loaded conversation is evicted from memory.
MESSAGE_STORE_IDLE_EVICTION_SECONDS: Final = 300  # 5 minutes

# Config-entry option keys (read from entry.options with the defaults above).
OPT_MAX_MESSAGES_PER_CONVERSATION: Final = "max_messages_per_conversation"
OPT_MESSAGE_RETENTION_DAYS: Final = "message_retention_days"

# ─── Constants used by the lifted ws_api.py / utils helpers ─────────────────
# HA entity-domain string used by helpers that build entity_ids for binary
# sensors created by the upstream integration. Not the companion's domain.
ENTITY_DOMAIN_BINARY_SENSOR: Final = "binary_sensor"

# Default age (days) at which a neighbor entry is considered stale and
# eligible for cleanup via meshcore_chat/cleanup_stale_neighbors. Mirrors
# the upstream meshcore.const value of the same name; lifted here so the
# companion's ws_api.py can self-import it without coupling to upstream's
# const module.
DEFAULT_STALE_NEIGHBOR_DAYS: Final = 30

# Channel-entity key prefix and message-suffix used by entity_id helpers
# in utils.py. Mirror the upstream values so the entity_ids the helpers
# produce match what the upstream integration registered.
CHANNEL_PREFIX: Final = "channel_"
MESSAGES_SUFFIX: Final = "messages"
