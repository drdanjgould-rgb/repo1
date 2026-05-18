import type { LLMTransport, MessagesRequest, MessagesResponse } from '../src/types.js';

/**
 * Test double for `LLMTransport`. Records every call and returns a
 * scriptable response. Use `FakeTransport.from(...)` to set up canned
 * replies in order.
 */
export class FakeTransport implements LLMTransport {
  readonly calls: MessagesRequest[] = [];
  private readonly responses: MessagesResponse[];

  constructor(responses: MessagesResponse[]) {
    this.responses = [...responses];
  }

  static from(
    ...responses: Array<Partial<MessagesResponse> & Pick<MessagesResponse, 'content'>>
  ): FakeTransport {
    return new FakeTransport(responses.map(toFullResponse));
  }

  messages(req: MessagesRequest): Promise<MessagesResponse> {
    this.calls.push(req);
    const r = this.responses.shift();
    if (!r) throw new Error('FakeTransport: no more scripted responses');
    return Promise.resolve(r);
  }

  /** Convenience: the most recent request sent to the transport. */
  get lastCall(): MessagesRequest {
    const r = this.calls[this.calls.length - 1];
    if (!r) throw new Error('FakeTransport: no calls yet');
    return r;
  }
}

function toFullResponse(
  partial: Partial<MessagesResponse> & Pick<MessagesResponse, 'content'>,
): MessagesResponse {
  return {
    id: partial.id ?? 'msg_test',
    model: partial.model ?? 'claude-sonnet-4-6',
    role: 'assistant',
    content: partial.content,
    stop_reason: partial.stop_reason ?? 'end_turn',
    usage: partial.usage ?? { input_tokens: 10, output_tokens: 5 },
  };
}
