import type {
  ConversationsRepo,
  EscalationsRepo,
  LeadsRepo,
  MessagesRepo,
} from '@contourai/db/repos';

/**
 * Read-only repos exposed to the staff console. Narrower than
 * OrchestratorDeps on purpose — the console only reads.
 */
export interface ConsoleDeps {
  repos: {
    conversations: ConversationsRepo;
    messages: MessagesRepo;
    escalations: EscalationsRepo;
    leads: LeadsRepo;
  };
  clinic: { id: string };
}
