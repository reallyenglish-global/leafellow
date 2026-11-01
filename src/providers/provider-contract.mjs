// Provider contract — shared across web, Android, iOS.
// Defines the LLM provider interaction model, auth flow, cost/quota tracking,
// and failure handling. Each platform implements the adapter behind this contract.
//
// Design-time only — no runtime execution until explicit build gate.
/*
export interface ProviderCredentials {
  provider: string;        // e.g. "openai", "anthropic", "openrouter"
  apiBase: string;         // provider API endpoint
  authToken: string;       // never stored in document JS or public bundles
  model: string;           // e.g. "claude-3-opus-20240229"
  supportsVision?: boolean;
  supportsMath?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderResult {
  success: boolean;
  response: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    // provider-specific error extractions
    // e.g. "insufficient_quota", "context_length_exceeded", "invalid_request"
  };
  cost?: number;           // in provider's unit (USD, etc.)
  quotaRemaining?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ProviderAdapter {
  init(creds: ProviderCredentials): Promise<void>;
  sendQuery(messages: Array<{role: string; content: string}>): Promise<ProviderResult>;
  cancel(): void;
  getStatus(): Promise<{isAvailable: boolean; costSoFar: number; quotaRemaining: number}>;
}
*/
