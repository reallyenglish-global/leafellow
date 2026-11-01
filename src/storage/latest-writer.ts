// SPDX-License-Identifier: Apache-2.0
export type LatestWriter<T> = {
  /** Remembers the newest value and arms the delay if it is not already armed. Ignored after close. */
  set(value: T): void;
  /** Cancels the delay, writes any pending value now, and resolves once every write this writer started has settled. Never rejects. */
  flush(): Promise<void>;
  /** flush(), then refuse further set() calls. */
  close(): Promise<void>;
  isPending(): boolean;
};

export function createLatestWriter<T>(
  write: (value: T) => Promise<void>,
  options: { delayMs: number; schedule?: (fn: () => void, ms: number) => unknown; cancel?: (handle: unknown) => void },
): LatestWriter<T> {
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let pending: { value: T } | null = null;
  let armed: unknown = null;
  let closed = false;
  const inFlight = new Set<Promise<void>>();

  function fire(): void {
    armed = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    let started: Promise<void>;
    try {
      started = write(value);
    } catch {
      return;
    }
    const settled: Promise<void> = started.catch(() => undefined).then(() => { inFlight.delete(settled); });
    inFlight.add(settled);
  }

  async function flush(): Promise<void> {
    if (armed !== null) {
      cancel(armed);
      armed = null;
    }
    fire();
    await Promise.all([...inFlight]);
  }

  return {
    set(value: T): void {
      if (closed) return;
      pending = { value };
      if (armed === null) armed = schedule(fire, options.delayMs);
    },
    flush,
    async close(): Promise<void> {
      closed = true;
      await flush();
    },
    isPending: () => pending !== null,
  };
}
