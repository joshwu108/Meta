import { normalizeTag } from '@/features/matching';
import type { Band, MapLabelsOutput, ReadScreensOutput } from '../schemas';
import { bandOf, confidenceOf, evidenceLine, type Evidence } from './confidence';
import { isSensitive } from './sensitive';
import { lookupLabel, lookupTag, SUMMARY_PHRASES, type VocabEntry } from './vocabulary';
import { MAX_EVIDENCE_LINES, MAX_LEFTOVERS_FOR_MODEL, MAX_SUGGESTIONS_PER_RUN } from './weights';

/**
 * Pure stages of the screenshot pipeline (spec 07 §9): signals → vocabulary match → model
 * leftovers → validation → aggregate → score → dedupe → cap. Nothing here touches I/O.
 */

/** One label read off a screenshot. `id` is what the mapping model must cite. */
export type Signal =
  | { id: string; kind: 'topic'; label: string; state: 'listed' | 'see_more' }
  | { id: string; kind: 'explore'; label: string; tiles: number }
  | { id: string; kind: 'ad_interest'; label: string };

export type ScreenSignals = {
  signals: Signal[];
  /** Topics the user set to "see less", for the Less of this cards. */
  seeLess: string[];
  summaries: string[];
  droppedSensitive: number;
};

/** Flatten the read_screens output, dropping sensitive labels before anything else sees them. */
export function screensToSignals(output: ReadScreensOutput): ScreenSignals {
  const signals: Signal[] = [];
  const seeLess: string[] = [];
  const summaries: string[] = [];
  let droppedSensitive = 0;
  for (const screen of output.screens) {
    if (screen.kind === 'other') continue;
    if (screen.summary) summaries.push(screen.summary);
    for (const topic of screen.topics) {
      if (isSensitive(topic.label)) { droppedSensitive += 1; continue; }
      if (topic.state === 'see_less') seeLess.push(topic.label);
      else signals.push({ id: `s${signals.length}`, kind: 'topic', label: topic.label, state: topic.state });
    }
    for (const theme of screen.themes) {
      if (isSensitive(theme.label)) { droppedSensitive += 1; continue; }
      signals.push({ id: `s${signals.length}`, kind: 'explore', label: theme.label, tiles: theme.tiles });
    }
  }
  return { signals, seeLess: [...new Set(seeLess)], summaries, droppedSensitive };
}

export type Mapped = { signal: Signal; entry: VocabEntry; close: boolean };

/** Exact/alias matches, plus the leftovers (capped) that may go to `import.map_labels`. */
export function matchVocabulary(signals: readonly Signal[]): { mapped: Mapped[]; leftovers: Signal[] } {
  const mapped: Mapped[] = [];
  const leftovers: Signal[] = [];
  for (const signal of signals) {
    const entry = lookupLabel(signal.label);
    if (entry) mapped.push({ signal, entry, close: false });
    else leftovers.push(signal);
  }
  return { mapped, leftovers: leftovers.slice(0, MAX_LEFTOVERS_FOR_MODEL) };
}

/**
 * Keep only model mappings that cite an input id, land on the closed vocabulary and are not
 * sensitive. Anything else (including an injected instruction) is dropped here.
 */
export function validateMappings(output: MapLabelsOutput, leftovers: readonly Signal[]): Mapped[] {
  const byId = new Map(leftovers.map((s) => [s.id, s]));
  const used = new Set<string>();
  const result: Mapped[] = [];
  for (const m of output.mappings) {
    const signal = byId.get(m.id);
    const entry = lookupTag(m.field, m.value);
    if (!signal || !entry || used.has(m.id) || isSensitive(m.value)) continue;
    used.add(m.id);
    result.push({ signal, entry, close: m.quality === 'close' });
  }
  return result;
}

