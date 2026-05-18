import { err, ok, type IntegrationError, type Result } from '../result.js';
import type {
  AddTagsInput,
  MailchimpClient,
  MailchimpMember,
  UpsertMemberInput,
} from '../mailchimp/types.js';

/**
 * In-memory fake. Records calls and answers from a scriptable map of
 * pre-set members; tests can inspect `.calls` and `.members`.
 *
 * Set `.failNext = { kind, message, retryable }` to make the next call
 * return that error.
 */
export class FakeMailchimpClient implements MailchimpClient {
  readonly upsertCalls: UpsertMemberInput[] = [];
  readonly tagCalls: AddTagsInput[] = [];
  /** Keyed by `${listId}:${email.toLowerCase()}`. */
  readonly members = new Map<string, MailchimpMember>();

  failNext: IntegrationError | null = null;

  upsertMember(input: UpsertMemberInput): Promise<Result<MailchimpMember>> {
    this.upsertCalls.push(input);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.resolve(err(e));
    }
    const key = `${input.listId}:${input.email.toLowerCase()}`;
    const existing = this.members.get(key);
    const member: MailchimpMember = {
      email: input.email,
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      tags: existing?.tags ?? [],
    };
    this.members.set(key, member);
    return Promise.resolve(ok(member));
  }

  addTags(input: AddTagsInput): Promise<Result<void>> {
    this.tagCalls.push(input);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.resolve(err(e));
    }
    const key = `${input.listId}:${input.email.toLowerCase()}`;
    const m = this.members.get(key);
    if (!m) {
      return Promise.resolve(
        err({
          kind: 'validation',
          message: 'cannot tag a non-existent member',
          retryable: false,
        }),
      );
    }
    const next = new Set([...(m.tags ?? []), ...input.tags]);
    this.members.set(key, { ...m, tags: [...next] });
    return Promise.resolve(ok(undefined));
  }
}
