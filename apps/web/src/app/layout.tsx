import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContourAI · Staff Console',
  description: 'Operations console for the ContourAI AI Concierge.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg)] text-ink-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-ink-100 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent-700 text-sm font-semibold tracking-tight text-accent-50">
                  C
                </div>
                <div className="leading-tight">
                  <div className="font-medium tracking-tight">ContourAI</div>
                  <div className="text-xs text-ink-500">Staff Console</div>
                </div>
              </Link>
              <nav className="flex items-center gap-6 text-sm">
                <Link href="/" className="text-ink-700 hover:text-ink-900">
                  Dashboard
                </Link>
                <Link href="/escalations" className="text-ink-700 hover:text-ink-900">
                  Escalations
                </Link>
                <Link href="/conversations" className="text-ink-700 hover:text-ink-900">
                  Conversations
                </Link>
                <Link href="/leads" className="text-ink-700 hover:text-ink-900">
                  Leads
                </Link>
              </nav>
              <div className="text-xs uppercase tracking-wider text-ink-500">
                Gould Plastic Surgery
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
          <footer className="border-t border-ink-100 bg-white">
            <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-ink-500">
              v0 preview · read-only · no real auth yet · PHI shown to authenticated staff only
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
