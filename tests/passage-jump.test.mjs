// SPDX-License-Identifier: Apache-2.0
// Adapter evidence only: the injected script runs in a Node vm against a fake rendition/book that
// uses the real epub.js CFI class from the installed engine bundle. This is not native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadEngineEpub } from './epub-engine-cfi.mjs';
import {
  PASSAGE_JUMP_MESSAGE_TYPE,
  PASSAGE_JUMP_TIMEOUT_MS,
  buildPassageJumpScript,
  createPassageJumpRequest,
  passageJumpStatus,
  readPassageJumpMessage,
} from '../src/reader/passage-jump.ts';

const { ePub } = loadEngineEpub();
const target = 'epubcfi(/6/4[chap01]!/4/10[para5],/1:0,/1:24)';
const exact = 'Alice was beginning to g';
const textRange = text => ({ toString: () => text });

function runInFakeEngine(request, engine = {}) {
  const posted = [];
  let resolvePosted;
  const firstPost = new Promise(resolve => { resolvePosted = resolve; });
  const calls = { display: [] };
  const book = {
    getRange: cfi => (engine.bookRange ? engine.bookRange(cfi) : Promise.resolve(textRange(exact))),
  };
  const rendition = {
    display: cfi => {
      calls.display.push(cfi);
      return engine.display ? engine.display(cfi) : Promise.resolve();
    },
    getRange: cfi => (engine.renderedRange ? engine.renderedRange(cfi) : textRange(exact)),
    currentLocation: () => engine.location ?? {
      start: { cfi: 'epubcfi(/6/4[chap01]!/4/8/1:0)' },
      end: { cfi: 'epubcfi(/6/4[chap01]!/4/12/1:5)' },
    },
  };
  const context = {
    window: { ReactNativeWebView: { postMessage: data => { posted.push(JSON.parse(data)); resolvePosted(); } } },
    Promise,
    JSON,
  };
  if (!engine.missingEngine) Object.assign(context, { book, rendition, ePub });
  vm.runInNewContext(buildPassageJumpScript(request), context);
  return firstPost.then(() => ({ message: posted[0], posted, calls }));
}

const request = () => createPassageJumpRequest(target, exact, 1_000);

test('confirms only after display resolves, the stored text matches and the range is inside the visible bounds', async () => {
  const pending = request();
  const { message, calls } = await runInFakeEngine(pending);
  assert.deepEqual(calls.display, [target], 'the stored range CFI is what the engine displays');
  assert.equal(message.type, PASSAGE_JUMP_MESSAGE_TYPE);
  assert.equal(message.token, pending.token);
  assert.deepEqual(readPassageJumpMessage(pending, message), {
    status: 'confirmed',
    fullyVisible: true,
    visibleStart: 'epubcfi(/6/4[chap01]!/4/8/1:0)',
    visibleEnd: 'epubcfi(/6/4[chap01]!/4/12/1:5)',
  });
});

test('an already-visible passage confirms without waiting for a relocated event', async () => {
  // display resolves immediately and the engine emits nothing else; the check reads currentLocation.
  const { message } = await runInFakeEngine(request(), { display: () => undefined });
  assert.equal(message.status, 'confirmed');
});

test('a passage whose start is visible but end runs past the screen is confirmed as partly visible', async () => {
  const { message } = await runInFakeEngine(request(), {
    location: { start: { cfi: 'epubcfi(/6/4[chap01]!/4/10/1:0)' }, end: { cfi: 'epubcfi(/6/4[chap01]!/4/10/1:10)' } },
  });
  assert.equal(message.status, 'confirmed');
  assert.equal(message.fullyVisible, false);
});

test('the right chapter rendered with matching text is still a failure when the range is off screen', async () => {
  const pending = request();
  const { message } = await runInFakeEngine(pending, {
    location: { start: { cfi: 'epubcfi(/6/4[chap01]!/4/20/1:0)' }, end: { cfi: 'epubcfi(/6/4[chap01]!/4/30/1:0)' } },
  });
  assert.equal(message.status, 'failed');
  assert.equal(message.code, 'not-visible');
  assert.equal(message.visibleStart, 'epubcfi(/6/4[chap01]!/4/20/1:0)', 'the actual visible range is reported');
  assert.equal(readPassageJumpMessage(pending, message).status, 'failed');
});

