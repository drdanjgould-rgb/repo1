import Link from 'next/link';
import { notFound } from 'next/navigation';
import { consoleApi } from '@/lib/api';
import {
  Badge,
  Card,
  ErrorState,
  PageHeader,
  formatRelative,
  statusVariant,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await consoleApi.conversation(id);
  if (!r.ok) {
    if (r.error.startsWith('404')) notFound();
    return <ErrorState message={r.error} />;
  }
  const { conversation, messages } = r.data;

  return (
    <>
      <PageHeader
        title="Conversation"
        subtitle={`${conversation.platform} · ${conversation.threadId}`}
        right={
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(conversation.status)}>{conversation.status}</Badge>
            <Link
              href="/conversations"
              className="text-sm text-accent-700 underline-offset-4 hover:underline"
            >
              ← Back
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <MetaTile label="Started" value={formatRelative(conversation.createdAt)} />
        <MetaTile label="Last activity" value={formatRelative(conversation.lastMessageAt)} />
        <MetaTile label="Turns" value={`${messages.length}`} />
      </div>

      <Card className="p-4">
        {messages.length === 0 ? (
          <div className="text-sm text-ink-500">No messages on this thread yet.</div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`flex ${m.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[75%] rounded-sm border px-4 py-3 ${
                    m.direction === 'inbound'
                      ? 'border-ink-100 bg-white'
                      : 'border-accent-100 bg-accent-50'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-ink-500">
                    <span className="font-medium uppercase tracking-wider">{m.role}</span>
                    {m.model ? (
                      <span className="font-mono text-[10px] text-ink-300">{m.model}</span>
                    ) : null}
                    {m.latencyMs ? (
                      <span className="font-mono text-[10px] text-ink-300">{m.latencyMs}ms</span>
                    ) : null}
                    <span>· {formatRelative(m.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-ink-900">
                    {m.contentRedacted}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="mt-6 rounded-sm border border-dashed border-ink-200 bg-white p-4 text-xs text-ink-500">
        <span className="font-medium uppercase tracking-wider text-ink-700">v0 note</span> ·
        Messages above are shown in their <em>redacted</em> form (
        <code className="font-mono">&lt;&lt;PHI_NAME_001&gt;&gt;</code>, etc.). Reveal-PHI for
        authenticated staff lands with real Supabase Auth in v1, alongside the audit-log entry for
        every reveal.
      </div>
    </>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1 text-base text-ink-900">{value}</div>
    </Card>
  );
}
