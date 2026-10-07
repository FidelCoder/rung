import { createPublicClient, erc20Abi, http, isAddress, parseAbiItem, zeroAddress, type Address } from 'viem';
import { botChain, preview, rungAddress, rungDeployBlock } from './chain';
import { rungAbi, stageEscrowAbi, retroRoundAbi } from './abi';
import { examples, exampleRounds } from './examples';
import { safeLink } from './metadata';
import type { ProjectView, RoundView, StageTerms, StageView, ApplicationView } from './types';

export const publicClient = createPublicClient({ chain: botChain, transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.botchain.ai') });

const REVIEW_STATES = ['None', 'Community vote open', 'Changes requested', 'Community approved'] as const;
export function reviewStateLabel(state: number) { return REVIEW_STATES[state] ?? 'None'; }

const DEFAULT_TERMS: StageTerms = { title: 'Stage', deliverable: 'Deliverable details were not found at the terms URI.', criteria: 'Refer to the on-chain terms hash to verify the original content.' };

async function fetchMetadata<T>(uri: string | undefined): Promise<T | undefined> {
  const url = uri ? safeLink(uri) : undefined;
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch { return undefined; }
}

async function assetMeta(asset: Address): Promise<{ symbol: string; decimals: number }> {
  if (asset === zeroAddress) return { symbol: 'BOT', decimals: 18 };
  try {
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    return { symbol, decimals };
  } catch { return { symbol: 'TOKEN', decimals: 18 }; }
}

export async function loadStage(stage: Address, fallbackAsset: Address = zeroAddress): Promise<StageView> {
  const c = publicClient;
  const [
    asset, goal, raised, deadline, deliveryDeadline, claimed, cancelled, isRefundable,
    reviewState, submittedAt, rejectedAt, evidenceURI, reviewReason, termsURI, builder,
    evidenceRound, approvalWeight, rejectionWeight, participationWeight, voterCount,
  ] = await Promise.all([
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'asset' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'goal' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'raised' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'deadline' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'deliveryDeadline' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'claimed' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'cancelled' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'isRefundable' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'reviewState' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'submittedAt' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'rejectedAt' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'evidenceURI' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'reviewReason' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'termsURI' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'builder' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'evidenceRound' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'approvalWeight' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'rejectionWeight' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'participationWeight' }),
    c.readContract({ address: stage, abi: stageEscrowAbi, functionName: 'voterCount' }),
  ]);
  const [meta, { symbol, decimals }] = await Promise.all([
    fetchMetadata<StageTerms>(termsURI),
    assetMeta(asset || fallbackAsset),
  ]);
  return {
    address: stage, asset, symbol, decimals, goal: goal.toString(), raised: raised.toString(),
    deadline: Number(deadline), deliveryDeadline: Number(deliveryDeadline), claimed, cancelled,
    refundable: isRefundable, reviewState: Number(reviewState), terms: { ...DEFAULT_TERMS, ...(meta ?? {}) },
    evidenceURI, reviewReason, submittedAt: Number(submittedAt), rejectedAt: Number(rejectedAt),
    evidenceRound: Number(evidenceRound), approvalWeight: approvalWeight.toString(),
    rejectionWeight: rejectionWeight.toString(), participationWeight: participationWeight.toString(),
    voterCount: Number(voterCount),
  };
}

export async function loadProject(id: number): Promise<ProjectView | undefined> {
  if (!rungAddress) return examples.find(p => p.id === id);
  if (id < 1) return undefined;
  try {
    const p = await publicClient.readContract({ address: rungAddress, abi: rungAbi, functionName: 'getProject', args: [BigInt(id)] });
    if (p.builder === zeroAddress) return undefined;
    const [verified, meta] = await Promise.all([
      publicClient.readContract({ address: rungAddress, abi: rungAbi, functionName: 'verified', args: [BigInt(id)] }),
      fetchMetadata<{ name?: string; description?: string; category?: ProjectView['category']; website?: string }>(p.metadataURI),
    ]);
    const stage = p.latestStage !== zeroAddress ? await loadStage(p.latestStage) : undefined;
    return {
      id, builder: p.builder, verified, stageNumber: Number(p.stageNumber), source: 'chain',
      name: p.name || meta?.name || 'Untitled project',
      description: meta?.description ?? '', category: meta?.category ?? 'Public goods',
      website: meta?.website, stage,
    };
  } catch { return undefined; }
}

