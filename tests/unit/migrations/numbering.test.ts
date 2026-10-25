import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Supabase keys `supabase_migrations.schema_migrations` on the leading digits of a filename, so
 * two migrations sharing a number is not a style problem: `supabase db reset` stops partway with
 * a duplicate key and the database is left half-built. That happened once here, when workstream
 * 07's graph and import migrations both arrived as `0700`, and it will happen again — each
 * workstream picks its own numbers on its own branch and nothing notices until the branches meet.
 */

const DIR = path.join('supabase', 'migrations');

const migrations = (): { file: string; version: string }[] =>
  readdirSync(DIR)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => ({ file, version: file.split('_')[0] ?? '' }));

describe('migration numbering', () => {
  it('finds the migrations', () => {
    expect(migrations().length).toBeGreaterThan(5);
  });

  it('gives every migration a four-digit version', () => {
    const malformed = migrations().filter(({ version }) => !/^\d{4}$/.test(version));
    expect(malformed.map((m) => m.file)).toEqual([]);
  });

  it('never gives two migrations the same version', () => {
    const seen = new Map<string, string[]>();
    for (const { file, version } of migrations()) {
      seen.set(version, [...(seen.get(version) ?? []), file]);
    }
    const clashes = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([version, files]) => `${version}: ${files.join(' and ')}`);
    expect(clashes, 'two migrations with one version break `supabase db reset`').toEqual([]);
  });

  it('applies in the order the filenames sort in', () => {
    // `supabase db reset` runs them lexically, so the numeric and lexical orders must agree.
    const versions = migrations().map(({ version }) => version);
    const lexical = [...versions].sort();
    const numeric = [...versions].sort((a, b) => Number(a) - Number(b));
    expect(lexical).toEqual(numeric);
  });
});
