// SPDX-License-Identifier: Apache-2.0
// Adapter from expo-file-system 58 (Directory.pickDirectoryAsync / createFile) to the export core.
import { Directory, type File } from 'expo-file-system';

import { HIGHLIGHT_EXPORT_MIME, type ExportDestination, type ExportFileHandle } from '../../../src/storage/highlight-export';

// Codes inferred by expo-modules-core from the installed native classes: Android
// PickerCancelledException and iOS FilePickingCancelledException.
const PICKER_CANCELLED_CODES = new Set(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED']);

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
