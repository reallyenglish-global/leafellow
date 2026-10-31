# Required formats: EPUB and PDF

## Confirmed scope

EPUB and PDF are both required on web, Android and iOS. The user's “epu” is interpreted as EPUB, not a third format. Format support is a requirement, not implemented functionality. Neither a single-format release nor a web-only reader satisfies this scope. Feasibility tasks may isolate a format, but both must pass before claiming the core reader supports the agreed scope.

## Shared experience

Import authorized files, render/read/navigate, select a passage, bookmark, highlight, annotate, preview outgoing context, ask AI, return to the source and restore private state offline. Provider access is a separate unresolved gate. Same learning controls and saved-record model, different format engines and location representations. No requirement for PDF editing, form filling, signatures or annotation write-back into the original file; initial annotations can live in Leafellow's private store/export.

## EPUB adapter

Candidate initial baseline: DRM-free reflowable EPUB. Persist publication/edition identity plus resource locator, format-native range and exact quote with surrounding context. Test restoration across font/line-spacing changes, viewport resize, pagination/scrolling and restart. Preserve semantic text/MathML where present; equations may instead be images and must not be silently transcribed as correct text. Fixed-layout EPUB, scripts, unusual media and accessibility behavior need explicit capability/support decisions rather than an unsupported blanket “every EPUB” claim.

## PDF adapter

Candidate initial baseline: DRM-free, unencrypted, text-based PDFs. Preserve the original fixed layout; zoom and page navigation are fundamental. Store document identity, a defined page index convention, page dimensions/rotation/crop transform, normalized range quadrilaterals and selected text/context. Test highlight alignment across zoom, rotation, viewport changes and restart; document displayed page labels separately from internal page indices.

Multi-column reading order, ligatures, missing glyph maps and equation extraction may differ from the visible page. Context preview must expose what will actually be sent. If the text layer is unreliable or absent, say so; never invent a quote or claim that an empty extraction means an empty page.

## Scans and visual equations — explicit scope decision

Detect image-only/poor-text pages and explain the limitation. Proposed later option: a user-selected region/image with explicit rights/privacy consent, or OCR with uncertain text preview and correction. **OCR/vision provider, processing location and budget are not approved or implemented.** Rendering a scanned page is not equivalent to selectable/OCR-backed AI discussion. Before selecting the release scope, decide whether scans are required at launch; do not quietly claim full PDF capability while omitting them. Do not bypass password/DRM protection.

## Engine strategy

Separate EPUB and PDF adapters behind common reader capability/selection/navigation contracts. Evaluate a browser EPUB engine and a PDF engine, with mobile embedded/native options as needed. Do not force PDF through EPUB conversion or assume one toolkit exposes equivalent capabilities in both formats. Dependencies, licenses, security patching, offline packaging, memory limits and accessibility need review before commitment.

## Acceptance matrix

All six combinations must be exercised: web/EPUB, web/PDF, Android/EPUB, Android/PDF, iOS/EPUB, iOS/PDF. Browser-engine coverage remains a further dimension.

For each combination: authorized import, navigation, selection/context accuracy, bookmark/highlight/annotation, position and anchor restoration after restart, format-appropriate layout/zoom changes, offline reading, failure feedback, accessibility and bounded large-document resource use. AI smoke tests require a permitted provider; curated explanations must not masquerade as live results.

Use at least one lawfully usable EPUB and one text-based PDF, with known expected passages and technical equations/diagrams, plus negative cases: malformed/oversized file, protected input and scanned/poor-text page. Define scan behavior honestly before implementation. Native device tests and real browser checks are required; unit tests and static exports do not prove the matrix.
