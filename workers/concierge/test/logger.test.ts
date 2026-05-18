import { describe, expect, it } from 'vitest';
import type { DestinationStream } from 'pino';
import type { LogEntry } from '@contourai/agents';
import { createPinoAgentLogger } from '../src/logger.js';

function captureStream(): { stream: DestinationStream; lines: () => unknown[] } {
  const raw: string[] = [];
  return {
    stream: {
      write(line: string) {
        raw.push(line.trim());
      },
    },
    lines: () =>
      raw.filter((s) => s.length > 0).map((s) => JSON.parse(s) as Record<string, unknown>),
  };
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    module: 'workers/concierge',
    model: 'claude-sonnet-4-6',
    latencyMs: 234,
    promptTokens: 100,
    completionTokens: 25,
    cacheReadTokens: 80,
    cacheCreationTokens: 0,
    redactionMap: { '<<PHI_NAME_001>>': 'Sarah Johnson' },
    responseHasPhi: true,
    stopReason: 'end_turn',
    ...overrides,
  };
}

describe('createPinoAgentLogger', () => {
  it('writes a JSON line per call with the expected fields', () => {
    const { stream, lines } = captureStream();
    const logger = createPinoAgentLogger({ destination: stream });
    logger.logCall(entry({ clinicId: 'c-1', conversationId: 'conv-1' }));

    const all = lines();
    expect(all).toHaveLength(1);
    const line = all[0] as Record<string, unknown>;
    expect(line['msg']).toBe('llm_call');
    expect(line['model']).toBe('claude-sonnet-4-6');
    expect(line['promptTokens']).toBe(100);
    expect(line['clinicId']).toBe('c-1');
  });

  it('NEVER logs the redactionMap (would leak PHI)', () => {
    const { stream, lines } = captureStream();
    const logger = createPinoAgentLogger({ destination: stream });
    logger.logCall(entry());

    const line = lines()[0] as Record<string, unknown>;
    expect(line['redactionMap']).toBeUndefined();
    // And the serialized line contains none of the PHI values.
    const serialized = JSON.stringify(line);
    expect(serialized).not.toContain('Sarah Johnson');
  });

  it('does not mutate the caller-provided entry', () => {
    const { stream } = captureStream();
    const logger = createPinoAgentLogger({ destination: stream });
    const e = entry();
    const before = { ...e.redactionMap };
    logger.logCall(e);
    expect(e.redactionMap).toEqual(before);
  });

  it('emits responseHasPhi flag so SRE can monitor jumps', () => {
    const { stream, lines } = captureStream();
    const logger = createPinoAgentLogger({ destination: stream });
    logger.logCall(entry({ responseHasPhi: true }));
    logger.logCall(entry({ responseHasPhi: false }));
    const all = lines();
    expect((all[0] as Record<string, unknown>)['responseHasPhi']).toBe(true);
    expect((all[1] as Record<string, unknown>)['responseHasPhi']).toBe(false);
  });
});
