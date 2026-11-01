// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeSqliteDatabase } from './sqlite-adapter.mjs';
import {
  HighlightExportUnreadableError,
  MAX_HIGHLIGHTS_PER_SOURCE,
  initializeSavedHighlights,
  readHighlightsForExport,
  saveHighlight,
} from '../src/storage/saved-highlights.ts';
import {
  HIGHLIGHT_EXPORT_FORMAT,
  HIGHLIGHT_EXPORT_VERSION,
  createExportGuard,
  exportFileName,
  parseHighlightExport,
  runHighlightExport,
  serializeHighlightExport,
} from '../src/storage/highlight-export.ts';
import { createHighlightSession } from '../src/storage/highlight-session.ts';
import { createSerialWriter } from '../src/storage/serial-writes.ts';

const bookA = `sha256:${'a'.repeat(64)}`;
const bookB = `sha256:${'b'.repeat(64)}`;
const cfiAt = n => `epubcfi(/6/4!/4/2,/1:${n},/1:${n + 3})`;
const input = (patch = {}) => ({
  documentId: bookA, exact: '  Ünïcödé — 日本語 \u{1F600}\n"quotes" </script> ', cfi: cfiAt(0), href: 'c1.xhtml', createdAt: 5, ...patch,
});

async function openDb(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'leafellow-export-'));
  const filename = path.join(dir, 'leafellow.db');
  const db = new NodeSqliteDatabase(filename);
  await initializeSavedHighlights(db);
  t.after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });
  return { db, filename };
}

async function savedSet(t) {
  const { db } = await openDb(t);
  const later = await saveHighlight(db, input({ cfi: cfiAt(9), exact: 'later', createdAt: 9 }));
  const first = await saveHighlight(db, input());
  return { db, first, later };
}

test('serializer emits a stable versioned envelope with exact text, deterministic order and no extra fields', async t => {
  const { first, later } = await savedSet(t);
  const text = serializeHighlightExport(bookA, [later, first]);
  assert.equal(text, serializeHighlightExport(bookA, [first, later]), 'input order does not change output');
  assert.ok(text.endsWith('\n'));
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ['format', 'formatVersion', 'source', 'count', 'highlights']);
  assert.equal(parsed.format, HIGHLIGHT_EXPORT_FORMAT);
  assert.equal(parsed.formatVersion, HIGHLIGHT_EXPORT_VERSION);
  assert.deepEqual(parsed.source, { documentId: bookA });
  assert.equal(parsed.count, 2);
  assert.deepEqual(parsed.highlights.map(h => h.id), [first.id, later.id]);
  assert.equal(parsed.highlights[0].annotation.quote.exact, input().exact, 'exact Unicode and whitespace preserved');
  assert.equal(parsed.highlights[0].annotation.visibility, 'private');
  assert.deepEqual(parseHighlightExport(text, bookA), [first, later], 'round trip re-validates every annotation');
  assert.ok(!/file:|content:|\/data\//.test(text), 'no device paths');
});

test('serializer refuses wrong-source, tampered, duplicate or out-of-bounds records instead of dropping them', async t => {
  const { first, later } = await savedSet(t);
  const other = { ...first, annotation: { ...first.annotation, documentId: bookB } };
  const tampered = { ...first, annotation: { ...first.annotation, anchor: { ...first.annotation.anchor, cfi: cfiAt(40) } } };
  const pdf = { ...first, annotation: { ...first.annotation, anchor: { format: 'pdf', pageIndex: 0, rotation: 0, rects: [{ x: 0, y: 0, width: 1, height: 1 }] } } };
  const shared = { ...first, annotation: { ...first.annotation, visibility: 'shared' } };
  for (const bad of [other, tampered, pdf, shared, { ...first, createdAt: -1 }, null, 'x']) {
    assert.throws(() => serializeHighlightExport(bookA, [later, bad]), TypeError);
  }
  assert.throws(() => serializeHighlightExport(bookA, [first, first]), /Duplicate/);
  assert.throws(() => serializeHighlightExport('not-a-hash', []), TypeError);
  assert.throws(() => serializeHighlightExport(bookA, new Array(MAX_HIGHLIGHTS_PER_SOURCE + 1).fill(first)), RangeError);
  const noted = { ...first, annotation: { ...first.annotation, note: 'n'.repeat(70_000) } };
  assert.throws(() => serializeHighlightExport(bookA, [noted]), RangeError);
  assert.equal(first.annotation.quote.exact, input().exact, 'inputs are not mutated');
});

