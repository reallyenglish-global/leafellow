// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeSqliteDatabase } from './sqlite-adapter.mjs';
import { initializeSavedHighlights, listSavedHighlights } from '../src/storage/saved-highlights.ts';
import { createHighlightSession } from '../src/storage/highlight-session.ts';
import { createSerialWriter } from '../src/storage/serial-writes.ts';

const bookA = `sha256:${'a'.repeat(64)}`;
const bookB = `sha256:${'b'.repeat(64)}`;
const input = (patch = {}) => ({ documentId: bookA, exact: 'text', cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:4)', href: 'c1.xhtml', createdAt: 1, ...patch });

async function openDb(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'leafellow-session-'));
  const db = new NodeSqliteDatabase(path.join(dir, 'leafellow.db'));
  await initializeSavedHighlights(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}

test('a list read queued behind a save sees the saved row, and only the newest load applies', async t => {
  const db = await openDb(t);
  const session = createHighlightSession(db, bookA, createSerialWriter());
  const firstLoad = session.load();
  const save = session.save(input());
  const retry = session.load();
  assert.equal((await firstLoad).status, 'stale', 'an older load never overwrites newer state');
  assert.equal((await save).created, true);
  const latest = await retry;
  assert.equal(latest.status, 'ready');
  assert.deepEqual(latest.highlights.map(h => h.annotation.quote.exact), ['text']);
});

test('a retry queued behind a delete cannot resurrect the deleted row', async t => {
  const db = await openDb(t);
  const session = createHighlightSession(db, bookA, createSerialWriter());
  const saved = (await session.save(input())).highlight;
  const removing = session.remove(saved.id);
  const retry = session.load();
  assert.equal(await removing, true);
  assert.deepEqual((await retry).highlights, []);
  assert.deepEqual((await listSavedHighlights(db, bookA)).highlights, []);
});

test('reads wait for an in-flight write instead of racing it', async t => {
  const db = await openDb(t);
  const writer = createSerialWriter();
  const session = createHighlightSession(db, bookA, writer);
  let release;
  const blocker = writer.run(() => new Promise(resolve => { release = resolve; }));
  let loaded = false;
  const load = session.load().then(result => { loaded = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(loaded, false, 'the read is queued behind the write');
  release();
  await blocker;
  assert.equal((await load).status, 'ready');
});

test('a session is scoped to one book and refuses work after close', async t => {
  const db = await openDb(t);
  const writer = createSerialWriter();
  const session = createHighlightSession(db, bookA, writer);
  await assert.rejects(() => session.save(input({ documentId: bookB })), /another book/);
  await writer.close();
  assert.deepEqual(await session.load(), { status: 'error' });
});

test('a failed read reports error rather than an empty list', async t => {
  const db = await openDb(t);
  await db.execAsync('DROP TABLE saved_highlights');
  const session = createHighlightSession(db, bookA, createSerialWriter());
  assert.deepEqual(await session.load(), { status: 'error' });
});
