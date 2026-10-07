'use client';

import Link from 'next/link';
import { Globe, ShieldCheck } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Card, ProgressBar } from '@/components/ui';
import { botChain, rungAddress } from '@/lib/chain';
import { amount, days, short } from '@/lib/format';
import { safeLink } from '@/lib/metadata';
import { reviewStateLabel } from '@/lib/reads';
import type { ProjectView, StageView } from '@/lib/types';
import { ActivityFeed } from './ActivityFeed';
import { BackerPanel } from './BackerPanel';
import { StageHistory } from './StageHistory';
import { useNow } from './useNow';

function countdown(timestamp: number, nowMs: number): string {
  const diff = timestamp - Math.floor(nowMs / 1000);
  if (diff <= 0) return 'ended';
  const d = days(timestamp);
  if (d > 1) return `${d}d left`;
  const h = Math.floor(diff / 3600);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(diff / 60))}m left`;
}

function reviewTone(state: number): 'default' | 'green' | 'amber' | 'blue' {
  if (state === 3) return 'green';
  if (state === 1) return 'blue';
  if (state === 2) return 'amber';
  return 'default';
}

export function ProjectDetail({ project }: { project: ProjectView }) {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);
  const now = useNow(30_000);
  const stage = project.stage;

  const refresh = useCallback(() => {
    setTick(value => value + 1);
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const website = project.website ? safeLink(project.website) : undefined;
  const explorerBase = botChain.blockExplorers?.default.url;
  const registryUrl = rungAddress && explorerBase ? `${explorerBase}/address/${rungAddress}` : undefined;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-zinc-900 px-6 py-8 text-white sm:px-10 sm:py-10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{project.category}</Badge>
          {project.verified && <Badge tone="green">Verified milestone</Badge>}
          <Badge tone={project.source === 'chain' ? 'blue' : 'amber'}>
            {project.source === 'chain' ? 'Onchain data' : 'Preview data'}
          </Badge>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{project.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
          {project.description || 'No description has been published for this project yet.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-400">
          <span className="font-medium text-zinc-200">Stage {project.stageNumber}</span>
          <span>Builder {short(project.builder)}</span>
          <span>Project #{project.id}</span>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-zinc-300 hover:text-white"
            >
              <Globe className="h-3.5 w-3.5" /> Website ↗
            </a>
          )}
        </div>
      </header>

      {stage ? (
        <>
          <StageCard stage={stage} stageNumber={project.stageNumber} now={now} />
          <BackerPanel stage={stage} onConfirmed={refresh} />
          <StageHistory projectId={project.id} currentAddress={stage.address} />
          <ActivityFeed
            address={stage.address}
            symbol={stage.symbol}
            decimals={stage.decimals}
            builder={project.builder}
            tick={tick}
          />
        </>
      ) : (
        <Card className="text-sm text-zinc-600">
          This project has no open stage right now. Check back once the builder opens the next milestone.
        </Card>
      )}

      {project.verified && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                A previous milestone was approved — future backers can verify it onchain.
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-700">
                The approval is recorded in the Rung registry
                {registryUrl ? (
                  <>
                    {' — '}
                    <a href={registryUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                      view registry contract
                    </a>
                  </>
                ) : rungAddress ? (
                  <> at {short(rungAddress)}</>
                ) : (
                  ''
                )}
                .
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <p className="text-sm text-zinc-600">
          Verified projects can apply to retro funding rounds.{' '}
          <Link href="/rounds" className="font-medium text-blue-600 hover:underline">
            Browse rounds →
          </Link>
        </p>
      </Card>
    </div>
  );
}

function StageCard({ stage, stageNumber, now }: { stage: StageView; stageNumber: number; now?: number }) {
  const goal = BigInt(stage.goal);
  const raised = BigInt(stage.raised);
  const pct = goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
  const evidenceLink = stage.evidenceURI ? safeLink(stage.evidenceURI) : undefined;
  const dateLabel = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Stage {stageNumber} · current raise
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{stage.terms.title}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={reviewTone(stage.reviewState)}>{reviewStateLabel(stage.reviewState)}</Badge>
          {stage.claimed && <Badge tone="blue">Claimed</Badge>}
          {stage.cancelled && <Badge tone="red">Cancelled</Badge>}
          {!stage.claimed && !stage.cancelled && stage.refundable && <Badge tone="amber">Refunds open</Badge>}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-zinc-700">Deliverable</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{stage.terms.deliverable}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-700">Acceptance criteria</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{stage.terms.criteria}</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <ProgressBar raised={raised} goal={goal} />
        <div className="flex flex-wrap justify-between gap-2 text-xs">
          <span className="font-medium text-zinc-700">
            {amount(stage.raised, stage.decimals)} / {amount(stage.goal, stage.decimals)} {stage.symbol} raised
          </span>
          <span className="text-zinc-500">{pct}% funded</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs text-zinc-500">Funding deadline</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">
            {now === undefined
              ? '…'
              : stage.deadline * 1000 <= now
                ? 'Contribution window closed'
                : `${countdown(stage.deadline, now)} · contributions close`}
          </p>
          {now !== undefined && <p className="text-xs text-zinc-500">{dateLabel(stage.deadline)}</p>}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs text-zinc-500">Delivery deadline</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">
            {now === undefined
              ? '…'
              : stage.deliveryDeadline * 1000 <= now
                ? 'Delivery window closed'
                : `${countdown(stage.deliveryDeadline, now)} · to deliver`}
          </p>
          {now !== undefined && <p className="text-xs text-zinc-500">{dateLabel(stage.deliveryDeadline)}</p>}
        </div>
      </div>

      {stage.reviewReason && (
        <p
          className={`mt-4 rounded-xl px-4 py-3 text-sm leading-5 ${
            stage.reviewState === 3 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
          }`}
        >
          Community outcome: {stage.reviewReason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {evidenceLink ? (
          <a href={evidenceLink} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
            Evidence ↗
          </a>
        ) : stage.evidenceURI ? (
          <span className="text-zinc-500">Evidence submitted (no public link)</span>
        ) : (
          <span className="text-zinc-500">No evidence submitted yet</span>
        )}
        {stage.reviewState > 0 && (
          <span className="text-zinc-500">
            Vote {amount(stage.approvalWeight, stage.decimals)} yes · {amount(stage.rejectionWeight, stage.decimals)} no · {stage.voterCount} backers
          </span>
        )}
      </div>
    </Card>
  );
}
