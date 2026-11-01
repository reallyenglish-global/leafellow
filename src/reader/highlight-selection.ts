// SPDX-License-Identifier: Apache-2.0
// Pure selection/navigation rules for the native EPUB reader. No renderer imports here so the
// rules run under Node tests; the React Native surface feeds engine callbacks into them.

export const MAX_HIGHLIGHT_QUOTE_LENGTH = 4000;
export const MAX_HREF_LENGTH = 1024;
export const MAX_CFI_LENGTH = 1024;

// The engine interpolates CFIs into injected JavaScript (`rendition.display('<cfi>')`), so only
// CFI syntax characters are accepted: no quotes, backslashes, parentheses or line breaks inside.
const CFI_BODY = /^[A-Za-z0-9/!:.,~@;=_\-[\]^% ]+$/;

/** True only for an engine-shaped EPUB range CFI: epubcfi(parent,start,end). */
export function isEpubRangeCfi(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_CFI_LENGTH) return false;
  const match = /^epubcfi\((.+)\)$/.exec(value);
  if (!match || !CFI_BODY.test(match[1]!)) return false;
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of match[1]!) {
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth < 0) return false;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  if (depth !== 0 || parts.length !== 3) return false;
  const [parent, start, end] = parts as [string, string, string];
  return /^\/\d/.test(parent) && /^[/:]\d/.test(start) && /^[/:]\d/.test(end);
}

export type PendingSelection = { documentId: string; exact: string; cfi: string; href: string; selectedAt: number };
export type SelectionResult = { ok: true; selection: PendingSelection } | { ok: false; reason: string };

/**
 * Validates one engine `onSelected(text, cfiRange)` event. The text is kept byte for byte; a
 * selection without a valid range CFI or a known current section is refused rather than repaired.
 */
export function captureSelection(
  text: unknown,
  cfiRange: unknown,
  context: { documentId: string; href: string | null | undefined; selectedAt: number },
): SelectionResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, reason: 'The selection contained no text.' };
  }
  if (text.length > MAX_HIGHLIGHT_QUOTE_LENGTH) {
    return { ok: false, reason: `Select at most ${MAX_HIGHLIGHT_QUOTE_LENGTH.toLocaleString('en-US')} characters to save a highlight.` };
  }
  if (!isEpubRangeCfi(cfiRange)) {
    return { ok: false, reason: 'The reader did not report a usable location for this selection, so it cannot be saved.' };
  }
  const href = context.href;
  if (typeof href !== 'string' || href.trim().length === 0 || href.length > MAX_HREF_LENGTH || /[\u0000-\u001f]/.test(href)) {
    return { ok: false, reason: 'The current chapter is not known yet, so this selection cannot be saved.' };
  }
  return { ok: true, selection: { documentId: context.documentId, exact: text, cfi: cfiRange, href, selectedAt: context.selectedAt } };
}

/** A pending selection is stale once the reader has moved to another source or section. */
export function isSelectionCurrent(
  selection: PendingSelection,
  current: { documentId: string; href: string | null | undefined },
): boolean {
  return selection.documentId === current.documentId && selection.href === current.href;
}
