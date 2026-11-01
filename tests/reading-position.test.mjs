// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLastReadingPosition,
  initializeLastReadingPosition,
  loadLastReadingPosition,
  saveLastReadingPosition,
} from '../src/storage/reading-position.ts';

const validPosition = () => ({
  documentId: `sha256:${'a'.repeat(64)}`,
  cfi: 'epubcfi(/6/4!/4/2/4/1:0)',
  progress: 0.42,
  updatedAt: 1_800_000_000_000,
});

class MemoryDatabase {
  schema = '';
  userVersion = 0;
  row = null;
  calls = [];

  async execAsync(sql) {
    this.schema += `${sql}\n`;
    if (sql.includes('PRAGMA user_version = 1')) this.userVersion = 1;
  }
  async runAsync(sql, ...params) {
    this.calls.push({ sql, params });
    if (sql.includes('INSERT INTO last_reading_position')) {
      const [documentId, cfi, progress, updatedAt] = params;
      this.row = { document_id: documentId, cfi, progress, updated_at: updatedAt };
    } else if (sql.includes('DELETE FROM last_reading_position')) {
      this.row = null;
    }
    return { changes: 1 };
  }
  async getFirstAsync(sql, ...params) {
    this.calls.push({ sql, params });
    if (sql === 'PRAGMA user_version') return { user_version: this.userVersion };
    return this.row?.document_id === params[1] ? this.row : null;
  }
}

test('creates one bounded local reading-position table', async () => {
  const db = new MemoryDatabase();
  await initializeLastReadingPosition(db);
  assert.equal(db.userVersion, 1);
  assert.match(db.schema, /CREATE TABLE IF NOT EXISTS last_reading_position/);
  assert.match(db.schema, /CHECK\s*\(\s*id\s*=\s*1\s*\)/);
  assert.match(db.schema, /CHECK\s*\(\s*progress\s*>=\s*0\s+AND\s+progress\s*<=\s*1\s*\)/);
});

test('refuses a position database created by a newer app', async () => {
  const db = new MemoryDatabase();
  db.userVersion = 2;
  await assert.rejects(
    () => initializeLastReadingPosition(db),
    /Unsupported reading-position schema version/,
  );
});

test('round-trips only a position for the exact source through bound parameters', async () => {
  const db = new MemoryDatabase();
  await initializeLastReadingPosition(db);
  const input = validPosition();
  await saveLastReadingPosition(db, input);
  input.cfi = 'mutated after save';
  const restored = await loadLastReadingPosition(db, validPosition().documentId);
  assert.deepEqual(restored, validPosition());
  assert.ok(db.calls.some(call => call.sql.includes('ON CONFLICT')));
  assert.ok(db.calls.every(call => !call.sql.includes(validPosition().documentId)));
  assert.ok(db.calls.every(call => !call.sql.includes(validPosition().cfi)));
  assert.deepEqual(await loadLastReadingPosition(db, `sha256:${'b'.repeat(64)}`), null);
});

test('clears the single saved position without touching source files', async () => {
  const db = new MemoryDatabase();
  await initializeLastReadingPosition(db);
  await saveLastReadingPosition(db, validPosition());
  await clearLastReadingPosition(db);
  assert.equal(await loadLastReadingPosition(db, validPosition().documentId), null);
  assert.ok(db.calls.some(call => call.sql.includes('DELETE FROM last_reading_position')));
});

test('rejects invalid identities, EPUB locations, progress and timestamps', async () => {
  const db = new MemoryDatabase();
  const base = validPosition();
  for (const patch of [
    { documentId: 'not-a-hash' },
    { cfi: '' },
    { cfi: 'epubcfi(broken' },
    { progress: -0.01 },
    { progress: 1.01 },
    { progress: Number.NaN },
    { updatedAt: -1 },
    { updatedAt: Number.POSITIVE_INFINITY },
  ]) {
    await assert.rejects(() => saveLastReadingPosition(db, { ...base, ...patch }), /Invalid reading position/);
  }
  await assert.rejects(() => loadLastReadingPosition(db, 'wrong-source'), /Invalid document identity/);
});
