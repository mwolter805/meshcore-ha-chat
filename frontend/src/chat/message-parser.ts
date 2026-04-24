import type { PanelConfig, ChatMessage, StoredMessage, DeliveryStatus, MessageGroup, RenderItem } from '../types';
import {
  MENTION_BRACKET_REGEX,
  MENTION_WORD_REGEX,
} from '../constants';

/**
 * Synchronous SHA-256 implementation for deterministic message IDs.
 * Matches the backend generate_message_id() in utils.py:
 *   hashlib.sha256(f"{timestamp}|{sender}|{text}".encode()).hexdigest()[:12]
 */
const K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(input: string): string {
  // Encode as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const len = data.length;

  // Pre-processing: pad to 512-bit blocks
  const bitLen = len * 8;
  const padLen = ((len + 9 + 63) & ~63); // next multiple of 64
  const buf = new Uint8Array(padLen);
  buf.set(data);
  buf[len] = 0x80;
  // Length in bits as big-endian 64-bit at end (only low 32 bits needed for practical sizes)
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 4, bitLen, false);

  // Initialize hash state
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Int32Array(64);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (((w[i-15] >>> 7) | (w[i-15] << 25)) ^ ((w[i-15] >>> 18) | (w[i-15] << 14)) ^ (w[i-15] >>> 3));
      const s1 = (((w[i-2] >>> 17) | (w[i-2] << 15)) ^ ((w[i-2] >>> 19) | (w[i-2] << 13)) ^ (w[i-2] >>> 10));
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

/**
 * Generate a deterministic message ID matching the backend generate_message_id().
 * SHA256 of "timestamp|sender|text" truncated to 12 hex chars.
 */
export function generateId(timestamp: string, sender: string, text: string): string {
  const raw = `${timestamp}|${sender}|${text}`;
  return sha256(raw).substring(0, 12);
}

/**
 * Extract @mentions from message text.
 * Supports @[Name With Spaces] and @SingleWord patterns.
 */
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  const seen = new Set<string>();

  // @[Name] pattern (higher priority — captures names with spaces/emoji)
  let match: RegExpExecArray | null;
  const bracketRegex = new RegExp(MENTION_BRACKET_REGEX.source, 'g');
  while ((match = bracketRegex.exec(text)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      mentions.push(name);
    }
  }

  // @Word pattern (only add if not already captured by bracket pattern)
  const wordRegex = new RegExp(MENTION_WORD_REGEX.source, 'g');
  while ((match = wordRegex.exec(text)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      mentions.push(name);
    }
  }

  return mentions;
}

/**
 * Convert a StoredMessage from the backend into a ChatMessage for the UI.
 */
export function toClientMessage(stored: StoredMessage): ChatMessage {
  return {
    id: stored.id,
    sender: stored.sender,
    text: stored.text,
    timestamp: new Date(stored.timestamp),
    isOutgoing: stored.outgoing,
    isSystem: false,
    raw: stored.text,
    mentions: extractMentions(stored.text),
    rxLogData: stored.rx_log_data,
    deliveryStatus: stored.delivery_status
      ? {
          status: stored.delivery_status as DeliveryStatus['status'],
          ackReceived: stored.ack_received,
          repeaterCount: stored.repeater_count,
          roundTripMs: stored.round_trip_ms,
        }
      : undefined,
    repeaterCount: stored.repeater_count,
  };
}

/**
 * Group consecutive messages from the same sender within a time window.
 */
export function groupMessages(messages: ChatMessage[], timeoutSeconds: number): MessageGroup[] {
  if (messages.length === 0) return [];

  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const msg of messages) {
    const shouldStartNewGroup =
      !currentGroup ||
      msg.isSystem ||
      currentGroup.isSystem ||
      msg.sender !== currentGroup.sender ||
      (msg.timestamp.getTime() - currentGroup.endTime.getTime()) / 1000 > timeoutSeconds;

    if (shouldStartNewGroup) {
      currentGroup = {
        sender: msg.sender,
        isOutgoing: msg.isOutgoing,
        isSystem: msg.isSystem,
        messages: [msg],
        startTime: msg.timestamp,
        endTime: msg.timestamp,
      };
      groups.push(currentGroup);
    } else {
      currentGroup!.messages.push(msg);
      currentGroup!.endTime = msg.timestamp;
    }
  }

  return groups;
}

/**
 * Check if two dates are on different calendar days.
 */
function isDifferentDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

/**
 * Format a date for the date separator label.
 */
export function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Build render items: message groups interleaved with date separators.
 */
export function buildRenderItems(
  messages: ChatMessage[],
  config: Pick<PanelConfig, 'group_messages' | 'group_timeout' | 'show_date_separators'>,
): RenderItem[] {
  const timeoutSeconds = config.group_timeout ?? 300;
  const groups =
    config.group_messages !== false
      ? groupMessages(messages, timeoutSeconds)
      : messages.map(
          (msg): MessageGroup => ({
            sender: msg.sender,
            isOutgoing: msg.isOutgoing,
            isSystem: msg.isSystem,
            messages: [msg],
            startTime: msg.timestamp,
            endTime: msg.timestamp,
          }),
        );

  if (groups.length === 0) return [];

  const items: RenderItem[] = [];
  let lastDate: Date | null = null;

  for (const group of groups) {
    const groupDate = group.startTime;

    // Insert date separator if day changed
    if (
      config.show_date_separators !== false &&
      (!lastDate || isDifferentDay(lastDate, groupDate))
    ) {
      items.push({
        type: 'date-separator',
        date: groupDate,
        label: formatDateSeparator(groupDate),
      });
    }

    items.push({ type: 'group', group });
    lastDate = groupDate;
  }

  return items;
}

/**
 * Format a relative timestamp (e.g., "2m ago", "1h ago", "Yesterday").
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Format a timestamp according to the configured format.
 */
export function formatTimestamp(date: Date, format: 'relative' | 'time' | 'datetime'): string {
  switch (format) {
    case 'relative':
      return formatRelativeTime(date);
    case 'time':
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    case 'datetime':
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    default:
      return formatRelativeTime(date);
  }
}
