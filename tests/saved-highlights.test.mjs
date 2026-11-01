// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeSqliteDatabase } from './sqlite-adapter.mjs';
import {
  HighlightOutcomeUnknownError,
  deleteSavedHighlight,
  initializeSavedHighlights,
  listSavedHighlights,
  saveHighlight,
  saveHighlightWithStatus,
} from '../src/storage/saved-highlights.ts';
import {
  initializeLastReadingPosition,
  loadLastReadingPosition,
  saveLastReadingPosition,
} from '../src/storage/reading-position.ts';

const bookA = `sha256:${'a'.repeat(64)}`;
const bookB = `sha256:${'b'.repeat(64)}`;
const rangeCfi = 'epubcfi(/6/4!/4/2,/1:0,/1:24)';

function tempDatabasePath(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'leafellow-highlights-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'leafellow.db');
}

async function openDatabase(filename) {
  const db = new NodeSqliteDatabase(filename);
  await initializeLastReadingPosition(db);
  await initializeSavedHighlights(db);
  return db;
}

const selection = (patch = {}) => ({
  documentId: bookA,
  exact: '  Alice was beginning\nto get very tired  ',
  cfi: rangeCfi,
  href: 'chapter-1.xhtml',
  createdAt: 1_800_000_000_000,
  ...patch,
});

test('a saved highlight survives closing and reopening the real SQLite database', async t => {
  const filename = tempDatabasePath(t);
  const first = await openDatabase(filename);
  const saved = await saveHighlight(first, selection());
  first.close();

  const reopened = await openDatabase(filename);
  t.after(() => reopened.close());
  const { highlights, unreadable } = await listSavedHighlights(reopened, bookA);
  assert.equal(unreadable, 0);
  assert.deepEqual(highlights, [saved]);
  assert.equal(saved.annotation.quote.exact, selection().exact, 'exact selected text is preserved byte for byte');
  assert.deepEqual(saved.annotation.anchor, { format: 'epub', href: 'chapter-1.xhtml', cfi: rangeCfi });
  assert.equal(saved.annotation.visibility, 'private');
  assert.equal(saved.annotation.documentId, bookA);
  assert.deepEqual((await listSavedHighlights(reopened, bookB)).highlights, []);
});

test('rejects invalid, stale-shaped or oversized selections without storing anything', async t => {
  const db = await openDatabase(tempDatabasePath(t));
  t.after(() => db.close());
  for (const patch of [
    { documentId: 'not-a-hash' }, { exact: '   ' }, { exact: 7 }, { href: '' }, { href: 'a\nb' },
    { cfi: 'epubcfi(/6/4!/4/2/1:0)' }, { cfi: "epubcfi(/6/4!/4/2,/1:0,/1:2');alert(1)//)" },
    { cfi: 'epubcfi(/6/4,/1:0)' }, { cfi: `epubcfi(/6/4!/4/2,/1:0,/1:${'9'.repeat(1100)})` }, { createdAt: -1 },
  ]) {
    await assert.rejects(() => saveHighlight(db, selection(patch)), /Invalid highlight/, JSON.stringify(patch).slice(0, 80));
  }
  await assert.rejects(() => saveHighlight(db, selection({ exact: 'x'.repeat(4001) })), /Highlight too long/);
  assert.deepEqual(await listSavedHighlights(db, bookA), { highlights: [], unreadable: 0 });
});

