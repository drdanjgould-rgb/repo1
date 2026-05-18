import { describe, expect, it } from 'vitest';
import { redact, restore } from '../src/index.js';

describe('restore', () => {
  it('round-trips an email', () => {
    const input = 'Email me at sarah@example.com';
    const { redacted, map } = redact(input);
    expect(restore(redacted, map)).toBe(input);
  });

  it('round-trips a mixed-PHI message exactly', () => {
    const input = 'Hi, my name is Sarah Johnson. Call (310) 555-1234 or email sarah@x.com.';
    const { redacted, map } = redact(input);
    expect(restore(redacted, map)).toBe(input);
  });

  it('leaves unrelated text untouched on restore', () => {
    const got = restore('hello world', { '<<PHI_NAME_001>>': 'Foo' });
    expect(got).toBe('hello world');
  });

  it('substitutes a token used by the LLM response with the original', () => {
    // Simulates: we sent the model "Hi <<PHI_NAME_001>>..." and it replied
    // with "Welcome <<PHI_NAME_001>>!" — restore puts the real name back.
    const llmReply = 'Welcome <<PHI_NAME_001>>! When can you visit?';
    const got = restore(llmReply, { '<<PHI_NAME_001>>': 'Sarah' });
    expect(got).toBe('Welcome Sarah! When can you visit?');
  });
});
