// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type RefObject } from 'react';

import type { PendingSelection } from '../../../../src/reader/highlight-selection';
import type { HighlightLoad, HighlightSession } from '../../../../src/storage/highlight-session';
import { HighlightOutcomeUnknownError, type SavedHighlight } from '../../../../src/storage/saved-highlights';

export type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; unreadable: number };

function sortHighlights(list: SavedHighlight[]): SavedHighlight[] {
  return [...list].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The open book's saved highlights and their save and delete messages. Callers check the
 * screen-level conditions (writer closed, export running, list ready) before save and remove.
 */
export function useHighlights(session: HighlightSession, activeRef: RefObject<boolean>) {
  const [highlights, setHighlights] = useState<SavedHighlight[]>([]);
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const apply = useCallback((result: HighlightLoad) => {
    if (!activeRef.current || result.status === 'stale') return;
    if (result.status === 'error') {
      setListState({ status: 'error' });
      return;
    }
    setHighlights(result.highlights);
    setListState({ status: 'ready', unreadable: result.unreadable });
  }, [activeRef]);

  // The list starts in the loading state, so the first read sets state only once it settles.
  useEffect(() => { void session.load().then(apply); }, [session, apply]);

  async function load() {
    setListState({ status: 'loading' });
    apply(await session.load());
  }

  function clearMessages() {
    setNotice('');
    setError('');
  }

  /** Resolves true once the passage is stored, whether newly or already, so the caller can clear its selection. */
  async function save(pending: PendingSelection): Promise<boolean> {
    setSaving(true);
    clearMessages();
    try {
      const { highlight: saved, created } = await session.save({
        documentId: pending.documentId, exact: pending.exact, cfi: pending.cfi, href: pending.href, createdAt: Date.now(),
      });
      if (!activeRef.current) return false;
      setHighlights(current => sortHighlights([...current.filter(item => item.id !== saved.id), saved]));
      setNotice(created ? 'Highlight saved on this device.' : 'This passage was already saved.');
      return true;
    } catch (reason: unknown) {
      if (!activeRef.current) return false;
      if (reason instanceof HighlightOutcomeUnknownError) {
        setError('The save may have finished, but it could not be confirmed. Checking saved highlights again.');
        void load();
        return false;
      }
      setError(reason instanceof RangeError ? `Not saved: ${reason.message}.` : 'The highlight could not be saved on this device. Nothing was saved.');
      return false;
    } finally {
      if (activeRef.current) setSaving(false);
    }
  }

  function remove(highlight: SavedHighlight) {
    if (deletingId) return;
    setDeletingId(highlight.id);
    clearMessages();
    // The marks effect removes the drawn mark once the row leaves the list.
    session.remove(highlight.id)
      .then(removed => {
        if (!activeRef.current) return;
        setHighlights(current => current.filter(item => item.id !== highlight.id));
        setNotice(removed ? 'Highlight deleted.' : 'This highlight was already gone.');
      })
      .catch((reason: unknown) => {
        if (!activeRef.current) return;
        if (reason instanceof HighlightOutcomeUnknownError) {
          setError('The delete may have finished, but it could not be confirmed. Checking saved highlights again.');
          void load();
          return;
        }
        setError('The highlight could not be deleted. It is still saved.');
      })
      .finally(() => { if (activeRef.current) setDeletingId(null); });
  }

  return { highlights, listState, saving, deletingId, notice, error, clearMessages, load, save, remove };
}
