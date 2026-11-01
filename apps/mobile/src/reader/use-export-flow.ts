// SPDX-License-Identifier: Apache-2.0
import { useCallback, useRef, useState, type RefObject } from 'react';

import {
  createExportGuard,
  exportFileName,
  runHighlightExport,
  serializeHighlightExport,
  type ExportOutcome,
} from '../../../../src/storage/highlight-export';
import { createExportFlow, type ExportFlow, type ExportFlowResult, type ExportFlowState } from '../../../../src/storage/highlight-export-flow';
import type { HighlightSession } from '../../../../src/storage/highlight-session';
import { HighlightExportUnreadableError } from '../../../../src/storage/saved-highlights';
import type { SerialWriter } from '../../../../src/storage/serial-writes';
import { systemFolderDestination } from '../highlight-export-destination';
import type { OpenBook } from './reader-screen';

export const plural = (count: number) => `${count} highlight${count === 1 ? '' : 's'}`;

export function isExportBusy(state: ExportFlowState): boolean {
  return state.status === 'preparing' || state.status === 'preview' || state.status === 'writing';
}

export function describeExport(outcome: ExportOutcome, count: number): { message: string; failed: boolean } {
  switch (outcome.status) {
    case 'written':
      // The requested name is reported as requested: a storage provider may store it under another name.
      return { failed: false, message: `Exported ${plural(count)} to the folder you chose and checked the file by reading it back. Leafellow asked for the name ${outcome.fileName}; some storage providers save it under a different name. Leafellow does not upload it; the storage provider for that folder may sync it.` };
    case 'cancelled':
      return { failed: false, message: 'Export cancelled. No file was created.' };
    case 'not-completed':
      return { failed: true, message: 'The folder could not be opened, so nothing was exported.' };
    case 'failed':
      if (outcome.stage === 'exists') return { failed: true, message: 'A file with the export name already exists there. Leafellow did not write to it or remove it, and nothing was exported.' };
      if (outcome.stage === 'create') return { failed: true, message: 'The export file could not be created in that folder, so nothing was exported. Some storage providers can leave an empty file behind; Leafellow did not write to it or remove it.' };
      if (outcome.cleanup === 'failed') {
        return { failed: true, message: 'The export could not be written and checked, and the new file could not be removed. An incomplete export file may remain in that folder; do not rely on it.' };
      }
      return { failed: true, message: 'The export could not be written and checked, so the new file was removed. Nothing was exported.' };
  }
}

export function describeExportResult(result: ExportFlowResult): { message: string; failed: boolean } {
  switch (result.kind) {
    case 'empty':
      return { failed: false, message: 'This book has no saved highlights yet, so there is nothing to export.' };
    case 'prepare-failed':
      return {
        failed: true,
        message: result.reason instanceof HighlightExportUnreadableError
          ? `${plural(result.reason.unreadable)} could not be read, so no partial export was made. Nothing was written.`
          : 'Saved highlights could not be prepared for export. Nothing was written.',
      };
    case 'outcome':
      return describeExport(result.outcome, result.count);
    case 'error':
      return { failed: true, message: 'The export could not be completed. Do not rely on any file it may have created.' };
  }
}

export function exportId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0x100000000).toString(36)}`;
}

/** This book's highlight export: snapshot, preview with acknowledgement, folder picker and write. */
export function useExportFlow({ session, book, active: activeRef, writer }: {
  session: HighlightSession; book: OpenBook; active: RefObject<boolean>; writer: SerialWriter;
}) {
  // Held from snapshot through preview, folder picker and write; saves, deletes and close wait.
  const [guard] = useState(createExportGuard);
  const [state, setState] = useState<ExportFlowState>({ status: 'idle' });
  // Handlers ask the flow, not `state`: two taps before a re-render must not act on stale state.
  // Created on first use from a handler, never during render.
  const flowRef = useRef<ExportFlow | null>(null);
  const flow = useCallback(() => {
    flowRef.current ??= createExportFlow({
      guard,
      async prepare() {
        // Queued behind every accepted save and delete, and no new ones start while the guard is held.
        const snapshot = await session.exportSnapshot();
        return { count: snapshot.length, text: serializeHighlightExport(book.id, snapshot) };
      },
      fileName: () => exportFileName(book.id, exportId()),
      run: ({ text, fileName }) => runHighlightExport({ text, fileName, destination: systemFolderDestination }),
      isActive: () => activeRef.current,
      onChange: next => { if (activeRef.current) setState(next); },
    });
    return flowRef.current;
  }, [guard, session, book.id, activeRef]);

  /** Returns true when this call started an export (the screen then clears its messages). */
  function start(): boolean {
    if (writer.isClosed()) return false;
    return flow().start() !== null;
  }

  function toggleAcknowledged() {
    const current = flow().state();
    if (current.status === 'preview') flow().setAcknowledged(!current.acknowledged);
  }

  return {
    state,
    busy: isExportBusy(state),
    result: state.status === 'finished' ? describeExportResult(state.result) : null,
    start,
    cancel: () => { flow().cancel(); },
    confirm: () => { void flow().confirm(); },
    toggleAcknowledged,
    guard,
  };
}
