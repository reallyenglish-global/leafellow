// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { epubBytes } from './document-fixtures.mjs';
import { inspectEpub, validateEpubFile } from '../src/reader/import-epub.ts';

test('allows only bounded EPUB file selections before reading bytes', () => {
  validateEpubFile('Alice.EPUB', 185_000);
  for (const [name, size, message] of [
    ['notes.pdf', 100, /Choose an EPUB/],
    ['book.epub', null, /size could not be verified/],
    ['book.epub', 0, /size could not be verified/],
    ['book.epub', 2 * 1024 * 1024 + 1, /up to 2 MiB/],
  ]) assert.throws(() => validateEpubFile(name, size), message);
});

test('validates bytes through the safe EPUB parser before exposing the source', async () => {
  const document = await inspectEpub(epubBytes());
  assert.equal(document.format, 'epub');
  assert.deepEqual(document.parts.map(part => part.text), [
    'Vectors have direction & length.', 'Matrix shapes matter.',
  ]);
});