test('another spine item on screen is not the passage', async () => {
  const { message } = await runInFakeEngine(request(), {
    location: { start: { cfi: 'epubcfi(/6/6!/4/2/1:0)' }, end: { cfi: 'epubcfi(/6/6!/4/8/1:0)' } },
  });
  assert.equal(message.code, 'not-visible');
});

test('fails closed when the text, the rendered view, display or the engine do not cooperate', async () => {
  const cases = [
    [{ bookRange: () => Promise.resolve(textRange('Alice was beginning to G')) }, 'text-mismatch'],
    [{ bookRange: () => Promise.resolve(null) }, 'text-mismatch'],
    [{ renderedRange: () => undefined }, 'not-rendered'],
    [{ display: () => Promise.reject(new Error('No Section Found')) }, 'display-failed'],
    [{ bookRange: () => Promise.reject(new Error('CFI could not be found')) }, 'error'],
    [{ location: { start: null, end: null } }, 'not-visible'],
    [{ missingEngine: true }, 'engine-unavailable'],
  ];
  for (const [engine, expected] of cases) {
    const { message } = await runInFakeEngine(request(), engine);
    assert.equal(message.status === 'confirmed' ? 'confirmed' : message.code, expected, JSON.stringify(Object.keys(engine)));
  }
});

test('the request is JSON data: hostile passage text is neither executed nor altered', async () => {
  const hostile = "');globalThis.pwned=1;// </script>\\";
  const pending = createPassageJumpRequest(target, hostile, 5);
  const seen = [];
  const { message } = await runInFakeEngine(pending, {
    bookRange: () => Promise.resolve(textRange(hostile)),
    renderedRange: () => textRange(hostile),
    display: cfi => { seen.push(cfi); return Promise.resolve(); },
  });
  assert.equal(message.status, 'confirmed', 'the exact hostile text round-trips into the comparison unchanged');
  assert.equal(globalThis.pwned, undefined);
  assert.deepEqual(seen, [target]);
});

test('only a well-formed reply with the pending token resolves a jump', async () => {
  const pending = request();
  const { message } = await runInFakeEngine(pending);
  const newer = createPassageJumpRequest(target, exact, 2_000);
  assert.equal(readPassageJumpMessage(newer, message), null, 'a stale reply never resolves a newer request');
  assert.equal(readPassageJumpMessage(null, message), null, 'no reply is accepted without a pending request');
  assert.equal(readPassageJumpMessage(pending, { ...message, type: 'onLocationChange' }), null);
  assert.equal(readPassageJumpMessage(pending, { ...message, token: 'jump-x' }), null);
  assert.equal(readPassageJumpMessage(pending, 'confirmed'), null);
  assert.deepEqual(readPassageJumpMessage(pending, { type: PASSAGE_JUMP_MESSAGE_TYPE, token: pending.token, status: 'confirmed' }).status,
    'failed', 'a matching but malformed reply fails closed');
  assert.equal(readPassageJumpMessage(pending, { type: PASSAGE_JUMP_MESSAGE_TYPE, token: pending.token, status: 'failed', code: 'timeout' }).code,
    'error', 'the page cannot claim host-only outcomes');
  assert.notEqual(newer.token, pending.token);
});

test('a jump without a reply stays in progress, then times out', () => {
  const pending = request();
  assert.deepEqual(passageJumpStatus(pending, pending.requestedAt + 1), { status: 'in-progress' });
  const timedOut = passageJumpStatus(pending, pending.requestedAt + PASSAGE_JUMP_TIMEOUT_MS);
  assert.equal(timedOut.status, 'failed');
  assert.equal(timedOut.code, 'timeout');
});

test('requests refuse locations and text that are not saved-highlight shaped', () => {
  assert.throws(() => createPassageJumpRequest('epubcfi(/6/4!/4/2/1:0)', exact, 1), /location/);
  assert.throws(() => createPassageJumpRequest(target, '', 1), /text/);
});
