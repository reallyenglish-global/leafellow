// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatestWriter } from '../src/storage/latest-writer.ts';

function harness(write) {
  const writes = [];
  const timers = new Map();
  let next = 0;
  const writer = createLatestWriter(
    async value => {
      writes.push(value);
      await write?.(value, writes.length);
    },
    {
      delayMs: 750,
      schedule: fn => { const id = next++; timers.set(id, fn); return id; },
      cancel: id => { timers.delete(id); },
    },
  );
  const fire = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { writer, writes, fire, timers };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('writes only the newest of several values after one delay', async () => {
  const { writer, writes, fire } = harness();
  writer.set('a');
  writer.set('b');
  writer.set('c');
  assert.equal(writer.isPending(), true);
  fire();
  await writer.flush();
  assert.deepEqual(writes, ['c']);
  assert.equal(writer.isPending(), false);
});

test('flush writes the pending value now and cancels the armed delay', async () => {
  const { writer, writes, fire, timers } = harness();
  writer.set('a');
  await writer.flush();
  assert.deepEqual(writes, ['a']);
  assert.equal(timers.size, 0);
  fire();
  await tick();
  assert.deepEqual(writes, ['a']);
});

test('a rejected write does not block later values or flush', async () => {
  const { writer, writes, fire } = harness(async (_value, count) => {
    if (count === 1) throw new Error('disk full');
  });
  writer.set('a');
  fire();
  await tick();
  writer.set('b');
  fire();
  await writer.flush();
  assert.deepEqual(writes, ['a', 'b']);
});

test('close flushes and then refuses new values', async () => {
  const { writer, writes, fire } = harness();
  writer.set('a');
  await writer.close();
  assert.deepEqual(writes, ['a']);
  writer.set('b');
  fire();
  await tick();
  assert.deepEqual(writes, ['a']);
  assert.equal(writer.isPending(), false);
});

test('flush waits for a write already in flight', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { writer, writes, fire } = harness(() => gate);
  writer.set('a');
  fire();
  let settled = false;
  const flushed = writer.flush().then(() => { settled = true; });
  await tick();
  assert.deepEqual(writes, ['a']);
  assert.equal(settled, false);
  release();
  await flushed;
  assert.equal(settled, true);
});
