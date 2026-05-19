/**
 * A loaded knowledge document. The body is the markdown content with
 * frontmatter stripped; the frontmatter fields are typed below.
 */
export interface KnowledgeDoc {
  slug: string;
  title: string;
  tags: string[];
  lastReviewed: string;
  /** Reviewer initials, captured for accountability (Dr. Gould initials).
   *  Three states:
   *    'PLACEHOLDER'  → not yet reviewed, sentinel test trips
   *    'DJG-source'   → content extracted directly from his uploaded
   *                     materials; awaiting his final markdown sign-off
   *    'DJG'          → he has reviewed the rendered markdown and
   *                     signed off
   */
  reviewedBy: string;
  /** Markdown body with frontmatter removed. */
  content: string;
}

export type KnowledgeSlug =
  | 'deep_plane_facelift'
  | 'drainless_tummy_tuck'
  | 'breast_augmentation'
  | 'revision_facelift'
  | 'recovery_general'
  | 'consultation_process'
  | 'pricing_policy'
  | '_voice_and_doctrine';
