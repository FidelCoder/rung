'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { erc20Abi, formatUnits, parseUnits, zeroAddress } from 'viem';
import { useBalance, useConnection, useReadContract } from 'wagmi';
import { Badge, Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { stageEscrowAbi } from '@/lib/abi';
import { preview } from '@/lib/chain';
import { amount } from '@/lib/format';
import { useTx } from '@/lib/tx';
import type { StageView } from '@/lib/types';
import { useNow } from './useNow';

export function BackerPanel({ stage, onConfirmed }: { stage: StageView; onConfirmed: () => void }) {
  const { address: account } = useConnection();
  const queryClient = useQueryClient();
  const now = useNow(15_000);
  const [input, setInput] = useState('');

  const native = stage.asset === zeroAddress;
  const { decimals, symbol } = stage;
  const goal = BigInt(stage.goal);
  const raised = BigInt(stage.raised);
  const remaining = goal > raised ? goal - raised : 0n;

  const contributeTx = useTx();
  const approveTx = useTx();
  const refundTx = useTx();

  const readsEnabled = !preview && !!account;
  const balanceQuery = useBalance({ address: account, query: { enabled: readsEnabled && native } });
  const tokenBalanceQuery = useReadContract({
    address: stage.asset, abi: erc20Abi, functionName: 'balanceOf',
    args: [account ?? zeroAddress], query: { enabled: readsEnabled && !native },
  });
  const allowanceQuery = useReadContract({
    address: stage.asset, abi: erc20Abi, functionName: 'allowance',
    args: [account ?? zeroAddress, stage.address], query: { enabled: readsEnabled && !native },
  });
  const contributionQuery = useReadContract({
    address: stage.address, abi: stageEscrowAbi, functionName: 'contributions',
    args: [account ?? zeroAddress], query: { enabled: readsEnabled },
  });
  const refundableQuery = useReadContract({
    address: stage.address, abi: stageEscrowAbi, functionName: 'isRefundable',
    query: { enabled: !preview, refetchInterval: 60_000 },
  });

  const balance = native ? balanceQuery.data?.value : tokenBalanceQuery.data;
  const contribution = contributionQuery.data;
  const allowance = native ? undefined : allowanceQuery.data;
  const refundable = refundableQuery.data ?? stage.refundable;

  const parsed = (() => {
    const text = input.trim();
    if (!text) return undefined;
    try { return parseUnits(text, decimals); } catch { return null; }
  })();
  const validParsed = parsed !== null && parsed !== undefined && parsed > 0n ? parsed : undefined;
  const allowanceWaiting = !native && readsEnabled && allowance === undefined && allowanceQuery.isLoading;
  const approved = !native && validParsed !== undefined && allowance !== undefined && allowance >= validParsed;
  const needsApproval = !native && validParsed !== undefined && (allowance === undefined || allowance < validParsed);

  const closedReason = preview
    ? 'Preview mode — no contract is configured, so contributions and refunds are disabled.'
    : stage.cancelled
      ? 'This stage was cancelled by the builder. Contributions are closed and refunds are open for backers.'
      : stage.claimed
        ? 'This stage reached its goal and the builder already claimed the funds.'
        : remaining <= 0n
          ? 'This stage is fully funded — no more contributions can be accepted.'
          : now !== undefined && now >= stage.deadline * 1000
            ? 'The funding deadline has passed — this stage no longer accepts contributions.'
            : undefined;

  let error: string | undefined;
  if (parsed === null) error = 'Enter a valid decimal amount.';
  else if (parsed !== undefined && parsed <= 0n) error = 'Enter an amount greater than zero.';
  else if (parsed !== undefined && parsed > remaining) {
    error = `Amount exceeds the remaining goal of ${amount(remaining.toString(), decimals)} ${symbol}.`;
  } else if (parsed !== undefined && balance !== undefined && parsed > balance) {
    error = `Insufficient balance — your wallet holds ${amount(balance.toString(), decimals)} ${symbol}.`;
  }

  const busy = contributeTx.pending || approveTx.pending || refundTx.pending;
  const canContribute = !closedReason && !!account && validParsed !== undefined && !error && !busy && !allowanceWaiting;
  const refundEligible = !preview && !!account && refundable && contribution !== undefined && contribution > 0n;
  const deadlineIn = now === undefined ? undefined : Math.max(0, Math.ceil((stage.deadline * 1000 - now) / 86_400_000));

  async function handleContribute() {
    if (!account || !canContribute || validParsed === undefined) return;
    if (!native && (allowance === undefined || allowance < validParsed)) {
      const approvedHash = await approveTx.send({
        address: stage.asset, abi: erc20Abi, functionName: 'approve',
        args: [stage.address, validParsed],
      });
      if (!approvedHash) return;
      void queryClient.invalidateQueries();
    }
    await contributeTx.send(
      {
        address: stage.address, abi: stageEscrowAbi, functionName: 'contribute',
        args: [validParsed], value: native ? validParsed : 0n,
      },
      {
        onConfirm: () => {
          setInput('');
          void queryClient.invalidateQueries();
          onConfirmed();
        },
      },
    );
  }

  async function handleRefund() {
    if (!refundEligible || busy) return;
    await refundTx.send(
      { address: stage.address, abi: stageEscrowAbi, functionName: 'refund', args: [] },
      { onConfirm: () => { void queryClient.invalidateQueries(); onConfirmed(); } },
    );
  }

  function applyMax() {
    if (!account) return;
    const cap = balance !== undefined && balance < remaining ? balance : remaining;
    if (cap <= 0n) return;
    setInput(formatUnits(cap, decimals));
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Back this stage</h2>
        <span className="text-xs text-zinc-500">
          {amount(remaining.toString(), decimals)} {symbol} still needed
        </span>
      </div>

      {closedReason && (
        <p className="mt-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm leading-5 text-zinc-600">{closedReason}</p>
      )}

      <div className="mt-4 space-y-4">
        <Field
          label={`Contribution amount (${symbol})`}
          error={error}
          hint={`Remaining ${amount(remaining.toString(), decimals)} ${symbol} · funding deadline ${deadlineIn === undefined ? '…' : `in ${deadlineIn}d`} · balance ${balance !== undefined ? `${amount(balance.toString(), decimals)} ${symbol}` : '—'}`}
        >
          <div className="flex items-center gap-2">
            <input
              className={inputClass}
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              autoComplete="off"
              disabled={busy}
            />
            <Button variant="secondary" onClick={applyMax} disabled={busy || !account}>
              Max
            </Button>
          </div>
        </Field>

        {!native && account && !preview && (
          <div className="space-y-1.5">
            <ol className="flex flex-wrap items-center gap-2 text-xs">
              <li>
                <Badge tone={approved ? 'green' : approveTx.pending ? 'blue' : 'default'}>
                  {approved ? '1. Approved ✓' : approveTx.pending ? '1. Approving…' : `1. Approve ${symbol}`}
                </Badge>
              </li>
              <li className="text-zinc-400" aria-hidden>→</li>
              <li>
                <Badge tone={contributeTx.status === 'done' ? 'green' : contributeTx.pending ? 'blue' : 'default'}>
                  2. Contribute
                </Badge>
              </li>
            </ol>
            {allowance !== undefined && (
              <p className="text-xs text-zinc-500">
                Allowance for this escrow: {amount(allowance.toString(), decimals)} {symbol}
              </p>
            )}
            {allowanceWaiting && <p className="text-xs text-zinc-500">Checking token allowance…</p>}
          </div>
        )}

        <Button className="w-full" onClick={handleContribute} disabled={!canContribute} loading={contributeTx.pending || approveTx.pending}>
          {needsApproval ? `Approve & contribute` : `Contribute`}
        </Button>

        {!account && !preview && (
          <p className="text-center text-xs text-zinc-500">Connect your wallet to contribute.</p>
        )}

        <Notice status={approveTx.status} hash={approveTx.hash} error={approveTx.error} />
        <Notice status={contributeTx.status} hash={contributeTx.hash} error={contributeTx.error} />

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-600">Your contribution</span>
            <span className="text-sm font-semibold text-zinc-900">
              {!account
                ? '—'
                : contribution !== undefined
                  ? `${amount(contribution.toString(), decimals)} ${symbol}`
                  : preview
                    ? '—'
                    : '…'}
            </span>
          </div>
          {refundEligible && (
            <p className="mt-2 text-xs text-amber-700">
              Refunds are open for this stage — you can withdraw your full contribution at any time.
            </p>
          )}
          {refundEligible && (
            <Button variant="danger" className="mt-3 w-full" onClick={handleRefund} loading={refundTx.pending} disabled={busy}>
              Refund my contribution
            </Button>
          )}
          <div className={refundEligible ? 'mt-3' : ''}>
            <Notice status={refundTx.status} hash={refundTx.hash} error={refundTx.error} />
          </div>
        </div>
      </div>
    </Card>
  );
}
