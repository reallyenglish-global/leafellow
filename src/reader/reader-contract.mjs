// Reader contract — shared across web, Android, iOS.
// Defines the common interface for: import, select passage, bookmark, highlight,
// annotation, context preview, navigation, and restoration.
// No platform-specific implementation lives here; each platform implements
// the adapter behind this contract.
//
// This is a design-time contract only — no runtime code is executed until
// an explicit build/approval gate is passed.
/*
export interface DocumentIdentity {
  source: string;        // SHA-256 of original file bytes
  edition: string;       // publication/edition identifier
  format: 'EPUB' | 'PDF';
  extractionVersion: 1;
}

export interface PassageSelection {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
  text: string;          // exact quote
  contextBefore: string; // surrounding context (configurable)
  contextAfter: string;  // surrounding context (configurable)
  page: number;          // PDF page index, or EPUB CFI location
  pageLabel?: string;    // optional PDF page label
  formatNativeRange?: string; // format-native range description
}

export interface Annotation {
  id: string;            // UUID v4
  documentId: string;    // source SHA-256
  version: 1;
  type: 'bookmark' | 'highlight' | 'note';
  selection: PassageSelection;
  createdAt: number;     // unix ms
  updatedAt: number;
  visibility: 'private' | 'shared' | ' collaborators';
  aiContext?: {
    provider: string;
    model: string;
    query: string;
    response: string;
    cost?: number;
  };
}

export interface LearningState {
  lastRead: number;      // unix ms of last passage
  lastAnnotation: string; // annotation ID
  bookmarks: string[];   // annotation IDs
  providerHistory: Array<{provider, model, query, response, cost, timestamp}>;
  restartCapable: boolean;
}

export interface ProviderResult {
  success: boolean;
  response: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  cost?: number;
  quotaRemaining?: number;
}

export interface ReaderAdapter {
  // Import
  importFile(file: File): Promise<DocumentIdentity>;
  // Selection
  selectPassage(offsetOrRange: object): PassageSelection;
  // Annotation
  addAnnotation(annotation: Annotation): Promise<Annotation>;
  // Navigation
  restoreSelection(selectionId: string): Promise<void>;
  close(): Promise<void>;
}
*/
