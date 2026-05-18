/**
 * A loaded knowledge document. The body is the markdown content with
 * frontmatter stripped; the frontmatter fields are typed below.
 */
export interface KnowledgeDoc {
  slug: string;
  title: string;
  tags: string[];
  lastReviewed: string;
  /** Reviewer initials, captured for accountability (Dr. Gould initials). */
  reviewedBy: string;
  /** Markdown body with frontmatter removed. */
  content: string;
}

export type KnowledgeSlug =
  | 'deep_plane_facelift'
  | 'drainless_tummy_tuck'
  | 'recovery_general'
  | 'consultation_process'
  | 'pricing_policy';
