'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Ban, Gift, Trophy } from 'lucide-react';
import { preview, rungAddress } from '@/lib/chain';
import { retroRoundAbi } from '@/lib/abi';
import { loadRound, publicClient } from '@/lib/reads';
import { useTx } from '@/lib/tx';
import { amount, errorMessage, short } from '@/lib/format';
import { awardSchema, safeLink } from '@/lib/metadata';
import type { ApplicationView, RoundView } from '@/lib/types';
import { Badge, Button, Card, Field, Notice, ProgressBar, inputClass } from '@/components/ui';
import { addressLink, formatDateTime, remainingLabel, roundStatus, sameAddress } from '@/components/retro/util';
import { PreviewRolePicker } from '@/components/retro/PreviewRolePicker';
import { postMetadata } from '@/components/retro/metadata';
import { ApplyForm } from '@/components/retro/ApplyForm';

type PreviewRole = 'builder' | 'reviewer' | 'roundOwner' | 'anyone';

const ROLE_OPTIONS = [
  { value: 'builder', label: 'Builder' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'roundOwner', label: 'Round owner' },
  { value: 'anyone', label: 'Anyone' },
] as const;

function toBig(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

function AwardEditor({ round, app, onDone }: { round: RoundView; app: ApplicationView; onDone: () => void }): ReactNode {
  const { send, status, hash, error, pending } = useTx();
  const [amountStr, setAmountStr] = useState(() => {
    try { return formatUnits(toBig(app.award), round.decimals); } catch { return '0'; }
  });
  const [rationale, setRationale] = useState(app.reason);
  const [score, setScore] = useState('70');
  const [criteria, setCriteria] = useState([
    { label: 'Impact on builders/users', weight: '50' },
    { label: 'Evidence quality', weight: '30' },
    { label: 'Sustained benefit', weight: '20' },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<string | undefined>();
  const [receiptWarning, setReceiptWarning] = useState<string | undefined>();

  const submit = async () => {
    const nextErrors: Record<string, string> = {};

    let wei: bigint | undefined;
    try { wei = parseUnits(amountStr.trim() || '0', round.decimals); } catch { wei = undefined; }
    if (wei === undefined) nextErrors.amount = 'Enter a valid amount.';
    else if (toBig(round.allocated) - toBig(app.award) + wei > toBig(round.budget)) {
      nextErrors.amount = 'Total awards would exceed the round budget.';
    }

    const rationaleParsed = awardSchema.shape.rationale.safeParse(rationale.trim());
    if (!rationaleParsed.success) nextErrors.rationale = rationaleParsed.error.issues[0]?.message ?? 'Rationale is required.';

    const scoreNum = Number(score);
    if (!Number.isInteger(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      nextErrors.score = 'Score must be an integer between 0 and 100.';
    }

    const criteriaParsed = awardSchema.shape.criteria.safeParse(
      criteria.map(row => ({ label: row.label.trim(), weight: Number(row.weight) })),
    );
    if (!criteriaParsed.success) nextErrors.criteria = criteriaParsed.error.issues[0]?.message ?? 'Each criterion needs a label and weight.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || wei === undefined || !rationaleParsed.success) return;

    // Best-effort receipt: the rationale string is what lands onchain in setAward.
    try {
      const pinned = await postMetadata('award', { score: scoreNum, rationale: rationaleParsed.data, criteria: criteriaParsed.data });
      setReceipt(pinned.uri);
      setReceiptWarning(undefined);
    } catch (e) {
      setReceiptWarning(errorMessage(e));
    }

    await send(
      { address: round.address, abi: retroRoundAbi, functionName: 'setAward', args: [BigInt(app.id), wei, rationaleParsed.data] },
      { onConfirm: onDone },
    );
  };

  const receiptLink = receipt ? safeLink(receipt) : undefined;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Award for application #{app.id}</span>
        <span className="text-xs text-zinc-500">
          Currently {amount(app.award, round.decimals)} {round.symbol} · budget left{' '}
          {amount((toBig(round.budget) - toBig(round.allocated)).toString(), round.decimals)} {round.symbol}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Amount (${round.symbol})`} error={errors.amount}>
          <input className={inputClass} value={amountStr} onChange={e => setAmountStr(e.target.value)} inputMode="decimal" placeholder="1200" />
        </Field>
        <Field label="Score (0–100)" error={errors.score}>
          <input className={inputClass} value={score} onChange={e => setScore(e.target.value)} inputMode="numeric" />
        </Field>
        <div className="space-y-2">
          <span className="block text-sm font-medium text-zinc-700">Criteria weights</span>
          {criteria.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={`${inputClass} flex-1`}
                value={row.label}
                onChange={e => setCriteria(rows => rows.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
              />
              <input
                className={`${inputClass} w-20`}
                value={row.weight}
                inputMode="numeric"
                onChange={e => setCriteria(rows => rows.map((r, j) => j === i ? { ...r, weight: e.target.value } : r))}
              />
            </div>
          ))}
          {errors.criteria && <span className="block text-xs text-red-600">{errors.criteria}</span>}
        </div>
      </div>

      <Field label="Rationale" error={errors.rationale} hint="10–1000 characters. Stored onchain as the award reason.">
        <textarea
          className={inputClass}
          rows={3}
          value={rationale}
          onChange={e => setRationale(e.target.value)}
          placeholder="Why this application earns this amount, referencing the published rubric."
        />
      </Field>

      {receiptWarning && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Receipt not pinned: {receiptWarning}. The reason is still recorded onchain.</p>}
      {receiptLink && (
        <a href={receiptLink} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">
          Scoring receipt ↗
        </a>
      )}
      <Notice status={status} hash={hash} error={error} />
      <Button onClick={() => void submit()} loading={pending} disabled={preview}>
        {pending ? 'Saving…' : app.award !== '0' ? 'Update award' : 'Set award'}
      </Button>
    </div>
  );
}

function ClaimButton({ round, app, onDone }: { round: RoundView; app: ApplicationView; onDone: () => void }): ReactNode {
  const { send, status, hash, error, pending } = useTx();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void send({ address: round.address, abi: retroRoundAbi, functionName: 'claim', args: [BigInt(app.id)] }, { onConfirm: onDone })} loading={pending} disabled={preview}>
        <Gift className="h-4 w-4" /> Claim {amount(app.award, round.decimals)} {round.symbol}
      </Button>
      <div className="min-w-0 flex-1">
        <Notice status={status} hash={hash} error={error} />
      </div>
    </div>
  );
}

function ApplicationRow({ round, app, showClaim, reviewerMode, onRefresh }: {
  round: RoundView;
  app: ApplicationView;
  showClaim: boolean;
  reviewerMode: boolean;
  onRefresh: () => void;
}): ReactNode {
  const [awarding, setAwarding] = useState(false);
  const evidence = safeLink(app.evidenceURI);
  const recipientLink = addressLink(app.recipient);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-zinc-400">#{app.id}</span>
            <Link href={`/project/${app.projectId}`} className="font-semibold hover:underline">
              Project {app.projectId}
            </Link>
            {app.award !== '0' && <Badge tone="green">Awarded</Badge>}
            {app.claimed && <Badge tone="blue">Claimed</Badge>}
            {app.award === '0' && !app.claimed && <Badge>No award</Badge>}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Recipient{' '}
            {recipientLink ? (
              <a href={recipientLink} target="_blank" rel="noreferrer" className="font-mono hover:underline">{short(app.recipient)}</a>
            ) : (
              <span className="font-mono">{short(app.recipient)}</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{amount(app.award, round.decimals)} {round.symbol}</p>
          {evidence ? (
            <a href={evidence} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">
              Evidence ↗
            </a>
          ) : (
            <span className="text-xs text-zinc-400">No evidence link</span>
          )}
        </div>
      </div>

      {app.reason && (
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          <span className="font-medium text-zinc-800">Reason:</span> {app.reason}
        </p>
      )}

      {(showClaim || reviewerMode) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
          {showClaim && <ClaimButton round={round} app={app} onDone={onRefresh} />}
          {reviewerMode && (
            <Button variant="secondary" onClick={() => setAwarding(v => !v)}>
              {awarding ? 'Close' : app.award !== '0' ? 'Update award' : 'Set award'}
            </Button>
          )}
        </div>
      )}

      {awarding && reviewerMode && (
        <AwardEditor round={round} app={app} onDone={() => { setAwarding(false); onRefresh(); }} />
      )}
    </Card>
  );
}

function RulesPanel({ round, now }: { round: RoundView; now: number }): ReactNode {
  const status = roundStatus(round, now);
  const budget = toBig(round.budget);
  const allocated = toBig(round.allocated);
  const remaining = budget > allocated ? budget - allocated : 0n;
  const rulesLink = safeLink(round.rulesURI);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-semibold">Round rules</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{round.description || 'No description published for this round.'}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="mt-4 rounded-xl bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scoring criteria</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
          {round.rules || 'No scoring rules were found at the rules URI.'}
        </p>
        {rulesLink && (
          <a href={rulesLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
            Published rules URI ↗
          </a>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-xs font-medium text-zinc-500">Applications close</p>
          <p className="mt-0.5 text-sm font-semibold">{formatDateTime(round.deadline)}</p>
          <p className="text-xs text-zinc-500">{remainingLabel(round.deadline, now)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-xs font-medium text-zinc-500">Decisions due</p>
          <p className="mt-0.5 text-sm font-semibold">{formatDateTime(round.decisionDeadline)}</p>
          <p className="text-xs text-zinc-500">{remainingLabel(round.decisionDeadline, now)}</p>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar raised={allocated} goal={budget} />
        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
          <span>{amount(round.allocated, round.decimals)} allocated of {amount(round.budget, round.decimals)} {round.symbol}</span>
          <span>{amount(remaining.toString(), round.decimals)} {round.symbol} remaining</span>
        </div>
      </div>
    </Card>
  );
}

export function RoundDetail({ round }: { round: RoundView }): ReactNode {
  const { address } = useConnection();
  const [data, setData] = useState<RoundView>(round);
  const [previewRole, setPreviewRole] = useState<PreviewRole>('builder');
  const [remainderClaimed, setRemainderClaimed] = useState(false);
  const [remainderTick, setRemainderTick] = useState(0);
  const finalTx = useTx();
  const miscTx = useTx();
  const [finalizeConfirmed, setFinalizeConfirmed] = useState(false);

  useEffect(() => { setData(round); }, [round]);

  const refresh = useCallback(async () => {
    setRemainderTick(t => t + 1);
    if (preview) return;
    const next = await loadRound(round.address);
    if (next) setData(next);
  }, [round.address]);

  // remainderClaimed is not part of RoundView; read it defensively.
  useEffect(() => {
    if (preview || !rungAddress) return;
    let alive = true;
    publicClient
      .readContract({ address: round.address, abi: retroRoundAbi, functionName: 'remainderClaimed' })
      .then(value => { if (alive) setRemainderClaimed(Boolean(value)); })
      .catch(() => { if (alive) setRemainderClaimed(false); });
    return () => { alive = false; };
  }, [round.address, remainderTick]);

  const now = Math.floor(Date.now() / 1000);
  const status = roundStatus(data, now);
  const budget = toBig(data.budget);
  const allocated = toBig(data.allocated);
  const remainder = budget > allocated ? budget - allocated : 0n;

  const isReviewerRole = preview ? previewRole === 'reviewer' : sameAddress(address, data.reviewer);
  const isRoundOwner = preview ? previewRole === 'roundOwner' : sameAddress(address, data.roundOwner);
  const withinDecisionWindow = now >= data.deadline && now <= data.decisionDeadline;

  const canReview = !data.finalized && !data.cancelled && (preview ? isReviewerRole : isReviewerRole && withinDecisionWindow);
  const applyOpen = preview ? previewRole === 'builder' : !data.finalized && !data.cancelled && now < data.deadline;
  const canRemainder = !remainderClaimed && (preview ? isRoundOwner : isRoundOwner && (data.finalized || data.cancelled));
  const canCancel = !data.finalized && !data.cancelled && (preview ? previewRole === 'anyone' : now > data.decisionDeadline);

  const showClaimFor = (app: ApplicationView) =>
    app.award !== '0' && !app.claimed &&
    (preview ? previewRole === 'builder' : data.finalized && !data.cancelled && sameAddress(address, app.recipient));

  const headerLink = addressLink(data.address);

  return (
    <div className="space-y-6">
      {preview && <PreviewRolePicker value={previewRole} onChange={setPreviewRole} options={ROLE_OPTIONS} />}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="font-mono">{short(data.address)}</span>
            {headerLink && (
              <a href={headerLink} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                Explorer ↗
              </a>
            )}
            <span>Round owner {short(data.roundOwner)}</span>
            <span>Reviewer {short(data.reviewer)}</span>
            <span>{data.applications.length} applications</span>
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      <RulesPanel round={data} now={now} />

      {applyOpen && (
        <ApplyForm round={data} applications={data.applications} open={applyOpen} onApplied={() => void refresh()} />
      )}

      {canReview && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Awards &amp; finalization</h2>
            <Badge tone="amber">Reviewer window {remainingLabel(data.decisionDeadline, now)}</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Set an award and written reason per application below. The sum of awards must stay within the budget.
          </p>
          <div className="mt-4">
            <ProgressBar raised={allocated} goal={budget} />
            <p className="mt-1.5 text-xs text-zinc-500">
              {amount(data.allocated, data.decimals)} / {amount(data.budget, data.decimals)} {data.symbol} allocated
            </p>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
              checked={finalizeConfirmed}
              onChange={e => setFinalizeConfirmed(e.target.checked)}
            />
            <span>
              I confirm {amount(data.allocated, data.decimals)} {data.symbol} allocated is final and within the{' '}
              {amount(data.budget, data.decimals)} {data.symbol} budget. Finalizing is permanent.
            </span>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void finalTx.send({ address: data.address, abi: retroRoundAbi, functionName: 'finalize' }, { onConfirm: () => void refresh() })}
              loading={finalTx.pending}
              disabled={preview || !finalizeConfirmed}
            >
              <Trophy className="h-4 w-4" /> Finalize round
            </Button>
            <span className="text-xs text-zinc-500">
              Confirms Σ awards = {amount(data.allocated, data.decimals)} {data.symbol} ≤ {amount(data.budget, data.decimals)} {data.symbol}
            </span>
          </div>
          <div className="mt-3">
            <Notice status={finalTx.status} hash={finalTx.hash} error={finalTx.error} />
          </div>
        </Card>
      )}

      {(canRemainder || canCancel) && (
        <Card>
          <h2 className="font-semibold">Round exit</h2>
          {canRemainder && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-800">Unallocated budget</p>
                <p className="text-xs text-zinc-500">
                  {amount((data.cancelled ? budget : remainder).toString(), data.decimals)} {data.symbol} returns to the round owner.
                </p>
              </div>
              <Button
                onClick={() => void miscTx.send({ address: data.address, abi: retroRoundAbi, functionName: 'claimRemainder' }, { onConfirm: () => void refresh() })}
                loading={miscTx.pending}
                disabled={preview}
              >
                Claim remainder
              </Button>
            </div>
          )}
          {canCancel && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-800">Round reviewer did not finalize</p>
                <p className="text-xs text-zinc-500">
                  Anyone may unlock the full budget for the round owner after {formatDateTime(data.decisionDeadline)}.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => void miscTx.send({ address: data.address, abi: retroRoundAbi, functionName: 'cancelExpired' }, { onConfirm: () => void refresh() })}
                loading={miscTx.pending}
                disabled={preview || !address}
              >
                <Ban className="h-4 w-4" /> Cancel expired round
              </Button>
            </div>
          )}
          <div className="mt-3">
            <Notice status={miscTx.status} hash={miscTx.hash} error={miscTx.error} />
          </div>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Applications</h2>
          <Badge>{data.applications.length}</Badge>
        </div>
        {data.applications.length === 0 ? (
          <Card className="text-sm text-zinc-500">No applications yet.</Card>
        ) : (
          <div className="grid gap-4">
            {data.applications.map(app => (
              <ApplicationRow
                key={app.id}
                round={data}
                app={app}
                showClaim={showClaimFor(app)}
                reviewerMode={canReview}
                onRefresh={() => void refresh()}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
