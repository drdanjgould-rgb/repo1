import Link from 'next/link';
import { consoleApi } from '@/lib/api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  formatRelative,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, escalations] = await Promise.all([
    consoleApi.dashboard(),
    consoleApi.escalations(),
  ]);

  if (!stats.ok) return <ErrorState message={stats.error} />;
  const totalLeads =
    stats.data.leadsByTier.hot +
    stats.data.leadsByTier.warm +
    stats.data.leadsByTier.cold +
    stats.data.leadsByTier.blocked;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Live operational snapshot. Read-only preview — no actions wired yet."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open escalations"
          value={stats.data.openEscalations}
          hint="Patient-side messages awaiting staff response"
          emphasis={stats.data.openEscalations > 0 ? 'danger' : 'ok'}
        />
        <StatCard
          label="Conversations today"
          value={stats.data.conversationsToday}
          hint="Threads with activity since midnight (local)"
        />
        <StatCard
          label="New leads (7d)"
          value={totalLeads}
          hint={`${stats.data.leadsByTier.hot} hot · ${stats.data.leadsByTier.warm} warm · ${stats.data.leadsByTier.cold} cold`}
        />
        <StatCard label="Pricing decline rate" value="—" hint="Compliance metric, lands in v1" />
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium tracking-tight">Recent escalations</h2>
          <Link
            href="/escalations"
            className="text-sm text-accent-700 underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        </div>
        {!escalations.ok ? (
          <ErrorState message={escalations.error} />
        ) : escalations.data.items.length === 0 ? (
          <EmptyState
            title="No open escalations."
            hint="When a red-flag inbound fires or the model trips the banned-phrase filter, it lands here."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-ink-100">
              {escalations.data.items.slice(0, 5).map((e) => (
                <li key={e.id} className="p-4 hover:bg-ink-100/30">
                  <Link
                    href={e.conversationId ? `/conversations/${e.conversationId}` : '/escalations'}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={escalationVariant(e.reason)}>{e.reason}</Badge>
                        {e.category !== 'none' ? (
                          <Badge variant="neutral">{e.category}</Badge>
                        ) : null}
                        <span className="text-xs text-ink-500">
                          severity {e.severity}/5 · {formatRelative(e.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 truncate text-sm text-ink-700">
                        {e.rationale ?? 'No rationale recorded.'}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
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
