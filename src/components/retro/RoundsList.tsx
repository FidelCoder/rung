'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { GitBranch } from 'lucide-react';
import { useConnection } from 'wagmi';
import { preview } from '@/lib/chain';
import { amount, short } from '@/lib/format';
import type { RoundView } from '@/lib/types';
import { Badge, Card, ProgressBar } from '@/components/ui';
import { remainingLabel, roundStatus } from '@/components/retro/util';
import { CreateRoundForm } from '@/components/retro/CreateRoundForm';

function toBig(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

function RoundCard({ round }: { round: RoundView }): ReactNode {
  const status = roundStatus(round);
  const budget = toBig(round.budget);
  const allocated = toBig(round.allocated);
  return (
    <Link href={`/rounds/${round.address}`} className="group h-full">
      <Card className="flex h-full flex-col transition group-hover:border-zinc-400">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-emerald-600" />
            <h3 className="truncate font-semibold group-hover:underline">{round.title}</h3>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">{round.description}</p>
        <div className="mt-4 space-y-2">
          <ProgressBar raised={allocated} goal={budget} />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{amount(round.allocated, round.decimals)} / {amount(round.budget, round.decimals)} {round.symbol} allocated</span>
            <span>{round.applications.length} applications</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
          <span>Applications {remainingLabel(round.deadline)}</span>
          <span>Decisions {remainingLabel(round.decisionDeadline)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
          <span>Organization {short(round.roundOwner)}</span>
          <span>Reviewer {short(round.reviewer)}</span>
        </div>
      </Card>
    </Link>
  );
}

export function RoundsList({ rounds }: { rounds: RoundView[] }): ReactNode {
  const { address } = useConnection();
  const canCreate = preview || !!address;

  return (
    <div className="space-y-6">
      {canCreate && <CreateRoundForm />}

      {rounds.length === 0 ? (
        <Card className="text-sm text-zinc-500">No retro rounds yet. An organization can connect its wallet to create and fund one.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rounds.map(round => <RoundCard key={round.address} round={round} />)}
        </div>
      )}
    </div>
  );
}
