import { err, ok, type IntegrationError, type Result } from '../result.js';
import type { MetaClient, SendMessageInput, SendMessageOutput } from '../meta/types.js';

/**
 * In-memory fake. Records every send; lets tests assert what would have
 * been delivered to Instagram / Facebook.
 */
export class FakeMetaClient implements MetaClient {
  readonly sends: SendMessageInput[] = [];
  failNext: IntegrationError | null = null;

  sendMessage(input: SendMessageInput): Promise<Result<SendMessageOutput>> {
    this.sends.push(input);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.resolve(err(e));
    }
    return Promise.resolve(ok({ messageId: `fake-mid-${this.sends.length}` }));
  }
}
