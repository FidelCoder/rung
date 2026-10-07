'use client';

import { useState, type FormEvent } from 'react';
import { rungAbi, stageEscrowAbi } from '@/lib/abi';
import { preview, rungAddress } from '@/lib/chain';
import { amount, errorMessage } from '@/lib/format';
import { evidenceSchema, termsSchema } from '@/lib/metadata';
import { useTx } from '@/lib/tx';
import type { ProjectView } from '@/lib/types';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { parseGoal, splitLinks } from './amounts';
import { endOfDayUnix, formatDay, isoPlusDays, maxDeadlineISO, minDeadlineISO, resolveDeadline, resolveDelivery } from './dates';
import { fieldErrors } from './formErrors';
import { pinMetadata } from './metadata';
import { AssetPicker, useAssetChoice } from './AssetPicker';

type Panel = 'stage' | 'cancel' | 'evidence' | null;

const APPROVED = 3;

export function StageActions({ project, disabled, onUpdate }: { project: ProjectView; disabled: boolean; onUpdate: () => void }) {
  const stage = project.stage;
  const now = Math.floor(Date.now() / 1000);
  const writable = !disabled && !!rungAddress;

  const openTx = useTx();
  const claimTx = useTx();
  const cancelTx = useTx();
  const evidenceTx = useTx();
  const assetChoice = useAssetChoice();

  const [panel, setPanel] = useState<Panel>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinError, setPinError] = useState<string>();

  const [title, setTitle] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState('');
  const [goal, setGoal] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(isoPlusDays(14));
  const [deliveryDate, setDeliveryDate] = useState(isoPlusDays(45));

  const [reason, setReason] = useState('');

  const [evTitle, setEvTitle] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [evLinks, setEvLinks] = useState('');

  function toggle(next: Exclude<Panel, null>) {
    setPanel(prev => (prev === next ? null : next));
    setErrors({});
    setPinError(undefined);
    openTx.reset();
    cancelTx.reset();
    evidenceTx.reset();
  }

  const retryable = !!stage && stage.claimed && now > stage.deliveryDeadline && (stage.reviewState === 0 || stage.reviewState === 2);
  const stageBlocked = !!stage && stage.reviewState !== APPROVED && !stage.refundable && !retryable;
  const canClaim = !!stage && stage.raised === stage.goal && !stage.claimed && !stage.cancelled && now <= stage.deliveryDeadline;
  const canCancel = !!stage && !stage.claimed && !stage.cancelled;
  const canEvidence = !!stage && stage.claimed && now <= stage.deliveryDeadline && (stage.reviewState === 0 || stage.reviewState === 2);

  async function submitOpenStage(e: FormEvent) {
    e.preventDefault();
    if (!rungAddress || !writable) return;
    const errs: Record<string, string> = {};
    const parsed = termsSchema.safeParse({ title, deliverable, criteria });
    if (!parsed.success) Object.assign(errs, fieldErrors(parsed.error));
    const goalWei = parseGoal(goal, assetChoice.decimals);
    if (!assetChoice.valid) errs.asset = assetChoice.error || 'Choose a supported asset and wait for its details to load.';
    if (!goalWei) errs.goal = `Enter a valid goal above zero in ${assetChoice.symbol}.`;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!deadlineDate) errs.deadline = 'Pick a funding deadline.';
    else if (deadlineDate < minDeadlineISO(nowSec) || deadlineDate > maxDeadlineISO(nowSec)) errs.deadline = 'Choose a date 1–90 days from today.';
    if (!deliveryDate) errs.delivery = 'Pick a delivery deadline.';
    else if (deadlineDate && deliveryDate <= deadlineDate) errs.delivery = 'Must be after the funding deadline.';
    else if (deadlineDate && !errs.deadline) {
      const dl = resolveDeadline(deadlineDate, nowSec);
      if (endOfDayUnix(deliveryDate) > dl + 365 * 86400) errs.delivery = 'Must be within 365 days of the funding deadline.';
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setPinError(undefined);
    const deadline = resolveDeadline(deadlineDate, nowSec);
    const deliveryDeadline = resolveDelivery(deliveryDate, deadline);
    try {
      const terms = await pinMetadata('terms', parsed.data);
      const hash = await openTx.send({
        address: rungAddress,
        abi: rungAbi,
        functionName: 'openStage',
        args: [BigInt(project.id), assetChoice.address!, goalWei, BigInt(deadline), BigInt(deliveryDeadline), terms.uri, terms.hash],
      });
      if (hash) {
        setPanel(null);
        onUpdate();
      }
    } catch (err) {
      setPinError(errorMessage(err));
    }
  }

  async function submitClaim() {
    if (!rungAddress || !stage) return;
    const hash = await claimTx.send({ address: stage.address, abi: stageEscrowAbi, functionName: 'claimFunds' });
    if (hash) onUpdate();
  }

  async function submitCancel(e: FormEvent) {
    e.preventDefault();
    if (!rungAddress || !stage) return;
    const value = reason.trim();
    if (!value) {
      setErrors({ reason: 'A written reason is required.' });
      return;
    }
    setErrors({});
    const hash = await cancelTx.send({ address: stage.address, abi: stageEscrowAbi, functionName: 'cancel', args: [value] });
    if (hash) {
      setReason('');
      setPanel(null);
      onUpdate();
    }
  }

  async function submitEvidence(e: FormEvent) {
    e.preventDefault();
    if (!rungAddress || !stage) return;
    const parsed = evidenceSchema.safeParse({ title: evTitle, summary: evSummary, links: splitLinks(evLinks), artifacts: [] });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPinError(undefined);
    try {
      const pinned = await pinMetadata('evidence', parsed.data);
      const hash = await evidenceTx.send({ address: stage.address, abi: stageEscrowAbi, functionName: 'submitEvidence', args: [pinned.uri, pinned.hash] });
      if (hash) {
        setPanel(null);
        onUpdate();
      }
    } catch (err) {
      setPinError(errorMessage(err));
    }
  }

  const pinNotice = pinError ? <Notice status="error" error={pinError} /> : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const minDeadline = minDeadlineISO(nowSec);
  const maxDeadline = maxDeadlineISO(nowSec);
  const minDelivery = deadlineDate ? isoPlusDays(1, new Date(`${deadlineDate}T12:00:00`)) : minDeadline;
  const maxDelivery = deadlineDate ? isoPlusDays(365, new Date(`${deadlineDate}T12:00:00`)) : maxDeadline;

  return (
    <div className="mt-4 space-y-3">
      {disabled && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {preview
            ? 'Preview mode — no contract is configured, so builder actions are disabled.'
            : 'Only the project builder can manage this stage.'}
        </p>
      )}

      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-zinc-900">Open the next stage</h4>
            <p className="text-xs text-zinc-500">
              Native BOT escrow, 1–90 day funding window.
              {stage ? ` Requires stage ${project.stageNumber} approved or refundable.` : ' This opens the first escrow.'}
            </p>
          </div>
          <Button variant="secondary" disabled={!writable} onClick={() => toggle('stage')}>
            {panel === 'stage' ? 'Close' : 'Open stage…'}
          </Button>
        </div>
        {stageBlocked && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Stage {project.stageNumber} is neither approved nor refundable yet — onchain creation would revert with
            <span className="font-mono"> PreviousStageIncomplete</span>. Wait for approval, a refund window, or for an unapproved claimed stage's delivery deadline to pass.
          </p>
        )}
        {panel === 'stage' && (
          <form onSubmit={submitOpenStage} className="mt-4 space-y-4">
            <Field label="Stage title" error={errors.title}>
              <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ship the transaction toolkit" maxLength={100} />
            </Field>
            <Field label="Deliverable" hint="What backers receive when this stage ships (20–1000 characters)." error={errors.deliverable}>
              <textarea
                className={`${inputClass} min-h-24`}
                value={deliverable}
                onChange={e => setDeliverable(e.target.value)}
                placeholder="Publish a TypeScript package with wallet connection, transaction simulation, and receipt tracking."
              />
            </Field>
            <Field label="Acceptance criteria" hint="How contributing backers assess the deliverable (20–1000 characters)." error={errors.criteria}>
              <textarea
                className={`${inputClass} min-h-24`}
                value={criteria}
                onChange={e => setCriteria(e.target.value)}
                placeholder="A public repository, published package, and two independent apps demonstrating the integration."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AssetPicker choice={assetChoice} error={errors.asset} />
              <Field label={`Goal (${assetChoice.symbol})`} hint="The amount is capped at this goal." error={errors.goal}>
                <input className={inputClass} value={goal} onChange={e => setGoal(e.target.value)} placeholder="12.5" inputMode="decimal" />
              </Field>
              <Field label="Funding deadline" hint={`Between ${minDeadline} and ${maxDeadline}.`} error={errors.deadline}>
                <input type="date" className={inputClass} value={deadlineDate} min={minDeadline} max={maxDeadline} onChange={e => setDeadlineDate(e.target.value)} />
              </Field>
              <Field label="Delivery deadline" hint="After funding ends, within 365 days." error={errors.delivery}>
                <input type="date" className={inputClass} value={deliveryDate} min={minDelivery} max={maxDelivery} onChange={e => setDeliveryDate(e.target.value)} />
              </Field>
            </div>
            {pinNotice}
            <Notice status={openTx.status} hash={openTx.hash} error={openTx.error} />
            <div className="flex justify-end">
              <Button type="submit" loading={openTx.pending} disabled={!writable}>
                Publish stage
              </Button>
            </div>
          </form>
        )}
        {panel !== 'stage' && <Notice status={openTx.status} hash={openTx.hash} error={openTx.error} />}
      </div>

      {canClaim && stage && (
        <div className="rounded-xl border border-zinc-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium text-zinc-900">Claim funds</h4>
              <p className="text-xs text-zinc-500">
                {amount(stage.raised, stage.decimals)} {stage.symbol} ready — claimable until {formatDay(stage.deliveryDeadline)}.
              </p>
            </div>
            <Button loading={claimTx.pending} disabled={!writable} onClick={submitClaim}>
              Claim funds
            </Button>
          </div>
          <div className="mt-3">
            <Notice status={claimTx.status} hash={claimTx.hash} error={claimTx.error} />
          </div>
        </div>
      )}

      {canCancel && stage && (
        <div className="rounded-xl border border-zinc-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium text-zinc-900">Cancel stage</h4>
              <p className="text-xs text-zinc-500">Stops funding immediately and makes every contribution refundable. Cannot be undone.</p>
            </div>
            <Button variant="danger" disabled={!writable} onClick={() => toggle('cancel')}>
              {panel === 'cancel' ? 'Close' : 'Cancel stage…'}
            </Button>
          </div>
          {panel === 'cancel' && (
            <form onSubmit={submitCancel} className="mt-4 space-y-3">
              <Field label="Reason" hint="Required onchain and visible to backers." error={errors.reason}>
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Why is this stage being stopped?"
                  maxLength={500}
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" variant="danger" loading={cancelTx.pending} disabled={!writable}>
                  Cancel stage
                </Button>
              </div>
            </form>
          )}
          {panel !== 'cancel' && <div className="mt-3"><Notice status={cancelTx.status} hash={cancelTx.hash} error={cancelTx.error} /></div>}
        </div>
      )}

      {canEvidence && stage && (
        <div className="rounded-xl border border-zinc-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium text-zinc-900">Submit evidence</h4>
              <p className="text-xs text-zinc-500">
                Funds are claimed — prove delivery before {formatDay(stage.deliveryDeadline)}. Backers then have 7 days to vote; a decision needs half of raised value to participate and a strict yes majority.
              </p>
            </div>
            <Button variant="secondary" disabled={!writable} onClick={() => toggle('evidence')}>
              {panel === 'evidence' ? 'Close' : 'Submit evidence…'}
            </Button>
          </div>
          {panel === 'evidence' && (
            <form onSubmit={submitEvidence} className="mt-4 space-y-4">
              <Field label="Evidence title" error={errors.title}>
                <input className={inputClass} value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Toolkit v1 shipped" maxLength={120} />
              </Field>
              <Field label="Summary" hint="What shipped, how to verify it (20–2000 characters)." error={errors.summary}>
                <textarea className={`${inputClass} min-h-28`} value={evSummary} onChange={e => setEvSummary(e.target.value)} />
              </Field>
              <Field label="Links" hint="One URL per line — repo, package, demo, docs." error={errors.links}>
                <textarea className={`${inputClass} min-h-20`} value={evLinks} onChange={e => setEvLinks(e.target.value)} placeholder={'https://github.com/…\nhttps://www.npmjs.com/…'} />
              </Field>
              {pinNotice}
              <Notice status={evidenceTx.status} hash={evidenceTx.hash} error={evidenceTx.error} />
              <div className="flex justify-end">
                <Button type="submit" loading={evidenceTx.pending} disabled={!writable}>
                  Submit evidence
                </Button>
              </div>
            </form>
          )}
          {panel !== 'evidence' && <div className="mt-3"><Notice status={evidenceTx.status} hash={evidenceTx.hash} error={evidenceTx.error} /></div>}
        </div>
      )}

    </div>
  );
}
