import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from '../src/meta/client.js';
import { FakeMetaClient } from '../src/test-utils/fake-meta.js';

const SECRET = 'test-app-secret';
const BODY = '{"object":"instagram","entry":[]}';
const SIG = 'sha256=' + createHmac('sha256', SECRET).update(BODY).digest('hex');

describe('verifyMetaSignature', () => {
  it('passes a correct signature', () => {
    expect(verifyMetaSignature({ body: BODY, signature: SIG, appSecret: SECRET })).toBe(true);
  });

  it('fails when the body is tampered with', () => {
    expect(
      verifyMetaSignature({
        body: BODY + ' tampered',
        signature: SIG,
        appSecret: SECRET,
      }),
    ).toBe(false);
  });

  it('fails when the secret is wrong', () => {
    expect(
      verifyMetaSignature({
        body: BODY,
        signature: SIG,
        appSecret: 'different-secret',
      }),
    ).toBe(false);
  });

  it('fails on a missing or empty signature', () => {
    expect(verifyMetaSignature({ body: BODY, signature: null, appSecret: SECRET })).toBe(false);
    expect(verifyMetaSignature({ body: BODY, signature: '', appSecret: SECRET })).toBe(false);
    expect(verifyMetaSignature({ body: BODY, signature: undefined, appSecret: SECRET })).toBe(
      false,
    );
  });

  it('fails on a malformed scheme prefix', () => {
    expect(
      verifyMetaSignature({
        body: BODY,
        signature: 'md5=' + 'a'.repeat(64),
        appSecret: SECRET,
      }),
    ).toBe(false);
  });

  it('fails on a length mismatch (no buffer-throw)', () => {
    expect(
      verifyMetaSignature({
        body: BODY,
        signature: 'sha256=tooshort',
        appSecret: SECRET,
      }),
    ).toBe(false);
  });
});

describe('FakeMetaClient', () => {
  it('records sends and returns a synthetic message id', async () => {
    const m = new FakeMetaClient();
    const r = await m.sendMessage({
      pageId: '123',
      recipientPsid: 'patient_456',
      text: 'hello',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.value.messageId).toMatch(/^fake-mid-/);
    expect(m.sends).toHaveLength(1);
    expect(m.sends[0]?.text).toBe('hello');
  });

  it('returns scripted errors via failNext', async () => {
    const m = new FakeMetaClient();
    m.failNext = { kind: 'rate_limit', message: 'slow', retryable: true };
    const r = await m.sendMessage({ pageId: '1', recipientPsid: 'p', text: 't' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error.kind).toBe('rate_limit');
  });
});

describe('RealMetaClient — constructor', () => {
  it('accepts a page access token without throwing', async () => {
    const { RealMetaClient } = await import('../src/meta/client.js');
    expect(() => new RealMetaClient({ pageAccessToken: 'token' })).not.toThrow();
  });
});
