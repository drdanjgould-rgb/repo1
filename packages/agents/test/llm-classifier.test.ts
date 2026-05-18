import { describe, expect, it } from 'vitest';
import { ClaudeClient } from '../src/client.js';
import { LLMSafetyClassifier } from '../src/safety/llm-classifier.js';
import { FakeTransport } from './fake-transport.js';

function buildClassifier(...llmReplies: Array<Record<string, unknown>>): {
  classifier: LLMSafetyClassifier;
  transport: FakeTransport;
} {
  const transport = FakeTransport.from(
    ...llmReplies.map((input) => ({
      content: [
        {
          type: 'tool_use' as const,
          id: 'tu_1',
          name: 'triage',
          input,
        },
      ],
      stop_reason: 'tool_use' as const,
    })),
  );
  const client = new ClaudeClient({ transport });
  return { classifier: new LLMSafetyClassifier({ client }), transport };
}

describe('LLMSafetyClassifier', () => {
  it('returns the floor verdict unchanged when regex finds nothing', async () => {
    // No LLM reply scripted — the LLM should NOT be called when the floor
    // clears.
    const { classifier, transport } = buildClassifier();
    const v = await classifier.triage('how much does a consult cost?');
    expect(v.redFlag).toBe(false);
    expect(transport.calls).toHaveLength(0);
  });

  it('upholds the regex verdict when the LLM agrees', async () => {
    const { classifier, transport } = buildClassifier({
      red_flag: true,
      category: 'medical_emergency',
      severity: 5,
      rationale: 'patient reports current chest pain',
    });
    const v = await classifier.triage("I've had chest pain for an hour");
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('medical_emergency');
    expect(v.severity).toBe(5);
    expect(v.rationale).toContain('LLM upheld');
    expect(transport.calls).toHaveLength(1);
  });

  it('downgrades when the LLM identifies a hypothetical', async () => {
    const { classifier } = buildClassifier({
      red_flag: false,
      category: 'none',
      severity: 1,
      rationale: 'patient is asking a hypothetical about bleeding risk, not bleeding now',
    });
    const v = await classifier.triage('What should I do if I notice some bleeding later?');
    expect(v.redFlag).toBe(false);
    expect(v.category).toBe('none');
    expect(v.severity).toBe(1);
    expect(v.rationale).toContain('LLM downgrade');
  });

  it('upholds floor verdict on LLM error (fail-safe)', async () => {
    // Scripted with zero responses -> next call will throw inside the
    // transport, exercising the catch path.
    const transport = FakeTransport.from();
    const client = new ClaudeClient({ transport });
    const classifier = new LLMSafetyClassifier({ client });
    const v = await classifier.triage('I am bleeding through the dressing');
    expect(v.redFlag).toBe(true);
    expect(v.rationale).toContain('uphold-on-error');
  });

  it('upholds floor verdict on malformed LLM tool input', async () => {
    const { classifier } = buildClassifier({
      // Missing required fields → parseTriageInput returns null
      something: 'bogus',
    });
    const v = await classifier.triage('I have chest pain');
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('medical_emergency');
  });
});
