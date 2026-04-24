import { CommandDef } from '../types';

/**
 * Remote device commands — executed on remote managed devices (repeaters/clients)
 * via the meshcore/send_cmd service. These are firmware CLI commands sent over
 * the mesh network to a target node, where the firmware's CommonCLI.handleCommand()
 * processes them.
 *
 * Used with: send_cmd("NodeName", "command args")
 */
export const REMOTE_COMMANDS: CommandDef[] = [
  // ========================
  // Device Management
  // ========================
  {
    name: 'reboot',
    description: 'Restart the remote device',
    category: 'Device Management',
    dangerous: true,
    remoteOnly: true,
  },
  {
    name: 'poweroff',
    description: 'Power off the remote device (v1.14.1+)',
    category: 'Device Management',
    dangerous: true,
    remoteOnly: true,
  },
  {
    name: 'shutdown',
    description: 'Power off the remote device (alias for poweroff)',
    category: 'Device Management',
    dangerous: true,
    remoteOnly: true,
  },
  {
    name: 'clkreboot',
    description: 'Reset clock to May 2024 and reboot',
    category: 'Device Management',
    dangerous: true,
    remoteOnly: true,
  },

  // ========================
  // Get Commands
  // ========================
  {
    name: 'get name',
    description: 'Get device name',
    category: 'Device Info',
    responseFormat: '> Device name string',
    remoteOnly: true,
  },
  {
    name: 'get radio',
    description: 'Get radio parameters (frequency, bandwidth, spreading factor, coding rate)',
    category: 'Radio Settings',
    responseFormat: '> freq,bw,sf,cr (example: 906.875,250.000,11,5)',
    remoteOnly: true,
  },
  {
    name: 'get freq',
    description: 'Get frequency only',
    category: 'Radio Settings',
    responseFormat: '> frequency in MHz (example: 906.875)',
    remoteOnly: true,
  },
  {
    name: 'get tx',
    description: 'Get transmit power',
    category: 'Radio Settings',
    responseFormat: '> TX power in dBm (example: 17)',
    remoteOnly: true,
  },
  {
    name: 'get af',
    description: 'Get airtime factor',
    category: 'Radio Settings',
    responseFormat: '> airtime factor value',
    remoteOnly: true,
  },
  {
    name: 'get lat',
    description: 'Get latitude coordinate',
    category: 'Location',
    responseFormat: '> latitude as float (example: 45.123456)',
    remoteOnly: true,
  },
  {
    name: 'get lon',
    description: 'Get longitude coordinate',
    category: 'Location',
    responseFormat: '> longitude as float (example: -122.654321)',
    remoteOnly: true,
  },
  {
    name: 'get repeat',
    description: 'Get forwarding/repeating status',
    category: 'Network',
    responseFormat: '> on or off',
    remoteOnly: true,
  },
  {
    name: 'get rxdelay',
    description: 'Get RX delay base',
    category: 'Advanced',
    responseFormat: '> RX delay value',
    remoteOnly: true,
  },
  {
    name: 'get txdelay',
    description: 'Get TX delay factor',
    category: 'Advanced',
    responseFormat: '> TX delay value',
    remoteOnly: true,
  },
  {
    name: 'get direct.txdelay',
    description: 'Get direct TX delay factor',
    category: 'Advanced',
    responseFormat: '> Direct TX delay value',
    remoteOnly: true,
  },
  {
    name: 'get flood.max',
    description: 'Get maximum flood hops',
    category: 'Network',
    responseFormat: '> max hops value (example: 8)',
    remoteOnly: true,
  },
  {
    name: 'get advert.interval',
    description: 'Get local advertisement interval (minutes)',
    category: 'Network',
    responseFormat: '> interval in minutes (example: 120)',
    remoteOnly: true,
  },
  {
    name: 'get flood.advert.interval',
    description: 'Get flood advertisement interval (hours)',
    category: 'Network',
    responseFormat: '> interval in hours (example: 12)',
    remoteOnly: true,
  },
  {
    name: 'get int.thresh',
    description: 'Get interference threshold',
    category: 'Advanced',
    responseFormat: '> threshold value',
    remoteOnly: true,
  },
  {
    name: 'get agc.reset.interval',
    description: 'Get AGC (automatic gain control) reset interval',
    category: 'Advanced',
    responseFormat: '> interval value',
    remoteOnly: true,
  },
  {
    name: 'get multi.acks',
    description: 'Get multi-acks setting',
    category: 'Advanced',
    responseFormat: '> multi-acks value (0 or 1)',
    remoteOnly: true,
  },
  {
    name: 'get allow.read.only',
    description: 'Get read-only access permission setting',
    category: 'Advanced',
    responseFormat: '> on or off',
    remoteOnly: true,
  },
  {
    name: 'get guest.password',
    description: 'Get guest password',
    category: 'Advanced',
    responseFormat: '> password string',
    remoteOnly: true,
  },
  {
    name: 'get public.key',
    description: 'Get full public key (hex)',
    category: 'Device Info',
    responseFormat: '> hex-encoded public key (example: a6ec829f...d9b70772)',
    remoteOnly: true,
  },
  {
    name: 'get role',
    description: 'Get device role',
    category: 'Device Info',
    responseFormat: '> repeater or client',
    remoteOnly: true,
  },
  {
    name: 'get owner.info',
    description: 'Get owner information text',
    category: 'Device Info',
    responseFormat: '> owner info string (with | for newlines)',
    remoteOnly: true,
  },
  {
    name: 'get adc.multiplier',
    description: 'Get ADC voltage multiplier',
    category: 'Advanced',
    responseFormat: '> multiplier value',
    remoteOnly: true,
  },
  {
    name: 'get path.hash.mode',
    description: 'Get path hash mode (v1.14.0+)',
    category: 'Network',
    responseFormat: '> mode: 0, 1, or 2',
    remoteOnly: true,
  },
  {
    name: 'get loop.detect',
    description: 'Get loop detection level (v1.14.0+)',
    category: 'Network',
    responseFormat: '> off, minimal, moderate, or strict',
    remoteOnly: true,
  },
  {
    name: 'get bootloader.ver',
    description: 'Get bootloader version (NRF52 only, v1.14.0+)',
    category: 'Device Info',
    responseFormat: '> bootloader version string',
    remoteOnly: true,
  },
  {
    name: 'get radio.rxgain',
    description: 'Get RX boosted gain mode (SX1262/SX1268 only, v1.14.1+)',
    category: 'Radio Settings',
    responseFormat: '> on or off',
    remoteOnly: true,
  },
  {
    name: 'get bridge.type',
    description: 'Get bridge hardware type',
    category: 'Advanced',
    responseFormat: '> none, rs232, or espnow',
    remoteOnly: true,
  },

  // ========================
  // Set Commands
  // ========================
  {
    name: 'set name',
    description: 'Set device name',
    category: 'Device Info',
    params: [
      {
        name: 'name',
        type: 'string',
        description: 'New name (no special characters: []\\:,?*)',
        required: true,
      },
    ],
    responseFormat: 'OK - name changed',
    remoteOnly: true,
  },
  {
    name: 'set af',
    description: 'Set airtime factor',
    category: 'Radio Settings',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Airtime factor (0-9)',
        required: true,
        min: 0,
        max: 9,
      },
    ],
    responseFormat: 'OK - airtime factor set',
    remoteOnly: true,
  },
  {
    name: 'set repeat',
    description: 'Enable or disable packet forwarding/repeating',
    category: 'Network',
    params: [
      {
        name: 'state',
        type: 'select',
        description: 'Enable (on) or disable (off)',
        required: true,
        options: ['on', 'off'],
      },
    ],
    responseFormat: 'OK - forwarding enabled/disabled',
    remoteOnly: true,
  },
  {
    name: 'set radio',
    description: 'Set radio parameters (reboot required to take effect)',
    category: 'Radio Settings',
    params: [
      {
        name: 'params',
        type: 'string',
        description: 'Comma-separated: freq,bw,sf,cr (example: 906.875,250.000,11,5)',
        required: true,
      },
    ],
    responseFormat: 'OK - radio parameters set (reboot required)',
    remoteOnly: true,
  },
  {
    name: 'set lat',
    description: 'Set latitude coordinate',
    category: 'Location',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Latitude (-90 to 90)',
        required: true,
        min: -90,
        max: 90,
      },
    ],
    responseFormat: 'OK - latitude set',
    remoteOnly: true,
  },
  {
    name: 'set lon',
    description: 'Set longitude coordinate',
    category: 'Location',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Longitude (-180 to 180)',
        required: true,
        min: -180,
        max: 180,
      },
    ],
    responseFormat: 'OK - longitude set',
    remoteOnly: true,
  },
  {
    name: 'set tx',
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
    responseFormat: 'OK - TX power set',
    remoteOnly: true,
  },
  {
    name: 'set rxdelay',
    description: 'Set RX delay base',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'RX delay value (≥0)',
        required: true,
        min: 0,
      },
    ],
    responseFormat: 'OK - RX delay set',
    remoteOnly: true,
  },
  {
    name: 'set txdelay',
    description: 'Set TX delay factor',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'TX delay value (≥0)',
        required: true,
        min: 0,
      },
    ],
    responseFormat: 'OK - TX delay set',
    remoteOnly: true,
  },
  {
    name: 'set direct.txdelay',
    description: 'Set direct TX delay factor',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Direct TX delay value (≥0)',
        required: true,
        min: 0,
      },
    ],
    responseFormat: 'OK - direct TX delay set',
    remoteOnly: true,
  },
  {
    name: 'set flood.max',
    description: 'Set maximum flood hops',
    category: 'Network',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Max hops (0-64)',
        required: true,
        min: 0,
        max: 64,
      },
    ],
    responseFormat: 'OK - flood max set',
    remoteOnly: true,
  },
  {
    name: 'set advert.interval',
    description: 'Set local advertisement interval (minutes)',
    category: 'Network',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Interval in minutes (60-240, or 0 to disable)',
        required: true,
        min: 0,
        max: 240,
      },
    ],
    responseFormat: 'OK - advert interval set',
    remoteOnly: true,
  },
  {
    name: 'set flood.advert.interval',
    description: 'Set flood advertisement interval (hours)',
    category: 'Network',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Interval in hours (3-168, or 0 to disable)',
        required: true,
        min: 0,
        max: 168,
      },
    ],
    responseFormat: 'OK - flood advert interval set',
    remoteOnly: true,
  },
  {
    name: 'set int.thresh',
    description: 'Set interference threshold',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Threshold value',
        required: true,
      },
    ],
    responseFormat: 'OK - interference threshold set',
    remoteOnly: true,
  },
  {
    name: 'set agc.reset.interval',
    description: 'Set AGC (automatic gain control) reset interval',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Interval value',
        required: true,
      },
    ],
    responseFormat: 'OK - AGC reset interval set',
    remoteOnly: true,
  },
  {
    name: 'set multi.acks',
    description: 'Set multi-acks mode',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Multi-acks setting (0 or 1)',
        required: true,
        min: 0,
        max: 1,
      },
    ],
    responseFormat: 'OK - multi-acks set',
    remoteOnly: true,
  },
  {
    name: 'set allow.read.only',
    description: 'Set read-only access permission',
    category: 'Advanced',
    params: [
      {
        name: 'state',
        type: 'select',
        description: 'Enable (on) or disable (off)',
        required: true,
        options: ['on', 'off'],
      },
    ],
    responseFormat: 'OK - read-only access updated',
    remoteOnly: true,
  },
  {
    name: 'set guest.password',
    description: 'Set guest password',
    category: 'Advanced',
    params: [
      {
        name: 'pwd',
        type: 'string',
        description: 'New guest password',
        required: true,
      },
    ],
    responseFormat: 'OK - guest password set',
    remoteOnly: true,
  },
  {
    name: 'set prv.key',
    description: 'Import private key (reboot required, serial-only)',
    category: 'Advanced',
    params: [
      {
        name: 'hex',
        type: 'string',
        description: '64-character hex private key',
        required: true,
      },
    ],
    responseFormat: 'OK - private key imported (reboot required)',
    remoteOnly: true,
  },
  {
    name: 'set owner.info',
    description: 'Set owner information text',
    category: 'Device Info',
    params: [
      {
        name: 'text',
        type: 'string',
        description: 'Owner info (use | for newlines)',
        required: true,
      },
    ],
    responseFormat: 'OK - owner info set',
    remoteOnly: true,
  },
  {
    name: 'set adc.multiplier',
    description: 'Set ADC voltage multiplier',
    category: 'Advanced',
    params: [
      {
        name: 'val',
        type: 'number',
        description: 'Multiplier value (0-10, 0 = board default)',
        required: true,
        min: 0,
        max: 10,
      },
    ],
    responseFormat: 'OK - ADC multiplier set',
    remoteOnly: true,
  },
  {
    name: 'set path.hash.mode',
    description: 'Set path hash mode for routing (v1.14.0+)',
    category: 'Network',
    params: [
      {
        name: 'mode',
        type: 'select',
        description: 'Mode: 0=disabled, 1=8-bit, 2=16-bit',
        required: true,
        options: ['0', '1', '2'],
      },
    ],
    responseFormat: 'OK - path hash mode set',
    remoteOnly: true,
  },
  {
    name: 'set loop.detect',
    description: 'Set loop detection level (v1.14.0+)',
    category: 'Network',
    params: [
      {
        name: 'mode',
        type: 'select',
        description: 'Mode: off, minimal, moderate, or strict',
        required: true,
        options: ['off', 'minimal', 'moderate', 'strict'],
      },
    ],
    responseFormat: 'OK - loop detection set',
    remoteOnly: true,
  },
  {
    name: 'set radio.rxgain',
    description: 'Set RX boosted gain mode (SX1262/SX1268 only, v1.14.1+)',
    category: 'Radio Settings',
    params: [
      {
        name: 'state',
        type: 'select',
        description: 'Enable (on) or disable (off)',
        required: true,
        options: ['on', 'off'],
      },
    ],
    responseFormat: 'OK - RX gain mode set',
    remoteOnly: true,
  },
  {
    name: 'set bridge.enabled',
    description: 'Enable or disable the bridge interface',
    category: 'Advanced',
    params: [
      {
        name: 'state',
        type: 'select',
        description: 'Enable (on) or disable (off)',
        required: true,
        options: ['on', 'off'],
      },
    ],
    responseFormat: 'OK - bridge enabled/disabled',
    remoteOnly: true,
  },
  {
    name: 'set bridge.delay',
    description: 'Set bridge packet delay',
    category: 'Advanced',
    params: [
      {
        name: 'ms',
        type: 'number',
        description: 'Delay in milliseconds (0-10000)',
        required: true,
        min: 0,
        max: 10000,
      },
    ],
    responseFormat: 'OK - bridge delay set',
    remoteOnly: true,
  },
  {
    name: 'set bridge.source',
    description: 'Set bridge packet source (RX or TX logs)',
    category: 'Advanced',
    params: [
      {
        name: 'source',
        type: 'select',
        description: 'Source: rx (logRx) or tx (logTx)',
        required: true,
        options: ['rx', 'tx'],
      },
    ],
    responseFormat: 'OK - bridge source set',
    remoteOnly: true,
  },
  {
    name: 'set bridge.baud',
    description: 'Set RS232 bridge baud rate',
    category: 'Advanced',
    params: [
      {
        name: 'rate',
        type: 'number',
        description: 'Baud rate (9600-115200, board-dependent max)',
        required: true,
        min: 9600,
      },
    ],
    responseFormat: 'OK - bridge baud rate set',
    remoteOnly: true,
  },
  {
    name: 'set bridge.channel',
    description: 'Set ESP-NOW bridge channel',
    category: 'Advanced',
    params: [
      {
        name: 'ch',
        type: 'number',
        description: 'Channel (1-14)',
        required: true,
        min: 1,
        max: 14,
      },
    ],
    responseFormat: 'OK - bridge channel set',
    remoteOnly: true,
  },
  {
    name: 'set bridge.secret',
    description: 'Set ESP-NOW bridge shared secret',
    category: 'Advanced',
    params: [
      {
        name: 'key',
        type: 'string',
        description: 'Shared secret string',
        required: true,
      },
    ],
    responseFormat: 'OK - bridge secret set',
    remoteOnly: true,
  },

  // ========================
  // Informational Commands
  // ========================
  {
    name: 'ver',
    description: 'Get firmware version and build date',
    category: 'Device Info',
    responseFormat: '<version> (Build: <date>)',
    remoteOnly: true,
  },
  {
    name: 'board',
    description: 'Get board/manufacturer name',
    category: 'Device Info',
    responseFormat: 'Board name string',
    remoteOnly: true,
  },
  {
    name: 'neighbors',
    description: 'List known neighbor nodes',
    category: 'Network',
    responseFormat: 'Formatted neighbor list',
    remoteOnly: true,
  },

  // ========================
  // Neighbor Management
  // ========================
  {
    name: 'neighbor.remove',
    description: 'Remove a neighbor by public key',
    category: 'Network',
    params: [
      {
        name: 'pubkey',
        type: 'string',
        description: 'Public key hex string of neighbor to remove',
        required: true,
      },
    ],
    responseFormat: 'OK - neighbor removed',
    remoteOnly: true,
  },

  // ========================
  // Time Management
  // ========================
  {
    name: 'clock',
    description: 'Get current device time',
    category: 'Device Info',
    responseFormat: 'HH:MM - D/M/Y UTC',
    remoteOnly: true,
  },
  {
    name: 'clock sync',
    description: 'Synchronize clock to sender\'s timestamp',
    category: 'Device Info',
    responseFormat: 'OK - clock set: HH:MM - D/M/Y UTC',
    remoteOnly: true,
  },
  {
    name: 'time',
    description: 'Set time to epoch seconds',
    category: 'Device Info',
    params: [
      {
        name: 'epoch',
        type: 'number',
        description: 'Unix epoch timestamp',
        required: true,
      },
    ],
    responseFormat: 'OK - clock set: HH:MM - D/M/Y UTC',
    remoteOnly: true,
  },

  // ========================
  // Password Management
  // ========================
  {
    name: 'password',
    description: 'Change admin password (requires prior login)',
    category: 'Advanced',
    params: [
      {
        name: 'pwd',
        type: 'string',
        description: 'New admin password',
        required: true,
      },
    ],
    responseFormat: 'password now: <pwd>',
    remoteOnly: true,
  },

  // ========================
  // Advertising
  // ========================
  {
    name: 'advert',
    description: 'Send a flood advertisement (network-wide broadcast)',
    category: 'Network',
    responseFormat: 'OK - Advert sent',
    remoteOnly: true,
  },
  {
    name: 'advert.zerohop',
    description: 'Send a local-only (zero-hop) advertisement (v1.14.0+)',
    category: 'Network',
    responseFormat: 'OK - zerohop advert sent',
    remoteOnly: true,
  },

  // ========================
  // Statistics / Logging
  // ========================
  {
    name: 'clear stats',
    description: 'Reset all statistics counters',
    category: 'Advanced',
    responseFormat: 'OK - stats reset',
    remoteOnly: true,
  },
  {
    name: 'log start',
    description: 'Start packet logging',
    category: 'Advanced',
    responseFormat: 'logging on',
    remoteOnly: true,
  },
  {
    name: 'log stop',
    description: 'Stop packet logging',
    category: 'Advanced',
    responseFormat: 'logging off',
    remoteOnly: true,
  },
  {
    name: 'log erase',
    description: 'Erase log file',
    category: 'Advanced',
    responseFormat: 'log erased',
    remoteOnly: true,
  },

  // ========================
  // Power Management (NRF52)
  // ========================
  {
    name: 'powersaving',
    description: 'Get power saving status (NRF52 only)',
    category: 'Device Info',
    responseFormat: 'on or off',
    remoteOnly: true,
  },
  {
    name: 'powersaving on',
    description: 'Enable power saving mode (NRF52 only)',
    category: 'Device Info',
    responseFormat: 'ok',
    remoteOnly: true,
  },
  {
    name: 'powersaving off',
    description: 'Disable power saving mode (NRF52 only)',
    category: 'Device Info',
    responseFormat: 'ok',
    remoteOnly: true,
  },

  // ========================
  // OTA Update
  // ========================
  {
    name: 'start ota',
    description: 'Enter Bluetooth OTA update mode (repeater-only)',
    category: 'Device Management',
    dangerous: true,
    remoteOnly: true,
  },

  // ========================
  // Radio Tuning
  // ========================
  {
    name: 'tempradio',
    description: 'Temporarily override radio parameters for a duration',
    category: 'Radio Settings',
    params: [
      {
        name: 'freq',
        type: 'number',
        description: 'Temporary frequency in MHz',
        required: true,
      },
      {
        name: 'bw',
        type: 'number',
        description: 'Temporary bandwidth in kHz',
        required: true,
      },
      {
        name: 'sf',
        type: 'number',
        description: 'Temporary spreading factor (5-12)',
        required: true,
      },
      {
        name: 'cr',
        type: 'number',
        description: 'Temporary coding rate (5-8)',
        required: true,
      },
      {
        name: 'mins',
        type: 'number',
        description: 'Duration in minutes',
        required: true,
      },
    ],
    responseFormat: 'OK - temp params for N mins',
    remoteOnly: true,
  },
];
