// SPDX-License-Identifier: Apache-2.0
// Synchronous export orchestration for the reader screen: start -> preview -> confirm | cancel.
// Every handler decides from this module's own state and the guard, never from a React render
// closure, so two taps in the same tick (confirm twice, confirm then cancel, cancel twice) cannot
// run the export twice or release a running one. No Expo or React imports.
import type { ExportGuard, ExportOutcome, ExportToken } from './highlight-export.ts';

export type ExportFlowResult =
  | { kind: 'empty' }
  | { kind: 'prepare-failed'; reason: unknown }
  | { kind: 'outcome'; outcome: ExportOutcome; count: number }
  /** The run threw instead of returning an outcome; nothing about the file is known. */
  | { kind: 'error'; fileName: string | null };

export type ExportFlowState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'preview'; count: number; acknowledged: boolean }
  | { status: 'writing' }
  | { status: 'finished'; result: ExportFlowResult };

export type ExportFlow = {
  /** Synchronously takes the guard; null if an export is already in progress. */
  start(): Promise<void> | null;
  setAcknowledged(acknowledged: boolean): void;
  /** Synchronously moves preview -> writing; null when not in an acknowledged preview. */
  confirm(): Promise<void> | null;
  /** true only if this call cancelled a preparing or preview export; refused while writing. */
  cancel(): boolean;
  state(): ExportFlowState;
  isBusy(): boolean;
};

type Internal =
  | { status: 'idle' }
  | { status: 'preparing'; token: ExportToken }
  | { status: 'preview'; token: ExportToken; count: number; text: string; acknowledged: boolean }
  | { status: 'writing'; token: ExportToken }
  | { status: 'finished'; result: ExportFlowResult };

export function createExportFlow({ guard, prepare, fileName, run, isActive, onChange }: {
  guard: ExportGuard;
  /** Snapshot and serialize; `count` is the number of highlights in `text`. */
  prepare(): Promise<{ count: number; text: string }>;
  fileName(): string;
  run(input: { text: string; fileName: string }): Promise<ExportOutcome>;
  /** false once the screen has unmounted. */
  isActive(): boolean;
  onChange(state: ExportFlowState): void;
}): ExportFlow {
  let state: Internal = { status: 'idle' };

  const publicState = (): ExportFlowState => {
    switch (state.status) {
      case 'preparing': return { status: 'preparing' };
      case 'preview': return { status: 'preview', count: state.count, acknowledged: state.acknowledged };
      case 'writing': return { status: 'writing' };
      default: return state;
    }
  };
  const set = (next: Internal) => {
    state = next;
    onChange(publicState());
  };
  // A completion may only act if its token still owns the flow.
  const owns = (token: ExportToken) => 'token' in state && state.token === token;

  async function prepareFor(token: ExportToken) {
    try {
      const { count, text } = await prepare();
      if (!owns(token)) return;
      if (!isActive() || count === 0) {
        guard.release(token);
        set(isActive() ? { status: 'finished', result: { kind: 'empty' } } : { status: 'idle' });
        return;
      }
      if (!guard.toPreview(token)) return;
      set({ status: 'preview', token, count, text, acknowledged: false });
    } catch (reason) {
      if (!owns(token)) return;
      guard.release(token);
      set({ status: 'finished', result: { kind: 'prepare-failed', reason } });
    }
  }

  async function runFor(token: ExportToken, text: string, count: number, name: string) {
    let result: ExportFlowResult;
    try {
      const outcome = await guard.hold(token, () => run({ text, fileName: name }));
      result = { kind: 'outcome', outcome, count };
    } catch {
      // hold already returned its own token to idle; nothing else is released here.
      result = { kind: 'error', fileName: name };
    }
    if (owns(token)) set({ status: 'finished', result });
  }

  return {
    start() {
      if (state.status === 'preparing' || state.status === 'preview' || state.status === 'writing') return null;
      const token = guard.tryAcquire();
      if (!token) return null;
      set({ status: 'preparing', token });
      return prepareFor(token);
    },
    setAcknowledged(acknowledged) {
      if (state.status === 'preview' && state.acknowledged !== acknowledged) set({ ...state, acknowledged });
    },
    confirm() {
      if (state.status !== 'preview' || !state.acknowledged || guard.phase(state.token) !== 'preview') return null;
      const { token, text, count } = state;
      let name: string;
      try {
        name = fileName();
      } catch {
        guard.release(token);
        set({ status: 'finished', result: { kind: 'error', fileName: null } });
        return Promise.resolve();
      }
      set({ status: 'writing', token });
      return runFor(token, text, count, name);
    },
    cancel() {
      if (state.status !== 'preparing' && state.status !== 'preview') return false;
      if (!guard.release(state.token)) return false;
      set({ status: 'idle' });
      return true;
    },
    state: publicState,
    isBusy: () => guard.isBusy(),
  };
}
