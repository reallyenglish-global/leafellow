// SPDX-License-Identifier: Apache-2.0
export type PartLocation = { format: 'epub'; href: string } | { format: 'pdf'; pageIndex: number };
export type TextPart = { location: PartLocation; text: string; textStatus: 'available' | 'unavailable' };
export type ImportedDocument = { id: string; extractionVersion: 1; format: 'epub' | 'pdf'; parts: TextPart[] };
export type TextPassage = {
  documentId: string; extractionVersion: 1; partIndex: number; location: PartLocation; start: number; end: number;
  quote: { exact: string; prefix: string; suffix: string };
};
