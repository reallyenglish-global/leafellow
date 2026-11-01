// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { epubBytes } from './document-fixtures.mjs';
import { inspectEpub } from '../src/reader/import-epub.ts';
import {
  RENDERER_SOURCE_DIRECTORY,
  RendererSourcePartialWriteError,
  createRendererSourceStore,
  isOwnedRendererSourceName,
  rendererCanLoadUri,
} from '../src/reader/renderer-source.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');

// The installed @epubjs-react-native/core decides the WebView transport from the src string alone.
// Load its real helpers (not a copy) so a dependency change re-runs this boundary.
async function installedCoreHelpers() {
  const coreRoot = realpathSync(path.join(projectRoot, 'apps/mobile/node_modules/@epubjs-react-native/core'));
  const pkg = JSON.parse(readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
  const utils = path.join(coreRoot, 'lib/module/utils');
  const enumSource = readFileSync(path.join(utils, 'enums/source-type.enum.js'), 'utf8');
  const sourceTypeSource = readFileSync(path.join(utils, 'getSourceType.js'), 'utf8')
    .replace(/^import .*source-type\.enum['"];?$/m, enumSource);
  const isFsUriSource = readFileSync(path.join(utils, 'isFsUri.js'), 'utf8');
  const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const [{ getSourceType, SourceType }, { isFsUri }] = await Promise.all([load(sourceTypeSource), load(isFsUriSource)]);
  return { version: pkg.version, getSourceType, SourceType, isFsUri };
}

// Picker results seen on Android: run 41310907504 selected the first one through DocumentsUI.
const ANDROID_CONTENT_URI = 'content://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2Femulated%2F0%2FDownload%2Fleafellow-fixture.epub';
const ANDROID_NO_EXTENSION_URI = 'content://com.android.providers.media.documents/document/document%3A1000000031';
const IOS_FILE_URI = 'file:///var/mobile/Containers/Data/Application/A/Library/Caches/DocumentPicker/B/Book.epub';
const CACHE_URI = 'file:///data/user/0/global.reallyenglish.leafellow/cache/';

function fakeFs({ failWrite = false, failDelete = new Set(), initial = [] } = {}) {
  const files = new Map(initial.map(([name, bytes]) => [name, bytes]));
  const calls = [];
  return {
    files,
    calls,
    adapter: {
      directoryUri: () => `${CACHE_URI}${RENDERER_SOURCE_DIRECTORY}/`,
      async writeNew(name, bytes) {
        calls.push(['write', name]);
        if (files.has(name)) throw new Error('exists');
        files.set(name, new Uint8Array(0));
        if (failWrite) throw new RendererSourcePartialWriteError();
        files.set(name, Uint8Array.from(bytes));
        return `${CACHE_URI}${RENDERER_SOURCE_DIRECTORY}/${name}`;
      },
      delete(name) {
        calls.push(['delete', name]);
        if (failDelete.has(name)) throw new Error('busy');
        files.delete(name);
      },
      list: () => [...files.keys()],
    },
  };
}

let counter = 0;
const tokens = () => `t${(++counter).toString(36).padStart(10, '0')}`;

test('RED boundary: installed core cannot load the Android SAF picker URI the app used to pass', async () => {
  const core = await installedCoreHelpers();
  assert.equal(core.version, '1.4.8');
  // content:// with ".epub" in it is classified as a local binary book, but is not a file:/// URI,
  // so core neither allow-lists it nor reads it natively: the WebView must fetch content:// itself.
  assert.equal(core.getSourceType(ANDROID_CONTENT_URI), core.SourceType.EPUB);
  assert.equal(core.isFsUri(ANDROID_CONTENT_URI), false);
  // A provider that hides the name gives no type at all; core throws inside an unawaited effect.
  assert.equal(core.getSourceType(ANDROID_NO_EXTENSION_URI), undefined);
  assert.equal(rendererCanLoadUri(ANDROID_CONTENT_URI), false);
  assert.equal(rendererCanLoadUri(ANDROID_NO_EXTENSION_URI), false);
  // iOS keeps its existing direct file path.
  assert.equal(rendererCanLoadUri(IOS_FILE_URI), true);
  assert.equal(core.getSourceType(IOS_FILE_URI), core.SourceType.EPUB);
});

for (const [label, pickedUri] of [
  ['Android content URI', ANDROID_CONTENT_URI],
  ['extension-less Android content URI', ANDROID_NO_EXTENSION_URI],
]) {
  test(`stages the exact validated bytes as an owned .epub file the installed core loads (${label})`, async () => {
    const core = await installedCoreHelpers();
    const fs = fakeFs();
    const store = createRendererSourceStore(fs.adapter, tokens);
    const bytes = epubBytes();
    const original = Uint8Array.from(bytes);
    await inspectEpub(bytes);
    const source = await store.prepare(pickedUri, bytes);
    assert.equal(source.copied, true);
    assert.notEqual(source.uri, pickedUri);
    assert.ok(source.uri.startsWith(`${CACHE_URI}${RENDERER_SOURCE_DIRECTORY}/`));
    assert.ok(source.uri.endsWith('.epub'));
    assert.ok(source.uri.length <= 1000, 'must not be mistaken for inline base64');
    assert.equal(core.getSourceType(source.uri), core.SourceType.EPUB);
    assert.equal(core.isFsUri(source.uri), true);
    assert.equal(rendererCanLoadUri(source.uri), true);
    const name = source.uri.slice(source.uri.lastIndexOf('/') + 1);
    assert.ok(isOwnedRendererSourceName(name));
    assert.deepEqual(fs.files.get(name), original, 'byte-identical to the validated bytes');
    assert.deepEqual(bytes, original, 'validated buffer is not mutated');
    assert.ok(!name.includes('leafellow-fixture') && !name.includes('%'), 'name never derives from the picked URI');
  });
}

test('direct file:// .epub sources (iOS picker) are passed through without a copy', async () => {
  const fs = fakeFs();
  const store = createRendererSourceStore(fs.adapter, tokens);
  const source = await store.prepare(IOS_FILE_URI, epubBytes());
  assert.deepEqual(source, { uri: IOS_FILE_URI, copied: false, release: source.release });
  assert.equal(fs.calls.length, 0);
  source.release();
  assert.equal(fs.calls.length, 0, 'never deletes a file it did not create');
});

test('release deletes only its own copy, is idempotent, and a stale release cannot touch a newer book', async () => {
  const fs = fakeFs();
  const store = createRendererSourceStore(fs.adapter, tokens);
  const first = await store.prepare(ANDROID_CONTENT_URI, epubBytes());
  const second = await store.prepare(ANDROID_CONTENT_URI, epubBytes());
  assert.notEqual(first.uri, second.uri);
  first.release();
  first.release();
  assert.equal(fs.files.size, 1);
  assert.ok(second.uri.endsWith([...fs.files.keys()][0]));
  assert.equal(fs.calls.filter(([op]) => op === 'delete').length, 1);
  second.release();
  assert.equal(fs.files.size, 0);
});

test('a failed write removes the partial copy and reports failure', async () => {
  const fs = fakeFs({ failWrite: true });
  const store = createRendererSourceStore(fs.adapter, tokens);
  await assert.rejects(store.prepare(ANDROID_CONTENT_URI, epubBytes()), /could not be prepared/);
  assert.equal(fs.files.size, 0);
});

test('release never throws when deletion fails, so closing the reader still proceeds', async () => {
  const fs = fakeFs();
  const store = createRendererSourceStore(fs.adapter, tokens);
  const source = await store.prepare(ANDROID_CONTENT_URI, epubBytes());
  const name = source.uri.slice(source.uri.lastIndexOf('/') + 1);
  fs.adapter.delete = () => { throw new Error('busy'); };
  assert.doesNotThrow(() => source.release());
  assert.ok(fs.files.has(name), 'left for the next startup sweep');
});

test('startup sweep removes only leftover owned copies, never live ones or foreign files', async () => {
  const fs = fakeFs({ initial: [
    ['book-t000000crash.epub', new Uint8Array([1])],
    ['notes.txt', new Uint8Array([2])],
    ['book-../../x.epub', new Uint8Array([3])],
    ['Book.epub', new Uint8Array([4])],
  ] });
  const store = createRendererSourceStore(fs.adapter, tokens);
  const live = await store.prepare(ANDROID_CONTENT_URI, epubBytes());
  const liveName = live.uri.slice(live.uri.lastIndexOf('/') + 1);
  assert.equal(store.sweep(), 1);
  assert.deepEqual([...fs.files.keys()].sort(), ['Book.epub', 'book-../../x.epub', liveName, 'notes.txt'].sort());
  assert.equal(store.sweep(), 0, 'idempotent');
});

test('sweep tolerates a missing or unreadable cache directory', () => {
  const store = createRendererSourceStore({ ...fakeFs().adapter, list: () => { throw new Error('missing'); } }, tokens);
  assert.equal(store.sweep(), 0);
});

test('rejects unsafe generated names', async () => {
  const store = createRendererSourceStore(fakeFs().adapter, () => '../escape');
  await assert.rejects(store.prepare(ANDROID_CONTENT_URI, epubBytes()), /could not be prepared/);
});

test('mobile app passes the renderer an owned source, not the picked content URI', () => {
  const source = readFileSync(path.join(projectRoot, 'apps/mobile/src/app/index.tsx'), 'utf8');
  assert.doesNotMatch(source, /uri:\s*file\.uri/, 'the SAF URI must not reach <Reader src>');
  assert.match(source, /rendererSources\.prepare\(\s*file\.uri,\s*bytes\s*\)/, 'stages the same bytes inspectEpub validated');
});
