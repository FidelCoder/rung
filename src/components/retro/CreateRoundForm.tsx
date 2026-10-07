'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { erc20Abi, isAddress, zeroAddress } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { useReadContract } from 'wagmi';
import { preview, rungAddress } from '@/lib/chain';
import { rungAbi } from '@/lib/abi';
import { useTx } from '@/lib/tx';
import { errorMessage } from '@/lib/format';
import { termsSchema } from '@/lib/metadata';
import { parseGoal } from '@/components/builder/amounts';
import { AssetPicker, useAssetChoice } from '@/components/builder/AssetPicker';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { postMetadata } from '@/components/retro/metadata';

/**
 * Round rules are pinned with the existing `terms` kind because it is the closest
 * shape the metadata API accepts: `title` = round title, `deliverable` = round
 * description, `criteria` = published scoring rules. `enrichRound` reads those keys
 * back into the RoundView description/rules fields.
 */
export function CreateRoundForm(): ReactNode {
  const { address } = useConnection();
  const queryClient = useQueryClient();
  const createTx = useTx();
  const approveTx = useTx();
  const assetChoice = useAssetChoice();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [budget, setBudget] = useState('');
  const [appDays, setAppDays] = useState('14');
  const [decisionDays, setDecisionDays] = useState('14');
  const [reviewer, setReviewer] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string | undefined>();

  const native = assetChoice.address === zeroAddress;
  const allowanceQuery = useReadContract({
    address: assetChoice.address ?? zeroAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? zeroAddress, rungAddress ?? zeroAddress],
    query: { enabled: !!address && !preview && !native && !!assetChoice.address },
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    const terms = termsSchema.safeParse({
      title: title.trim(),
      deliverable: description.trim(),
      criteria: rulesText.trim(),
    });
    if (!terms.success) {
      for (const issue of terms.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
    }

    const budgetWei = parseGoal(budget, assetChoice.decimals);
    if (!assetChoice.valid) nextErrors.asset = assetChoice.error || 'Choose an allowlisted asset and wait for its details to load.';
    if (!budgetWei) nextErrors.budget = `Enter a valid amount above zero in ${assetChoice.symbol}.`;

    const appDaysNum = Number(appDays);
    if (!Number.isInteger(appDaysNum) || appDaysNum < 1 || appDaysNum > 90) {
      nextErrors.appDays = 'Application window must be 1–90 days.';
    }
    const decisionDaysNum = Number(decisionDays);
    if (!Number.isInteger(decisionDaysNum) || decisionDaysNum < 1 || decisionDaysNum > 90) {
      nextErrors.decisionDays = 'Decision window must be 1–90 days after applications close.';
    }

    const reviewerAddress = reviewer.trim();
    if (!isAddress(reviewerAddress)) nextErrors.reviewer = 'Enter a valid reviewer address.';
    else if (address && reviewerAddress.toLowerCase() === address.toLowerCase()) {
      nextErrors.reviewer = 'Choose a reviewer distinct from the organization wallet.';
    }

    setErrors(nextErrors);
    setPinError(undefined);
    if (Object.keys(nextErrors).length > 0 || !terms.success || !budgetWei || !assetChoice.address) return;
    if (!rungAddress) {
      setPinError('No contract address configured — preview mode cannot send transactions.');
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const applicationDeadline = now + appDaysNum * 86400;
    const decisionDeadline = applicationDeadline + decisionDaysNum * 86400;

    setPinning(true);
    try {
      const pinned = await postMetadata('terms', {
        title: terms.data.title,
        deliverable: terms.data.deliverable,
        criteria: terms.data.criteria,
      });
      if (!native && (allowanceQuery.data === undefined || allowanceQuery.data < budgetWei)) {
        const approved = await approveTx.send({
          address: assetChoice.address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [rungAddress, budgetWei],
        });
        if (!approved) return;
        void queryClient.invalidateQueries();
      }
      await createTx.send({
        address: rungAddress,
        abi: rungAbi,
        functionName: 'createRound',
        args: [assetChoice.address, budgetWei, BigInt(applicationDeadline), BigInt(decisionDeadline), reviewerAddress as `0x${string}`, pinned.uri, pinned.hash],
        value: native ? budgetWei : 0n,
      });
    } catch (e) {
      setPinError(errorMessage(e));
    } finally {
      setPinning(false);
    }
  };

  const busy = pinning || createTx.pending || approveTx.pending;

  return (
    <Card>
      <h2 className="font-semibold">Create a retro round</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Your organization becomes the round owner and receives any unallocated budget. Choose a separate reviewer wallet or Safe for award decisions. The full budget is escrowed at creation.
        Applications open for 1–90 days; decisions end within a further 90 days.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Round title" error={errors.title} hint="5–100 characters.">
            <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="The builder round" />
          </Field>
          <AssetPicker choice={assetChoice} error={errors.asset} />
          <Field label={`Budget (${assetChoice.symbol})`} error={errors.budget} hint={native ? 'Escrowed with the transaction.' : 'Approve the exact amount; the registry transfers it into the new round.'}>
            <input className={inputClass} value={budget} onChange={e => setBudget(e.target.value)} inputMode="decimal" placeholder="50000" />
          </Field>
        </div>

        <Field label="Description" error={errors.deliverable} hint="Who the round recognizes and what qualifies (20–1000 characters).">
          <textarea
            className={inputClass}
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Recognizing open tools, practical infrastructure, and the people making BOT Chain easier to build on."
          />
        </Field>

        <Field label="Scoring rules" error={errors.criteria} hint="Published in rulesURI before the round opens (20–1000 characters).">
          <textarea
            className={inputClass}
            rows={3}
            value={rulesText}
            onChange={e => setRulesText(e.target.value)}
            placeholder="Impact on builders/users (0–50), evidence quality (0–30), sustained benefit (0–20). A project must have an approved milestone to apply."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Application window (days)" error={errors.appDays} hint="1–90 days from now.">
            <input className={inputClass} value={appDays} onChange={e => setAppDays(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Decision window (days)" error={errors.decisionDays} hint="1–90 days after applications close.">
            <input className={inputClass} value={decisionDays} onChange={e => setDecisionDays(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Organization reviewer" error={errors.reviewer} hint="Chosen by your organization. A Safe can represent a reviewer panel.">
            <input
              className={inputClass}
              value={reviewer}
              onChange={e => setReviewer(e.target.value)}
              placeholder="0x reviewer or Safe"
            />
          </Field>
        </div>

        {pinError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{pinError}</p>}
        <Notice status={approveTx.status} hash={approveTx.hash} error={approveTx.error} />
        <Notice status={createTx.status} hash={createTx.hash} error={createTx.error} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={!address && !preview}>
            {busy ? (pinning ? 'Publishing rules…' : 'Creating…') : !native && (allowanceQuery.data === undefined || (parseGoal(budget, assetChoice.decimals) ?? 0n) > allowanceQuery.data) ? 'Approve & create round' : 'Create round'}
          </Button>
          {!address && !preview && <span className="text-sm text-zinc-500">Connect your organization wallet to create and fund a round.</span>}
          {preview && <span className="text-sm text-amber-700">Preview mode — round creation is disabled.</span>}
        </div>
      </form>
    </Card>
  );
}
