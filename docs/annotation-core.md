# First TDD implementation contract: portable passage annotations

## Goal and acceptance

Implement a small TypeScript core shared by future web, Android and iOS adapters: create private passage annotations with source-version identity, format-specific EPUB/PDF anchors, selected quote/context and an optional personal note; serialize/restore a versioned record without silently rebinding it to another document.

Use RED/GREEN cycles for one behavior at a time, then run standard-library foundation tests, TypeScript checks and Node tests in GitHub Actions. No dependencies at runtime; TypeScript is a pinned development tool. Node tests are contract tests, not proof of native compatibility. No application framework decision is finalized here.

## Invariants / blast radius

Only new domain code, tests, developer commands, documentation and CI. No ebook parser/rendering, provider authentication/inference, app scaffold, storage service, network call, migration or deployment. No previous saved-record format or users exist. Publication goes to a reviewed feature branch, not a merge into main.

Source-version IDs must be non-empty and are supplied by future import adapters; this module does not calculate file hashes. EPUB CFI is an opaque engine locator with a basic shape check, not a full CFI validator. PDF rectangles are normalized in the unrotated cropped page frame; pageIndex is zero-based and rotation is explicit. No promise that current browser/native engines already generate this common contract.

Persisted records must remain private. Unknown schema versions and wrong source identity must fail explicitly. Selected text/context remains data, not markup or application instructions. Records must be recreated as owned data so caller mutation cannot change previously returned annotations.

## API and record limits

`createAnnotation(input)` returns an owned, private version-1 record. `serializeAnnotation(record)` revalidates before JSON encoding. `deserializeAnnotation(json, expectedDocumentId)` validates the saved schema/privacy and rejects a source-ID mismatch rather than silently rebinding it. IDs/quotes/locators are preserved, not whitespace-normalized. Missing optional note becomes an empty string. Unknown input properties are dropped; public-sharing records need a distinct later contract.

Serialized input/output is limited to 65,536 JavaScript UTF-16 code units, not bytes. Malformed JSON, unsupported versions, non-private saved records, non-finite/out-of-page rectangles and sparse rectangle arrays are rejected. This is a small local-record contract, not a general hostile-document sanitizer or complete source authenticity check. No file I/O or automatic network activity occurs.

## Observed TDD evidence

Executed on Node 26.13.0 with TypeScript 7.0.2. All fixtures use synthetic source identities and text.

1. RED: missing implementation module; GREEN: private EPUB annotation creation (1 test).
2. RED: invalid PDF anchors did not throw; GREEN: page/rotation/normalized rectangle validation (2 tests).
3. RED: null input produced an accidental property-access error; GREEN: deliberate identity/quote/EPUB validation across invalid variants (3 tests).
4. RED: later caller mutation changed the returned quote; GREEN: copied quote/locator/rectangles and whitelisted stored fields (4 tests).
5. RED: serializer was not implemented; GREEN: Unicode EPUB/PDF JSON round trips (5 tests).
6. RED: mismatched expected document was accepted; GREEN: source mismatch, unsupported schema and non-private record rejection (6 tests).
7. RED: sparse rectangle arrays and oversized records were accepted; GREEN: explicit hole handling and record-size bounds, with malformed JSON/primitive rejection (8 tests).

Every cycle was actually run; this summary is not a claim of persisted failing CI commits. Failing stages were local and do not need to break the shared branch. The checks were rerun after each implementation change.

## Verification and limitations

`pnpm test`, `pnpm typecheck`, `python3 -m unittest discover -s tests -v`, `git diff --check`. Keep observed RED/GREEN evidence with the PR. Import safety, anchor resolution/reflow correctness, encrypted storage, renderer integration, browser tests and Android/iOS device tests are later acceptance work, not covered by these unit tests.
