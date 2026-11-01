// Learning contract — shared across web, Android, iOS.
// Defines the learning state model, provider interaction model,
// and navigation/ restoration concepts. Each platform implements the
// adapter behind this contract.
//
// Design-time only — no runtime execution until explicit build gate.
/*
export interface LearningState {
  lastRead: number;        // unix ms
  lastAnnotation: string;  // annotation ID
  bookmarks: string[];     // annotation IDs
  providerHistory: Array<{
    provider: string;
    model: string;
    query: string;
    response: string;
    cost?: number;
    timestamp: number;
  }>;
  restartCapable: boolean;
}

export interface LearningProviderBridge {
  // Ask AI about a selected passage
  askAboutPassage(selection: PassageSelection, context?: string): Promise<{
    success: boolean;
    response: string;
    error?: {code: string; message: string; retryable: boolean};
    cost?: number;
  }>;
  // Cancel ongoing request
  cancel(): void;
}

export interface NavigationRecord {
  passageId: string;       // stable identifier for the selected passage
  documentIdentity: DocumentIdentity;
  timestamp: number;
  annotationId?: string;
}

export type LearningEvent =
  | 'passage_selected'
  | 'ai_query_started'
  | 'ai_response_received'
  | 'ai_response_failed'
  | 'annotation_created'
  | 'bookmark_toggled'
  | 'restart';
*/