test('an empty export is a valid deterministic envelope', () => {
  const text = serializeHighlightExport(bookA, []);
  assert.deepEqual(JSON.parse(text).highlights, []);
  assert.deepEqual(parseHighlightExport(text, bookA), []);
});

test('parse rejects hostile or mismatched envelopes', async t => {
  const { first } = await savedSet(t);
  const good = JSON.parse(serializeHighlightExport(bookA, [first]));
  const variants = [
    'not json', '[]', JSON.stringify({ ...good, format: 'other' }), JSON.stringify({ ...good, formatVersion: 2 }),
    JSON.stringify({ ...good, count: 5 }), JSON.stringify({ ...good, extra: true }),
    JSON.stringify({ ...good, __proto__: null, source: { documentId: bookB } }),
    JSON.stringify({ ...good, highlights: [{ ...good.highlights[0], annotation: { ...good.highlights[0].annotation, documentId: bookB } }] }),
  ];
  for (const text of variants) assert.throws(() => parseHighlightExport(text, bookA), text.slice(0, 60));
  assert.throws(() => parseHighlightExport(serializeHighlightExport(bookA, [first]), bookB));
});

test('export file names are generated ASCII, never titles or paths', () => {
  const name = exportFileName(bookA, 'k3x9z0abcd12');
  assert.equal(name, 'leafellow-highlights-aaaaaaaaaaaa-k3x9z0abcd12.json');
  assert.match(name, /^[a-z0-9-]+\.json$/);
  for (const bad of ['../x', 'A B', '', 'é'.repeat(10), 'x'.repeat(41)]) assert.throws(() => exportFileName(bookA, bad), TypeError);
  assert.throws(() => exportFileName('My Book.epub', 'abcdefgh'), TypeError);
});

test('snapshot reads the real SQLite rows after close/reopen and fails closed on any unreadable row', async t => {
  const { db, filename } = await openDb(t);
  const a = await saveHighlight(db, input());
  await saveHighlight(db, input({ documentId: bookB }));
  db.close();
  const reopened = new NodeSqliteDatabase(filename);
  t.after(() => reopened.close());
  await initializeSavedHighlights(reopened);
  assert.deepEqual(await readHighlightsForExport(reopened, bookA), [a], 'only this source');
  await reopened.runAsync('INSERT INTO saved_highlights (id, document_id, cfi, record, created_at) VALUES (?, ?, ?, ?, ?)',
    'hl_corrupt', bookA, cfiAt(50), '{"broken', 7);
  await assert.rejects(() => readHighlightsForExport(reopened, bookA), error => {
    assert.ok(error instanceof HighlightExportUnreadableError);
    assert.equal(error.unreadable, 1);
    assert.ok(!error.message.includes('broken'));
    return true;
  });
});

test('session snapshot waits for every mutation queued before it', async t => {
  const { db } = await openDb(t);
  const session = createHighlightSession(db, bookA, createSerialWriter());
  const save = session.save(input());
  const snapshot = session.exportSnapshot();
  const saved = (await save).highlight;
  assert.deepEqual(await snapshot, [saved]);
  const removing = session.remove(saved.id);
  const after = session.exportSnapshot();
  await removing;
  assert.deepEqual(await after, []);
});

// Injected destination adapter: records every call so tests can see exactly what was touched.
function fakeDestination({ pick = 'ok', existing = [], create = 'ok', write = 'ok', read = 'same', remove = 'ok', preSize = 0 } = {}) {
  const calls = [];
  const files = new Map(existing.map(name => [name, 'OLD']));
  const destination = {
    async pickFolder() {
      calls.push('pick');
      if (pick === 'cancel') return null;
      if (pick === 'throw') throw new Error('provider unavailable');
      return {
        async has(name) { calls.push(`has:${name}`); return files.has(name); },
        async create(name) {
          calls.push(`create:${name}`);
          if (create === 'throw') throw new Error('no space');
          if (!files.has(name)) files.set(name, '');
          const handle = {
            async size() { return preSize || files.get(name).length; },
            async write(text) {
              calls.push('write');
              if (write === 'throw') { files.set(name, text.slice(0, 3)); throw new Error('io'); }
              files.set(name, text);
            },
            async read() { calls.push('read'); return read === 'same' ? files.get(name) : `${files.get(name)} `; },
            async remove() { calls.push('remove'); if (remove === 'throw') throw new Error('locked'); files.delete(name); },
          };
          return handle;
        },
      };
    },
  };
  return { destination, calls, files };
}

