import type { MessagesRequest, MessagesResponse } from '../types.js';

/**
 * Typed, versioned prompt template. A prompt is a pure function from a
 * typed input to a fully-formed `MessagesRequest`, plus an optional
 * `parseOutput` that lifts the LLM response into a typed result.
 *
 * Versioning: every prompt carries an integer version. Bump when the
 * semantics change (output schema, model, system prompt rewrite). The
 * registry lets multiple versions coexist so we can run A/B evals.
 */
export interface PromptTemplate<TInput, TOutput> {
  id: string;
  version: number;
  /**
   * One-line description for registry listings and eval reports.
   */
  description?: string;
  /**
   * Build the messages-API request from typed input.
   */
  build(input: TInput): Omit<MessagesRequest, 'metadata'>;
  /**
   * Optional: lift the messages-API response into a typed output. If
   * absent, callers consume the raw `MessagesResponse`.
   */
  parseOutput?(response: MessagesResponse): TOutput;
}
