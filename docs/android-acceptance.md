# Android reader acceptance

**Status: provisional.** The workflow, flow and tooling are implemented and checked on the host. **No full native acceptance pass yet:** rendering, real selection, saving and scrolling are verified. Run 41315463625 also passed the corrected visibility checks, then exposed a Library-button/status-bar overlap. The safe-area fix awaits a new hosted run; resume, return-to, export and deletion remain unverified. Nothing here counts as Android acceptance until a hosted CI run passes and its evidence artifact has been reviewed. iOS is separate and not covered: [`ios.yml`](../.github/workflows/ios.yml) is only a build and launch smoke test.

## What it exercises

[`.github/workflows/android-acceptance.yml`](../.github/workflows/android-acceptance.yml) runs on `pull_request` and manual `workflow_dispatch` only, so a branch push does not build twice. The flow is [`e2e/android/reader-acceptance.yaml`](../e2e/android/reader-acceptance.yaml). It uses only the real UI, the system pickers and native gestures:

1. Clean launch (`clearState: true`) of the installed Release APK. No Metro and no dev client.
2. **Choose an EPUB** opens the real system file picker (DocumentsUI). The flow picks `leafellow-fixture.epub`, which `adb` pushed to `/sdcard/Download/` and media-scanned.
3. A native Maestro `longPressOn` on the isolated, enlarged opening word **Luminous** in the rendered EPUB. The reader's existing `onSelected` path shows the **PASSAGE PREVIEW** with exactly that word. **Save highlight** is tapped. The flow waits for "Highlight saved on this device." and "Show highlights (1)".
4. Three native swipes scroll the long chapter until "Luminous" is no longer on screen. **Library** closes the reader, which waits for queued writes.
5. Force-stop and relaunch without clearing data. The flow reselects the identical file through the picker, then requires the resume note, "Show highlights (1)", and the opening word still off-screen before opening the highlight list.
6. **Go to** on the saved row uses the existing engine bridge. The flow requires "Showing this highlight." (or the "continues below" variant). The bridge only reports that after it checks the drawn range against the saved quote. A separate Maestro assertion requires "Luminous" visible above the highlights toggle (the reader area, not the saved-quote row).
7. **Export highlights…** opens the privacy preview. The flow ticks the acknowledgement checkbox, then **Choose folder and export** opens the real folder picker. The flow navigates to the new shared folder `/sdcard/Documents/LeafellowExports`, which `adb` created just before the run (the app gets no path), then chooses **Use this folder** and **Allow**. It waits for "Exported 1 highlight to the folder you chose…".
8. **Delete** removes the highlight. The flow returns to the library, force-stops, relaunches and reimports, then requires "Show highlights (0)".

After the flow, [`scripts/android-acceptance-run.sh`](../scripts/android-acceptance-run.sh) pulls the shared folder with `adb` and runs [`scripts/android_export_check.py`](../scripts/android_export_check.py). The check requires exactly one file named `leafellow-highlights-<first 12 hex of the fixture hash>-<id>.json`, the exact envelope keys, `source.documentId` equal to the fixture's `sha256:`, `count` 1, one private v1 record for that source with quote exactly `Luminous`, and an EPUB range CFI. A missing folder, an empty folder or extra files all fail.

No step is optional. Navigation inside the system file picker is conditional, because it may open on Recent or Downloads, but choosing the file is not. There is no `continueOnError`, no test-only route, no seeded database and no injected JavaScript selection.

## Renderer transport regression

The first hosted run built and installed the Release APK and selected the fixture through DocumentsUI, but the reader stayed on Opening before text appeared. A later hosted run (41313612875) verified the transport fix through actual rendering, long-press selection, save confirmation and scrolling. Android's picker returns a native `content://` URI; the installed EPUB engine passes its source to browser-side epub.js rather than reading it through Android's ContentResolver.

The app now stages the exact already-validated bytes in its own app-cache namespace when a source cannot be safely handed directly to the engine. The renderer receives a short `file:///cache/book-token.epub` URI, not the SAF URI or a base64 book embedded in its persistent HTML. Raw quote/backslash/script-delimiter paths are staged too, because the installed engine interpolates its source into a JavaScript literal. Safe existing iOS file URIs retain their prior path.

Only the operation's own newly-created file may be removed after a partial write; a failed exclusive creation must not delete an existing file. Cleanup is attempted on close, import failure, unmount and next startup. A crash or deletion failure can leave a temporary copy in cache until a later cleanup; no backup/secure-erasure guarantee is made. This is not a retained book library, an upload, or permission to execute book scripts. `allowScriptedContent` remains false. A bounded opening timeout now shows a useful error rather than an unexplained endless spinner.

Host regression tests cover this boundary and lifecycle. The transport fix has native rendering/selection/save evidence; restart, return-to, export and delete remain unverified until the full flow completes.

## Safe-area regression

