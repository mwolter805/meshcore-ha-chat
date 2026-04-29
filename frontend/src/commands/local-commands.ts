import { CommandDef } from '../types';

/**
 * Local device commands — executed directly on the connected companion device
 * via the Python library's binary protocol using meshcore.execute_command service.
 * These are available through `meshcore.execute_command` in Home Assistant.
 */
export const LOCAL_COMMANDS: CommandDef[] = [
  // ========================
  // Device Management
  // ========================
  {
    name: 'reboot',
    description: 'Restart the device',
    category: 'Device Management',
    dangerous: true,
  },
  {
    name: 'poweroff',
    description: 'Power off the device (v1.14.1+)',
    category: 'Device Management',
    dangerous: true,
  },
  {
    name: 'send_appstart',
    description: 'Initialize connection, returns SELF_INFO with device details',
    category: 'Device Management',
    responseFormat: 'Device info with name, public key, radio params, location',
  },
  {
    name: 'send_device_query',
    description: 'Query device info (firmware, capabilities, path hash mode)',
    category: 'Device Management',
    responseFormat: 'Device information including firmware version and capabilities',
  },

  // ========================
  // Device Info / Getters
  // ========================
  {
    name: 'get_bat',
    description: 'Get battery voltage and percentage',
    category: 'Device Info',
    responseFormat: 'Battery: {voltage}mV ({percentage}%)',
  },
  {
    name: 'get_time',
    description: "Get device's current RTC time",
    category: 'Device Info',
    responseFormat: 'Epoch timestamp or formatted time string',
  },
  {
    name: 'get_self_telemetry',
    description: 'Get local device telemetry data',
    category: 'Device Info',
    responseFormat: 'Telemetry data including temperature, voltage, uptime',
  },

  // ========================
  // Time Management
  // ========================
  {
    name: 'set_time',
    description: 'Set device RTC time',
    category: 'Device Info',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Epoch seconds (Unix timestamp)',
        required: true,
      },
    ],
  },

  // ========================
  // Radio Settings
  // ========================
  {
    name: 'set_radio',
    description: 'Set radio parameters (frequency, bandwidth, spreading factor, coding rate)',
    category: 'Radio Settings',
    params: [
      {
        name: 'freq',
        type: 'number',
        description: 'Frequency in MHz',
        required: true,
        min: 400,
        max: 1000,
      },
      {
        name: 'bw',
        type: 'number',
        description: 'Bandwidth in kHz',
        required: true,
        min: 7.8,
        max: 500,
      },
      {
        name: 'sf',
        type: 'number',
        description: 'Spreading factor',
        required: true,
        min: 5,
        max: 12,
      },
      {
        name: 'cr',
        type: 'number',
        description: 'Coding rate',
        required: true,
        min: 5,
        max: 8,
      },
    ],
    responseFormat: 'OK - radio parameters set (reboot required)',
  },
  {
    name: 'get_allowed_repeat_freq',
    description: 'Get allowed repeater frequencies',
    category: 'Radio Settings',
    responseFormat: 'List of allowed frequency ranges',
  },

  // ========================
  // TX Power
  // ========================
  {
    name: 'set_tx_power',
    description: 'Set transmit power',
    category: 'Radio Settings',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'TX power in dBm',
        required: true,
        min: -9,
        max: 22,
      },
    ],
    responseFormat: 'OK - TX power set to {val}dBm',
  },

  // ========================
  // RX Gain (v1.14.1+)
  // ========================
  {
    name: 'set_radio.rxgain',
    description: 'Set RX boosted gain mode (SX1262/SX1268 only, v1.14.1+)',
    category: 'Radio Settings',
    params: [
      {
        name: 'state',
        type: 'select',
        description: 'Enable or disable RX boosted gain',
        required: true,
        options: ['on', 'off'],
      },
    ],
  },

  // ========================
  // Location
  // ========================
  {
    name: 'set_coords',
    description: 'Set GPS coordinates (latitude and longitude)',
    category: 'Location',
    params: [
      {
        name: 'lat',
        type: 'number',
        description: 'Latitude in decimal degrees',
        required: true,
        min: -90,
        max: 90,
      },
      {
        name: 'lon',
        type: 'number',
        description: 'Longitude in decimal degrees',
        required: true,
        min: -180,
        max: 180,
      },
    ],
    responseFormat: 'OK - coordinates set',
  },

  // ========================
  // Network / Path Hash
  // ========================
  {
    name: 'set_path_hash_mode',
    description: 'Set path hash mode (0, 1, or 2) for routing optimization',
    category: 'Network',
    params: [
      {
        name: 'mode',
        type: 'select',
        description: 'Path hash mode (0=1-Byte, 1=2-Byte, 2=3-Byte)',
        required: true,
        options: ['0', '1', '2'],
      },
    ],
  },

  // ========================
  // Flood Configuration
  // ========================
  {
    name: 'set_flood_max',
    description: 'Set maximum flood hops (network-wide broadcast limit)',
    category: 'Network',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Maximum number of hops for flood messages',
        required: true,
        min: 0,
        max: 64,
      },
    ],
    responseFormat: 'OK - flood max set to {val}',
  },

  // ========================
  // Advertising
  // ========================
  {
    name: 'send_advert',
    description: 'Send a local or flood advertisement',
    category: 'Network',
    params: [
      {
        name: 'flood',
        type: 'boolean',
        description: 'True for flood advert, false for local-only',
        required: false,
        default: false,
      },
    ],
    responseFormat: 'Advertisement sent',
  },

  // ========================
  // Statistics
  // ========================
  {
    name: 'get_stats_core',
    description: 'Get core mesh statistics (messages, packets, routing)',
    category: 'Statistics',
    responseFormat: 'Core statistics including message counts and routing info',
  },
  {
    name: 'get_stats_radio',
    description: 'Get radio statistics (TX/RX counts, errors, signal quality)',
    category: 'Statistics',
    responseFormat: 'Radio statistics including TX/RX packet counts and error rates',
  },
  {
    name: 'get_stats_packets',
    description: 'Get detailed packet statistics',
    category: 'Statistics',
    responseFormat: 'Packet-level statistics',
  },

  // ========================
  // Custom Variables
  // ========================
  {
    name: 'set_custom_var',
    description: 'Set a custom variable (sensor data)',
    category: 'Advanced',
    params: [
      {
        name: 'key',
        type: 'string',
        description: 'Variable name',
        required: true,
      },
      {
        name: 'value',
        type: 'string',
        description: 'Variable value',
        required: true,
      },
    ],
    responseFormat: 'OK - variable set',
  },
  {
    name: 'get_custom_vars',
    description: 'Get all custom variables',
    category: 'Advanced',
    responseFormat: 'Dictionary of all custom variables',
  },

  // ========================
  // Tuning Parameters
  // ========================
  {
    name: 'set_tuning',
    description: 'Set timing parameters (RX delay and airtime factor)',
    category: 'Advanced',
    params: [
      {
        name: 'rx_dly',
        type: 'number',
        description: 'RX delay base',
        required: true,
      },
      {
        name: 'af',
        type: 'number',
        description: 'Airtime factor',
        required: true,
      },
    ],
  },

  // ========================
  // Device Configuration Setters
  // ========================
  {
    name: 'set_name',
    description: 'Set device name',
    category: 'Device Info',
    dangerous: true,
    dangerMessage: 'Changing the device name will change all entity IDs. Automations, scripts, and dashboards using current entity IDs will need to be updated.',
    params: [
      {
        name: 'name',
        type: 'string',
        description: 'New device name',
        required: true,
      },
    ],
    responseFormat: 'OK - name set to {name}',
  },
  {
    name: 'set_multi_acks',
    description: 'Enable or disable multi-ack mode',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Multi-acks setting (0 or 1)',
        required: true,
        options: ['0', '1'],
      },
    ],
  },
  {
    name: 'set_advert_loc_policy',
    description: 'Set location advertisement policy',
    category: 'Network',
    params: [
      {
        name: 'policy',
        type: 'select',
        description: 'Policy: 0=none, 1=prefs (saved), 2=share (live GPS)',
        required: true,
        options: ['0', '1', '2'],
      },
    ],
  },
  {
    name: 'set_manual_add_contacts',
    description: 'Set manual contact adding mode',
    category: 'Advanced',
    params: [
      {
        name: 'flag',
        type: 'boolean',
        description: 'Enable manual contact addition',
        required: true,
      },
    ],
  },
  {
    name: 'set_telemetry_mode_base',
    description: 'Set base telemetry mode',
    category: 'Advanced',
    params: [
      {
        name: 'mode',
        type: 'number',
        description: 'Telemetry mode',
        required: true,
      },
    ],
  },
  {
    name: 'set_telemetry_mode_loc',
    description: 'Set location telemetry mode',
    category: 'Advanced',
    params: [
      {
        name: 'mode',
        type: 'number',
        description: 'Location telemetry mode',
        required: true,
      },
    ],
  },
  {
    name: 'set_telemetry_mode_env',
    description: 'Set environment telemetry mode',
    category: 'Advanced',
    params: [
      {
        name: 'mode',
        type: 'number',
        description: 'Environment telemetry mode',
        required: true,
      },
    ],
  },

  // ========================
  // Channel Management
  // ========================
  {
    name: 'get_channel',
    description: 'Get channel information by index',
    category: 'Advanced',
    params: [
      {
        name: 'channel_idx',
        type: 'number',
        description: 'Channel index',
        required: true,
      },
    ],
  },
  {
    name: 'set_channel',
    description: 'Set channel name and optional secret',
    category: 'Advanced',
    params: [
      {
        name: 'channel_idx',
        type: 'number',
        description: 'Channel index',
        required: true,
      },
      {
        name: 'name',
        type: 'string',
        description: 'Channel name (use # prefix for auto-derived key)',
        required: true,
      },
    ],
  },

  // ========================
  // Cryptographic / Security
  // ========================
  {
    name: 'export_private_key',
    description: 'Export private key (may be disabled by firmware)',
    category: 'Advanced',
    responseFormat: 'Private key in hex format',
  },
  {
    name: 'import_private_key',
    description: 'Import private key (reboot required)',
    category: 'Advanced',
    dangerous: true,
    dangerMessage: 'Importing a private key changes the device identity and all entity IDs. Automations, scripts, and dashboards using current entity IDs will need to be updated.',
    params: [
      {
        name: 'key',
        type: 'string',
        description: 'Private key in hex format',
        required: true,
      },
    ],
  },
  {
    name: 'sign',
    description: 'Sign data with the device private key',
    category: 'Advanced',
    params: [
      {
        name: 'data',
        type: 'string',
        description: 'Data to sign (hex format)',
        required: true,
      },
    ],
  },

  // ========================
  // Messaging
  // ========================
  {
    name: 'send_msg',
    description: 'Send a direct text message to a contact',
    category: 'Messaging',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name, public key prefix, or full public key',
        required: true,
      },
      {
        name: 'message',
        type: 'string',
        description: 'Message text',
        required: true,
      },
    ],
  },
  {
    name: 'send_msg_with_retry',
    description: 'Send a message with automatic retry and path reset',
    category: 'Messaging',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name, public key prefix, or full public key',
        required: true,
      },
      {
        name: 'message',
        type: 'string',
        description: 'Message text',
        required: true,
      },
    ],
  },
  {
    name: 'send_chan_msg',
    description: 'Send a message to a channel (group message)',
    category: 'Messaging',
    params: [
      {
        name: 'channel',
        type: 'number',
        description: 'Channel index',
        required: true,
      },
      {
        name: 'message',
        type: 'string',
        description: 'Message text',
        required: true,
      },
    ],
  },
  {
    name: 'send_cmd',
    description: 'Send a CLI command to a remote node over the mesh',
    category: 'Messaging',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name, public key prefix, or full public key',
        required: true,
      },
      {
        name: 'command',
        type: 'string',
        description: 'CLI command to execute on remote node',
        required: true,
      },
    ],
  },
  {
    name: 'send_login',
    description: 'Login to a remote node with admin password',
    category: 'Messaging',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
      {
        name: 'password',
        type: 'string',
        description: 'Admin password',
        required: true,
      },
    ],
  },
  {
    name: 'send_logout',
    description: 'Logout from a remote node',
    category: 'Messaging',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },

  // ========================
  // Remote Status / Data Requests
  // ========================
  {
    name: 'send_statusreq',
    description: 'Request status from a remote node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'send_telemetry_req',
    description: 'Request telemetry data from a remote node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'send_path_discovery',
    description: 'Initiate path discovery to a remote node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },

  // ========================
  // Synchronous Data Requests
  // ========================
  {
    name: 'req_status_sync',
    description: 'Request status from a node (synchronous)',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'req_telemetry_sync',
    description: 'Request telemetry data from a node (synchronous)',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'req_mma_sync',
    description: 'Request min/max/avg statistics for a time range',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
      {
        name: 'start',
        type: 'number',
        description: 'Start time (epoch seconds)',
        required: true,
      },
      {
        name: 'end',
        type: 'number',
        description: 'End time (epoch seconds)',
        required: true,
      },
    ],
  },
  {
    name: 'req_acl_sync',
    description: 'Request access control list from a node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'req_neighbours_sync',
    description: 'Request neighbor list from a remote node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'fetch_all_neighbours',
    description: 'Fetch complete neighbor list with pagination',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'req_regions_sync',
    description: 'Request region information from a node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'req_owner_sync',
    description: 'Request owner information (name and description)',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'req_basic_sync',
    description: 'Request basic node information',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },

  // ========================
  // Contact Management
  // ========================
  {
    name: 'get_contacts',
    description: 'Retrieve all known contacts from the device',
    category: 'Advanced',
    params: [
      {
        name: 'lastmod',
        type: 'number',
        description: 'Only get contacts modified since this timestamp (optional)',
        required: false,
      },
    ],
  },
  {
    name: 'reset_path',
    description: 'Reset routing path to flood for a contact',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'share_contact',
    description: 'Share a contact info on the mesh',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'export_contact',
    description: 'Export a contact card (or self if no contact specified)',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key (optional, defaults to self)',
        required: false,
      },
    ],
  },
  {
    name: 'import_contact',
    description: 'Import a contact card',
    category: 'Advanced',
    params: [
      {
        name: 'card_data',
        type: 'string',
        description: 'Contact card data (hex encoded)',
        required: true,
      },
    ],
  },
  {
    name: 'remove_contact',
    description: 'Remove a contact from the list',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'update_contact',
    description: 'Update contact routing path and flags',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
      {
        name: 'path',
        type: 'string',
        description: 'Routing path (hex string)',
        required: true,
      },
      {
        name: 'flags',
        type: 'string',
        description: 'Contact flags',
        required: true,
      },
    ],
  },
  {
    name: 'add_contact',
    description: 'Add a contact to the list',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
    ],
  },
  {
    name: 'change_contact_path',
    description: 'Change a contact routing path',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
      {
        name: 'path',
        type: 'number',
        description: 'New path (integer)',
        required: true,
      },
    ],
  },
  {
    name: 'change_contact_flags',
    description: 'Change a contact flags',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
      {
        name: 'flags',
        type: 'number',
        description: 'New flags (integer)',
        required: true,
      },
    ],
  },
  {
    name: 'set_autoadd_config',
    description: 'Configure auto-add behavior for new contacts',
    category: 'Advanced',
    params: [
      {
        name: 'flag',
        type: 'number',
        description: 'Auto-add configuration flag',
        required: true,
      },
    ],
  },
  {
    name: 'get_autoadd_config',
    description: 'Get current auto-add configuration',
    category: 'Advanced',
  },

  // ========================
  // Binary Requests / Control
  // ========================
  {
    name: 'send_binary_req',
    description: 'Send a raw binary request to a remote node',
    category: 'Advanced',
    params: [
      {
        name: 'contact',
        type: 'string',
        description: 'Contact name or public key',
        required: true,
      },
      {
        name: 'req_type',
        type: 'number',
        description: 'Binary request type',
        required: true,
      },
    ],
  },
  {
    name: 'set_flood_scope',
    description: 'Set flood scope filter for broadcast messages',
    category: 'Network',
    params: [
      {
        name: 'scope',
        type: 'string',
        description: 'Flood scope (int, string, or hex)',
        required: true,
      },
    ],
  },
  {
    name: 'send_control_data',
    description: 'Send raw control data packet to the mesh',
    category: 'Advanced',
    params: [
      {
        name: 'control_type',
        type: 'number',
        description: 'Control data type',
        required: true,
      },
      {
        name: 'payload',
        type: 'string',
        description: 'Payload data (hex encoded)',
        required: true,
      },
    ],
  },
  {
    name: 'send_node_discover_req',
    description: 'Broadcast node discovery request',
    category: 'Network',
    params: [
      {
        name: 'filter',
        type: 'number',
        description: 'Discovery filter',
        required: true,
      },
      {
        name: 'prefix_only',
        type: 'boolean',
        description: 'Only use public key prefix for matching',
        required: false,
        default: false,
      },
    ],
  },

  // ========================
  // Message Retrieval
  // ========================
  {
    name: 'get_msg',
    description: 'Retrieve pending incoming messages',
    category: 'Messaging',
    params: [
      {
        name: 'timeout',
        type: 'number',
        description: 'Timeout in seconds to wait for messages (optional)',
        required: false,
        default: 5,
      },
    ],
  },

  // ========================
  // Trace / Debugging
  // ========================
  {
    name: 'send_trace',
    description: 'Send a trace packet through specific repeaters',
    category: 'Advanced',
    params: [
      {
        name: 'auth_code',
        type: 'number',
        description: 'Authentication code',
        required: true,
      },
      {
        name: 'tag',
        type: 'number',
        description: 'Trace tag',
        required: true,
      },
      {
        name: 'flags',
        type: 'number',
        description: 'Trace flags',
        required: true,
      },
      {
        name: 'path',
        type: 'string',
        description: 'Optional repeater path (hex encoded)',
        required: false,
      },
    ],
  },
];
