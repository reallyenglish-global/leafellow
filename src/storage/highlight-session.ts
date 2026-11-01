// SPDX-License-Identifier: Apache-2.0
import {
  deleteSavedHighlight,
  listSavedHighlights,
  readHighlightsForExport,
  saveHighlightWithStatus,
  type HighlightDatabase,
  type HighlightInput,
  type SavedHighlight,
} from './saved-highlights.ts';
import type { SerialWriter } from './serial-writes.ts';

export type HighlightLoad =
  | { status: 'ready'; highlights: SavedHighlight[]; unreadable: number }
  | { status: 'error' }
  /** A newer load was requested; this result must not replace newer state. */
  | { status: 'stale' };

export type HighlightSession = {
  load(): Promise<HighlightLoad>;
  save(input: HighlightInput): Promise<{ highlight: SavedHighlight; created: boolean }>;
  remove(id: string): Promise<boolean>;
  /** Every validated row after all queued work; rejects if any row is unreadable. */
  exportSnapshot(): Promise<SavedHighlight[]>;
};

/**
 * One open book's highlight storage. Reads go through the same serial writer as saves, deletes
 * and reading-position writes, so a list read always reflects every mutation queued before it.
 */
export function createHighlightSession(db: HighlightDatabase, documentId: string, writer: SerialWriter): HighlightSession {
  let generation = 0;
  return {
    async load() {
      const requested = ++generation;
      try {
        const result = await writer.run(() => listSavedHighlights(db, documentId));
        if (requested !== generation) return { status: 'stale' };
        return { status: 'ready', highlights: result.highlights, unreadable: result.unreadable };
      } catch {
        return requested === generation ? { status: 'error' } : { status: 'stale' };
      }
    },
    save(input) {
      if (input.documentId !== documentId) return Promise.reject(new TypeError('Highlight belongs to another book'));
      return writer.run(() => saveHighlightWithStatus(db, input));
    },
    remove(id) {
      return writer.run(() => deleteSavedHighlight(db, documentId, id));
    },
    exportSnapshot() {
      return writer.run(() => readHighlightsForExport(db, documentId));
    },
  };
}
