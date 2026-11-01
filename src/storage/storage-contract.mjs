// Storage contract — shared across web, Android, iOS.
// Defines the persistent record model, database versioning, and eviction/quota model.
// Each platform implements the adapter behind this contract.
//
// Design-time only — no runtime execution until explicit build gate.
/*
export interface AnnotationRecord {
  id: string;            // UUID v4
  documentId: string;    // source SHA-256
  version: 1;
  type: 'bookmark' | 'highlight' | 'note';
  selection: PassageSelection; // from reader contract
  createdAt: number;     // unix ms
  updatedAt: number;
  visibility: 'private' | 'shared' | 'collaborators';
  aiContext?: {
    provider: string;
    model: string;
    query: string;
    response: string;
    cost?: number;
  };
}

export interface StorageVersion {
  annotations: number;   // schema version
  learningState: number;
  lastUpdated: number;
}

export interface StorageAdapter {
  init(dbName: string, version: number): Promise<void>;
  saveAnnotation(record: AnnotationRecord): Promise<AnnotationRecord>;
  getAnnotation(id: string): Promise<AnnotationRecord | undefined>;
  listAnnotations(documentId: string): Promise<AnnotationRecord[]>;
  deleteAnnotation(id: string): Promise<boolean>;
  saveLearningState(state: LearningState): Promise<LearningState>;
  getLearningState(): Promise<LearningState>;
  clearAll(): Promise<void>;
  getQuota(): Promise<{used: number; limit: number;}>; // bytes
  evictIfNeeded(bytesNeeded: number): Promise<boolean>;
}
*/
