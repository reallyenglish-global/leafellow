// SPDX-License-Identifier: Apache-2.0
import { importEpubDocument } from '../epub/import-document.ts';
import type { ImportedDocument } from '../document-types.ts';

export const MAX_EPUB_BYTES = 2 * 1024 * 1024;

export function validateEpubFile(name: string, size: number | null, mimeType?: string | null): void {
  // SAF providers can expose an opaque document ID as File.name, especially from Recent.
  // Either an EPUB name or the provider's explicit EPUB MIME admits inspection; neither replaces
  // the byte parser or the size bound before reading. Keep the provider identifier unchanged.
  if (!name.toLowerCase().endsWith('.epub') && mimeType !== 'application/epub+zip') {
    throw new Error('Choose an EPUB file.');
  }
  if (size === null || !Number.isSafeInteger(size) || size < 1) {
    throw new Error('The file size could not be verified.');
  }
  if (size > MAX_EPUB_BYTES) throw new Error('This prototype accepts EPUB files up to 2 MiB.');
}

export async function inspectEpub(bytes: Uint8Array): Promise<ImportedDocument> {
  const document = importEpubDocument(bytes);
  if (document.format !== 'epub') throw new Error('The selected file is not an EPUB.');
  return document;
}
