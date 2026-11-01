// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { epubBytes, epubEntries, pdfBytes } from './document-fixtures.mjs';
import { strToU8, strFromU8 } from 'fflate';
import * as importer from '../src/documents.ts';

const { importDocument, selectPassage } = importer;

test('selects source-bound text with context without fabricating visual anchors', async () => {
  for (const bytes of [epubBytes(), pdfBytes()]) {
    const document = await importDocument(bytes);
    const text = document.parts[0].text;
    const start = text.indexOf('direction');
    const end = start + 'direction'.length;
    const passage = selectPassage(document, 0, start, end);
    assert.deepEqual(passage, {
      documentId: document.id, extractionVersion: 1, partIndex: 0, location: document.parts[0].location,
      start, end, quote: { exact: 'direction', prefix: text.slice(0, start), suffix: text.slice(end) },
    });
    assert.equal(Object.hasOwn(passage, 'anchor'), false);
    assert.notEqual(passage.location, document.parts[0].location);
  }
});

test('rejects invalid ranges, unavailable text and split Unicode surrogate pairs', async () => {
  const document = await importDocument(epubBytes());
  for (const [start, end] of [[-1, 2], [0, 0], [2, 1], [0, Infinity], [NaN, 3], [0, 999], [0, 1.5]]) {
    assert.throws(() => selectPassage(document, 0, start, end), /Invalid text range/);
  }
  assert.throws(() => selectPassage(document, 99, 0, 1), /Invalid text range/);
  const blank = await importDocument(pdfBytes(['']));
  assert.throws(() => selectPassage(blank, 0, 0, 1), /Invalid text range/);
  const unicode = await importDocument(epubBytes({ 'OPS/one.xhtml': strToU8('<html><body><p>向量 📖 有方向。</p></body></html>') }));
  const start = unicode.parts[0].text.indexOf('📖');
  assert.equal(selectPassage(unicode, 0, start, start + 2).quote.exact, '📖');
  assert.throws(() => selectPassage(unicode, 0, start, start + 1), /Invalid text range/);
  assert.throws(() => selectPassage(unicode, 0, start + 1, start + 2), /Invalid text range/);
});

test('bounds extracted text and EPUB spine length', async () => {
  await assert.rejects(() => importDocument(epubBytes({ 'OPS/one.xhtml': strToU8('<html><body>' + 'x'.repeat(100001) + '</body></html>') })), /Document text limit/);
  const opf = strFromU8(epubEntries()['OPS/package.opf']);
  const many = opf.replace(/<spine>.*<\/spine>/, '<spine>' + '<itemref idref="one"/>'.repeat(101) + '</spine>');
  await assert.rejects(() => importDocument(epubBytes({ 'OPS/package.opf': strToU8(many) })), /EPUB spine limit/);
});

test('rejects unsupported, empty, malformed and oversized sources deliberately', async () => {
  for (const value of [null, [], 'not bytes']) {
    await assert.rejects(() => importDocument(value), /Expected Uint8Array/);
  }
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('not a book')]) {
    await assert.rejects(() => importDocument(bytes), /Unsupported document/);
  }
  await assert.rejects(() => importDocument(new Uint8Array(2 * 1024 * 1024 + 1)), /Document byte limit/);
  await assert.rejects(() => importDocument(new TextEncoder().encode('%PDF-broken')), /Invalid PDF/);
  await assert.rejects(() => importDocument(new Uint8Array([80, 75, 3, 4])), /Invalid EPUB/);
});

test('accepts a harmless HTML5 doctype in XHTML spine items', async () => {
  const document = await importDocument(epubBytes({
    'OPS/one.xhtml': strToU8('<!DOCTYPE html><html><body>A safe chapter.</body></html>'),
  }));
  assert.equal(document.parts[0].text, 'A safe chapter.');
});

test('rejects EPUB traversal, unsafe XML declarations, malformed XML and active content', async () => {
  const opf = strFromU8(epubEntries()['OPS/package.opf']);
  for (const [overrides, message] of [
    [{ '../escape.txt': strToU8('outside') }, /Unsafe EPUB path/],
    [{ 'OPS/package.opf': strToU8(opf.replace('one.xhtml', '%2e%2e/one.xhtml')) }, /Unsafe EPUB path/],
    [{ 'OPS/one.xhtml': strToU8('<!DOCTYPE html SYSTEM "https://example.invalid/evil.dtd"><html><body>Test</body></html>') }, /XML declarations/],
    [{ 'OPS/one.xhtml': strToU8('<!DOCTYPE html [<!ENTITY x "unsafe">]><html><body>Test</body></html>') }, /XML declarations/],
    [{ 'OPS/one.xhtml': strToU8('<html><body>unclosed') }, /Invalid EPUB XML/],
    [{ 'OPS/one.xhtml': strToU8('<html><body><script>throw 1</script></body></html>') }, /Active EPUB content/],
    [{ 'OPS/one.xhtml': strToU8('<html><body onload="bad()">Test</body></html>') }, /Active EPUB content/],
    [{ 'META-INF/encryption.xml': strToU8('<encryption/>') }, /Protected EPUB/],
    [{ 'OPS/package.opf': strToU8(opf.replace('<metadata>', '<metadata><meta property="rendition:layout">pre-paginated</meta>')) }, /Fixed-layout EPUB/],
    [{ 'OPS/package.opf': strToU8(opf.replace('id="one"', 'id="one" properties="scripted"')) }, /Active EPUB content/],
  ]) {
    await assert.rejects(() => importDocument(epubBytes(overrides)), message);
  }
});

