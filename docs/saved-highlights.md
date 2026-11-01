# Private saved EPUB highlights

## Scope

The Android/iOS reader can save a selected EPUB passage as a private, local highlight, list a book's highlights when the same exact EPUB is reopened, show them as renderer highlight marks, return to one, and delete one. Export, sync, sharing, AI, PDF and web reading are not part of this slice. The web route remains an informational placeholder.

## Engine contract actually used

Checked against the installed `@epubjs-react-native/core` 1.4.8 types and compiled source:

- `onSelected(selectedText, cfiRange)`: the WebView template posts `range.toString()` together with the epub.js range CFI. Leafellow keeps that text byte for byte and requires an `epubcfi(parent,start,end)` range. A missing or point CFI is refused, not repaired.
- The section `href` comes only from this book's latest `onLocationChange`/`onReady` location (`location.start.href`). There is no fallback to `useReader().section`. With no reported section the selection is refused. With `flow="scrolled-doc"` one section is shown at a time. A selection becomes stale and is cleared when the reported section changes.
- `ReaderProvider` is mounted per open book (`ReaderScreen`, keyed by source identity), so no engine state from a previous book is reachable.
- Return to a passage (`src/reader/passage-jump.ts`): `goToLocation` only dispatches `rendition.display(...)` and reports nothing, so Leafellow does not use it. It calls `useReader().injectJavascript` with a script whose request (`token`, `cfi`, `exact`) is passed as `JSON.stringify` data. In the WebView the script uses the template's globals `book`, `rendition` and `ePub` (template.js `let book; let rendition;` and the epub.js bundle's `ePub.CFI` export). It confirms only when all of these hold: `rendition.display(cfi)` resolves; `book.getRange(cfi).toString()` equals the stored quote (the same call the template uses for `onSelected`); `rendition.getRange(cfi)` (the rendered view) has the same text; and the range start lies within `rendition.currentLocation()` start/end according to `ePub.CFI.prototype.compare`. The reply says whether the range end is also on screen, and on `not-visible` it carries the actual visible start/end CFIs. Having the right chapter rendered is not enough. Replies arrive through `window.ReactNativeWebView.postMessage` and `Reader.onWebViewMessage`. Only a reply whose correlation token matches the one pending request is accepted (the token is not a secret). The UI shows in-progress ("Checking…"), confirmed (whole or partial), failed (the reason by code), timeout (8 s) and reloaded (when the WebView restarts mid-jump). An already-visible passage confirms without needing a `relocated` event.
- Marks: every engine `onReady`, including a WebView reload, increments a readiness generation and clears the applied set. One effect then reconciles marks with the stored list (`addAnnotation` for missing, `removeAnnotationByCfi` for removed) for that WebView instance. Synchronous mark failures appear as a separate page-mark message and are never reported as storage failures. The reader theme is a module constant, because `Reader` reloads the WebView whenever `defaultTheme` changes identity.

## Storage

`src/storage/saved-highlights.ts` adds a `saved_highlights` table to the existing `leafellow.db` alongside `last_reading_position`. The table is created with `IF NOT EXISTS` and `PRAGMA user_version` stays at 1, so existing databases keep their reading position and the existing initializer still accepts the file. Versions above 1 are refused.

- Each row stores a private annotation-core version-1 record (`createAnnotation`/`serializeAnnotation`) for the exact-byte `sha256:` source identity. `deserializeAnnotation` with the expected source checks every row on read.
- Stable ID: `hl_` + the first 128 bits of SHA-256(source identity, NUL, CFI). `UNIQUE(document_id, cfi)` makes a repeated save return the original record unchanged.
- Limits: quote ≤ 4,000 UTF-16 units, CFI and href ≤ 1,024, record ≤ 65,536 (also a SQL `CHECK`), 500 highlights per source.
- All values are bound parameters. List and delete are scoped by `document_id`. Order is `created_at, id`.
- Malformed, foreign or inconsistent rows are counted as unreadable and never returned. The UI shows only the count.
- Writes (position, save, delete) and list reads (initial load, Retry, refresh) go through one serial writer via `src/storage/highlight-session.ts`. A read therefore reflects every mutation queued before it, and only the newest load is applied. Older loads come back `stale` and are dropped. Save is disabled until the list has loaded. Closing the reader waits for accepted work and then refuses new work.
- Failures before the write statement are definite ("Nothing was saved." / "It is still saved."). Once the INSERT/DELETE has been sent, any failure (native call, re-read, row validation) raises `HighlightOutcomeUnknownError`. The UI then says the outcome could not be confirmed and re-reads the list through the serial writer. Saves report `created` from storage rather than guessing from UI state.
- Highlights are stored locally in app-local SQLite, with no automatic upload. Platform backup inclusion has not been verified or configured, so no claim is made about backups.

## Evidence

Node 26 tests use a real `node:sqlite` database through `tests/sqlite-adapter.mjs`. They cover close/reopen persistence, source isolation, duplicate saves, scoped deletes, preserved positions, invalid input and size limits, malformed rows, adding the table to an existing version-1 database, newer-version refusal and SQL failure. Fault-injection tests commit the save or delete and then fail the follow-up read (by throwing, or by returning a corrupt row). They check for the uncertain-outcome error and that the row really was committed. Session tests cover reads queued behind saves and deletes, stale-load dropping, and scoping to one book. `tests/passage-jump.test.mjs` runs the injected script in a Node `vm` against a fake `book`/`rendition` that uses the **real `ePub.CFI` class loaded from the installed engine bundle** (`tests/epub-engine-cfi.mjs`). It covers confirmed, already visible, partly visible, the right chapter but off screen, another spine item, text mismatch, not rendered, display rejection, missing engine, hostile quote text, stale and forged replies, and timeout. These are adapter/logic tests. **They are not native evidence.**

The predecessor iOS build from `main` built and launched. Native selection, `onSelected` CFI delivery, mark rendering, navigation and expo-sqlite persistence for this slice have **not yet been verified** on any simulator or device.
