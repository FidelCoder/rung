'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { preview } from '@/lib/chain';
import { amount, short } from '@/lib/format';
import { fetchProjects } from '@/lib/clientReads';
import type { ProjectView } from '@/lib/types';
import { Badge, Card, Notice, Spinner } from '@/components/ui';
import { ConnectButton } from '@/components/ConnectButton';
import { StageActions } from '@/components/builder/StageActions';
import { StageSummary } from '@/components/builder/StageSummary';

export function WorkspaceClient() {
  const { address } = useConnection();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workspace-projects', address ?? 'none'],
    queryFn: () => fetchProjects(),
  });

  const all = data ?? [];
  const projects = preview ? all : all.filter(p => !!address && p.builder.toLowerCase() === address.toLowerCase());

  if (preview) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Preview mode — no contract is configured, so the sample projects below have their builder actions disabled.
        </p>
        {projects.map(project => (
          <ProjectRow key={project.id} project={project} disabled onUpdate={refetch} />
        ))}
      </div>
    );
  }

  if (!address) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-base font-semibold">Connect your wallet</h2>
        <p className="text-sm text-zinc-500">Your projects and stage actions appear here once your builder wallet is connected.</p>
        <ConnectButton />
      </Card>
    );
  }

  if (isLoading && data === undefined) {
    return (
      <Card className="flex items-center gap-3 text-sm text-zinc-500">
        <Spinner className="h-5 w-5" />
        Loading your projects…
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-base font-semibold">You haven&apos;t started a project yet</h2>
        <p className="text-sm text-zinc-500">Publish on Bohr Testnet with two wallet approvals. Network fees use BOT, and the stage goal is not charged at launch.</p>
        <Link
          href="/new"
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Start one →
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        {projects.length} project{projects.length === 1 ? '' : 's'} owned by {short(address)}
      </p>
      {projects.map(project => (
        <ProjectRow key={project.id} project={project} disabled={false} onUpdate={refetch} />
      ))}
    </div>
  );
}

function ProjectRow({ project, disabled, onUpdate }: { project: ProjectView; disabled: boolean; onUpdate: () => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/project/${project.id}`} className="text-base font-semibold hover:underline">
            {project.name}
          </Link>
          <p className="mt-0.5 text-xs text-zinc-500">
            Project #{project.id} · Stage {project.stageNumber} · {short(project.builder)}
            {project.stage ? ` · ${amount(project.stage.goal, project.stage.decimals)} ${project.stage.symbol} goal` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {project.verified && <Badge tone="green">Verified</Badge>}
          <Badge>{project.category}</Badge>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">{project.description}</p>
      <div className="mt-4">
        <StageSummary project={project} />
      </div>
      <StageActions project={project} disabled={disabled} onUpdate={onUpdate} />
    </Card>
  );
}
