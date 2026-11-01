// SPDX-License-Identifier: Apache-2.0
// Adapter from expo-file-system 58 (Directory.pickDirectoryAsync / createFile) to the export core.
import { Directory, type File } from 'expo-file-system';

import { HIGHLIGHT_EXPORT_MIME, type ExportDestination, type ExportFileHandle } from '../../../src/storage/highlight-export';

// Codes inferred by expo-modules-core from the installed native classes: Android
// PickerCancelledException and iOS FilePickingCancelledException.
const PICKER_CANCELLED_CODES = new Set(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED']);

// The no-overwrite checks here are best-effort, not atomic:
// - `size` is 0 both for a fresh file and when the native read fails (both platforms catch and
//   return 0), and an existing empty file also reads 0.
// - `entry.name` is the basename of the entry URI, not provider metadata. For SAF providers with
//   opaque document IDs (Downloads `msf:…`, Drive) it never equals the display name, so `has()`
//   cannot see a clash there.
// - `File.name` has the same URI-basename semantics, so the name a provider actually stored is not
//   known; callers report the requested name as requested.
function fileHandle(file: File): ExportFileHandle {
  return {
    async size() { return file.size; },
    // write may be sync or async depending on the platform module; awaiting covers both.
    async write(text) { await file.write(text); },
    read: () => file.text(),
    async remove() { file.delete(); },
  };
}

export const systemFolderDestination: ExportDestination = {
  async pickFolder() {
    let directory: Directory;
    try {
      directory = await Directory.pickDirectoryAsync();
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && PICKER_CANCELLED_CODES.has(code)) return null;
      throw error;
    }
    return {
      async has(name) { return directory.list().some(entry => entry.name === name); },
      async create(name) { return fileHandle(directory.createFile(name, HIGHLIGHT_EXPORT_MIME)); },
    };
  },
};
