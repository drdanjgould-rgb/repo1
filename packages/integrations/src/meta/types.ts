import type { Result } from '../result.js';

export interface SendMessageInput {
  /** Instagram/Facebook Page ID (the inbound recipient — outbound sender). */
  pageId: string;
  /** Patient's platform-scoped ID (Page-Scoped User ID, returned in inbound). */
  recipientPsid: string;
  /** Text body. Max 1000 chars on IG. */
  text: string;
}

export interface SendMessageOutput {
  /** Platform-side message id, for idempotency on outbound persistence. */
  messageId: string;
}

export interface MetaClient {
  sendMessage(input: SendMessageInput): Promise<Result<SendMessageOutput>>;
}

export interface VerifySignatureInput {
  /** Raw request body, exactly as received. */
  body: string;
  /** Contents of `X-Hub-Signature-256` header (e.g., "sha256=abc..."). */
  signature: string | null | undefined;
  /** Meta app secret. */
  appSecret: string;
}
