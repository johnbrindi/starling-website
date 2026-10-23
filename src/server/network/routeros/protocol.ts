// RouterOS API wire protocol (RouterOS v6.43+ login). https://help.mikrotik.com/docs/display/ROS/API
// A sentence is a list of length-prefixed words terminated by an empty word.

export function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([((len >> 8) & 0x3f) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([((len >> 16) & 0x1f) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) {
    return Buffer.from([((len >> 24) & 0x0f) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.from([0xf0, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

/** Decodes a length prefix. Returns null if more bytes are needed. */
export function decodeLength(buf: Buffer, offset: number): { length: number; size: number } | null {
  if (offset >= buf.length) return null;
  const b0 = buf[offset]!;
  const need = (n: number) => offset + n <= buf.length;
  if ((b0 & 0x80) === 0) return { length: b0, size: 1 };
  if ((b0 & 0xc0) === 0x80) return need(2) ? { length: ((b0 & 0x3f) << 8) | buf[offset + 1]!, size: 2 } : null;
  if ((b0 & 0xe0) === 0xc0) {
    return need(3) ? { length: ((b0 & 0x1f) << 16) | (buf[offset + 1]! << 8) | buf[offset + 2]!, size: 3 } : null;
  }
  if ((b0 & 0xf0) === 0xe0) {
    return need(4)
      ? { length: ((b0 & 0x0f) * 0x1000000) + (buf[offset + 1]! << 16) + (buf[offset + 2]! << 8) + buf[offset + 3]!, size: 4 }
      : null;
  }
  if (b0 === 0xf0) return need(5) ? { length: buf.readUInt32BE(offset + 1), size: 5 } : null;
  throw new Error(`Invalid RouterOS length prefix 0x${b0.toString(16)}`);
}

export function encodeSentence(words: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const w of words) {
    const bytes = Buffer.from(w, "utf8");
    parts.push(encodeLength(bytes.length), bytes);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/** Incrementally parses sentences from a TCP stream. */
export class SentenceParser {
  private buf: Buffer = Buffer.alloc(0);
  private words: string[] = [];

  push(chunk: Buffer): string[][] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out: string[][] = [];
    let offset = 0;
    for (;;) {
      const len = decodeLength(this.buf, offset);
      if (!len) break;
      if (offset + len.size + len.length > this.buf.length) break;
      const start = offset + len.size;
      offset = start + len.length;
      if (len.length === 0) {
        out.push(this.words);
        this.words = [];
      } else {
        this.words.push(this.buf.subarray(start, start + len.length).toString("utf8"));
      }
    }
    this.buf = this.buf.subarray(offset);
    return out;
  }
}

export interface Reply {
  type: string; // !re, !done, !trap, !fatal, !empty
  tag?: string;
  attrs: Record<string, string>;
}

export function parseReply(words: string[]): Reply {
  const [type = "", ...rest] = words;
  const attrs: Record<string, string> = {};
  let tag: string | undefined;
  for (const w of rest) {
    if (w.startsWith(".tag=")) {
      tag = w.slice(5);
    } else if (w.startsWith("=")) {
      const i = w.indexOf("=", 1);
      if (i > 0) attrs[w.slice(1, i)] = w.slice(i + 1);
    } else if (type === "!fatal") {
      attrs.message = w;
    }
  }
  return { type, tag, attrs };
}

/** Builds the words for a command: /path, =attr=value, ?query. */
export function commandWords(path: string, attrs: Record<string, string | number | boolean | undefined> = {}, queries: string[] = []) {
  const words = [path];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    words.push(`=${k}=${typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}`);
  }
  for (const q of queries) words.push(q.startsWith("?") ? q : `?${q}`);
  return words;
}

/** Parses RouterOS durations: "1w2d03:04:05", "1d2h3m4s", "4m5s", "00:01:02". */
export function parseDuration(value: string | undefined): number {
  if (!value) return 0;
  let total = 0;
  const clock = value.match(/(\d+):(\d+):(\d+)$/);
  let rest = value;
  if (clock) {
    total += Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    rest = value.slice(0, clock.index);
  }
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  for (const m of rest.matchAll(/(\d+)(ms|w|d|h|m|s)/g)) {
    if (m[2] === "ms") continue;
    total += Number(m[1]) * units[m[2]!]!;
  }
  return total;
}

/** Formats seconds as a RouterOS time value: "2d03:04:05" or "00:59:59". */
export function formatDuration(seconds: number): string {
  const s = Math.max(1, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d${hms}` : hms;
}

/** Quotes a value for use inside a RouterOS script string. Only safe for our generated usernames. */
export function scriptSafe(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Unsafe value for RouterOS script");
  return value;
}