export async function loadProjects(limit = 100): Promise<ProjectView[]> {
  if (preview || !rungAddress) return examples;
  try {
    const count = Number(await publicClient.readContract({ address: rungAddress, abi: rungAbi, functionName: 'projectCount' }));
    const ids = Array.from({ length: Math.min(count, limit) }, (_, i) => count - i);
    const projects = await Promise.all(ids.map(id => loadProject(id)));
    return projects.filter((p): p is ProjectView => !!p);
  } catch { return examples; }
}

export async function loadRound(address: Address): Promise<RoundView | undefined> {
  try {
    const c = publicClient;
    const [
      asset, budget, allocated, applicationDeadline, decisionDeadline, rulesURI,
      finalized, cancelled, remainderClaimed, applicationCount, roundOwner, reviewer, treasury,
    ] = await Promise.all([
      c.readContract({ address, abi: retroRoundAbi, functionName: 'asset' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'budget' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'allocated' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'applicationDeadline' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'decisionDeadline' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'rulesURI' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'finalized' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'cancelled' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'remainderClaimed' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'applicationCount' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'roundOwner' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'reviewer' }),
      c.readContract({ address, abi: retroRoundAbi, functionName: 'treasury' }),
    ]);
    const [rules, { symbol, decimals }] = await Promise.all([
      fetchMetadata<{ title?: string; description?: string; rules?: string }>(rulesURI),
      assetMeta(asset),
    ]);
    const applications: ApplicationView[] = [];
    for (let i = 0; i < Number(applicationCount); i++) {
      const a = await c.readContract({ address, abi: retroRoundAbi, functionName: 'getApplication', args: [BigInt(i)] });
      applications.push({ id: i, projectId: Number(a.projectId), recipient: a.recipient, evidenceURI: a.evidenceURI, award: a.award.toString(), claimed: a.claimed, reason: a.reason });
    }
    return {
      address, title: rules?.title ?? 'Retro round', description: rules?.description ?? '', rules: rules?.rules ?? '',
      rulesURI, symbol, decimals, budget: budget.toString(), allocated: allocated.toString(),
      deadline: Number(applicationDeadline), decisionDeadline: Number(decisionDeadline),
      roundOwner, reviewer, treasury, finalized, cancelled, source: 'chain', applications,
    };
  } catch { return undefined; }
}

export async function loadRounds(): Promise<RoundView[]> {
  if (preview || !rungAddress) return exampleRounds;
  const registry = rungAddress;
  try {
    const count = Number(await publicClient.readContract({ address: registry, abi: rungAbi, functionName: 'roundCount' }));
    const addresses = await Promise.all(Array.from({ length: count }, (_, i) =>
      publicClient.readContract({ address: registry, abi: rungAbi, functionName: 'rounds', args: [BigInt(i)] })));
    const rounds = await Promise.all(addresses.map(a => loadRound(a as Address)));
    return rounds.filter((r): r is RoundView => !!r);
  } catch { return exampleRounds; }
}

const stageCreatedEvent = parseAbiItem('event StageCreated(uint256 indexed projectId, uint256 indexed stageNumber, address indexed stage, address builder, address asset, uint256 goal, uint64 deadline)');

/** Every stage ever opened for a project, oldest first, with its final onchain state. */
export async function loadProjectStages(projectId: number): Promise<(StageView & { stageNumber: number })[]> {
  if (!rungAddress) return [];
  try {
    const logs = await publicClient.getLogs({
      address: rungAddress,
      event: stageCreatedEvent,
      args: { projectId: BigInt(projectId) },
      fromBlock: rungDeployBlock,
      toBlock: 'latest',
    });
    const entries = logs.map(l => {
      const args = l.args as { stage?: Address; stageNumber?: bigint };
      return args.stage && args.stageNumber !== undefined
        ? { address: args.stage, stageNumber: Number(args.stageNumber) }
        : undefined;
    }).filter((e): e is { address: Address; stageNumber: number } => !!e);
    const stages = await Promise.all(entries.map(async e => {
      const stage = await loadStage(e.address).catch(() => undefined);
      return stage ? { ...stage, stageNumber: e.stageNumber } : undefined;
    }));
    return stages.filter((s): s is StageView & { stageNumber: number } => !!s)
      .sort((a, b) => a.stageNumber - b.stageNumber);
  } catch { return []; }
}

export function isAddressLike(value: string): value is Address { return isAddress(value); }
