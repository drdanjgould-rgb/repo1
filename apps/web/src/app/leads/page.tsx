import Link from 'next/link';
import { consoleApi } from '@/lib/api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  formatRelative,
  tierVariant,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const params = await searchParams;
  const r = await consoleApi.leads(params.tier);
  if (!r.ok) return <ErrorState message={r.error} />;

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Lead pipeline scored by the orchestrator. Sorted by last touch."
        right={
          <div className="flex gap-1 text-xs">
            <FilterChip href="/leads" label="All" active={!params.tier} />
            <FilterChip href="/leads?tier=hot" label="Hot" active={params.tier === 'hot'} />
            <FilterChip href="/leads?tier=warm" label="Warm" active={params.tier === 'warm'} />
            <FilterChip href="/leads?tier=cold" label="Cold" active={params.tier === 'cold'} />
          </div>
        }
      />
      {r.data.items.length === 0 ? (
        <EmptyState title="No leads match this filter." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Procedure</th>
                <th className="px-4 py-3 font-medium">Timeline</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Last touched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {r.data.items.map((l) => (
                <tr key={l.id} className="hover:bg-ink-100/30">
                  <td className="px-4 py-3">
                    <Badge variant={tierVariant(l.tier)}>{l.tier}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono">{l.score}</td>
                  <td className="px-4 py-3 text-ink-700">{l.procedureInterest ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-700">{l.timeline ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">
                    {l.rawContactRedacted ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">{l.source}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {formatRelative(l.lastTouchedAt ?? l.createdAt)}
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
