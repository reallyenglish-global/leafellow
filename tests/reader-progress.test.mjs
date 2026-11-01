// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpubReaderProgress } from '../src/reader/reader-progress.ts';

test('normalizes EPUB reader percentages into the stored zero-to-one fraction', () => {
  assert.equal(normalizeEpubReaderProgress(0), 0);
  assert.equal(normalizeEpubReaderProgress(42), 0.42);
  assert.equal(normalizeEpubReaderProgress(100), 1);
});

test('rejects values outside the EPUB reader percentage range', () => {
  for (const value of [-0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => normalizeEpubReaderProgress(value), /Invalid EPUB reader progress/);
  }
});
