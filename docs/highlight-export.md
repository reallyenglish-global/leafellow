# Private highlight export (EPUB)

## Scope

From the reader's highlight panel, a user can export **the current book's** saved [private highlights](saved-highlights.md) as one JSON file into a system folder they pick. Nothing is exported automatically. There is no import or restore of this file, and no sharing sheet, network call, sync or app-wide file-sharing or backup setting. PDF and web are not covered.

## Flow

1. **Export highlights…** is disabled until the list has loaded and at least one highlight exists. With none saved, the button says so and the panel explains that export becomes available after saving.
2. Starting an export takes a synchronous busy token (`createExportGuard`). While it is held, save, delete, close (Back to library) and a second export are refused. They are refused both in the UI (disabled controls) and in the handlers (`exportGuard.isBusy()`).
3. The snapshot is read through the book's serial writer (`session.exportSnapshot()`), so it reflects every accepted save and delete. Every row for that source is validated. **If any row is unreadable, the export fails closed** and reports how many rows could not be read. It never produces a partial file that claims to be complete.
4. A preview shows the count, what the file contains (exact passages, notes, EPUB positions, the content hash, never the book) and the destination privacy note: *Leafellow writes the file only to the folder you choose and does not upload it; the storage provider for that folder may sync it.* The **Choose folder and export** button stays disabled until the user ticks an accessible checkbox acknowledging that the file leaves Leafellow's private storage. Cancel releases the token.
5. Only then does `Directory.pickDirectoryAsync()` open. The token is held until the picker and the write have settled. Result messages are only set if the screen is still mounted.

## File format (version 1)

`serializeHighlightExport(documentId, highlights)` in `src/storage/highlight-export.ts` has no Expo imports. It produces:

```json
{
  "format": "leafellow.highlights",
  "formatVersion": 1,
  "source": { "documentId": "sha256:<64 hex>" },
  "count": 1,
  "highlights": [
    { "id": "hl_<32 hex>", "createdAt": 1800000000000, "annotation": { "...": "annotation-core v1 record" } }
  ]
}
```

- Every record is re-validated with the same contract as a stored row (`validateSavedHighlight`): annotation-core v1, `visibility: "private"`, EPUB range-CFI anchor, the exact expected source, a stable ID derived from source and CFI, and a non-negative `createdAt`. A wrong-source, tampered, PDF, shared, duplicate or malformed record **throws**. It is never dropped silently.
- Bounds: at most 500 records (the per-source limit), each within the 65,536-unit record limit, and the whole file within 8 Mi UTF-16 units.
- Deterministic: records are sorted by `createdAt, id` and keys have a fixed order. Two-space JSON plus a trailing newline. No export timestamp, device path, file URI, book title or source bytes. Quote text and notes are copied exactly, including Unicode and whitespace. Inputs are not mutated.
- The existing `note` field is included. That is part of what the user explicitly acknowledges in the preview.
- `parseHighlightExport(text, documentId)` is a strict reader used by tests to round-trip and re-validate. It requires exact keys and canonical text. It is not wired to any UI.

## Destination behaviour

`runHighlightExport({ text, fileName, destination })` takes an injected `ExportDestination`. `apps/mobile/src/highlight-export-destination.ts` adapts expo-file-system 58.0.13:

- **File name:** `leafellow-highlights-<first 12 hex of the source hash>-<base36 time + random>.json`, checked against `^[a-z0-9-]+\.json$`. It never contains the book title or a path.
- **Picker cancel:** distinguished only by the native codes in the installed module, `ERR_PICKER_CANCELLED` (Android `PickerCancelledException`) and `ERR_FILE_PICKING_CANCELLED` (iOS `FilePickingCancelledException`). These are reported as "Export cancelled. No file was created." Any other picker failure gets a neutral "could not be opened, nothing was exported".
- **No overwrite.** In the installed native code, iOS `createFile` throws `FileAlreadyExistsException` when the path exists (`overwrite` defaults to false; it would otherwise `removeItem` first). Android `JavaFile.createFile` ignores the `createNewFile()` result, so it would hand back an existing file. SAF `DocumentFile.createFile` behaviour on a name clash depends on the provider. So Leafellow does not rely on `createFile`:
  1. It checks `directory.list()` for the generated name and stops if the name is present.
  2. It refuses to write if the returned handle's size is not 0.
  3. It never retries with another name.
  
  An existing file is never written to or deleted.
- **Write and verify:** `await file.write(text)` (awaiting covers either sync or async native behaviour), then `await file.text()` must equal the text exactly. **"Exported" is shown only after that read-back matches.**
- **Cleanup:** after a write or verify failure, only the handle that this attempt created is deleted. If that delete fails, the UI warns that an incomplete file with the generated name may remain. A failure while creating the file deletes nothing.
- On Android SAF, a provider may store the file under a different display name. The success message shows the requested name. This has not been checked on a device.

## Evidence

`tests/highlight-export.test.mjs` was written first and observed RED (`ERR_MODULE_NOT_FOUND` for the export module), then GREEN. It covers:

- deterministic envelope and order, exact Unicode, and a parse round trip;
- refusal of wrong-source, tampered, PDF, shared, negative-time, duplicate, over-count and over-size records;
- a valid empty envelope;
- hostile and mismatched envelopes;
- ASCII file names;
- a real `node:sqlite` snapshot after close/reopen that is scoped to one source and fails closed on a corrupt row;
- the session snapshot queued behind save and delete;
- an injected destination: success, picker cancel, picker throw, existing name, non-empty returned handle, create failure, write failure, read-back mismatch, cleanup failure and no retry;
- the guard refusing an overlapping export synchronously and staying held while the picker is pending.

These are logic and adapter tests. **They are not native evidence.** `Directory.pickDirectoryAsync`, `createFile`, `write`, `text` and `delete` have not been run on an iOS or Android simulator or device, including iCloud Drive or SAF providers. The native build gate is the hosted CI.
