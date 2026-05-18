import { describe, expect, it } from 'vitest';
import { ClaudeClient } from '@contourai/agents';
import { FakeTransport } from '@contourai/agents/test-utils';
import { classifyIntent } from '../src/handlers/intent.js';

function transport(toolInput: Record<string, unknown>) {
  return FakeTransport.from({
    content: [{ type: 'tool_use', id: 'tu_1', name: 'classify', input: toolInput }],
    stop_reason: 'tool_use',
  });
}

describe('classifyIntent', () => {
  it('parses a basic classification', async () => {
    const client = new ClaudeClient({
      transport: transport({
        intent: 'pricing',
        urgency: 3,
        asked_for_human: false,
        procedure: 'deep plane facelift',
      }),
    });
    const r = await classifyIntent(client, 'how much is a deep plane facelift?');
    expect(r.intent).toBe('pricing');
    expect(r.urgency).toBe(3);
    expect(r.procedure).toBe('deep plane facelift');
    expect(r.asked_for_human).toBe(false);
  });

  it('clamps urgency into 1..5', async () => {
    const client = new ClaudeClient({
      transport: transport({ intent: 'other', urgency: 99, asked_for_human: false }),
    });
    const r = await classifyIntent(client, 'hi');
    expect(r.urgency).toBe(5);
  });

  it('floors urgency at 1', async () => {
    const client = new ClaudeClient({
      transport: transport({ intent: 'other', urgency: -3, asked_for_human: false }),
    });
    const r = await classifyIntent(client, 'hi');
    expect(r.urgency).toBe(1);
  });

  it('omits procedure when empty', async () => {
    const client = new ClaudeClient({
      transport: transport({
        intent: 'other',
        urgency: 1,
        asked_for_human: false,
        procedure: '',
      }),
    });
    const r = await classifyIntent(client, 'hi');
    expect(r.procedure).toBeUndefined();
  });

  it('throws on invalid intent', async () => {
    const client = new ClaudeClient({
      transport: transport({
        intent: 'not_a_real_intent',
        urgency: 1,
        asked_for_human: false,
      }),
    });
    await expect(classifyIntent(client, 'hi')).rejects.toThrow(/invalid intent/);
  });

  it("throws when the model doesn't call the tool", async () => {
    const t = FakeTransport.from({
      content: [{ type: 'text', text: 'sorry, I do not understand' }],
    });
    const client = new ClaudeClient({ transport: t });
    await expect(classifyIntent(client, 'hi')).rejects.toThrow(/did not call/);
  });

  it('flags an explicit human request', async () => {
    const client = new ClaudeClient({
      transport: transport({
        intent: 'other',
        urgency: 2,
        asked_for_human: true,
      }),
    });
    const r = await classifyIntent(client, 'can i talk to a nurse?');
    expect(r.asked_for_human).toBe(true);
  });
});
