import type { Metadata } from 'next';
import { loadDiscoveredRounds } from '@/lib/discovery.server';
import { RoundsList } from '@/components/retro/RoundsList';
import { enrichRound } from '@/components/retro/roundRules';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Retro rounds — Rung',
  description: 'Retroactive funding rounds for verified projects on BOT Chain.',
};

export default async function RoundsPage() {
  const resolved = await Promise.all((await loadDiscoveredRounds()).map(enrichRound));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Retro rounds</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
          Organizations create and fund their own rounds, choose their reviewer, and publish award
          rules. Verified project builders apply; unallocated funds return to the organization.
        </p>
      </header>
      <RoundsList rounds={resolved} />
    </div>
  );
}
