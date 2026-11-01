// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';

import { normalizeEpubReaderProgress } from '../../../../src/reader/reader-progress';
import { createLatestWriter, type LatestWriter } from '../../../../src/storage/latest-writer';
import { saveLastReadingPosition, type PositionDatabase } from '../../../../src/storage/reading-position';
import type { SerialWriter } from '../../../../src/storage/serial-writes';
import type { OpenBook } from './reader-screen';

type Position = { documentId: string; cfi: string; progress: number; updatedAt: number };

/** Progress for the header and the debounced, flush-on-background write of the reading position. */
export function useReadingPosition(db: PositionDatabase, writer: SerialWriter, book: OpenBook, active: RefObject<boolean>) {
  const [progress, setProgress] = useState<number | null>(null);
  const [positionError, setPositionError] = useState('');
  // Created on first use from an effect or a handler, never during render, and kept for the
  // screen's lifetime. Scroll relocations arrive in bursts; only the newest position is written,
  // after a short pause.
  const latest = useRef<LatestWriter<Position> | null>(null);
  const positionWriter = useCallback(() => {
    latest.current ??= createLatestWriter<Position>(
      position => writer.run(() => saveLastReadingPosition(db, position)).then(
        () => { if (active.current) setPositionError(''); },
        () => { if (active.current) setPositionError('The reading position could not be saved on this device.'); },
      ),
      { delayMs: 750 },
    );
    return latest.current;
  }, [db, writer, active]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void positionWriter().flush();
    });
    return () => {
      subscription.remove();
      // An unmount that bypasses close() must not leave a pending position unwritten.
      void positionWriter().flush();
    };
  }, [positionWriter]);

  function onLocationChange(location: { start: { href: string; cfi: string } }, percent: number) {
    setProgress(percent);
    try {
      const progressFraction = normalizeEpubReaderProgress(percent);
      if (writer.isClosed()) return;
      positionWriter().set({ documentId: book.id, cfi: location.start.cfi, progress: progressFraction, updatedAt: Date.now() });
    } catch {
      setPositionError('The reader reported invalid progress; this position was not saved.');
    }
  }

  /** Writes any pending position, then closes the shared serial writer once every write has settled. */
  async function close() {
    await positionWriter().close();
    await writer.close();
  }

  return { progress, positionError, onLocationChange, close, flush: () => positionWriter().flush() };
}
