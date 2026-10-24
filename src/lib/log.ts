/**
 * Structured JSON logging with PII redaction (specs §7).
 * Every entry is one JSON line on stdout/stderr. User ids are hashed, and any key on the
 * redaction list is replaced with "[redacted]" at any depth.
 */
import { createHash } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

/** Keys whose values are never written to logs (case-insensitive, matched on the key name). */
export const REDACTED_KEYS = [
  'email',
  'display_name',
  'displayname',
  'bio',
  'message',
  'messages',
  'content',
  'body',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'api_key',
  'apikey',
  'prompt',
  'phone',
  'address',
] as const;

const REDACTED = '[redacted]';
const MAX_DEPTH = 8;
const redactedSet = new Set<string>(REDACTED_KEYS);

/** Hash a user id so logs can be correlated without storing the raw id. */
export function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

function isRedactedKey(key: string): boolean {
  return redactedSet.has(key.toLowerCase());
}

/** Returns a deep copy of `value` with every redacted key replaced. Never mutates the input. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        isRedactedKey(key) ? REDACTED : redact(inner, depth + 1),
      ]),
    );
  }
  return value;
}

export type LogEntry = {
  level: LogLevel;
  msg: string;
  time: string;
  [key: string]: unknown;
};

/** Build the entry that would be written. Exposed for tests. */
export function buildEntry(level: LogLevel, msg: string, fields: LogFields = {}): LogEntry {
  const { userId, ...rest } = fields;
  const safe = redact(rest) as Record<string, unknown>;
  const entry: LogEntry = { level, msg, time: new Date().toISOString(), ...safe };
  return typeof userId === 'string' ? { ...entry, userHash: hashUserId(userId) } : entry;
}

type Sink = (line: string, level: LogLevel) => void;

const defaultSink: Sink = (line, level) => {
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
};

let sink: Sink = defaultSink;

/** Replace the output sink (tests). Returns a restore function. */
export function setLogSink(next: Sink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

function write(level: LogLevel, msg: string, fields?: LogFields): void {
  if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;
  if (process.env.NODE_ENV === 'test' && process.env.LOG_IN_TESTS !== '1' && sink === defaultSink) return;
  sink(JSON.stringify(buildEntry(level, msg, fields)), level);
}

export const log = {
  debug: (msg: string, fields?: LogFields) => write('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => write('error', msg, fields),
};

/** Generate a request id for correlating a Route Handler's log lines. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
