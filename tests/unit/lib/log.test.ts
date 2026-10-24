import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEntry, hashUserId, log, redact, setLogSink } from '@/lib/log';

describe('redact', () => {
  it('replaces PII keys at any depth without mutating the input', () => {
    const input = { email: 'a@b.c', nested: { display_name: 'Maya', ok: 1, deeper: [{ bio: 'x', keep: true }] } };
    const copy = structuredClone(input);
    const out = redact(input) as Record<string, unknown>;
    expect(out).toEqual({ email: '[redacted]', nested: { display_name: '[redacted]', ok: 1, deeper: [{ bio: '[redacted]', keep: true }] } });
    expect(input).toEqual(copy);
  });

  it('is case-insensitive on key names and handles tokens and passwords', () => {
    expect(redact({ Email: 'x', PASSWORD: 'y', Authorization: 'z', fine: 'v' })).toEqual({
      Email: '[redacted]',
      PASSWORD: '[redacted]',
      Authorization: '[redacted]',
      fine: 'v',
    });
  });

  it('serialises errors and truncates very deep objects', () => {
    const out = redact(new Error('oops')) as { name: string; message: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe('oops');
    const deep = Array.from({ length: 12 }).reduce<unknown>((acc) => ({ inner: acc }), 'leaf');
    expect(JSON.stringify(redact(deep))).toContain('[truncated]');
  });
});

describe('buildEntry', () => {
  it('hashes userId instead of logging it and keeps other fields', () => {
    const entry = buildEntry('info', 'hello', { userId: 'user-123', requestId: 'r1', email: 'a@b.c' });
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('hello');
    expect(entry).not.toHaveProperty('userId');
    expect(entry.userHash).toBe(hashUserId('user-123'));
    expect(entry.userHash).toHaveLength(16);
    expect(entry.email).toBe('[redacted]');
    expect(entry.requestId).toBe('r1');
    expect(typeof entry.time).toBe('string');
  });
});

describe('log sink', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('writes one JSON line per call to the sink and respects debug level', () => {
    const lines: Array<{ line: string; level: string }> = [];
    const restore = setLogSink((line, level) => lines.push({ line, level }));
    try {
      log.info('a', { x: 1 });
      log.debug('hidden');
      log.error('b', { bio: 'secret' });
      vi.stubEnv('LOG_LEVEL', 'debug');
      log.debug('shown');
    } finally {
      restore();
    }
    expect(lines.map((l) => l.level)).toEqual(['info', 'error', 'debug']);
    expect(JSON.parse(lines[0]!.line)).toMatchObject({ level: 'info', msg: 'a', x: 1 });
    expect(lines[1]!.line).not.toContain('secret');
  });
});
