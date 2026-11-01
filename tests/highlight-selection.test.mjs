// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureSelection,
  isEpubRangeCfi,
  isSelectionCurrent,
} from '../src/reader/highlight-selection.ts';
import { createSerialWriter } from '../src/storage/serial-writes.ts';

const documentId = `sha256:${'a'.repeat(64)}`;
const cfi = 'epubcfi(/6/4[chap01]!/4/2,/1:0,/1:24)';
const context = { documentId, href: 'chapter-1.xhtml', selectedAt: 1 };

test('captures the engine selection text and range CFI exactly as reported', () => {
  const text = ' “Curious”,\ncurious ';
  const result = captureSelection(text, cfi, context);
  assert.deepEqual(result, { ok: true, selection: { documentId, exact: text, cfi, href: 'chapter-1.xhtml', selectedAt: 1 } });
});

test('refuses selections without text, a range CFI or a known current section', () => {
  assert.equal(captureSelection('  ', cfi, context).ok, false);
  assert.equal(captureSelection('x'.repeat(4001), cfi, context).ok, false);
  for (const bad of [undefined, '', 'epubcfi(/6/4!/4/2/1:0)', "epubcfi(/6/4!/4,/1:0,/1:2');x()//)", 'epubcfi(/6/4!/4/2,/1:0,/1:2)\n']) {
    assert.equal(captureSelection('text', bad, context).ok, false, String(bad));
  }
  assert.equal(captureSelection('text', cfi, { ...context, href: null }).ok, false);
  assert.equal(isEpubRangeCfi('epubcfi(/6/4!/4/2/1,:0,:24)'), true);
  assert.equal(isEpubRangeCfi('epubcfi(/6/4!/4[a,b]/2,/1:0,/1:2)'), true, 'commas inside assertions do not split the range');
});

test('treats a selection as stale after the source or section changes', () => {
  const { selection } = captureSelection('text', cfi, context);
  assert.equal(isSelectionCurrent(selection, { documentId, href: 'chapter-1.xhtml' }), true);
  assert.equal(isSelectionCurrent(selection, { documentId, href: 'chapter-2.xhtml' }), false);
  assert.equal(isSelectionCurrent(selection, { documentId: `sha256:${'b'.repeat(64)}`, href: 'chapter-1.xhtml' }), false);
});

test('href-only arrival is no longer an exported success signal', async () => {
  const module = await import('../src/reader/highlight-selection.ts');
  assert.equal('evaluateJump' in module, false);
  assert.equal('JUMP_CONFIRM_TIMEOUT_MS' in module, false);
});

test('serial writer runs tasks in order, survives failures and refuses work after close', async () => {
  const writer = createSerialWriter();
  const events = [];
  let release;
  const first = writer.run(() => new Promise(resolve => { release = resolve; }).then(() => events.push('first')));
  const second = writer.run(async () => { events.push('second'); throw new Error('disk full'); });
  const third = writer.run(async () => { events.push('third'); return 3; });
  await Promise.resolve();
  assert.deepEqual(events, [], 'later writes wait for the first');
  const closing = writer.close();
  release();
  await first;
  await assert.rejects(second, /disk full/);
  assert.equal(await third, 3);
  await closing;
  assert.deepEqual(events, ['first', 'second', 'third'], 'close waits for every accepted write');
  await assert.rejects(writer.run(async () => events.push('late')), /closed/);
  assert.deepEqual(events, ['first', 'second', 'third']);
  assert.equal(writer.isClosed(), true);
});
