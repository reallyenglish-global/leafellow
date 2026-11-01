// SPDX-License-Identifier: Apache-2.0
// The generated Android acceptance EPUB must pass the same import checks the app runs on a picked file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inspectEpub, validateEpubFile } from '../src/reader/import-epub.ts';

test('generated acceptance EPUB passes the safe EPUB parser with the pinned identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leafellow-fixture-'));
  try {
    execFileSync('python3', [new URL('../scripts/android_fixture_epub.py', import.meta.url).pathname, dir]);
    const meta = JSON.parse(readFileSync(join(dir, 'leafellow-fixture.json'), 'utf8'));
    const path = join(dir, meta.fileName);
    validateEpubFile(meta.fileName, statSync(path).size);
    const document = await inspectEpub(new Uint8Array(readFileSync(path)));
    assert.equal(document.format, 'epub');
    assert.equal(document.id, meta.documentId);
    assert.equal(meta.documentId, `sha256:${meta.sha256}`);
    assert.equal(meta.targetQuote, 'Luminous');
    const text = document.parts.map(part => part.text).join(' ');
    assert.equal(text.split(/\s+/).filter(word => word === 'Luminous').length, 1);
    assert.ok(text.length > 10_000, 'chapter is long enough to scroll away from the target');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
