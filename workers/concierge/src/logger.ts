import pino, { type Logger, type DestinationStream } from 'pino';
import type { AgentLogger, LogEntry } from '@contourai/agents';

export interface PinoAgentLoggerOptions {
  /** Pino log level. Default 'info'. */
  level?: pino.Level;
  /** Override destination stream. Default: stdout. Useful for tests. */
  destination?: DestinationStream;
  /** Static fields merged into every log entry (clinic_id, env, etc.). */
  base?: Record<string, unknown>;
}

/**
 * Pino-backed `AgentLogger`. Production wiring for the Concierge worker
 * + any other module that uses `@contourai/agents/ClaudeClient`.
 *
 * IMPORTANT: We strip `redactionMap` from the log entry before emitting.
 * The map contains ORIGINAL PHI (token → real name/email/phone). Logging
 * it would defeat the redaction layer — it'd land in Axiom as plaintext
 * PHI. Operators who need to decode tokens consult the encrypted
 * `messages.redaction_map` column in Postgres under proper access control.
 */
export function createPinoAgentLogger(opts: PinoAgentLoggerOptions = {}): AgentLogger {
  const logger: Logger = pino(
    {
      level: opts.level ?? 'info',
      base: opts.base ?? {},
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    opts.destination,
  );

  return {
    logCall(entry: LogEntry): void {
      // Make a redaction-map-free shallow copy. Don't mutate the caller's
      // object; it may still be needed elsewhere (e.g., the worker writes
      // it to the encrypted column).
      const { redactionMap: _omit, ...safe } = entry;
      void _omit;
      logger.info(safe, 'llm_call');
    },
  };
}