const name = exportFileName(bookA, 'abcdefgh1234');

test('a confirmed export writes one new file and reports written only after read-back matches', async t => {
  const { first } = await savedSet(t);
  const text = serializeHighlightExport(bookA, [first]);
  const { destination, calls, files } = fakeDestination();
  const outcome = await runHighlightExport({ text, fileName: name, destination });
  assert.deepEqual(outcome, { status: 'written', fileName: name });
  assert.deepEqual(calls, ['pick', `has:${name}`, `create:${name}`, 'write', 'read']);
  assert.equal(files.get(name), text);
});

test('picker cancel and picker failure are distinct and touch nothing', async () => {
  for (const [pick, status] of [['cancel', 'cancelled'], ['throw', 'not-completed']]) {
    const { destination, calls } = fakeDestination({ pick });
    assert.deepEqual(await runHighlightExport({ text: '{}\n', fileName: name, destination }), { status });
    assert.deepEqual(calls, ['pick']);
  }
});

test('an existing file name is never created, overwritten or deleted, and is not retried', async () => {
  const { destination, calls, files } = fakeDestination({ existing: [name] });
  assert.deepEqual(await runHighlightExport({ text: '{}\n', fileName: name, destination }), { status: 'failed', stage: 'exists', cleanup: 'none' });
  assert.deepEqual(calls, ['pick', `has:${name}`]);
  assert.equal(files.get(name), 'OLD');
  const reused = fakeDestination({ preSize: 3 });
  assert.deepEqual(await runHighlightExport({ text: '{}\n', fileName: name, destination: reused.destination }),
    { status: 'failed', stage: 'exists', cleanup: 'none' }, 'a provider handing back a non-empty file is treated as existing');
  assert.ok(!reused.calls.includes('write') && !reused.calls.includes('remove'));
});

test('create, write and read-back failures clean up only the file this export created', async () => {
  const create = fakeDestination({ create: 'throw' });
  assert.deepEqual(await runHighlightExport({ text: '{}\n', fileName: name, destination: create.destination }),
    { status: 'failed', stage: 'create', cleanup: 'none' });
  for (const [options, stage] of [[{ write: 'throw' }, 'write'], [{ read: 'mismatch' }, 'verify']]) {
    const { destination, calls, files } = fakeDestination(options);
    assert.deepEqual(await runHighlightExport({ text: '{"a":1}\n', fileName: name, destination }), { status: 'failed', stage, cleanup: 'removed' });
    assert.equal(calls.at(-1), 'remove');
    assert.equal(files.has(name), false);
  }
  const stuck = fakeDestination({ write: 'throw', remove: 'throw' });
  assert.deepEqual(await runHighlightExport({ text: '{"a":1}\n', fileName: name, destination: stuck.destination }),
    { status: 'failed', stage: 'write', cleanup: 'failed' }, 'a failed cleanup is reported so the UI can warn about an incomplete file');
  assert.equal(stuck.calls.filter(call => call.startsWith('create')).length, 1, 'no automatic retry');
});

test('the export guard is synchronous and stays held until the picker and write settle', async () => {
  const guard = createExportGuard();
  const token = guard.tryAcquire();
  assert.ok(token);
  assert.equal(guard.tryAcquire(), null, 'an overlapping export is refused synchronously');
  assert.equal(guard.isBusy(), true);
  let releasePick;
  const destination = { pickFolder: () => new Promise(resolve => { releasePick = resolve; }) };
  const running = guard.hold(token, () => runHighlightExport({ text: '{}\n', fileName: name, destination }));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(guard.isBusy(), true, 'held while the folder picker is open');
  releasePick(null);
  assert.deepEqual(await running, { status: 'cancelled' });
  assert.equal(guard.isBusy(), false);
  assert.ok(guard.tryAcquire());
  const stale = guard.tryAcquire();
  assert.equal(stale, null);
  assert.throws(() => guard.release({}), /not the current export/);
});
