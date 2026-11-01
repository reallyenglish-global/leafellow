// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { createAnnotation, deserializeAnnotation, serializeAnnotation, type Annotation } from '../annotations.ts';
import { isEpubRangeCfi, MAX_HIGHLIGHT_QUOTE_LENGTH, MAX_HREF_LENGTH } from '../reader/highlight-selection.ts';
import { isDocumentIdentity } from './reading-position.ts';

export type SavedHighlight = { id: string; createdAt: number; annotation: Annotation };
export type HighlightInput = { documentId: string; exact: string; cfi: string; href: string; createdAt: number };

export interface HighlightDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number)[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
}

export const MAX_HIGHLIGHTS_PER_SOURCE = 500;
// Matches the annotation core's serialized record limit (UTF-16 code units).
const MAX_RECORD_LENGTH = 65536;

// Additive table: shares PRAGMA user_version 1 with the reading-position schema.
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS saved_highlights (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  cfi TEXT NOT NULL,
  record TEXT NOT NULL CHECK (length(record) <= ${MAX_RECORD_LENGTH}),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (document_id, cfi)
)`;
const CREATE_INDEX = `CREATE INDEX IF NOT EXISTS saved_highlights_by_document
  ON saved_highlights (document_id, created_at, id)`;

type Row = { id: string; document_id: string; cfi: string; record: string; created_at: number };
const SELECT_COLUMNS = 'SELECT id, document_id, cfi, record, created_at FROM saved_highlights';

export async function initializeSavedHighlights(db: HighlightDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionRow?.user_version ?? 0;
  if (!Number.isSafeInteger(version) || version < 0 || version > 1) {
    throw new Error('Unsupported saved-highlight schema version');
  }
  await db.execAsync(CREATE_TABLE);
  await db.execAsync(CREATE_INDEX);
}

/** Stable ID derived from the exact source hash and engine range locator. */
export function highlightId(documentId: string, cfi: string): string {
  return `hl_${bytesToHex(sha256(utf8ToBytes(`${documentId}\u0000${cfi}`))).slice(0, 32)}`;
}

function createHighlightRecord(input: unknown): { annotation: Annotation; createdAt: number; record: string } {
  if (!input || typeof input !== 'object') throw new TypeError('Invalid highlight');
  const candidate = input as Partial<HighlightInput>;
  if (!isDocumentIdentity(candidate.documentId) ||
      typeof candidate.exact !== 'string' || candidate.exact.trim().length === 0 ||
      !isEpubRangeCfi(candidate.cfi) ||
      typeof candidate.href !== 'string' || candidate.href.trim().length === 0 ||
      candidate.href.length > MAX_HREF_LENGTH || /[\u0000-\u001f]/.test(candidate.href) ||
      !Number.isSafeInteger(candidate.createdAt) || candidate.createdAt! < 0) {
    throw new TypeError('Invalid highlight');
  }
  if (candidate.exact.length > MAX_HIGHLIGHT_QUOTE_LENGTH) throw new RangeError('Highlight too long');
  const annotation = createAnnotation({
    id: highlightId(candidate.documentId, candidate.cfi),
    documentId: candidate.documentId,
    quote: { exact: candidate.exact, prefix: '', suffix: '' },
    anchor: { format: 'epub', href: candidate.href, cfi: candidate.cfi },
  });
  return { annotation, createdAt: candidate.createdAt!, record: serializeAnnotation(annotation) };
}

function readRow(row: Row, documentId: string): SavedHighlight {
  if (!row || row.document_id !== documentId || typeof row.id !== 'string' ||
      !Number.isSafeInteger(row.created_at) || row.created_at < 0) {
    throw new TypeError('Invalid stored highlight');
  }
  const annotation = deserializeAnnotation(row.record, documentId);
  if (annotation.id !== row.id || annotation.anchor.format !== 'epub' ||
      annotation.anchor.cfi !== row.cfi || !isEpubRangeCfi(annotation.anchor.cfi) ||
      annotation.id !== highlightId(documentId, annotation.anchor.cfi) ||
      annotation.quote.exact.length > MAX_HIGHLIGHT_QUOTE_LENGTH) {
    throw new TypeError('Invalid stored highlight');
  }
  return { id: row.id, createdAt: row.created_at, annotation };
}

/**
 * The write statement was sent, so it may have committed, but the result could not be confirmed.
 * Callers must not report "not saved" / "still saved"; they should re-read the list instead.
 */
export class HighlightOutcomeUnknownError extends Error {
  readonly operation: 'save' | 'delete';
  constructor(operation: 'save' | 'delete', options?: { cause?: unknown }) {
    super(`Highlight ${operation} outcome could not be confirmed`, options);
    this.name = 'HighlightOutcomeUnknownError';
    this.operation = operation;
  }
}

async function afterWrite<T>(operation: 'save' | 'delete', step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (cause) {
    throw new HighlightOutcomeUnknownError(operation, { cause });
  }
}

/** Saves once per (source, range); a repeated save returns the original record unchanged. */
export async function saveHighlightWithStatus(
  db: HighlightDatabase,
  input: unknown,
): Promise<{ highlight: SavedHighlight; created: boolean }> {
  const { annotation, createdAt, record } = createHighlightRecord(input);
  const documentId = annotation.documentId;
  const cfi = (annotation.anchor as { cfi: string }).cfi;
  const existing = await db.getFirstAsync<Row>(`${SELECT_COLUMNS} WHERE document_id = ? AND cfi = ?`, documentId, cfi);
  if (existing) return { highlight: readRow(existing, documentId), created: false };
  const count = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM saved_highlights WHERE document_id = ?', documentId);
  if ((count?.total ?? 0) >= MAX_HIGHLIGHTS_PER_SOURCE) throw new RangeError('Highlight limit reached for this book');
  // From here the INSERT may have committed even if the native call or the re-read fails.
  return afterWrite('save', async () => {
    await db.runAsync(
      `INSERT INTO saved_highlights (id, document_id, cfi, record, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id, cfi) DO NOTHING`,
      annotation.id, documentId, cfi, record, createdAt,
    );
    const stored = await db.getFirstAsync<Row>(`${SELECT_COLUMNS} WHERE document_id = ? AND cfi = ?`, documentId, cfi);
    if (!stored) throw new Error('Highlight was not stored');
    return { highlight: readRow(stored, documentId), created: true };
  });
}

export async function saveHighlight(db: HighlightDatabase, input: unknown): Promise<SavedHighlight> {
  return (await saveHighlightWithStatus(db, input)).highlight;
}

/** Lists one source's highlights in creation order; unreadable rows are counted, never returned. */
export async function listSavedHighlights(
  db: HighlightDatabase,
  documentId: string,
): Promise<{ highlights: SavedHighlight[]; unreadable: number }> {
  if (!isDocumentIdentity(documentId)) throw new TypeError('Invalid document identity');
  const rows = await db.getAllAsync<Row>(
    `${SELECT_COLUMNS} WHERE document_id = ? ORDER BY created_at ASC, id ASC LIMIT ?`,
    documentId, MAX_HIGHLIGHTS_PER_SOURCE,
  );
  const highlights: SavedHighlight[] = [];
  let unreadable = 0;
  for (const row of rows) {
    try {
      highlights.push(readRow(row, documentId));
    } catch {
      unreadable += 1;
    }
  }
  return { highlights, unreadable };
}

/** Deletes only the named highlight within the named source. Resolves whether a row was removed. */
export async function deleteSavedHighlight(db: HighlightDatabase, documentId: string, id: string): Promise<boolean> {
  if (!isDocumentIdentity(documentId)) throw new TypeError('Invalid document identity');
  if (typeof id !== 'string' || !/^hl_[a-f0-9]{32}$/.test(id)) throw new TypeError('Invalid highlight id');
  const select = 'SELECT id FROM saved_highlights WHERE document_id = ? AND id = ?';
  if (!await db.getFirstAsync<{ id: string }>(select, documentId, id)) return false;
  return afterWrite('delete', async () => {
    await db.runAsync('DELETE FROM saved_highlights WHERE document_id = ? AND id = ?', documentId, id);
    if (await db.getFirstAsync<{ id: string }>(select, documentId, id)) throw new Error('Highlight was not deleted');
    return true;
  });
}
