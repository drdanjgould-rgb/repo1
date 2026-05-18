import type { ToolDefinition } from '../types.js';

/**
 * A tool that the LLM may call, paired with a typed executor. The
 * Concierge worker registers these and dispatches by name when a
 * `tool_use` block arrives from the model.
 *
 * `Input` is the shape the model sends (must match `input_schema`).
 * `Output` is what the executor returns; the agent loop serializes it
 * back into a `tool_result` block on the next turn.
 */
export interface RegisteredTool<Input = Record<string, unknown>, Output = unknown> {
  definition: ToolDefinition;
  execute(input: Input): Promise<Output>;
}

export type ToolRegistry = Map<string, RegisteredTool>;

export function defineTool<Input, Output>(
  definition: ToolDefinition,
  execute: (input: Input) => Promise<Output>,
): RegisteredTool<Input, Output> {
  return { definition, execute };
}
