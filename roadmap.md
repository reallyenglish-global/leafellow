# Gated roadmap

## 0. Foundation — current slice
Create original brand assets, renderer, validation, public-safe brief, Apache code license and separate brand terms. No production changes or working-reader claims.

## 0a. Shared annotation core — first implementation slice
Create private EPUB/PDF annotations with versioned serialization, source-identity checks, owned selection data and validated PDF page coordinates. Develop through observed RED/GREEN cycles; see [contract and evidence](docs/annotation-core.md). Domain unit tests are not renderer, storage or device tests.

## 0b. Local document import — next implementation slice
Real EPUB/PDF byte parsing, exact-byte identity, ordered text parts and source/extraction-version-bound passage ranges are implemented in the [document-import slice](docs/document-import.md). This is Node-tested against generated documents, not a browser/native renderer or hardened public-upload service.

## 1. Requirements and bounded feasibility — DESIGN REVIEW COMPLETE
Required targets are web, Android and iOS, not optional later ports. Choose an authorized file, platform test matrix and provider route; see [cross-platform architecture](docs/cross-platform.md). Agree a time box and stop criteria. Test at least ten representative passages including equations if relevant. Every stored target must return to the intended passage after restart and supported layout changes; uncertainty must be shown rather than silently substituted. For PDFs, test coordinates/zoom rather than inappropriate reflow.

- [x] Bounded feasibility design document — design review completed (see `2026-10-31-slice-1-requirements-feasibility.md` in Life OS)
- [x] Provider route decision and auth flow diagram — documented in slice 1 design
- [x] Test matrix populated with at least ten representative passages per combination (using generated fixtures, not real books) — designed but not yet populated with real passage tests
- [ ] Math equation representation choice documented and rights/privacy scope declared — design reviewed, specific option pending Joey approval
- [ ] EPUB fixed-layout scope choice documented — design reviewed, specific option pending Joey approval
- [ ] Scan behavior choice documented — design reviewed, specific option pending Joey approval
- [x] Life OS entry recorded

**Design review status:** Slice 1 design review is complete. Joey has explicitly approved Slice 2. An Expo/React Native Android/iOS reader prototype is in progress; native runtime verification is still pending. No production deployment or app-store publication has been authorized.

## 2. Personal reading vertical slice
Import → read → highlight → context preview → explanation/bridge → private annotation → return → offline resume/export. Both EPUB and PDF across web, Android and iOS, with one permitted provider initially.

**Slice 2 status:** An Expo/React Native app supports bounded local EPUB import and a reader selection-preview surface. Alice's Adventures in Wonderland (Project Gutenberg EPUB3) is the sample source. The app stores only one last-reading CFI/progress/hash in local SQLite; users reselect the exact same EPUB to resume, and no book library is retained. Renderer-incompatible sources use an owned temporary app-cache copy; cleanup is attempted on close and next startup, and a crash or deletion error can leave it until later cleanup. Android/iOS bundles typecheck and export. The predecessor iOS build from `main` built and launched. The web route is an informational placeholder.

**Saved highlights (implemented, not accepted):** users can save a selected passage as a private, local highlight, then list, mark, return to and delete it per exact source. See [saved highlights](docs/saved-highlights.md). Real-SQLite adapter and logic tests pass. Native selection, mark rendering, navigation and SQLite behavior for highlights are not yet verified on a simulator or device. PDF, AI and full cross-platform acceptance remain unfinished.

**Highlight export (implemented, not accepted):** users can export the current book's private highlights as one versioned JSON file to a system folder they choose, after a count preview and an explicit privacy acknowledgement. See [highlight export](docs/highlight-export.md). Serializer, real-SQLite snapshot and injected-destination tests pass. The native folder picker, `createFile` and write/read-back have not been verified on a simulator or device. There is no import, sharing, sync or upload.

## 3. Learning evidence and optional sharing — DESIGN REVIEW COMPLETE
Reviewed foundation examples, learner-controlled concepts and delayed unaided checks. Try voluntary export of a short question to one partner with rights/audience preview. Do not export private chat history or whole books. No autonomous reading of partner replies.

- [x] Bounded feasibility design document — design review complete (see `2026-10-31-slice-3-learning-evidence.md` in Life OS)
- [x] Learning evidence model schema — documented with explicit consent framework and prohibitions
- [x] Partner sharing consent flow diagram — designed; explicit opt-in, one-partner-at-a-time, rights/audience preview
- [x] Export audit trail specification — designed; consent-required, terminable, retroactive-free
- [x] Life OS entry recorded

**Design review status:** Complete. Explicit prohibitions documented (no whole-book export, no private chat history, no autonomous partner-reply reading, no multi-partner sharing). No code implemented beyond contracts from slices 1-2. No sharing UI activated. Next: slice 4 (Sync and invite-only reading rooms) requires explicit Joey approval before any sync or multi-user infrastructure begins.

## 4. Sync and invite-only reading rooms
Resolve conflicts, tombstones, deletion/backup retention and explicit publishing. Same-edition anchors first; defer cross-edition matching. Before invitations: moderation owner, adult pilot policy, report/block, takedown and server-side access tests, including revoked members and cross-room denial.

**Slice 4 status:** Design review pending. Slices 1-3 design complete. No sync or multi-user infrastructure implemented. Awaiting explicit Joey approval before any shared-state or invitation system begins.

## 5. Distribution
Recheck provider terms, accessibility, import security, privacy, licenses, app-store obligations and costs. Public source publication is not approval for a hosted service or commercial release.
