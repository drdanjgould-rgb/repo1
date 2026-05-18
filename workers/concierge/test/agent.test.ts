import { describe, expect, it } from 'vitest';
import { ClaudeClient } from '@contourai/agents';
import { FakeTransport } from '@contourai/agents/test-utils';
import { createConciergeAgent, HOLDING_REPLY } from '../src/agent.js';

function newAgent(text = 'Hello, how can I help?') {
  const transport = FakeTransport.from({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  const client = new ClaudeClient({ transport });
  const agent = createConciergeAgent({ client });
  return { agent, transport };
}

describe('createConciergeAgent', () => {
  it('returns the LLM reply and grows history', async () => {
    const { agent } = newAgent('Hi! What can I help with?');
    const r = await agent.reply('hello');
    expect(r.text).toBe('Hi! What can I help with?');
    expect(r.verdict.redFlag).toBe(false);
    expect(r.usage?.input_tokens).toBe(10);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(agent.history()).toHaveLength(2);
    expect(agent.history()[0]?.role).toBe('user');
    expect(agent.history()[1]?.role).toBe('assistant');
  });

  it('preserves multi-turn history across calls', async () => {
    const { agent } = newAgent('Reply A');
    await agent.reply('msg 1');
    expect(agent.history()).toHaveLength(2);
    // Second turn — replace the transport's queue via a fresh client?
    // Easier: build a transport with two scripted responses.
    const transport = FakeTransport.from(
      { content: [{ type: 'text', text: 'first reply' }] },
      { content: [{ type: 'text', text: 'second reply' }] },
    );
    const client = new ClaudeClient({ transport });
    const a = createConciergeAgent({ client });
    await a.reply('msg 1');
    await a.reply('msg 2');
    expect(a.history()).toHaveLength(4);
    expect(a.history()[0]?.content).toBe('msg 1');
    expect(a.history()[2]?.content).toBe('msg 2');
  });

  it('short-circuits on a red-flag message — no LLM call, no history mutation', async () => {
    const { agent, transport } = newAgent();
    const r = await agent.reply('I have chest pain');
    expect(r.verdict.redFlag).toBe(true);
    expect(r.verdict.category).toBe('medical_emergency');
    expect(r.text).toBe(HOLDING_REPLY);
    expect(r.usage).toBeUndefined();
    expect(r.latencyMs).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(agent.history()).toHaveLength(0);
  });

  it('respects postOp triage threshold', async () => {
    const transport = FakeTransport.from({ content: [{ type: 'text', text: 'ok' }] });
    const client = new ClaudeClient({ transport });
    const a = createConciergeAgent({ client, postOp: true });
    const r = await a.reply('my drain stopped working');
    expect(r.verdict.redFlag).toBe(true);
    expect(transport.calls).toHaveLength(0);
  });

  it('/clear empties history', async () => {
    const { agent } = newAgent('Reply');
    await agent.reply('hello');
    expect(agent.history().length).toBeGreaterThan(0);
    agent.clear();
    expect(agent.history()).toHaveLength(0);
  });
});
