import Link from 'next/link';
import { consoleApi } from '@/lib/api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  formatRelative,
  statusVariant,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const r = await consoleApi.conversations(params.status);
  if (!r.ok) return <ErrorState message={r.error} />;

  return (
    <>
      <PageHeader
        title="Conversations"
        subtitle="DMs in flight. Click a row to see the full turn-by-turn."
        right={
          <div className="flex gap-1 text-xs">
            <FilterChip href="/conversations" label="All" active={!params.status} />
            <FilterChip
              href="/conversations?status=open"
              label="Open"
              active={params.status === 'open'}
            />
            <FilterChip
              href="/conversations?status=escalated"
              label="Escalated"
              active={params.status === 'escalated'}
            />
            <FilterChip
              href="/conversations?status=closed"
              label="Closed"
              active={params.status === 'closed'}
            />
          </div>
        }
      />
      {r.data.items.length === 0 ? (
        <EmptyState
          title="No conversations match this filter."
          hint="Try a different status or seed demo data with `pnpm seed:demo`."
        />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Thread</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {r.data.items.map((c) => (
                <tr key={c.id} className="hover:bg-ink-100/30">
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{c.platform}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{c.threadId}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {formatRelative(c.lastMessageAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">{formatRelative(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/conversations/${c.id}`}
                      className="text-accent-700 underline-offset-4 hover:underline"
                    >
                      Open →
                    </Link>
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

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-sm border px-3 py-1 transition-colors ${
        active
          ? 'border-accent-700 bg-accent-700 text-accent-50'
          : 'border-ink-100 bg-white text-ink-700 hover:border-ink-200'
      }`}
    >
      {label}
    </Link>
  );
}
