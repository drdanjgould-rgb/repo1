import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <PageHeader
        title="Not found"
        subtitle="That resource does not exist or is in a different clinic."
      />
      <Card className="p-6 text-sm">
        <Link href="/" className="text-accent-700 underline-offset-4 hover:underline">
          ← Back to dashboard
        </Link>
      </Card>
    </>
  );
}
