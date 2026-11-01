// SPDX-License-Identifier: Apache-2.0
import { importDocument, type ImportedDocument } from '../documents.ts';

export const MAX_EPUB_BYTES = 2 * 1024 * 1024;

export function validateEpubFile(name: string, size: number | null): void {
  if (!name.toLowerCase().endsWith('.epub')) throw new Error('Choose an EPUB file.');
  if (size === null || !Number.isSafeInteger(size) || size < 1) {
    throw new Error('The file size could not be verified.');
  }
  if (size > MAX_EPUB_BYTES) throw new Error('This prototype accepts EPUB files up to 2 MiB.');
}

export async function inspectEpub(bytes: Uint8Array): Promise<ImportedDocument> {
  const document = await importDocument(bytes);
  if (document.format !== 'epub') throw new Error('The selected file is not an EPUB.');
  return document;
}
