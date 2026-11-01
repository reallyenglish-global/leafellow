// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererSourceStore, rendererCanLoadUri } from '../src/reader/renderer-source.ts';

test('a failed exclusive create cannot delete an already-existing cache file', async () => {
  const original = Uint8Array.of(4, 5, 6);
  const files = new Map([['book-fixedtoken.epub', original]]);
  const store = createRendererSourceStore({
    async writeNew() { throw new Error('already exists'); },
    delete(name) { files.delete(name); },
    list() { return [...files.keys()]; },
  }, () => 'fixedtoken');
  await assert.rejects(store.prepare('content://provider/42', Uint8Array.of(1, 2, 3)));
  assert.deepEqual(files.get('book-fixedtoken.epub'), original);
});

test('direct file URIs cannot inject into the engine single-quoted source literal', () => {
  for (const uri of ["file:///tmp/reader's-book.epub", 'file:///tmp/book\\name.epub',
    'file:///tmp/book\nname.epub', 'file:///tmp/book</script>.epub']) {
    assert.equal(rendererCanLoadUri(uri), false, uri);
  }
  assert.equal(rendererCanLoadUri('file:///tmp/reader%27s-book.epub'), true);
});
