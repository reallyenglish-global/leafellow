// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/annotations.ts';
const { createAnnotation, serializeAnnotation, deserializeAnnotation } = core;

// Synthetic source IDs and quotes; no copyrighted book or learner history.
const epub = () => ({
  id: 'note-1', documentId: 'source-version-1',
  quote: { exact: 'A dot product compares two vectors.', prefix: 'Example: ', suffix: ' Try it.' },
  anchor: { format: 'epub', href: 'chapter-1.xhtml', cfi: 'epubcfi(/6/2!/4/2/1:0)' },
  note: 'Check what the dimensions mean.',
});

test('creates a private EPUB annotation without changing its source locator', () => {
  const input = epub();
  const annotation = createAnnotation(input);
  assert.deepEqual(annotation, { ...input, schemaVersion: 1, visibility: 'private' });
});

test('rejects missing source identity, empty selections and malformed EPUB locators', () => {
  for (const input of [
    null, {}, { ...epub(), id: '  ' }, { ...epub(), documentId: '' },
    { ...epub(), quote: { ...epub().quote, exact: ' ' } },
    { ...epub(), quote: { exact: 'A selection', prefix: 3, suffix: '' } },
    { ...epub(), note: 4 }, { ...epub(), visibility: 'public' },
    { ...epub(), anchor: { format: 'html' } },
    { ...epub(), anchor: { ...epub().anchor, href: '' } },
    { ...epub(), anchor: { ...epub().anchor, cfi: 'not-a-cfi' } },
  ]) {
    assert.throws(() => createAnnotation(input), /Invalid (annotation|EPUB anchor)/);
  }
});

const pdf = () => ({
  ...epub(),
  anchor: { format: 'pdf', pageIndex: 0, rotation: 90, rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.05 }] },
});

test('owns the EPUB and PDF selection data and drops unrelated input fields', () => {
  for (const fixture of [epub, pdf]) {
    const input = { ...fixture(), unrelated: 'must not be saved' };
    const annotation = createAnnotation(input);
    input.quote.exact = 'Changed later';
    input.anchor.format === 'epub' ? input.anchor.href = 'other.xhtml' : input.anchor.rects[0].x = 0.8;
    assert.equal(annotation.quote.exact, fixture().quote.exact);
    assert.deepEqual(annotation.anchor, fixture().anchor);
    assert.equal(Object.hasOwn(annotation, 'unrelated'), false);
  }
});

test('refuses wrong-document, unknown-version or non-private saved records', () => {
  const record = createAnnotation(epub());
  assert.throws(() => deserializeAnnotation(JSON.stringify(record), 'different-source-version'), /Document mismatch/);
  for (const changes of [{ schemaVersion: 2 }, { schemaVersion: undefined }, { visibility: 'public' }, { visibility: undefined }]) {
    assert.throws(() => deserializeAnnotation(JSON.stringify({ ...record, ...changes }), record.documentId), /Unsupported annotation record/);
    assert.throws(() => serializeAnnotation({ ...record, ...changes }), /Unsupported annotation record/);
  }
});

test('round-trips private EPUB and PDF records with exact Unicode quote context', () => {
  for (const fixture of [epub, pdf]) {
    const annotation = createAnnotation({ ...fixture(), note: '向量 α · β <not markup> 📖' });
    const saved = serializeAnnotation(annotation);
    const restored = deserializeAnnotation(saved, annotation.documentId);
    assert.deepEqual(restored, annotation);
    assert.notEqual(restored.anchor, annotation.anchor);
  }
});

test('rejects sparse PDF rectangle arrays instead of saving null holes', () => {
  const input = pdf();
  input.anchor.rects = new Array(1);
  assert.throws(() => createAnnotation(input), /Invalid PDF anchor/);
});

test('bounds serialized record size and rejects malformed JSON or primitives', () => {
  const record = createAnnotation({ ...epub(), note: 'x'.repeat(65536) });
  assert.throws(() => serializeAnnotation(record), /Annotation size limit/);
  assert.throws(() => deserializeAnnotation(' '.repeat(65537), 'source-version-1'), /Annotation size limit/);
  for (const text of ['{', 'null', '[]', '7', '"text"']) {
    assert.throws(() => deserializeAnnotation(text, 'source-version-1'));
  }
});

test('rejects PDF anchors outside the defined page coordinate contract', () => {
  for (const changes of [
    { pageIndex: -1 }, { pageIndex: 1.5 }, { rotation: 45 }, { rects: [] },
    { rects: [{ x: -0.1, y: 0, width: 0.1, height: 0.1 }] },
    { rects: [{ x: 0.8, y: 0, width: 0.3, height: 0.1 }] },
    { rects: [{ x: 0, y: 0.9, width: 0.1, height: 0.2 }] },
    { rects: [{ x: 0, y: 0, width: 0, height: 0.1 }] },
    { rects: [{ x: 0, y: NaN, width: 0.1, height: 0.1 }] },
  ]) {
    assert.throws(() => createAnnotation({ ...pdf(), anchor: { ...pdf().anchor, ...changes } }), /Invalid PDF anchor/);
  }
});