Run 41315463625 passed the corrected positive-area visibility check, then a normal `reader-back` tap did not return to the library. Its failed-step image and hierarchy show the actual enabled button at `[42,44][210,140]` (center y=92), underneath Android SystemUI's status bar `[0,0][1080,128]`. This was a production touch-target/layout defect, not a reason to tap a special coordinate in the test.

The reader now applies live `useSafeAreaInsets()` values to header top padding and bottom controls, and subtracts those insets from the renderer viewport. The dark header continues behind the status bar; the Library control itself starts below it. The normal accessibility-directed tap and mandatory home-screen assertion are unchanged. Source-wiring/captured-geometry tests are only regression policy checks; a new hosted run must prove the control actually works before restart/resume acceptance is claimed.

## Fixture

[`scripts/android_fixture_epub.py`](../scripts/android_fixture_epub.py) writes a synthetic CC0 EPUB using only the Python standard library. Every entry is STORED, with a fixed timestamp, so the bytes do not depend on zlib. The output is pinned by `FIXTURE_SHA256`. CI regenerates the file on every run, and the run fails if the hash differs. No `.epub` is committed.

## Build and runtime jobs

- **build** (ubuntu-24.04, 45 min, JDK 17 for AGP 9.2.1): pnpm frozen install, then type checks, Node tests and Python tests *before* `expo prebuild --platform android --no-install`. It then runs `./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=2`. It uploads `app-release.apk`, its `sha256` and `provenance.json` (checkout SHA, PR head SHA, run ID) as `leafellow-android-release-apk-<run_id>`.
- **acceptance** (separate job, so a failed runtime job can be rerun on its own): downloads that exact artifact and verifies the checksum, run ID, checkout SHA and PR head SHA. It regenerates the fixture and installs Maestro CLI 2.12.0 from the fixed GitHub release URL, checked with `sha256sum` (no `curl | sh`). It enables KVM on this hosted runner only, then boots an API 36 `google_apis` x86_64 `pixel_6` emulator with `reactivecircus/android-emulator-runner` and the hosted SDK. `setup-android` is not used.
- The wrapper refuses targets unless modern `ro.boot.qemu` or legacy `ro.kernel.qemu` is exactly `1`, before installation or shared-storage writes. It never recursively deletes the export folder: use a fresh disposable emulator, and extra exports cause validation to fail rather than being erased. Do not run it against personal devices.
- The wrapper passes `--format junit`, `--test-output-dir` and `--debug-output` into the evidence folder and records each step's exit code in `status.txt`. It exits with the first failure. Logcat, a screenshot and the UI hierarchy are collected with bounded timeouts inside the emulator step, before the emulator shuts down. Collecting them never changes the result. Evidence is uploaded with `if: always()`.

**Signing:** the APK is signed with the generated template's debug key. It is a prototype build for this emulator only, not a store or distribution build. No secrets are used.

## Checklist

| Item | Implemented | Verified |
| --- | --- | --- |
| Deterministic fixture, pinned hash, safe-parser test | yes | host tests |
| Export checker shape and failure cases | yes | host tests |
| Wrapper exit-code propagation, bounded diagnostics (fake adb/maestro) | yes | host tests, not native |
| Workflow syntax (`actionlint`), wrapper (`bash -n`, `shellcheck`) | yes | host |
| Release APK builds from prebuild | yes | previous head built; current transport fix pending |
| Picker, long press, save, restart, return-to, export, delete on emulator | yes | previous head failed before rendering; current fix pending |
| iOS acceptance | no | out of scope |

## Known runtime risks (to confirm on the first hosted run)

- The **DocumentsUI root title** for primary storage differs by image ("Internal storage", the device name or the model). The wrapper passes a regex of all three as `STORAGE_ROOT`, escaping each literal title before joining them.
- **Long press in the WebView** depends on Maestro locating "Luminous" through the WebView's accessibility tree. The paragraph contains only that word so the centre point lands on it. If the system selects more or less than the word, the quote assertion fails. It is not relaxed.
- Android shows its own **selection toolbar** (Copy, Share…) because the reader sets no custom menu. It may overlap the top of the reader, but not the preview card.
- **Layout**: with the highlight panel open, the export preview shares the screen with the reader. On a Pixel 6 the acknowledgement and confirm buttons should fit, but this has not been observed.
- Run 41313612875 showed paragraphs 7–10 in the failure screenshot, while the accessibility tree retained `Luminous` at zero-height bounds `[89,184][992,184]`. Visibility selectors now require height 1–1999 px using documented `height: 1000`, `tolerance: 999` semantics, verified against Maestro 2.12 `Filters.sizeMatches`. Initial, offscreen, resume-paragraph and return assertions all exclude zero-area nodes. The host policy tests are not native evidence; the corrected selectors must pass on the next real run.
- The emulator binary version is whatever the hosted SDK or the runner action installs. It is recorded in the logs, not pinned.
