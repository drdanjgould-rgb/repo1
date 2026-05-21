import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b border-ink-100 pb-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-sm border border-ink-100 bg-white shadow-[0_1px_0_rgba(12,14,18,0.03)] ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  emphasis = 'normal',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  emphasis?: 'normal' | 'danger' | 'warn' | 'ok';
}) {
  const colorByEmphasis: Record<typeof emphasis, string> = {
    normal: 'text-ink-900',
    danger: 'text-signal-danger',
    warn: 'text-signal-warn',
    ok: 'text-signal-ok',
  };
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`mt-2 text-3xl font-medium tracking-tight ${colorByEmphasis[emphasis]}`}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-ink-500">{hint}</div> : null}
    </Card>
  );
}

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'danger' | 'warn' | 'ok' | 'info';
}) {
  const styles: Record<typeof variant, string> = {
    neutral: 'bg-ink-100 text-ink-700',
    danger: 'bg-red-50 text-signal-danger',
    warn: 'bg-amber-50 text-signal-warn',
    ok: 'bg-emerald-50 text-signal-ok',
    info: 'bg-blue-50 text-signal-info',
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="bg-dotted p-10 text-center">
      <div className="text-sm text-ink-700">{title}</div>
      {hint ? <div className="mt-1 text-xs text-ink-500">{hint}</div> : null}
    </Card>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-red-200 bg-red-50 p-5">
      <div className="text-xs uppercase tracking-wider text-signal-danger">Console API error</div>
      <div className="mt-2 font-mono text-sm text-signal-danger">{message}</div>
      <div className="mt-3 text-xs text-ink-500">
        Check that the API is running on <code className="font-mono">localhost:3000</code> and that
        both apps have the same <code className="font-mono">STAFF_API_TOKEN</code> in their
        <code className="font-mono"> .env.local</code>.
      </div>
    </Card>
  );
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

export function statusVariant(
  status: 'open' | 'closed' | 'escalated',
): 'neutral' | 'danger' | 'ok' {
  if (status === 'escalated') return 'danger';
  if (status === 'closed') return 'neutral';
  return 'ok';
}

export function tierVariant(
  tier: 'hot' | 'warm' | 'cold' | 'blocked',
): 'danger' | 'warn' | 'neutral' | 'info' {
  if (tier === 'hot') return 'danger';
  if (tier === 'warm') return 'warn';
  if (tier === 'blocked') return 'info';
  return 'neutral';
}
