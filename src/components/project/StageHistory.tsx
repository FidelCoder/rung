'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Spinner } from '@/components/ui';
import { amount } from '@/lib/format';
import { loadProjectStages, reviewStateLabel } from '@/lib/reads';
import type { StageView } from '@/lib/types';

function historyTone(stage: StageView): 'green' | 'amber' | 'red' | 'blue' | 'default' {
  if (stage.cancelled) return 'red';
  if (stage.claimed) return 'green';
  if (stage.reviewState === 3) return 'green';
  if (stage.reviewState === 1) return 'blue';
  if (stage.reviewState === 2) return 'amber';
  return 'default';
}

export function StageHistory({ projectId, currentAddress }: { projectId: number; currentAddress: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['stage-history', projectId],
    queryFn: () => loadProjectStages(projectId),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const all = data ?? [];
  // Retries reuse their stage number (approval is what advances the ladder), so
  // number the attempts within each stage number to keep every escrow distinct.
  const attempts = new Map<string, number>();
  const perNumber = new Map<number, number>();
  for (const stage of all) {
    const next = (perNumber.get(stage.stageNumber) ?? 0) + 1;
    perNumber.set(stage.stageNumber, next);
    attempts.set(stage.address.toLowerCase(), next);
  }
  const duplicates = new Set([...perNumber].filter(([, n]) => n > 1).map(([num]) => num));

  const past = all.filter(s => s.address.toLowerCase() !== currentAddress.toLowerCase());

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Stage history</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Every milestone attempt, with its recorded community decision.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {open ? 'Hide history' : 'Show history'}
        </button>
      </div>
      {open && (
        isLoading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Spinner /> Loading onchain stage history…
          </p>
        ) : past.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">This is the project’s first stage.</p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-zinc-200 pl-4">
            {past.map(stage => (
              <li key={stage.address} className="relative">
                <span className="absolute -left-[21px] top-1.5 block h-2.5 w-2.5 rounded-full bg-zinc-300 ring-4 ring-white" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    Stage {stage.stageNumber}
                    {duplicates.has(stage.stageNumber) && ` · attempt ${attempts.get(stage.address.toLowerCase()) ?? 1}`}
                  </Badge>
                  <Badge tone={historyTone(stage)}>{reviewStateLabel(stage.reviewState)}</Badge>
                  {stage.claimed && <Badge tone="blue">Funds claimed</Badge>}
                  {stage.cancelled && <Badge tone="red">Cancelled</Badge>}
                  <span className="text-xs text-zinc-500">
                    {amount(stage.raised, stage.decimals)} / {amount(stage.goal, stage.decimals)} {stage.symbol} raised
                  </span>
                </div>
                {stage.reviewReason && (
                  <p className="mt-1 text-sm text-zinc-600">“{stage.reviewReason}”</p>
                )}
                {stage.evidenceURI && (
                  <p className="mt-0.5 text-xs text-zinc-500">Evidence: {stage.evidenceURI}</p>
                )}
              </li>
            ))}
          </ol>
        )
      )}
    </Card>
  );
}
