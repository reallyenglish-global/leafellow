// SPDX-License-Identifier: Apache-2.0
// User-directed export of one source's private highlights to a JSON file. No Expo imports: the
// destination folder is an injected adapter so the flow can be tested without a device.
import { MAX_HIGHLIGHTS_PER_SOURCE, validateSavedHighlight, type SavedHighlight } from './saved-highlights.ts';
import { isDocumentIdentity } from './reading-position.ts';

export const HIGHLIGHT_EXPORT_FORMAT = 'leafellow.highlights';
export const HIGHLIGHT_EXPORT_VERSION = 1;
export const HIGHLIGHT_EXPORT_MIME = 'application/json';
// UTF-16 code units of the whole file; 500 maximal records fit comfortably below this.
const MAX_EXPORT_LENGTH = 8 * 1024 * 1024;
const ENVELOPE_KEYS = ['format', 'formatVersion', 'source', 'count', 'highlights'];
const ENTRY_KEYS = ['id', 'createdAt', 'annotation'];

function byCreation(a: SavedHighlight, b: SavedHighlight): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function validateAll(documentId: string, values: readonly unknown[]): SavedHighlight[] {
  if (!isDocumentIdentity(documentId)) throw new TypeError('Invalid document identity');
  if (!Array.isArray(values)) throw new TypeError('Invalid highlight list');
  if (values.length > MAX_HIGHLIGHTS_PER_SOURCE) throw new RangeError('Too many highlights to export');
  const highlights = values.map(value => validateSavedHighlight(value, documentId)).sort(byCreation);
  const ids = new Set(highlights.map(h => h.id));
  if (ids.size !== highlights.length) throw new TypeError('Duplicate highlight in export');
  return highlights;
}

/**
 * Deterministic JSON for one source: same highlights in any order give identical text. Every record
 * is re-validated; one bad record fails the export rather than being dropped. Inputs are not mutated.
 */
export function serializeHighlightExport(documentId: string, values: readonly unknown[]): string {
  const highlights = validateAll(documentId, values);
  const text = `${JSON.stringify({
    format: HIGHLIGHT_EXPORT_FORMAT,
    formatVersion: HIGHLIGHT_EXPORT_VERSION,
    source: { documentId },
    count: highlights.length,
    highlights: highlights.map(h => ({ id: h.id, createdAt: h.createdAt, annotation: h.annotation })),
  }, null, 2)}\n`;
  if (text.length > MAX_EXPORT_LENGTH) throw new RangeError('Export size limit');
  return text;
}

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Strict reader for tests and verification; Leafellow has no import of this format. */
export function parseHighlightExport(text: string, expectedDocumentId: string): SavedHighlight[] {
  if (typeof text !== 'string' || text.length > MAX_EXPORT_LENGTH) throw new RangeError('Export size limit');
  const parsed: unknown = JSON.parse(text);
  if (!hasExactKeys(parsed, ENVELOPE_KEYS) || parsed.format !== HIGHLIGHT_EXPORT_FORMAT ||
      parsed.formatVersion !== HIGHLIGHT_EXPORT_VERSION || !hasExactKeys(parsed.source, ['documentId']) ||
      parsed.source.documentId !== expectedDocumentId || !Array.isArray(parsed.highlights) ||
      parsed.count !== parsed.highlights.length ||
      !parsed.highlights.every(entry => hasExactKeys(entry, ENTRY_KEYS))) {
    throw new TypeError('Unsupported highlight export');
  }
  const highlights = validateAll(expectedDocumentId, parsed.highlights);
  if (serializeHighlightExport(expectedDocumentId, highlights) !== text) throw new TypeError('Non-canonical highlight export');
  return highlights;
}

/** `leafellow-highlights-<12 hex of source hash>-<unique id>.json`; never a title or path. */
export function exportFileName(documentId: string, uniqueId: string): string {
  if (!isDocumentIdentity(documentId)) throw new TypeError('Invalid document identity');
  if (typeof uniqueId !== 'string' || !/^[a-z0-9]{8,40}$/.test(uniqueId)) throw new TypeError('Invalid export id');
  return `leafellow-highlights-${documentId.slice('sha256:'.length, 'sha256:'.length + 12)}-${uniqueId}.json`;
}

export type ExportFileHandle = {
  /** Current size in bytes; a freshly created file is 0. */
  size(): Promise<number>;
  write(text: string): Promise<void>;
  read(): Promise<string>;
  remove(): Promise<void>;
};
export type ExportFolder = {
  has(name: string): Promise<boolean>;
  create(name: string): Promise<ExportFileHandle>;
};
export type ExportDestination = {
  /** Resolves null when the user dismissed the picker. */
  pickFolder(): Promise<ExportFolder | null>;
};

export type ExportOutcome =
  | { status: 'written'; fileName: string }
  | { status: 'cancelled' }
  /** The picker failed for a reason that is not a known cancellation; nothing was created. */
  | { status: 'not-completed' }
  | { status: 'failed'; stage: 'exists' | 'create' | 'write' | 'verify'; cleanup: 'none' | 'removed' | 'failed' };

/**
 * One attempt, one new file, no retries. Success is reported only after the written text reads back
 * identically. Cleanup only ever removes the handle this attempt created.
 */
export async function runHighlightExport(
  { text, fileName, destination }: { text: string; fileName: string; destination: ExportDestination },
): Promise<ExportOutcome> {
  let folder: ExportFolder | null;
  try {
    folder = await destination.pickFolder();
  } catch {
    return { status: 'not-completed' };
  }
  if (!folder) return { status: 'cancelled' };
  let handle: ExportFileHandle;
  try {
    if (await folder.has(fileName)) return { status: 'failed', stage: 'exists', cleanup: 'none' };
    handle = await folder.create(fileName);
    // A provider that returns an existing non-empty file is never written to or removed.
    if (await handle.size() !== 0) return { status: 'failed', stage: 'exists', cleanup: 'none' };
  } catch {
    return { status: 'failed', stage: 'create', cleanup: 'none' };
  }
  const cleanUp = async (stage: 'write' | 'verify'): Promise<ExportOutcome> => {
    try {
      await handle.remove();
      return { status: 'failed', stage, cleanup: 'removed' };
    } catch {
      return { status: 'failed', stage, cleanup: 'failed' };
    }
  };
  try {
    await handle.write(text);
  } catch {
    return cleanUp('write');
  }
  try {
    if (await handle.read() !== text) return cleanUp('verify');
  } catch {
    return cleanUp('verify');
  }
  return { status: 'written', fileName };
}

export type ExportToken = { readonly id: number };
export type ExportGuard = {
  /** Synchronous: returns null if an export is already in progress. */
  tryAcquire(): ExportToken | null;
  release(token: ExportToken): void;
  /** Runs work under an acquired token and releases it once the work settles. */
  hold<T>(token: ExportToken, work: () => Promise<T>): Promise<T>;
  isBusy(): boolean;
};

export function createExportGuard(): ExportGuard {
  let current: ExportToken | null = null;
  let next = 0;
  const release = (token: ExportToken) => {
    if (current === null || token !== current) throw new Error('Token is not the current export');
    current = null;
  };
  return {
    tryAcquire() {
      if (current) return null;
      current = { id: ++next };
      return current;
    },
    release,
    async hold(token, work) {
      if (token !== current) throw new Error('Token is not the current export');
      try {
        return await work();
      } finally {
        release(token);
      }
    },
    isBusy: () => current !== null,
  };
}
