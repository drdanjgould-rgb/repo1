export {
  RealMailchimpClient,
  subscriberHash,
  type MailchimpClient,
  type MailchimpClientOptions,
  type MailchimpMember,
  type UpsertMemberInput,
  type AddTagsInput,
} from './mailchimp/index.js';
export {
  RealSheetsClient,
  type SheetsClient,
  type SheetsClientOptions,
  type AppendRowInput,
  type AppendRowOutput,
} from './sheets/index.js';
export {
  RealMetaClient,
  verifyMetaSignature,
  type MetaClient,
  type MetaClientOptions,
  type SendMessageInput,
  type SendMessageOutput,
  type VerifySignatureInput,
} from './meta/index.js';
export { ok, err, type IntegrationError, type Result } from './result.js';
