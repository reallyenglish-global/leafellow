// SPDX-License-Identifier: Apache-2.0
import type { useReader } from '@epubjs-react-native/core';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import {
  PASSAGE_JUMP_TIMEOUT_MS,
  buildPassageJumpScript,
  createPassageJumpRequest,
  passageJumpFailure,
  passageJumpStatus,
  readPassageJumpMessage,
  type PassageJumpOutcome,
  type PassageJumpRequest,
} from '../../../../src/reader/passage-jump';
import type { SavedHighlight } from '../../../../src/storage/saved-highlights';
import { highlightCfi } from './use-reader-marks';

/** One verified "Go to" at a time: inject the check, then settle on its reply, a reload or the timeout. */
export function usePassageJump(reader: ReturnType<typeof useReader>, activeRef: RefObject<boolean>) {
  const [jump, setJump] = useState<{ id: string; request: PassageJumpRequest } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pendingJump = useRef<PassageJumpRequest | null>(null);

  const finishJump = useCallback((outcome: PassageJumpOutcome) => {
    pendingJump.current = null;
    if (!activeRef.current) return;
    setJump(null);
    if (outcome.status === 'confirmed') {
      setNotice(outcome.fullyVisible
        ? 'Showing this highlight.'
        : 'Showing the start of this highlight; it continues below.');
    } else if (outcome.status === 'failed') {
      setError(outcome.reason);
    }
  }, [activeRef]);

  useEffect(() => {
    if (!jump) return;
    const timer = setTimeout(() => {
      if (pendingJump.current === jump.request) finishJump(passageJumpStatus(jump.request, Date.now()));
    }, Math.max(0, PASSAGE_JUMP_TIMEOUT_MS - (Date.now() - jump.request.requestedAt)));
    return () => clearTimeout(timer);
  }, [jump, finishJump]);

  function clearMessages() {
    setNotice('');
    setError('');
  }

  /** Returns false, touching nothing, when this highlight cannot be jumped to or a jump is already pending. */
  function goTo(highlight: SavedHighlight): boolean {
    const cfi = highlightCfi(highlight);
    if (!cfi || pendingJump.current || highlight.annotation.anchor.format !== 'epub') return false;
    clearMessages();
    let request: PassageJumpRequest;
    try {
      request = createPassageJumpRequest(cfi, highlight.annotation.quote.exact, Date.now());
    } catch {
      finishJump(passageJumpFailure('invalid-target'));
      return true;
    }
    pendingJump.current = request;
    setJump({ id: highlight.id, request });
    try {
      reader.injectJavascript(buildPassageJumpScript(request));
    } catch {
      finishJump(passageJumpFailure('engine-unavailable'));
    }
    return true;
  }

  /** A WebView (re)load abandons any jump in flight. */
  function onReady() {
    if (pendingJump.current) finishJump(passageJumpFailure('reloaded'));
  }

  function onWebViewMessage(message: unknown) {
    const outcome = readPassageJumpMessage(pendingJump.current, message);
    if (outcome && outcome.status !== 'in-progress') finishJump(outcome);
  }

  /** Drops the pending request so no late reply or timeout reports on a closing screen. */
  function cancel() {
    pendingJump.current = null;
  }

  return { jump, goTo, onReady, onWebViewMessage, notice, error, clearMessages, cancel };
}
