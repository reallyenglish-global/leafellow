// SPDX-License-Identifier: Apache-2.0
export type SerialWriter = {
  /** Queues a task after every earlier one; each caller sees its own task's result or error. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Stops accepting tasks and resolves once every accepted task has settled. */
  close(): Promise<void>;
  isClosed(): boolean;
};

export function createSerialWriter(): SerialWriter {
  let tail: Promise<unknown> = Promise.resolve();
  let closed = false;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (closed) return Promise.reject(new Error('Storage writer is closed'));
      const result = tail.then(() => task());
      tail = result.catch(() => undefined);
      return result;
    },
    async close(): Promise<void> {
      closed = true;
      await tail;
    },
    isClosed: () => closed,
  };
}
