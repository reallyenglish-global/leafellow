// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { strFromU8 } from 'fflate';

import { ImportError } from './document-import-error.ts';
import type { ImportedDocument, TextPart, TextPassage } from './document-types.ts';
import { importEpubDocument } from './epub/import-document.ts';

export type { ImportedDocument, PartLocation, TextPart, TextPassage } from './document-types.ts';

export function selectPassage(document: ImportedDocument, partIndex: number, start: number, end: number): TextPassage {
  const part = document?.parts?.[partIndex];
  if (!part || part.textStatus !== 'available' || !Number.isSafeInteger(partIndex) ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end <= start || end > part.text.length ||
      splitsSurrogate(part.text, start) || splitsSurrogate(part.text, end) || !part.text.slice(start, end).trim()) {
    throw new ImportError('Invalid text range');
  }
  return {
    documentId: document.id, extractionVersion: document.extractionVersion, partIndex, location: { ...part.location }, start, end,
    quote: { exact: part.text.slice(start, end), prefix: part.text.slice(Math.max(0, start - 80), start), suffix: part.text.slice(end, end + 80) },
  };
}
function splitsSurrogate(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF;
}

async function pdfParts(bytes: Uint8Array): Promise<TextPart[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(bytes), useWasm: false, useWorkerFetch: false,
    useSystemFonts: true, disableFontFace: true, disableAutoFetch: true, disableStream: true,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (await pdf.getPermissions() !== null) throw new ImportError('Protected PDF');
    if (pdf.numPages > 100) throw new ImportError('PDF page limit');
    const parts: TextPart[] = [];
    let totalText = 0;
    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
      totalText += text.length;
      if (text.length > 100000 || totalText > 500000) throw new ImportError('Document text limit');
      parts.push({ location: { format: 'pdf', pageIndex }, text, textStatus: text ? 'available' : 'unavailable' });
      page.cleanup();
    }
    return parts;
  } finally {
    await task.destroy();
  }
}

export async function importDocument(bytes: Uint8Array): Promise<ImportedDocument> {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
  if (bytes.byteLength > 2 * 1024 * 1024) throw new ImportError('Document byte limit');
  const data = new Uint8Array(bytes);
  const isPdf = strFromU8(data.subarray(0, 5)) === '%PDF-';
  const isZip = data[0] === 80 && data[1] === 75 && data[2] === 3 && data[3] === 4;
  if (!isPdf && !isZip) throw new ImportError('Unsupported document');
  try {
    if (!isPdf) return importEpubDocument(data);
    const id = `sha256:${bytesToHex(sha256(data))}`;
    return { id, extractionVersion: 1, format: 'pdf', parts: await pdfParts(data) };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (isPdf && error instanceof Error && error.name === 'PasswordException') throw new ImportError('Protected PDF');
    throw new ImportError(isPdf ? 'Invalid PDF' : 'Invalid EPUB');
  }
}
