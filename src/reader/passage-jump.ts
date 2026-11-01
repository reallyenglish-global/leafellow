// SPDX-License-Identifier: Apache-2.0
// Exact-passage navigation for the native EPUB reader. The engine's goToLocation only dispatches
// `rendition.display(...)`, so instead the app injects one script that displays the stored range,
// re-reads its text with the same `book.getRange(cfi).toString()` call the engine used when the
// passage was selected, and checks the range against `rendition.currentLocation()` with epub.js's
// own `ePub.CFI.prototype.compare`. Only a reply carrying the current request token is accepted.

import { isEpubRangeCfi, MAX_HIGHLIGHT_QUOTE_LENGTH } from './highlight-selection.ts';

export const PASSAGE_JUMP_MESSAGE_TYPE = 'leafellowPassageJump';
export const PASSAGE_JUMP_TIMEOUT_MS = 8000;

export type PassageJumpRequest = { token: string; cfi: string; exact: string; requestedAt: number };
export type PassageJumpFailure =
  | 'engine-unavailable' | 'invalid-target' | 'display-failed' | 'text-mismatch'
  | 'not-rendered' | 'not-visible' | 'error' | 'timeout' | 'reloaded';
export type PassageJumpOutcome =
  | { status: 'in-progress' }
  | { status: 'confirmed'; fullyVisible: boolean; visibleStart: string; visibleEnd: string }
  | { status: 'failed'; code: PassageJumpFailure; reason: string };

const TOKEN = /^jump-[a-z0-9]{1,24}-[a-z0-9]{1,24}$/;
const FAILURE_REASONS: Record<PassageJumpFailure, string> = {
  'engine-unavailable': 'The reader is not ready to move to this highlight yet. Try again in a moment.',
  'invalid-target': 'This highlight’s saved location is not one the reader can use.',
  'display-failed': 'The reader could not display this highlight’s saved location.',
  'text-mismatch': 'The text at this highlight’s saved location no longer matches the saved passage.',
  'not-rendered': 'The reader moved, but the saved passage is not on screen.',
  'not-visible': 'The reader moved, but the saved passage is not on screen.',
  error: 'The reader reported an error while moving to this highlight.',
  timeout: 'The reader did not confirm it reached this highlight.',
  reloaded: 'The reader reloaded before it confirmed this highlight. Try Go to again.',
};

let sequence = 0;

/** Correlation token only: it matches a reply to its request and is not a secret. */
export function createPassageJumpRequest(cfi: string, exact: string, now: number): PassageJumpRequest {
  if (!isEpubRangeCfi(cfi)) throw new TypeError('Invalid highlight location');
  if (typeof exact !== 'string' || exact.length === 0 || exact.length > MAX_HIGHLIGHT_QUOTE_LENGTH) {
    throw new TypeError('Invalid highlight text');
  }
  sequence = (sequence + 1) % 0x7fffffff;
  return { token: `jump-${sequence.toString(36)}-${Math.max(0, Math.floor(now)).toString(36)}`, cfi, exact, requestedAt: now };
}

export function passageJumpFailure(code: PassageJumpFailure): PassageJumpOutcome {
  return { status: 'failed', code, reason: FAILURE_REASONS[code] };
}

