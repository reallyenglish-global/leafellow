// SPDX-License-Identifier: Apache-2.0
export type ReadingPosition = {
  documentId: string;
  cfi: string;
  progress: number;
  updatedAt: number;
};

export interface PositionDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number)[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS last_reading_position (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  document_id TEXT NOT NULL,
  cfi TEXT NOT NULL,
  progress REAL NOT NULL CHECK (progress >= 0 AND progress <= 1),
  updated_at INTEGER NOT NULL
)`;

const UPSERT = `INSERT INTO last_reading_position (id, document_id, cfi, progress, updated_at)
  VALUES (1, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    document_id = excluded.document_id,
    cfi = excluded.cfi,
    progress = excluded.progress,
    updated_at = excluded.updated_at`;

export async function initializeLastReadingPosition(db: PositionDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionRow?.user_version ?? 0;
  if (!Number.isSafeInteger(version) || version < 0 || version > 1) {
    throw new Error('Unsupported reading-position schema version');
  }
  await db.execAsync(CREATE_TABLE);
  if (version === 0) await db.execAsync('PRAGMA user_version = 1');
}

export function createReadingPosition(input: unknown): ReadingPosition {
  if (!input || typeof input !== 'object') throw new TypeError('Invalid reading position');
  const candidate = input as Partial<ReadingPosition>;
  if (!isDocumentIdentity(candidate.documentId) ||
      typeof candidate.cfi !== 'string' || !/^epubcfi\(.+\)$/.test(candidate.cfi) ||
      typeof candidate.progress !== 'number' || !Number.isFinite(candidate.progress) ||
      candidate.progress < 0 || candidate.progress > 1 ||
      !Number.isSafeInteger(candidate.updatedAt) || candidate.updatedAt! < 0) {
    throw new TypeError('Invalid reading position');
  }
  return {
    documentId: candidate.documentId,
    cfi: candidate.cfi,
    progress: candidate.progress,
    updatedAt: candidate.updatedAt!,
  };
}

export function isDocumentIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

export async function saveLastReadingPosition(db: PositionDatabase, input: unknown): Promise<void> {
  const position = createReadingPosition(input);
  await db.runAsync(UPSERT, position.documentId, position.cfi, position.progress, position.updatedAt);
}

export async function loadLastReadingPosition(
  db: PositionDatabase,
  documentId: string,
): Promise<ReadingPosition | null> {
  if (!isDocumentIdentity(documentId)) throw new TypeError('Invalid document identity');
  const row = await db.getFirstAsync<{
    document_id: string;
    cfi: string;
    progress: number;
    updated_at: number;
  }>(
    'SELECT document_id, cfi, progress, updated_at FROM last_reading_position WHERE id = ? AND document_id = ?',
    1,
    documentId,
  );
  if (!row) return null;
  const position = createReadingPosition({
    documentId: row.document_id,
    cfi: row.cfi,
    progress: row.progress,
    updatedAt: row.updated_at,
  });
  if (position.documentId !== documentId) throw new TypeError('Invalid stored reading position');
  return position;
}

export async function clearLastReadingPosition(db: PositionDatabase): Promise<void> {
  await db.runAsync('DELETE FROM last_reading_position WHERE id = 1');
}
