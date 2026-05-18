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
export { ok, err, type IntegrationError, type Result } from './result.js';