test('counts malformed or foreign stored rows as unreadable without exposing their content', async t => {
  const db = await openDatabase(tempDatabasePath(t));
  t.after(() => db.close());
  const good = await saveHighlight(db, selection());
  const insert = 'INSERT INTO saved_highlights (id, document_id, cfi, record, created_at) VALUES (?, ?, ?, ?, ?)';
  await db.runAsync(insert, 'hl_bad_json', bookA, 'epubcfi(/6/2,/1:0,/1:1)', '{"secret": "raw', 1);
  const foreign = JSON.stringify({ ...good.annotation, documentId: bookB });
  await db.runAsync(insert, 'hl_foreign', bookA, 'epubcfi(/6/2,/1:0,/1:2)', foreign, 2);
  const moved = JSON.stringify({ ...good.annotation, anchor: { ...good.annotation.anchor, cfi: 'epubcfi(/6/8,/1:0,/1:3)' } });
  await db.runAsync(insert, `hl_${'0'.repeat(32)}`, bookA, 'epubcfi(/6/8,/1:0,/1:3)', moved, 3);
  const result = await listSavedHighlights(db, bookA);
  assert.deepEqual(result, { highlights: [good], unreadable: 3 });
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('adds highlights to an existing version-1 position database without erasing positions', async t => {
  const filename = tempDatabasePath(t);
  const legacy = new NodeSqliteDatabase(filename);
  await initializeLastReadingPosition(legacy);
  const position = { documentId: bookA, cfi: 'epubcfi(/6/4!/4/2/1:0)', progress: 0.5, updatedAt: 7 };
  await saveLastReadingPosition(legacy, position);
  legacy.close();

  const upgraded = await openDatabase(filename);
  t.after(() => upgraded.close());
  assert.deepEqual(await loadLastReadingPosition(upgraded, bookA), position);
  assert.equal((await upgraded.getFirstAsync('PRAGMA user_version')).user_version, 1);
  await initializeSavedHighlights(upgraded);
  await initializeLastReadingPosition(upgraded);
  await upgraded.execAsync('PRAGMA user_version = 2');
  await assert.rejects(() => initializeSavedHighlights(upgraded), /Unsupported saved-highlight schema version/);
});

test('surfaces database failures instead of reporting a highlight as saved', async t => {
  const db = await openDatabase(tempDatabasePath(t));
  await db.execAsync('DROP TABLE saved_highlights');
  await assert.rejects(() => saveHighlight(db, selection()));
  await assert.rejects(() => listSavedHighlights(db, bookA));
  db.close();
  await assert.rejects(() => saveHighlight(db, selection()));
  t.after(() => undefined);
});

test('repeated saves are idempotent, ordered deterministically and deleted only within their source', async t => {
  const db = await openDatabase(tempDatabasePath(t));
  t.after(() => db.close());
  await saveLastReadingPosition(db, { documentId: bookA, cfi: 'epubcfi(/6/4!/4/2/1:0)', progress: 0.3, updatedAt: 1 });
  const later = await saveHighlight(db, selection({ cfi: 'epubcfi(/6/4!/4/8,/1:0,/1:5)', exact: 'later', createdAt: 20 }));
  const first = await saveHighlight(db, selection({ createdAt: 10 }));
  const again = await saveHighlight(db, selection({ createdAt: 99, exact: 'different text for the same range' }));
  assert.deepEqual(again, first, 'a duplicate save returns the original record unchanged');
  const other = await saveHighlight(db, selection({ documentId: bookB, createdAt: 5 }));
  assert.notEqual(other.id, first.id, 'the same range in another source is a different highlight');
  assert.deepEqual((await listSavedHighlights(db, bookA)).highlights.map(h => h.id), [first.id, later.id]);

  assert.equal(await deleteSavedHighlight(db, bookA, other.id), false, 'another source highlight is not deleted through source A');
  assert.deepEqual((await listSavedHighlights(db, bookB)).highlights, [other]);
  assert.equal(await deleteSavedHighlight(db, bookA, first.id), true);
  assert.deepEqual((await listSavedHighlights(db, bookA)).highlights, [later]);
  assert.equal((await loadLastReadingPosition(db, bookA))?.progress, 0.3, 'reading position is untouched');
  assert.ok(db.statements.every(sql => !sql.includes(bookA) && !sql.includes('Alice')), 'values are bound, never interpolated');
});

// Fault injection: the write commits, then the follow-up read fails or returns a row readRow rejects.
function failReadsAfterWrite(db, failure) {
  let wrote = false;
  return {
    execAsync: sql => db.execAsync(sql),
    runAsync: async (sql, ...params) => { const result = await db.runAsync(sql, ...params); wrote = true; return result; },
    getFirstAsync: async (sql, ...params) => {
      if (!wrote) return db.getFirstAsync(sql, ...params);
      if (failure === 'corrupt') return { ...(await db.getFirstAsync(sql, ...params)), record: '{"broken' };
      throw new Error('database is locked');
    },
    getAllAsync: (sql, ...params) => db.getAllAsync(sql, ...params),
  };
}

test('a read failure after the save commits reports an uncertain outcome, never "not saved"', async t => {
  const filename = tempDatabasePath(t);
  const db = await openDatabase(filename);
  for (const failure of ['throw', 'corrupt']) {
    const cfi = failure === 'throw' ? rangeCfi : 'epubcfi(/6/4!/4/8,/1:0,/1:5)';
    await assert.rejects(() => saveHighlight(failReadsAfterWrite(db, failure), selection({ cfi })), error => {
      assert.ok(error instanceof HighlightOutcomeUnknownError, failure);
      assert.equal(error.operation, 'save');
      return true;
    });
  }
  db.close();
  const reopened = await openDatabase(filename);
  t.after(() => reopened.close());
  assert.equal((await listSavedHighlights(reopened, bookA)).highlights.length, 2, 'both rows were in fact committed');
});

test('a read failure after the delete commits reports an uncertain outcome, never "still saved"', async t => {
  const db = await openDatabase(tempDatabasePath(t));
  t.after(() => db.close());
  const saved = await saveHighlight(db, selection());
  await assert.rejects(() => deleteSavedHighlight(failReadsAfterWrite(db), bookA, saved.id), error => {
    assert.ok(error instanceof HighlightOutcomeUnknownError);
    assert.equal(error.operation, 'delete');
    return true;
  });
  assert.deepEqual((await listSavedHighlights(db, bookA)).highlights, [], 'the row was in fact deleted');
});

test('failures before any write stay definite, and saves report whether they created a row', async t => {
  const db = await openDatabase(tempDatabasePath(t));
  t.after(() => db.close());
  const broken = { ...db, getFirstAsync: async () => { throw new Error('disk I/O error'); } };
  await assert.rejects(() => saveHighlight(broken, selection()), error => !(error instanceof HighlightOutcomeUnknownError));
  const first = await saveHighlightWithStatus(db, selection());
  const again = await saveHighlightWithStatus(db, selection({ createdAt: 99 }));
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.deepEqual(again.highlight, first.highlight);
});
