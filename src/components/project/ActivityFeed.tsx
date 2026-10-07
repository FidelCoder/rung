'use client';

import { useEffect, useState } from 'react';
import type { AbiEvent, Address, Hash } from 'viem';
import { zeroAddress } from 'viem';
import { Badge, Card, Spinner } from '@/components/ui';
import { stageEscrowAbi } from '@/lib/abi';
import { explorer, preview } from '@/lib/chain';
import { amount, short } from '@/lib/format';
import { safeLink } from '@/lib/metadata';
import { publicClient } from '@/lib/reads';

const EVENT_NAMES = ['Contributed', 'Refunded', 'FundsClaimed', 'Cancelled', 'EvidenceSubmitted', 'VoteCast', 'CommunityReviewFinalized'] as const;
type EventName = (typeof EVENT_NAMES)[number];

const EVENT_META: Record<EventName, { label: string; tone: 'default' | 'green' | 'amber' | 'red' | 'blue' }> = {
  Contributed: { label: 'Contribution', tone: 'green' },
  Refunded: { label: 'Refund', tone: 'amber' },
  FundsClaimed: { label: 'Funds claimed', tone: 'blue' },
  Cancelled: { label: 'Cancelled', tone: 'red' },
  EvidenceSubmitted: { label: 'Evidence submitted', tone: 'default' },
  VoteCast: { label: 'Backer vote', tone: 'blue' },
  CommunityReviewFinalized: { label: 'Vote finalized', tone: 'green' },
};

type Entry = {
  key: string;
  kind: EventName;
  block: bigint;
  logIndex: number;
  tx?: Hash;
  actor?: Address;
  value?: bigint;
  detail?: string;
  href?: string;
};

type RawLog = {
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hash | null;
  eventName?: string;
  args?: unknown;
};

function stageEvents(): AbiEvent[] {
  return EVENT_NAMES.map(name => {
    const item = stageEscrowAbi.find(i => i.type === 'event' && i.name === name);
    if (!item || item.type !== 'event') throw new Error(`Event ${name} missing from the StageEscrow ABI`);
    return item;
  });
}

function toEntry(kind: EventName, log: RawLog, builder: Address): Entry | undefined {
  if (log.blockNumber === null || log.logIndex === null) return undefined;
  const args = (log.args ?? {}) as {
    backer?: Address;
    amount?: bigint;
    reason?: string;
    uri?: string;
    approved?: boolean;
    approve?: boolean;
    weight?: bigint;
    approvalWeight?: bigint;
    rejectionWeight?: bigint;
    participationWeight?: bigint;
    voterCount?: bigint;
    quorumReached?: boolean;
  };
  const entry: Entry = {
    key: `${kind}-${log.blockNumber}-${log.logIndex}`,
    kind,
    block: log.blockNumber,
    logIndex: log.logIndex,
    tx: log.transactionHash ?? undefined,
  };
  switch (kind) {
    case 'Contributed':
    case 'Refunded':
      entry.actor = args.backer;
      entry.value = typeof args.amount === 'bigint' ? args.amount : undefined;
      break;
    case 'FundsClaimed':
      entry.actor = builder;
      entry.value = typeof args.amount === 'bigint' ? args.amount : undefined;
      break;
    case 'Cancelled':
      entry.actor = builder;
      entry.detail = args.reason;
      break;
    case 'EvidenceSubmitted':
      entry.actor = builder;
      entry.detail = args.uri;
      entry.href = args.uri ? safeLink(args.uri) : undefined;
      break;
    case 'VoteCast':
      entry.actor = args.backer;
      entry.value = typeof args.weight === 'bigint' ? args.weight : undefined;
      entry.detail = typeof args.approve === 'boolean' ? (args.approve ? 'Voted yes' : 'Voted no') : undefined;
      break;
    case 'CommunityReviewFinalized':
      entry.detail = `${args.approved ? 'Approved' : 'Changes requested'} · ${args.quorumReached ? 'quorum reached' : 'quorum missed'} · ${args.voterCount?.toString() ?? '0'} voters`;
      if (typeof args.approvalWeight === 'bigint' && typeof args.rejectionWeight === 'bigint') {
        entry.value = args.approvalWeight + args.rejectionWeight;
      }
      break;
  }
  return entry;
}

async function fetchStageLogs(address: Address): Promise<RawLog[]> {
  const events = stageEvents();
  try {
    return await publicClient.getLogs({ address, events, fromBlock: 0n, toBlock: 'latest' }) as unknown as RawLog[];
  } catch {
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > 20_000n ? latest - 20_000n : 0n;
      return await publicClient.getLogs({ address, events, fromBlock, toBlock: 'latest' }) as unknown as RawLog[];
    } catch {
      return [];
    }
  }
}

export function ActivityFeed({ address, symbol, decimals, builder, tick }: {
  address: Address; symbol: string; decimals: number; builder: Address; tick: number;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let alive = true;
    if (preview || address === zeroAddress) {
      setEntries([]);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    (async () => {
      let logs: RawLog[] = [];
      try {
        logs = await fetchStageLogs(address);
      } catch {
        logs = [];
      }
      if (!alive) return;
      const built: Entry[] = [];
      for (const log of logs) {
        const kind = log.eventName as EventName | undefined;
        if (!kind || !EVENT_NAMES.includes(kind)) continue;
        const entry = toEntry(kind, log, builder);
        if (entry) built.push(entry);
      }
      built.sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1));
      setEntries(built.slice(0, 20));
      setStatus('ready');
    })();
    return () => { alive = false; };
  }, [address, builder, tick]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Onchain activity</h2>
        <span className="text-xs text-zinc-500">
          {status === 'ready' && entries.length > 0 ? `Latest ${entries.length} events` : 'Stage escrow events'}
        </span>
      </div>
      {status === 'loading' ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Spinner /> Loading activity…
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No onchain activity yet.</p>
      ) : (
        <ol className="mt-4 space-y-4 border-l border-zinc-200 pl-4">
          {entries.map(entry => {
            const meta = EVENT_META[entry.kind];
            const txUrl = entry.tx ? explorer(entry.tx) : undefined;
            return (
              <li key={entry.key} className="relative">
                <span className="absolute -left-[21px] top-1.5 block h-2.5 w-2.5 rounded-full bg-zinc-300 ring-4 ring-white" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {entry.actor && <span className="text-xs text-zinc-500">{short(entry.actor)}</span>}
                  {entry.value !== undefined && (
                    <span className="text-xs font-medium text-zinc-700">
                      {amount(entry.value.toString(), decimals)} {symbol}
                    </span>
                  )}
                </div>
                {(entry.detail || entry.href) && (
                  <p className="mt-1 break-words text-sm text-zinc-600">
                    {entry.href ? (
                      <a href={entry.href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        {entry.detail}
                      </a>
                    ) : (
                      entry.detail
                    )}
                  </p>
                )}
                <p className="mt-1 text-xs text-zinc-400">
                  Block {entry.block.toString()}
                  {txUrl && (
                    <>
                      {' · '}
                      <a href={txUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        View tx ↗
                      </a>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