test('checks archive expansion limits before extracting large EPUB resources', async () => {
  await assert.rejects(() => importDocument(epubBytes({ 'OPS/large.txt': strToU8('x'.repeat(512 * 1024 + 1)) })), /EPUB resource limit/);
  const extra = Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`OPS/extra-${i}.txt`, strToU8('x')]));
  await assert.rejects(() => importDocument(epubBytes(extra)), /EPUB resource limit/);
});

test('uses parsed EPUB metadata rather than matching policy words in book titles', async () => {
  const opf = strFromU8(epubEntries()['OPS/package.opf']);
  const document = await importDocument(epubBytes({ 'OPS/package.opf': strToU8(opf.replace('Leafellow test book', 'The pre-paginated question')) }));
  assert.equal(document.parts.length, 2);
  await assert.rejects(() => importDocument(epubBytes({
    'OPS/package.opf': strToU8(opf.replace('id="one"', 'id="one" properties="scr&#x69;pted"')),
  })), /Active EPUB content/);
});

test('rejects ambiguous EPUB manifest IDs and non-XHTML spine resources', async () => {
  const opf = strFromU8(epubEntries()['OPS/package.opf']);
  await assert.rejects(() => importDocument(epubBytes({
    'OPS/package.opf': strToU8(opf.replace('</manifest>', '<item id="one" href="two.xhtml" media-type="application/xhtml+xml"/></manifest>')),
  })), /Invalid EPUB manifest/);
  await assert.rejects(() => importDocument(epubBytes({
    'OPS/package.opf': strToU8(opf.replaceAll('application/xhtml+xml', 'image/png')),
  })), /Unsupported EPUB media/);
});

test('bounds PDF page count and explicitly labels pages without extractable text', async () => {
  await assert.rejects(() => importDocument(pdfBytes(Array.from({ length: 101 }, () => 'x'))), /PDF page limit/);
  const document = await importDocument(pdfBytes(['']));
  assert.equal(document.parts[0].textStatus, 'unavailable');
  assert.equal(document.parts[0].text, '');
});

test('rejects encrypted PDFs including owner-only documents with empty user password', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./protected-pdf.json', import.meta.url), 'utf8'));
  for (const data of Object.values(fixtures)) {
    await assert.rejects(() => importDocument(Uint8Array.from(Buffer.from(data, 'base64'))), /Protected PDF/);
  }
});

test('extracts actual PDF page text and leaves the caller-owned bytes intact', async () => {
  const bytes = pdfBytes();
  const before = bytes.slice();
  const document = await importDocument(bytes);
  assert.equal(document.id, 'sha256:' + createHash('sha256').update(before).digest('hex'));
  assert.equal(document.format, 'pdf');
  assert.deepEqual(document.parts.map(part => part.location), [
    { format: 'pdf', pageIndex: 0 }, { format: 'pdf', pageIndex: 1 },
  ]);
  assert.deepEqual(document.parts.map(part => part.text), ['Vectors point in a direction.', 'Matrix shapes matter.']);
  assert.deepEqual(bytes, before);
});

test('performs fixture imports without invoking the network fetch API', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Network forbidden in import'); });
  for (const bytes of [epubBytes(), pdfBytes()]) {
    const document = await importDocument(bytes);
    assert.ok(document.parts.length > 0);
  }
  assert.equal(network.mock.callCount(), 0);
});

test('imports a real EPUB archive in spine order with source-byte identity', async () => {
  const bytes = epubBytes();
  const document = await importDocument(bytes);
  assert.equal(document.id, 'sha256:' + createHash('sha256').update(bytes).digest('hex'));
  assert.equal(document.format, 'epub');
  assert.deepEqual(document.parts.map(part => part.location), [
    { format: 'epub', href: 'OPS/one.xhtml' }, { format: 'epub', href: 'OPS/two.xhtml' },
  ]);
  assert.deepEqual(document.parts.map(part => part.text), ['Vectors have direction & length.', 'Matrix shapes matter.']);
  assert.ok(document.parts.every(part => part.textStatus === 'available'));
});
