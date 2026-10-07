import type { Metadata } from 'next';
import { ReviewQueue } from '@/components/review/ReviewQueue';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review queue — Rung',
  description: 'Review milestone evidence and vote on work funded by the community.',
};

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Community review</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
          Backers review submitted evidence and vote in proportion to what they contributed. Votes stay open for 7 days;
          approval requires half of the raised value to participate and more yes weight than no weight. Anyone can finalize the result.
        </p>
      </header>
      <ReviewQueue />
    </div>
  );
}
