# Gated roadmap

## 0. Foundation — current slice

Create original brand assets, renderer, validation, public-safe brief, Apache code license and separate brand terms. No production changes or working-reader claims.

## 0a. Shared annotation core — first implementation slice

Create private EPUB/PDF annotations with versioned serialization, source-identity checks, owned selection data and validated PDF page coordinates. Develop through observed RED/GREEN cycles; see [contract and evidence](annotation-core.md). Domain unit tests are not renderer, storage or device tests.

## 0b. Local document import — next implementation slice

Real EPUB/PDF byte parsing, exact-byte identity, ordered text parts and source/extraction-version-bound passage ranges are implemented in the proposed [document-import slice](document-import.md). This is Node-tested against generated documents, not a browser/native renderer or hardened public-upload service.

## 1. Requirements and bounded feasibility

Required targets are web, Android and iOS, not optional later ports. Choose an authorized file, platform test matrix and provider route; see [cross-platform architecture](cross-platform.md). Agree a time box and stop criteria. Test at least ten representative passages including equations if relevant. Every stored target must return to the intended passage after restart and supported layout changes; uncertainty must be shown rather than silently substituted. For PDFs, test coordinates/zoom rather than inappropriate reflow.

Record equation selection representation (plain text, MathML/LaTeX, image or none). Preview must not silently corrupt symbols. OCR/image support, if necessary, needs explicit provider/privacy/rights scope. Inspect import safety before opening untrusted files.

Demonstrate one permitted provider request, cancel, denied/expired auth, no-network behavior and no silent billing fallback. Known/unknown cost and quota status must be honest. A failure means change engine/route, reduce scope or pause—not quietly bypass the gate.

## 2. Personal reading vertical slice

Import → read → highlight → context preview → explanation/bridge → private annotation → return → offline resume/export. Both EPUB and PDF across web, Android and iOS, with one permitted provider initially. Individual feasibility tasks may isolate formats, but a single-format result is not acceptance of the agreed core reader scope. See [format scope](formats.md). Test anchors, partial AI output, hostile imports, consent, secrets, restart and restore. Run on target hardware; a screenshot is not proof of the experience.

**Initial prototype status:** React Native + Expo app code imports a selected local, bounded, DRM-free/reflowable EPUB and renders a selection-preview surface on Android/iOS. Alice's Adventures in Wonderland (Project Gutenberg EPUB3) is the chosen first source. One last-reading CFI, progress value and content hash are stored in app-local SQLite; the same EPUB must be selected again to resume, and source bytes are not retained. iOS/Android bundles type-check and export. The predecessor iOS build from `main` built and launched. The web route is an informational placeholder.

**Saved highlights (implemented, not accepted):** users can save a selected passage as a private, local highlight, then list, mark, return to and delete it per exact source. See [saved highlights](saved-highlights.md). Real-SQLite adapter and logic tests pass. Native selection, mark rendering, navigation and SQLite behavior for highlights are not yet verified on a simulator or device. Export is the next slice. PDF, AI and full cross-platform acceptance remain unimplemented.

## 3. Learning evidence and optional sharing

Reviewed foundation examples, learner-controlled concepts and delayed unaided checks. Try voluntary export of a short question to one partner with rights/audience preview. Do not export private chat history or whole books. No autonomous reading of partner replies.

## 4. Sync and invite-only reading rooms

Resolve conflicts, tombstones, deletion/backup retention and explicit publishing. Same-edition anchors first; defer cross-edition matching. Before invitations: moderation owner, adult pilot policy, report/block, takedown and server-side access tests, including revoked members and cross-room denial.

## 5. Distribution

Recheck provider terms, accessibility, import security, privacy, licenses, app-store obligations and costs. Public source publication is not approval for a hosted service or commercial release.
