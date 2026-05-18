import { describe, expect, it } from 'vitest';
import { ClaudeClient } from '../src/client.js';
import type { AgentLogger, LogEntry } from '../src/types.js';
import { FakeTransport } from './fake-transport.js';

describe('ClaudeClient — redact on send', () => {
  it('redacts PHI in user messages before passing to the transport', async () => {
    const transport = FakeTransport.from({
      content: [{ type: 'text', text: 'Thanks for reaching out.' }],
    });
    const client = new ClaudeClient({ transport });

    await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Hi, my name is Sarah Johnson and my email is sarah@x.com',
        },
      ],
    });

    const sent = transport.lastCall;
    const sentContent = sent.messages[0]?.content;
    expect(typeof sentContent).toBe('string');
    if (typeof sentContent !== 'string') throw new Error();
    expect(sentContent).not.toContain('Sarah Johnson');
    expect(sentContent).not.toContain('sarah@x.com');
    expect(sentContent).toMatch(/<<PHI_NAME_\d{3}>>/);
    expect(sentContent).toMatch(/<<PHI_EMAIL_\d{3}>>/);
  });

  it('redacts the system block too', async () => {
    const transport = FakeTransport.from({
      content: [{ type: 'text', text: 'ok' }],
    });
    const client = new ClaudeClient({ transport });

    await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system: 'Patient Sarah Johnson has been a regular',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(transport.lastCall.system).not.toContain('Sarah Johnson');
  });

  it('redacts across messages so the same name maps to the same token', async () => {
    const transport = FakeTransport.from({
      content: [{ type: 'text', text: 'ok' }],
    });
    const client = new ClaudeClient({ transport });

    await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'I am Sarah Johnson' },
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Sarah Johnson asking again' },
      ],
    });

    const first = transport.lastCall.messages[0]?.content;
    const third = transport.lastCall.messages[2]?.content;
    if (typeof first !== 'string' || typeof third !== 'string') {
      throw new Error('expected string content');
    }
    const tokenMatch1 = first.match(/<<PHI_NAME_\d{3}>>/);
    const tokenMatch2 = third.match(/<<PHI_NAME_\d{3}>>/);
    expect(tokenMatch1).not.toBeNull();
    expect(tokenMatch2).not.toBeNull();
    expect(tokenMatch1?.[0]).toBe(tokenMatch2?.[0]);
  });
});

describe('ClaudeClient — restore on response', () => {
  it('restores tokens in the response text using the per-call map', async () => {
    // Simulate: model echoes back the token it received.
    const transport = FakeTransport.from({
      content: [{ type: 'text', text: 'Hi <<PHI_NAME_001>>, how can I help?' }],
    });
    const client = new ClaudeClient({ transport });

    const resp = await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'I am Sarah Johnson' }],
    });

    const text = resp.content[0];
    if (!text || text.type !== 'text') throw new Error();
    expect(text.text).toBe('Hi Sarah Johnson, how can I help?');
  });

  it('does not modify tool_use blocks on restore', async () => {
    const transport = FakeTransport.from({
      content: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'send_reply',
          input: { intent: 'pricing' },
        },
      ],
    });
    const client = new ClaudeClient({ transport });
    const resp = await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Sarah Johnson asks about price' }],
    });
    const tu = resp.content[0];
    expect(tu?.type).toBe('tool_use');
    if (tu?.type !== 'tool_use') throw new Error();
    expect(tu.input).toEqual({ intent: 'pricing' });
  });
});

describe('ClaudeClient — logging', () => {
  it('emits one log entry per call with tokens, latency, and redaction map', async () => {
    const transport = FakeTransport.from({
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 100,
        output_tokens: 25,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 0,
      },
    });
    const entries: LogEntry[] = [];
    const logger: AgentLogger = {
      logCall: (e) => {
        entries.push(e);
      },
    };
    const client = new ClaudeClient({ transport, logger, defaultModule: 'test' });

    await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Sarah Johnson here' }],
      metadata: { clinicId: 'c-1', conversationId: 'conv-1', module: 'concierge' },
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (!entry) throw new Error();
    expect(entry.module).toBe('concierge');
    expect(entry.clinicId).toBe('c-1');
    expect(entry.conversationId).toBe('conv-1');
    expect(entry.promptTokens).toBe(100);
    expect(entry.completionTokens).toBe(25);
    expect(entry.cacheReadTokens).toBe(80);
    expect(entry.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Object.values(entry.redactionMap)).toContain('Sarah Johnson');
  });

  it('falls back to defaultModule when request metadata is absent', async () => {
    const transport = FakeTransport.from({ content: [{ type: 'text', text: 'ok' }] });
    const entries: LogEntry[] = [];
    const client = new ClaudeClient({
      transport,
      logger: {
        logCall: (e) => {
          entries.push(e);
        },
      },
      defaultModule: 'fallback-mod',
    });

    await client.messages({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(entries[0]?.module).toBe('fallback-mod');
  });
});
