// SPDX-License-Identifier: Apache-2.0
export type EpubAnchor = { format: 'epub'; href: string; cfi: string };
export type Quote = { exact: string; prefix: string; suffix: string };
export type Rect = { x: number; y: number; width: number; height: number };
export type PdfAnchor = { format: 'pdf'; pageIndex: number; rotation: 0 | 90 | 180 | 270; rects: Rect[] };
export type AnnotationInput = {
  id: string;
  documentId: string;
  quote: Quote;
  anchor: EpubAnchor | PdfAnchor;
  note?: string;
};
export type Annotation = AnnotationInput & {
  schemaVersion: 1;
  visibility: 'private';
  note: string;
};

function validateRecord(record: Annotation): Annotation {
  if (!record || record.schemaVersion !== 1 || record.visibility !== 'private') {
    throw new TypeError('Unsupported annotation record');
  }
  return createAnnotation(record);
}

// Limit measured in UTF-16 code units, matching JavaScript string length.
const MAX_RECORD_LENGTH = 65536;

export function serializeAnnotation(annotation: Annotation): string {
  const json = JSON.stringify(validateRecord(annotation));
  if (json.length > MAX_RECORD_LENGTH) throw new RangeError('Annotation size limit');
  return json;
}

export function deserializeAnnotation(json: string, expectedDocumentId: string): Annotation {
  if (typeof json !== 'string' || json.length > MAX_RECORD_LENGTH) {
    throw new RangeError('Annotation size limit');
  }
  const parsed = validateRecord(JSON.parse(json) as Annotation);
  if (!nonempty(expectedDocumentId) || parsed.documentId !== expectedDocumentId) {
    throw new TypeError('Document mismatch');
  }
  return parsed;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createAnnotation(input: AnnotationInput): Annotation {
  const visibility = (input as (AnnotationInput & { visibility?: unknown }) | null)?.visibility;
  if (!input || !nonempty(input.id) || !nonempty(input.documentId) ||
      !input.quote || !nonempty(input.quote.exact) ||
      typeof input.quote.prefix !== 'string' || typeof input.quote.suffix !== 'string' ||
      (input.note !== undefined && typeof input.note !== 'string') ||
      (visibility !== undefined && visibility !== 'private') ||
      !input.anchor || !['epub', 'pdf'].includes(input.anchor.format)) {
    throw new TypeError('Invalid annotation');
  }
  const anchor = input.anchor;
  if (anchor.format === 'epub' && (!nonempty(anchor.href) ||
      typeof anchor.cfi !== 'string' || !/^epubcfi\(.+\)$/.test(anchor.cfi))) {
    throw new TypeError('Invalid EPUB anchor');
  }
  if (anchor.format === 'pdf') {
    if (!Number.isSafeInteger(anchor.pageIndex) || anchor.pageIndex < 0 ||
        ![0, 90, 180, 270].includes(anchor.rotation) ||
        !Array.isArray(anchor.rects) || anchor.rects.length === 0 ||
        Array.from(anchor.rects).some(r => !r ||
          ![r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n)) ||
          r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 ||
          r.x + r.width > 1 || r.y + r.height > 1)) {
      throw new TypeError('Invalid PDF anchor');
    }
  }
  const ownedAnchor: EpubAnchor | PdfAnchor = anchor.format === 'epub'
    ? { format: 'epub', href: anchor.href, cfi: anchor.cfi }
    : { format: 'pdf', pageIndex: anchor.pageIndex, rotation: anchor.rotation,
        rects: anchor.rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })) };
  return {
    id: input.id, documentId: input.documentId,
    quote: { exact: input.quote.exact, prefix: input.quote.prefix, suffix: input.quote.suffix },
    anchor: ownedAnchor, note: input.note ?? '', schemaVersion: 1, visibility: 'private',
  };
}
