import { describe, expect, it } from 'vitest';
import { ClaudeClient } from '@contourai/agents';
import { FakeTransport } from '@contourai/agents/test-utils';
import {
  FakeConversationsRepo,
  FakeEscalationsRepo,
  FakeLeadScoresRepo,
  FakeLeadsRepo,
  FakeMessagesRepo,
  FakePatientsRepo,
} from '@contourai/db/test-utils';
import { FakeMailchimpClient, FakeSheetsClient } from '@contourai/integrations/test-utils';
import {
  createConciergeAgent,
  handleInboundDM,
  type OrchestratorDeps,
} from '@contourai/worker-concierge';

const CLINIC = '00000000-0000-0000-0000-000000000001';

function buildDeps(): { deps: OrchestratorDeps; sheets: FakeSheetsClient } {
  const transport = FakeTransport.from(
    { content: [{ type: 'text', text: 'Thanks! How can we reach you, phone or email?' }] },
    {
      content: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'classify',
          input: { intent: 'booking', urgency: 4, asked_for_human: false },
        },
      ],
      stop_reason: 'tool_use',
    },
  );
  const client = new ClaudeClient({ transport });
  const agent = createConciergeAgent({ client });
  const sheets = new FakeSheetsClient();

  return {
    deps: {
      client,
      agent,
      repos: {
        conversations: new FakeConversationsRepo(),
        messages: new FakeMessagesRepo(),
        escalations: new FakeEscalationsRepo(),
        patients: new FakePatientsRepo(),
        leads: new FakeLeadsRepo(),
        leadScores: new FakeLeadScoresRepo(),
      },
      integrations: { mailchimp: new FakeMailchimpClient(), sheets },
      clinic: {
        id: CLINIC,
        mailchimpListId: 'list-1',
        sheetsSpreadsheetId: 'sheet-1',
        sheetsRange: 'Leads!A1',
      },
    },
    sheets,
  };
}

describe('Inngest binding — orchestrator integration', () => {
  it('end-to-end: a normalized event through handleInboundDM produces a replied result', async () => {
    // We test the orchestrator directly here — same path the Inngest
    // step.run callback would take. Wiring through Inngest's runtime
    // requires the dev server, which we don't run in CI.
    const { deps, sheets } = buildDeps();
    const result = await handleInboundDM(deps, {
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 'patient-igsid-001',
      platformMsgId: 'meta-msg-001',
      text: 'I would like to book a consult, what is the best way to reach Dr. Gould?',
      sender: { handle: 'patient-igsid-001', email: 'sarah@example.com' },
    });
    expect(result.kind).toBe('replied');
    expect(sheets.calls).toHaveLength(1);
  });
});
