import type { Result } from '../result.js';

export interface MailchimpMember {
  email: string;
  firstName?: string;
  lastName?: string;
  /** Existing tag set on the member (post-upsert). */
  tags?: string[];
}

export interface UpsertMemberInput {
  listId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /**
   * "subscribed" enrolls the member in the list's automations (sequences).
   * "transactional" delivers individual emails without enrolling. Default:
   * "subscribed" so warm/hot leads pick up the nurture sequence.
   */
  status?: 'subscribed' | 'transactional' | 'pending';
  /** Merge fields (FNAME, LNAME, custom fields). */
  mergeFields?: Record<string, string>;
}

export interface AddTagsInput {
  listId: string;
  email: string;
  tags: string[];
}

export interface MailchimpClient {
  upsertMember(input: UpsertMemberInput): Promise<Result<MailchimpMember>>;
  addTags(input: AddTagsInput): Promise<Result<void>>;
}
