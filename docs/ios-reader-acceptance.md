# iOS reader acceptance — candidate harness

## Status and scope

Base: `eb9cea48e9f35edf3d0e1a46db004a02eac73c2a` (merged Android acceptance).
This slice adds an **opt-in native acceptance job**, not an iOS support claim.
No production reader, storage schema, provider, entitlement or app sharing setting changes.
No push, PR publication, merge or deployment is authorized by local implementation alone.

Existing iOS CI only builds, launches and captures a screenshot. The new gate must exercise:

1. Native Files picker → generated, DRM-free EPUB → rendered opening word.
2. Native long press → exact quote preview → save one private highlight.
3. Scroll away, normal Library tap, terminate/relaunch **without clearing app data**.
4. Re-select the identical bytes; restore position, count and rendered paragraph away from the quote.
5. Return to the saved range; independently see the quote in the reader, not just the highlight row.
6. Review export privacy preview, acknowledge and choose a real folder. Read back one real JSON file,
   validate source SHA, exact quote, private v1 record and range CFI with the existing export checker.
7. Delete, restart and re-select; the saved highlight count must remain zero.

## Privacy boundary: a separate synthetic Files location

Do **not** enable `UIFileSharingEnabled` on Leafellow. Expo SQLite lives in the app's private
storage; exposing the entire Documents folder is not needed for reader acceptance.

`e2e/ios/FixtureShelf.swift` is a tiny simulator-only companion, compiled against the simulator SDK
and locally ad-hoc signed without credentials. Its Files-enabled Documents contain only:

- `leafellow-fixture.epub` — the same generated and pinned-hash EPUB as Android.
- `LeafellowExports/` — an initially empty folder chosen explicitly in the real folder picker.

It has a different bundle identifier, is never included in Leafellow or distributed, and uses no
network or Apple account. Only its data container is staged and read. Existing files/exports fail
closed rather than being overwritten/deleted. The acceptance wrapper refuses a Leafellow binary
whose Info.plist enables Files sharing.

## Hosted execution (requires publication approval)

The existing `ios.yml` gains `workflow_dispatch` input `reader_acceptance` (default false).
Normal push/PR build/smoke checks remain; they do **not** imply reader acceptance.

After approval to publish the branch/PR:

```bash
gh workflow run ios.yml -R reallyenglish-global/leafellow \
  --ref test/ios-reader-acceptance -f reader_acceptance=true
```

Build job: pinned Xcode 26.6 on `macos-26`; existing Release simulator build. Upload the zip,
SHA-256 checksum and provenance (exact checkout SHA, workflow run ID and build attempt).
Acceptance job: downloads that run's artifact, verifies checksum and exact source/run before
extraction, and creates its own `LeafellowAcceptance-RUN-ATTEMPT` iPhone 17 / iOS 26.5 simulator.
Missing Xcode/runtime fails visibly; no silent toolchain fallback.

The wrapper requires an explicit simulator UUID listed as available and booted on the pinned runtime,
with the **exact** dedicated name supplied by the workflow for this run/attempt. It never targets `booted`, hardware, an existing personal-named
simulator, or an unverified container. Cleanup removes **only** the simulator this job created.
Maestro 2.12.0 is downloaded from the fixed release and checked against the same pinned archive
SHA-256 already used by Android. No `curl | sh`, provider credentials or signing secrets.

If only acceptance fails, rerun failed jobs to reuse the verified build; the artifact source/run
must still match. Follow-up source changes require fresh exact-head verification.

## Evidence and failure handling

The wrapper records `status.json` (first failure wins), per-step tool logs, Maestro JUnit,
screenshots/hierarchy debug evidence, an end-of-run simulator screenshot and bounded app logs.
It reads the actual export even after a later UI assertion fails and retains any verified export.
Diagnostics are best-effort and cannot convert a failed or passed acceptance into the opposite result.
Workflow artifacts upload on failure before simulator cleanup.

Host tests mock simulator/tool boundaries and include dummy artifact bytes strictly for checksum
admission tests. They prove orchestration and failure propagation, **not** UIKit/Files/WebView behavior.
The Files selectors, helper Swift compilation, signing, Files registration, security-scoped directory
access, quote selection, layout, export consent and physical rendering need hosted native evidence.
Missing or mismatched controls must be fixed from that evidence; do not make them optional or replace
native selection with injected JavaScript, a direct import hook or fabricated exports.

## Observed local results and review

- 60 Python tests passed (21 iOS harness/artifact/policy tests; 39 existing tests).
- 99 JavaScript tests passed; both core/mobile TypeScript checks passed.
- `actionlint 1.7.12` passed on the changed workflow; all four Maestro YAML files parsed.
- `git diff --check` passed. No TypeScript/React source or application config changed;
  the project has no configured ESLint gate, so none was bootstrapped for this test-only slice.
- Independent packet-only Claude review identified a restored-picker title/row race. Regression
  coverage was added, navigation was changed to positive location markers with Search-relative
  row selectors, and follow-up review found no source-level blocker (medium confidence).
- Review also prompted exact simulator run-name binding and preservation of partial stdout on
  timeout, with process-group termination. The remaining Files-state timing/label questions fail
  closed and require actual hosted screenshots/hierarchies rather than another host simulation.
- The runner-image inventory lists Xcode 26.6 and iOS 26.5; installation on the actual runner is
  still an execution prerequisite, not assumed runtime evidence.

Sources: [hosted macOS image inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md),
[Maestro relational selectors](https://docs.maestro.dev/reference/selectors/relational-selectors),
[Maestro 2.12 selector implementation](https://github.com/mobile-dev-inc/Maestro/blob/cli-2.12.0/maestro-client/src/main/java/maestro/Filters.kt),
[Expo SDK 58 filesystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/) plus installed
`expo-file-system/ios/FilePickingUtils.swift` source.

## Local verification

```bash
python3 -m unittest discover -s tests -v
mise exec node@24 -- pnpm test
mise exec node@24 -- pnpm typecheck
mise exec node@24 -- pnpm --filter @leafellow/mobile typecheck
mise exec actionlint@1.7.12 -- actionlint .github/workflows/ios.yml
git diff --check
```

This Linux host has no Xcode/simctl. Local green is a **candidate harness**, not completion of the
native acceptance slice. A hosted pass on the published exact head and review are required before
calling iOS reader acceptance verified; merge remains separately approved.
