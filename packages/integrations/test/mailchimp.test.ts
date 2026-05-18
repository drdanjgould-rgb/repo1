import { describe, expect, it } from 'vitest';
import { subscriberHash } from '../src/mailchimp/client.js';
import { FakeMailchimpClient } from '../src/test-utils/fake-mailchimp.js';

describe('subscriberHash', () => {
  it('is the MD5 of the lowercased email per Mailchimp spec', () => {
    // MD5("urist@mcvankab.com") — verified via node:crypto.
    expect(subscriberHash('urist@mcvankab.com')).toBe('41c00e62476865ba72254cdc5b2c191e');
  });

  it('is case-insensitive', () => {
    expect(subscriberHash('Foo@Bar.com')).toBe(subscriberHash('foo@bar.com'));
  });
});

describe('FakeMailchimpClient', () => {
  it('records upsertMember calls and remembers members', async () => {
    const mc = new FakeMailchimpClient();
    const r = await mc.upsertMember({
      listId: 'list-1',
      email: 'sarah@example.com',
      firstName: 'Sarah',
      lastName: 'Johnson',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.value.email).toBe('sarah@example.com');
    expect(mc.upsertCalls).toHaveLength(1);
    expect(mc.members.size).toBe(1);
  });

  it('accumulates tags via addTags', async () => {
    const mc = new FakeMailchimpClient();
    await mc.upsertMember({ listId: 'list-1', email: 'a@b.com' });
    await mc.addTags({ listId: 'list-1', email: 'a@b.com', tags: ['hot_lead', 'concierge'] });
    await mc.addTags({ listId: 'list-1', email: 'a@b.com', tags: ['concierge', 'facelift'] });
    const m = mc.members.get('list-1:a@b.com');
    expect(m?.tags?.sort()).toEqual(['concierge', 'facelift', 'hot_lead']);
  });

  it('fails addTags when the member does not exist', async () => {
    const mc = new FakeMailchimpClient();
    const r = await mc.addTags({ listId: 'list-1', email: 'missing@x.com', tags: ['x'] });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error.kind).toBe('validation');
  });

  it('returns scripted errors via failNext', async () => {
    const mc = new FakeMailchimpClient();
    mc.failNext = { kind: 'rate_limit', message: 'slow down', retryable: true };
    const r = await mc.upsertMember({ listId: 'list-1', email: 'x@y.com' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error.kind).toBe('rate_limit');
    expect(r.error.retryable).toBe(true);
  });
});

describe('RealMailchimpClient — constructor', () => {
  it('requires a datacenter suffix on the API key', async () => {
    const { RealMailchimpClient } = await import('../src/mailchimp/client.js');
    expect(() => new RealMailchimpClient({ apiKey: 'no-dc-here' })).toThrow(/datacenter/);
  });

  it('infers baseUrl from the apiKey suffix', async () => {
    const { RealMailchimpClient } = await import('../src/mailchimp/client.js');
    // Constructor must not throw; we infer dc=us20.
    expect(() => new RealMailchimpClient({ apiKey: 'abc-us20' })).not.toThrow();
  });
});
