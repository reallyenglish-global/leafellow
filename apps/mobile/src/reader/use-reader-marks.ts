// SPDX-License-Identifier: Apache-2.0
import type { useReader } from '@epubjs-react-native/core';
import { useEffect, useRef, useState, type RefObject } from 'react';

import type { SavedHighlight } from '../../../../src/storage/saved-highlights';
import { HIGHLIGHT_STYLE } from './reader-theme';

export function highlightCfi(highlight: SavedHighlight): string {
  return highlight.annotation.anchor.format === 'epub' ? highlight.annotation.anchor.cfi : '';
}

/**
 * Keeps the marks drawn in the current WebView in step with the stored list. `reset` forgets every
 * drawn mark; call it from onReady, because a WebView (re)load starts with none.
 */
export function useReaderMarks(readerRef: RefObject<ReturnType<typeof useReader>>, highlights: SavedHighlight[], readyGeneration: number) {
  const [markError, setMarkError] = useState('');
  const applied = useRef(new Set<string>());

  // Reconcile drawn marks with the stored list for the current WebView instance only.
  useEffect(() => {
    if (readyGeneration === 0) return;
    const wanted = new Map(highlights.map(highlight => [highlightCfi(highlight), highlight] as const));
    let failed = 0;
    for (const cfi of [...applied.current]) {
      if (wanted.has(cfi)) continue;
      try {
        readerRef.current.removeAnnotationByCfi(cfi);
        applied.current.delete(cfi);
      } catch {
        failed += 1;
      }
    }
    for (const [cfi, highlight] of wanted) {
      if (!cfi || applied.current.has(cfi)) continue;
      try {
        readerRef.current.addAnnotation('highlight', cfi, { id: highlight.id }, HIGHLIGHT_STYLE);
        applied.current.add(cfi);
      } catch {
        failed += 1;
      }
    }
    // Reported once the effect has finished rather than synchronously inside it; a newer
    // reconciliation, or unmounting, supersedes a report that has not landed yet.
    let current = true;
    void Promise.resolve().then(() => {
      if (current) {
        setMarkError(failed > 0
          ? 'Some highlight marks could not be updated on the page. Your saved highlights are unchanged.'
          : '');
      }
    });
    return () => { current = false; };
  }, [readerRef, readyGeneration, highlights]);

  function reset() {
    applied.current = new Set();
  }

  return { markError, reset };
}