/** Vocabulary tags mentioned in the Your Algorithm summaries (whole-phrase, case-insensitive). */
export function summaryMentions(summaries: readonly string[]): VocabEntry[] {
  const text = ` ${summaries.join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const found = new Map<string, VocabEntry>();
  for (const { phrase, entry } of SUMMARY_PHRASES) {
    if (text.includes(` ${phrase} `)) found.set(`${entry.field}:${entry.tag}`, entry);
  }
  return [...found.values()];
}

export type Candidate = {
  field: 'interests' | 'activity_prefs';
  value: string;
  label: string;
  category: string | null;
  confidence: number;
  band: Band;
  evidence: string[];
  usedModel: boolean;
};

function toEvidence({ signal, close }: Mapped): Evidence {
  if (signal.kind === 'topic') return { kind: 'topic', label: signal.label, state: signal.state, close };
  if (signal.kind === 'ad_interest') return { kind: 'ad_interest', label: signal.label, close };
  return { kind: 'explore', label: signal.label, tiles: signal.tiles, close };
}

/** Labels from a Download-your-information export (topics and ad interests), sensitive ones dropped. */
export function exportToSignals(topics: readonly string[], adInterests: readonly string[]): ScreenSignals {
  const signals: Signal[] = [];
  let droppedSensitive = 0;
  const add = (label: string, kind: 'topic' | 'ad_interest') => {
    if (isSensitive(label)) { droppedSensitive += 1; return; }
    const id = `s${signals.length}`;
    signals.push(kind === 'topic' ? { id, kind, label, state: 'listed' } : { id, kind, label });
  };
  [...new Set(topics)].forEach((l) => add(l, 'topic'));
  [...new Set(adInterests)].forEach((l) => add(l, 'ad_interest'));
  return { signals, seeLess: [], summaries: [], droppedSensitive };
}

/** One candidate per (field, tag), evidence merged, confidence computed, too-weak ones dropped. */
export function aggregate(mapped: readonly Mapped[], mentions: readonly VocabEntry[]): Candidate[] {
  type Acc = { entry: VocabEntry; evidence: Evidence[]; usedModel: boolean };
  const groups = new Map<string, Acc>();
  const touch = (entry: VocabEntry): Acc => {
    const key = `${entry.field}:${entry.tag}`;
    const acc = groups.get(key) ?? { entry, evidence: [], usedModel: false };
    groups.set(key, acc);
    return acc;
  };
  for (const m of mapped) {
    const acc = touch(m.entry);
    acc.evidence.push(toEvidence(m));
    acc.usedModel ||= m.close || lookupLabel(m.signal.label) === null;
  }
  // A summary mention only strengthens a tag that a topic or tile already showed.
  for (const entry of mentions) {
    const acc = groups.get(`${entry.field}:${entry.tag}`);
    if (acc) acc.evidence.push({ kind: 'summary', label: entry.tag });
  }
  const candidates: Candidate[] = [];
  for (const { entry, evidence, usedModel } of groups.values()) {
    const confidence = confidenceOf(evidence);
    const band = bandOf(confidence);
    if (!band || isSensitive(entry.tag)) continue;
    candidates.push({
      field: entry.field,
      value: entry.tag,
      label: labelFor(entry),
      category: entry.category,
      confidence,
      band,
      evidence: evidence.slice(0, MAX_EVIDENCE_LINES).map(evidenceLine),
      usedModel,
    });
  }
  return candidates.sort((a, b) => b.confidence - a.confidence || a.value.localeCompare(b.value));
}

/** Card title: the tag in sentence case ("board-games" → "Board games"). */
function labelFor(entry: VocabEntry): string {
  const words = entry.tag.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type Existing = {
  interests: readonly string[];
  activityPrefs: readonly string[];
  /** `${field}:${value}` of suggestions already pending. */
  pending: ReadonlySet<string>;
  /** Tags and normalized labels the user said "not me" to or keeps as dislikes. */
  dislikes: ReadonlySet<string>;
};

/** Drop what the profile already has, what is pending, and what the user rejected; cap the run. */
export function dedupe(candidates: readonly Candidate[], existing: Existing): { kept: Candidate[]; duplicate: number } {
  const have = new Set([...existing.interests.map((v) => `interests:${v}`), ...existing.activityPrefs.map((v) => `activity_prefs:${v}`)]);
  const kept = candidates.filter((c) => {
    const key = `${c.field}:${c.value}`;
    return !have.has(key) && !existing.pending.has(key) && !existing.dislikes.has(c.value);
  });
  return { kept: kept.slice(0, MAX_SUGGESTIONS_PER_RUN), duplicate: candidates.length - kept.length };
}

export type DislikeCandidate = { value: string; label: string; tag: string | null; category: string | null };

/** "Less of this" cards from see-less topics, minus ones already kept or pending. */
export function dislikeCandidates(seeLess: readonly string[], existing: Existing): DislikeCandidate[] {
  const seen = new Set<string>();
  const result: DislikeCandidate[] = [];
  for (const label of seeLess) {
    const value = normalizeTag(label).slice(0, 64);
    if (!value || seen.has(value) || existing.dislikes.has(value) || existing.pending.has(`dislike:${value}`)) continue;
    seen.add(value);
    const entry = lookupLabel(label);
    result.push({ value, label: label.slice(0, 64), tag: entry?.tag ?? null, category: entry?.category ?? null });
  }
  return result;
}