// Runs inside the reader WebView. `book`, `rendition` and `ePub` are the globals declared by the
// engine template (template.js: `let book; let rendition;` plus the epub.js bundle).
const PAGE_FUNCTION = `function (req) {
  var bridge = window.ReactNativeWebView;
  function post(result) {
    result.type = ${JSON.stringify(PASSAGE_JUMP_MESSAGE_TYPE)};
    result.token = req.token;
    if (bridge && typeof bridge.postMessage === 'function') bridge.postMessage(JSON.stringify(result));
  }
  function fail(code, extra) {
    var result = extra || {};
    result.status = 'failed';
    result.code = code;
    post(result);
  }
  try {
    if (typeof book === 'undefined' || typeof rendition === 'undefined' || typeof ePub === 'undefined' ||
        !book || !rendition || !ePub.CFI || typeof ePub.CFI.prototype.compare !== 'function') {
      return fail('engine-unavailable');
    }
    var compare = ePub.CFI.prototype.compare;
    var target = new ePub.CFI(req.cfi);
    if (!target.range || !target.start || !target.end) return fail('invalid-target');
    var targetEnd = {
      spinePos: target.spinePos,
      range: false,
      path: { steps: target.path.steps.concat(target.end.steps), terminal: target.end.terminal }
    };
    Promise.resolve(rendition.display(req.cfi)).then(function () {
      return book.getRange(req.cfi);
    }, function () {
      throw { leafellow: 'display-failed' };
    }).then(function (range) {
      if (!range || range.toString() !== req.exact) return fail('text-mismatch');
      var rendered = rendition.getRange(req.cfi);
      if (!rendered || rendered.toString() !== req.exact) return fail('not-rendered');
      var location = rendition.currentLocation();
      if (!location || !location.start || !location.end || !location.start.cfi || !location.end.cfi) {
        return fail('not-visible');
      }
      var bounds = { visibleStart: location.start.cfi, visibleEnd: location.end.cfi };
      var startVisible = compare(location.start.cfi, target) <= 0 && compare(target, location.end.cfi) <= 0;
      if (!startVisible) return fail('not-visible', bounds);
      bounds.status = 'confirmed';
      bounds.fullyVisible = compare(location.start.cfi, targetEnd) <= 0 && compare(targetEnd, location.end.cfi) <= 0;
      post(bounds);
    }).catch(function (reason) {
      fail(reason && reason.leafellow === 'display-failed' ? 'display-failed' : 'error');
    });
  } catch (reason) {
    fail('error');
  }
}`;

// U+2028/U+2029 are legal in JSON but historically not in JS string literals; escape them.
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');
const escapeLineSeparator = (char: string) => `\\u${char.charCodeAt(0).toString(16)}`;

/** The request is passed as JSON data, never interpolated into code. */
export function buildPassageJumpScript(request: PassageJumpRequest): string {
  const payload = JSON.stringify({ token: request.token, cfi: request.cfi, exact: request.exact })
    .replace(LINE_SEPARATORS, escapeLineSeparator);
  return `(${PAGE_FUNCTION})(${payload}); true;`;
}

const FAILURE_CODES = new Set(Object.keys(FAILURE_REASONS));

/**
 * Reads one WebView message. Returns null for anything that is not a reply to the pending request
 * (other message types, stale or unknown tokens, malformed payloads), so it can never resolve a jump.
 */
export function readPassageJumpMessage(pending: PassageJumpRequest | null, message: unknown): PassageJumpOutcome | null {
  if (!pending || !message || typeof message !== 'object') return null;
  const reply = message as Record<string, unknown>;
  if (reply.type !== PASSAGE_JUMP_MESSAGE_TYPE || typeof reply.token !== 'string' ||
      !TOKEN.test(reply.token) || reply.token !== pending.token) {
    return null;
  }
  if (reply.status === 'confirmed' && typeof reply.fullyVisible === 'boolean' &&
      typeof reply.visibleStart === 'string' && typeof reply.visibleEnd === 'string') {
    return { status: 'confirmed', fullyVisible: reply.fullyVisible, visibleStart: reply.visibleStart, visibleEnd: reply.visibleEnd };
  }
  if (reply.status === 'failed' && typeof reply.code === 'string' && FAILURE_CODES.has(reply.code) &&
      reply.code !== 'timeout' && reply.code !== 'reloaded') {
    return passageJumpFailure(reply.code as PassageJumpFailure);
  }
  return passageJumpFailure('error');
}

/** Without a matching reply the jump stays in progress until the timeout, then fails closed. */
export function passageJumpStatus(pending: PassageJumpRequest, now: number): PassageJumpOutcome {
  return now - pending.requestedAt >= PASSAGE_JUMP_TIMEOUT_MS ? passageJumpFailure('timeout') : { status: 'in-progress' };
}
