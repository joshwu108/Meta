/// <reference lib="webworker" />
import { extractLabels, MAX_FILE_BYTES, mergeLabels, type ExtractedLabels } from './export-labels';

/** Parses the chosen export JSON files off the main thread and posts back only the labels. */
self.onmessage = async (event: MessageEvent<File[]>) => {
  const parts: ExtractedLabels[] = [];
  for (const file of event.data) {
    if (file.size > MAX_FILE_BYTES) continue;
    try {
      parts.push(extractLabels(JSON.parse(await file.text())));
    } catch {
      // Not JSON (e.g. the HTML export): skip it.
    }
  }
  (self as unknown as Worker).postMessage(mergeLabels(parts));
};
