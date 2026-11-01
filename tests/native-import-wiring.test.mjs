// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { inspectEpub, validateEpubFile } from '../src/reader/import-epub.ts';

test('native import passes provider MIME before reading bytes or preparing renderer source', async () => {
  const source = readFileSync(new URL('../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
  const admission = source.match(/validateEpubFile\(file\.name,[^;]+;/)[0];
  const context = vm.createContext({ validateEpubFile, file: { name: 'msf:1000000031', size: 100, type: 'application/epub+zip' } });
  vm.runInContext(admission, context);
  for (const file of [
    { name: 'msf:1000000031', size: 100, type: 'application/pdf' },
    { name: 'msf:1000000031', size: 100, type: '' },
    { name: 'msf:1000000031', size: null, type: 'application/epub+zip' },
    { name: 'msf:1000000031', size: 2 * 1024 * 1024 + 1, type: 'application/epub+zip' },
  ]) assert.throws(() => vm.runInContext(admission, vm.createContext({ validateEpubFile, file })));
  assert.ok(source.indexOf(admission) < source.indexOf('await file.arrayBuffer()'));
  assert.ok(source.indexOf('await inspectEpub(bytes)') < source.indexOf('await rendererSources.prepare(file.uri, bytes)'));
  await assert.rejects(inspectEpub(new TextEncoder().encode('%PDF-not-an-epub')));
});
