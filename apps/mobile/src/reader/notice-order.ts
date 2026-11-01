// SPDX-License-Identifier: Apache-2.0
import { useCallback, useRef, useState, type RefObject } from 'react';

// The reader's notices come from several sources (save/delete, go-to, a tapped mark) but share one
// line on screen. Each notice is stamped from one counter so the screen can show the newest, the
// same last-write-wins behavior as a single shared message slot.
export type Notice = { text: string; order: number };

/** One source's notice. `set` must be called from handlers or async callbacks, never during render. */
export function useOrderedNotice(orderRef: RefObject<number>) {
  const [notice, setNoticeState] = useState<Notice>({ text: '', order: 0 });
  const setNotice = useCallback((text: string) => {
    orderRef.current += 1;
    setNoticeState({ text, order: orderRef.current });
  }, [orderRef]);
  return [notice, setNotice] as const;
}

/** The counter shared by every notice source on one screen. */
export function useNoticeOrder() {
  return useRef(0);
}

export function latestNotice(...notices: Notice[]): string {
  let latest: Notice = { text: '', order: -1 };
  for (const notice of notices) if (notice.text && notice.order > latest.order) latest = notice;
  return latest.text;
}
