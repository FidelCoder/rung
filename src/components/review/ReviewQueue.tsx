'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useConnection } from 'wagmi';
import type { Address } from 'viem';
import { Gavel } from 'lucide-react';
import { Badge, Button, Card, Notice, ProgressBar, Spinner } from '@/components/ui';
import { stageEscrowAbi } from '@/lib/abi';
import { preview } from '@/lib/chain';
import { amount, days, short } from '@/lib/format';
import { fetchProjects } from '@/lib/clientReads';
import { publicClient, reviewStateLabel } from '@/lib/reads';
import { useTx } from '@/lib/tx';
import type { ProjectView, StageView } from '@/lib/types';
import { safeLink } from '@/lib/metadata';

const REVIEW_WINDOW = 7 * 86400;

function toBig(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

function VoteActions({ stage, address, disabled, onComplete }: {
  stage: StageView;
  address?: Address;
  disabled: boolean;
  onComplete: () => void;
}) {
  const voteTx = useTx();
  const finalizeTx = useTx();
  const [weight, setWeight] = useState<bigint>(0n);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const closesAt = stage.submittedAt + REVIEW_WINDOW;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    if (!address || preview) {
      setWeight(0n);
      setHasVoted(false);
      return;
    }
    setLoading(true);
    Promise.all([
      publicClient.readContract({ address: stage.address, abi: stageEscrowAbi, functionName: 'contributions', args: [address] }),
      publicClient.readContract({ address: stage.address, abi: stageEscrowAbi, functionName: 'hasVoted', args: [address] }),
    ]).then(([contribution, voted]) => {
      if (!active) return;
      setWeight(contribution);
      setHasVoted(voted);
    }).catch(() => {
      if (active) {
        setWeight(0n);
        setHasVoted(false);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [address, stage.address, stage.evidenceRound]);

  const votingOpen = now <= closesAt;
  const mayVote = !disabled && !preview && stage.reviewState === 1 && votingOpen && !!address && weight > 0n && !hasVoted && !loading;
  const mayFinalize = !disabled && !preview && stage.reviewState === 1 && !votingOpen;

  const cast = async (approve: boolean) => {
    const hash = await voteTx.send({ address: stage.address, abi: stageEscrowAbi, functionName: 'castVote', args: [approve] }, {
      onConfirm: () => { setHasVoted(true); onComplete(); },
    });
    return hash;
  };

  const finalize = async () => {
    await finalizeTx.send({ address: stage.address, abi: stageEscrowAbi, functionName: 'finalizeReview' }, { onConfirm: onComplete });
  };

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <span>{stage.voterCount} backers voted · {amount(stage.participationWeight, stage.decimals)} participated · {amount(stage.approvalWeight, stage.decimals)} yes · {amount(stage.rejectionWeight, stage.decimals)} no</span>
        <span>{votingOpen ? `${days(closesAt)}d left to vote` : 'Vote window closed'}</span>
      </div>
      {address && !preview && (
        <p className="text-xs text-zinc-500">
          {loading ? 'Checking your contribution…' : weight > 0n ? `Your voting weight: ${amount(weight.toString(), stage.decimals)} ${stage.symbol}${hasVoted ? ' · vote recorded' : ''}` : 'Only wallets that contributed to this stage can vote.'}
        </p>
      )}
      {!address && !preview && <p className="text-xs text-zinc-500">Connect a contributing wallet to vote. Anyone can finalize after the window closes.</p>}
      {preview && <p className="text-xs text-amber-700">Preview mode — connect to a deployed contract to cast or finalize votes.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!mayVote} loading={voteTx.pending} onClick={() => void cast(true)}>Vote yes</Button>
        <Button variant="secondary" disabled={!mayVote} loading={voteTx.pending} onClick={() => void cast(false)}>Vote no</Button>
        {mayFinalize && <Button disabled={finalizeTx.pending} loading={finalizeTx.pending} onClick={() => void finalize()}>Finalize vote</Button>}
      </div>
      <Notice status={voteTx.status} hash={voteTx.hash} error={voteTx.error} />
      <Notice status={finalizeTx.status} hash={finalizeTx.hash} error={finalizeTx.error} />
    </div>
  );
}

function ReviewCard({ project, address, disabled, onComplete }: {
  project: ProjectView;
  address?: Address;
  disabled: boolean;
  onComplete: () => void;
}) {
  const stage = project.stage;
  if (!stage) return null;
  const evidence = safeLink(stage.evidenceURI);
  const raised = toBig(stage.raised);
  const goal = toBig(stage.goal);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/project/${project.id}`} className="font-semibold hover:underline">{project.name}</Link>
            <Badge tone="blue">{reviewStateLabel(stage.reviewState)}</Badge>
            <Badge>Stage {project.stageNumber}</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Builder {short(project.builder)} · escrow {short(stage.address)} · evidence round {stage.evidenceRound}</p>
        </div>
        {project.verified && <Badge tone="green">Verified</Badge>}
      </div>
      <div className="mt-4 rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{stage.terms.title}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-700">{stage.terms.deliverable}</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500"><span className="font-medium text-zinc-600">Acceptance criteria:</span> {stage.terms.criteria}</p>
      </div>
      <div className="mt-4">
        <ProgressBar raised={raised} goal={goal} />
        <p className="mt-1.5 text-xs text-zinc-500">{amount(stage.raised, stage.decimals)} / {amount(stage.goal, stage.decimals)} {stage.symbol} raised</p>
      </div>
      {evidence ? (
        <a href={evidence} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">Review submitted evidence ↗</a>
      ) : <p className="mt-3 text-sm text-amber-700">Evidence URI is not a public web link; verify it using the onchain content hash.</p>}
      {stage.reviewReason && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Previous community outcome: {stage.reviewReason}</p>}
      <VoteActions stage={stage} address={address} disabled={disabled} onComplete={onComplete} />
    </Card>
  );
}

export function ReviewQueue() {
  const { address } = useConnection();
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      setProjects(preview ? (await import('@/components/retro/previewData')).sampleReviewProjects() : await fetchProjects());
    } catch {
      setLoadError('Could not load stages. Refresh the page or try again shortly.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const withStage = projects.filter((project): project is ProjectView & { stage: StageView } => !!project.stage);
  const pending = withStage.filter(project => project.stage.reviewState === 1)
    .sort((a, b) => a.stage.submittedAt - b.stage.submittedAt);
  const decided = withStage.filter(project => project.stage.reviewState === 2 || project.stage.reviewState === 3)
    .sort((a, b) => b.stage.submittedAt - a.stage.submittedAt);

  if (loading) return <Card className="flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading community votes…</Card>;

  return (
    <div className="space-y-6">
      {preview && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Sample data is shown until a Rung contract is configured. Voting actions are disabled in preview.</p>}
      {loadError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {pending.length === 0 && <Card className="text-sm text-zinc-500">No milestone votes are open.</Card>}
      {pending.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-zinc-400" />
            <h2 className="text-base font-semibold">Open community votes</h2>
            <Badge>{pending.length}</Badge>
          </div>
          <div className="grid gap-4">{pending.map(project => <ReviewCard key={project.id} project={project} address={address} disabled={false} onComplete={() => void refresh()} />)}</div>
        </section>
      )}
      {decided.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Recent outcomes</h2>
          <div className="grid gap-4">{decided.map(project => (
            <Card key={project.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/project/${project.id}`} className="font-semibold hover:underline">{project.name}</Link>
                <Badge tone={project.stage.reviewState === 3 ? 'green' : 'amber'}>{reviewStateLabel(project.stage.reviewState)}</Badge>
                <Badge>Stage {project.stageNumber}</Badge>
              </div>
              <p className="mt-2 text-sm text-zinc-600">{project.stage.reviewReason || 'No community outcome recorded.'}</p>
              <p className="mt-1 text-xs text-zinc-500">{amount(project.stage.approvalWeight, project.stage.decimals)} yes · {amount(project.stage.rejectionWeight, project.stage.decimals)} no · {project.stage.voterCount} voters</p>
            </Card>
          ))}</div>
        </section>
      )}
    </div>
  );
}
