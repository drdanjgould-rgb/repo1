import Link from 'next/link';
import { consoleApi } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorState, PageHeader, formatRelative } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EscalationsPage() {
  const r = await consoleApi.escalations();
  if (!r.ok) return <ErrorState message={r.error} />;

  return (
    <>
      <PageHeader
        title="Escalations"
        subtitle="Every open red-flag, compliance, and human-handoff event. Sorted newest first."
      />
      {r.data.items.length === 0 ? (
        <EmptyState
          title="Nothing in the queue."
          hint="An empty escalations page is the desired state."
        />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Sev</th>
                <th className="px-4 py-3 font-medium">Rationale</th>
                <th className="px-4 py-3 font-medium">Notified</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {r.data.items.map((e) => (
                <tr key={e.id} className="hover:bg-ink-100/30">
                  <td className="px-4 py-3">
                    <Badge variant={escalationVariant(e.reason)}>{e.reason}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{e.category}</td>
                  <td className="px-4 py-3 font-mono">{e.severity}/5</td>
                  <td className="max-w-md px-4 py-3 text-ink-700">
                    <span className="line-clamp-2">{e.rationale ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {e.notifiedAt ? formatRelative(e.notifiedAt) : 'pending'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">{formatRelative(e.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {e.conversationId ? (
                      <Link
                        href={`/conversations/${e.conversationId}`}
                        className="text-accent-700 underline-offset-4 hover:underline"
                      >
                        Open thread →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function escalationVariant(
  reason: 'red_flag_medical' | 'human_handoff_request' | 'complaint' | 'compliance' | 'other',
): 'danger' | 'warn' | 'info' | 'neutral' {
  if (reason === 'red_flag_medical') return 'danger';
  if (reason === 'compliance' || reason === 'complaint') return 'warn';
  if (reason === 'human_handoff_request') return 'info';
  return 'neutral';
}
