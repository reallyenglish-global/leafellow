# Real-document import slice

## Goal and approved scope

After PR 1 merge, implement real-byte EPUB/PDF parsing and bounded extraction of passage text, using generated original test documents. Runtime behavior is local/read-only: no shell, network, document-script execution, provider calls, cloud upload, storage changes or deployment. Deliver as a separate PR; PR 1 merge authorization does not authorize merging this slice.

## Contract and boundaries

- `importDocument(bytes)` returns SHA-256 identity of the exact original bytes, format and ordered text parts. EPUB parts use resource hrefs in spine order; PDF parts use zero-based page indices. A part without extractable text is labelled explicitly, never silently treated as an empty book.
- `selectPassage(document, partIndex, start, end)` preserves a selected UTF-16 text range, context, source identity and extractionVersion 1. It is an extracted-text selection, NOT a renderer CFI or glyph rectangle. Never fabricate an annotation anchor. Conversion to the existing annotation contract requires actual renderer selection/geometry in a later slice.
- Initial profile: DRM-free, unencrypted, small reflowable EPUB with well-formed XML/XHTML, and text-based PDF. Encrypted, scripted or fixed-layout EPUB is rejected rather than claimed supported. No OCR, equation-image understanding or layout fidelity guarantee.
- Bytes/entry/declared expansion/page/text limits and path/XML/active-content rejection are basic admission controls, not a complete hostile-parser sandbox. Only generated fixtures are exercised here. Before exposing arbitrary public imports: worker/process isolation, cancellation/deadlines, stronger ZIP validation, broader security review and real browser/native tests remain required.
- Raw XHTML is never returned as renderable content. No external resource fetch; PDF uses bytes and no resource URLs. PDF.js is a candidate adapter in a Node-tested extraction path, not an already validated React Native integration.

## Dependencies and evidence

Pinned fflate 0.8.3 (MIT), fast-xml-parser 5.11.2 (MIT), PDF.js 6.4.299 (Apache-2.0), @noble/hashes 2.4.0 (MIT); versions/licenses inspected from registry and package source. Existing TypeScript development tool remains pinned. Dependencies are installed with lifecycle scripts disabled; audit and licenses are checked before publication. PDF.js imported successfully in local Node before feature implementation; this is a prerequisite probe, not a passing feature test.

## Implemented profile and limits

- Source size at most 2 MiB; EPUB at most 128 ZIP entries, 512 KiB declared expanded bytes per entry, 4 MiB declared total expansion, and 100 spine parts; PDF at most 100 pages.
- Text limit: 100,000 JavaScript UTF-16 code units per part and 500,000 per document. Context: at most 80 code units on each side of a selection. Invalid ranges and selection boundaries splitting surrogate pairs are rejected; offsets refer to this extraction version, not original layout.
- Assumes UTF-8 XML/XHTML; other encodings are not converted or claimed supported. DTD declarations (including ordinary external XHTML DTDs) are intentionally unsupported. Scripts/event attributes, declared scripted EPUB, fixed-layout EPUB, duplicate manifest IDs, non-XHTML spine resources and encryption metadata are rejected. Relative paths are deliberately conservative; parent segments and query/fragment/remote paths are unsupported.
- EPUB admission is metadata-based ZIP preflight using fflate, not full ZIP integrity/CRC validation or guaranteed decompression CPU isolation. Declared lengths cannot prove hostile compressed data safe. Do not expose this prototype directly to arbitrary public uploads.
- PDF.js loads from copied bytes with no remote asset URLs, WASM/worker fetching disabled and no rendering/actions requested. Caller buffers are not transferred/detached. Password-required and owner-only encrypted PDFs are rejected. Tasks are destroyed in a finally block. Empty/no-text pages are marked unavailable; that does not prove they are scanned or prove OCR ran.
- PDF text is parser extraction order, not a validated multi-column reading order or equation transcription. EPUB inline text is whitespace-normalized; layout and full MathML semantics are not preserved. Original source bytes retain their distinct hash identity.

## Observed TDD and execution evidence

1. RED: import module missing; GREEN: real compressed EPUB fixture, inline/entity text and spine order.
2. RED: PDF bytes sent to ZIP parser; GREEN: real PDF.js extraction of generated PDF page text with intact caller bytes.
3. RED: wrong source type returned incidental ZIP error; GREEN: explicit type, signature, size and malformed-input feedback.
4. RED: EPUB traversal/active content and expansion limits were accepted; GREEN: metadata preflight, paths, XML/active-content and protected/fixed-layout policy.
5. RED: duplicate manifest IDs and over-limit PDF page count accepted; GREEN: explicit manifest/media and page limits.
6. RED: password-required PDF returned generic invalid error; GREEN: explicit encrypted-PDF rejection, also exercised against owner-only blank PDF.
7. RED: selection API missing; GREEN: source-bound quote/context with no fabricated CFI/rectangle.
8. RED: invalid text ranges, oversized extracted text and over-limit spine were accepted; GREEN: range/Unicode and text/spine bounds.
9. RED: a title containing a policy word was falsely classified fixed-layout; GREEN: parsed metadata/property checks, including entity-encoded scripted properties.
10. RED: selected ranges lacked extraction version; GREEN: document and passage records carry extractionVersion 1 so offsets are not silently treated as independent of extraction algorithm.

Additional regression check: both generated fixture formats imported with global fetch mocked to throw; zero fetch calls observed. This is a fixture-level regression check, not proof against every parser/network path. Feature tests were run before corresponding implementations and followed by green reruns; no intentionally failing CI commit was published.

All EPUB/PDF bytes are generated from original synthetic content in `tests/document-fixtures.mjs`, not downloaded books or mocked parser responses. The two base64 encrypted-PDF fixtures in `tests/protected-pdf.json` are original blank PDFs generated with pypdf 6.21.4 by `scripts/generate_protected_fixtures.py`; known fixture-only passwords are not real credentials. Normal tests do not install or execute pypdf. Type checks include DOM declarations because the real PDF.js adapter's upstream declarations need them; no type-check suppression is used.

## Acceptance / failure cases

Real generated EPUB spine ordering/inline text/entities and PDF page text; stable exact-byte identity; no mutation/transfer of caller bytes; unsupported/malformed/oversized inputs; EPUB paths, XML declarations/entities, active content, missing manifest/spine resources and expansion limits; no-text PDF feedback; bounded text-range selection with exact quote/context and no invented renderer anchors. Existing annotation tests remain green. Run strict TypeScript, Node 24/26 Actions, dependency audit, actionlint, foundation tests and secret/whitespace checks.

No browser UI, native build, font/layout/CFI resolution, PDF glyph hit testing, encrypted persistence or provider flow is covered by these tests. Changes are isolated to source/tests/docs/locked dependencies and CI test discovery. No existing persistent format migration or production impact.
