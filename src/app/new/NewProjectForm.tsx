'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { parseEventLogs, zeroAddress } from 'viem';
import { useConnection, usePublicClient } from 'wagmi';
import { rungAbi } from '@/lib/abi';
import { preview, rungAddress } from '@/lib/chain';
import { amount, days, errorMessage, short } from '@/lib/format';
import { projectSchema, termsSchema } from '@/lib/metadata';
import { useTx } from '@/lib/tx';
import type { Category } from '@/lib/types';
import { Button, Card, Field, Notice, Spinner, inputClass } from '@/components/ui';
import { ConnectButton } from '@/components/ConnectButton';
import { parseGoal } from '@/components/builder/amounts';
import { endOfDayUnix, formatDay, isoPlusDays, maxDeadlineISO, minDeadlineISO, resolveDeadline, resolveDelivery } from '@/components/builder/dates';
import { fieldErrors } from '@/components/builder/formErrors';
import { pinMetadata, type PinnedMeta } from '@/components/builder/metadata';

const STEPS = ['Project details', 'Stage terms', 'Review & publish'] as const;
const CATEGORIES: Category[] = ['Developer tools', 'AI & agents', 'DePIN', 'Public goods'];

type Flow = { phase: 'idle' | 'pinning' | 'creating' | 'opening' | 'done' | 'error'; projectId?: number; error?: string };

// ── Offchain draft (Chunk 5): the wizard survives a refresh via localStorage. ──
const DRAFT_KEY = 'rung:draft:new-project';
type Draft = {
  step: number; name: string; description: string; category: Category; website: string;
  title: string; deliverable: string; criteria: string; goal: string;
  deadlineDate: string; deliveryDate: string; createdId?: number;
};

function readDraft(): Draft | undefined {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.name !== 'string') return undefined;
    return {
      step: Math.min(Math.max(Number(parsed.step) || 0, 0), STEPS.length - 1),
      name: String(parsed.name ?? ''),
      description: String(parsed.description ?? ''),
      category: (CATEGORIES as readonly string[]).includes(String(parsed.category)) ? (parsed.category as Category) : 'Public goods',
      website: String(parsed.website ?? ''),
      title: String(parsed.title ?? ''),
      deliverable: String(parsed.deliverable ?? ''),
      criteria: String(parsed.criteria ?? ''),
      goal: String(parsed.goal ?? ''),
      deadlineDate: String(parsed.deadlineDate ?? ''),
      deliveryDate: String(parsed.deliveryDate ?? ''),
      createdId: typeof parsed.createdId === 'number' ? parsed.createdId : undefined,
    };
  } catch { return undefined; }
}

function writeDraft(draft: Draft) {
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage full/unavailable */ }
}

function clearDraft() {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
}

export function NewProjectForm() {
  const router = useRouter();
  const { address } = useConnection();
  const client = usePublicClient();
  const createTx = useTx();
  const stageTx = useTx();

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string>();
  const [flow, setFlow] = useState<Flow>({ phase: 'idle' });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('Developer tools');
  const [website, setWebsite] = useState('');

  const [title, setTitle] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState('');
  const [goal, setGoal] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(isoPlusDays(14));
  const [deliveryDate, setDeliveryDate] = useState(isoPlusDays(45));

  const [projectMeta, setProjectMeta] = useState<PinnedMeta>();
  const [termsMeta, setTermsMeta] = useState<PinnedMeta>();
  const [createdId, setCreatedId] = useState<number>();
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);

  // Restore a saved draft once on mount; only start saving after hydration so
  // the initial empty state never overwrites an existing draft.
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setStep(draft.step);
      setName(draft.name); setDescription(draft.description);
      setCategory(draft.category); setWebsite(draft.website);
      setTitle(draft.title); setDeliverable(draft.deliverable); setCriteria(draft.criteria);
      setGoal(draft.goal); setDeadlineDate(draft.deadlineDate); setDeliveryDate(draft.deliveryDate);
      if (draft.createdId != null) setCreatedId(draft.createdId);
      setRestored(true);
    }
    setHydrated(true);
  }, []);

  // Persist every change once hydrated; cleared on successful publish.
  useEffect(() => {
    if (!hydrated) return;
    if (flow.phase === 'done') { clearDraft(); return; }
    const empty = !name && !description && !title && !deliverable && !criteria && !goal;
    if (empty) { clearDraft(); return; }
    writeDraft({
      step, name, description, category, website, title, deliverable, criteria,
      goal, deadlineDate, deliveryDate, createdId,
    });
  }, [hydrated, flow.phase, step, name, description, category, website, title, deliverable, criteria, goal, deadlineDate, deliveryDate, createdId]);

  useEffect(() => {
    if (flow.phase !== 'done' || flow.projectId == null) return;
    clearDraft();
    const timer = setTimeout(() => router.push(`/project/${flow.projectId}`), 2500);
    return () => clearTimeout(timer);
  }, [flow, router]);

  function projectPayload() {
    const site = website.trim();
    return site ? { name: name.trim(), description: description.trim(), category, website: site } : { name: name.trim(), description: description.trim(), category };
  }

  function termsPayload() {
    return { title: title.trim(), deliverable: deliverable.trim(), criteria: criteria.trim() };
  }

  function validateDates(): Record<string, string> {
    const errs: Record<string, string> = {};
    const nowSec = Math.floor(Date.now() / 1000);
    if (!deadlineDate) errs.deadlineDate = 'Pick a funding deadline.';
    else if (deadlineDate < minDeadlineISO(nowSec) || deadlineDate > maxDeadlineISO(nowSec)) errs.deadlineDate = 'Choose a date 1–90 days from today.';
    if (!deliveryDate) errs.deliveryDate = 'Pick a delivery deadline.';
    else if (deadlineDate && deliveryDate <= deadlineDate) errs.deliveryDate = 'Must be after the funding deadline.';
    else if (deadlineDate && !errs.deadlineDate) {
      const dl = resolveDeadline(deadlineDate, nowSec);
      if (endOfDayUnix(deliveryDate) > dl + 365 * 86400) errs.deliveryDate = 'Must be within 365 days of the funding deadline.';
    }
    return errs;
  }

  async function pin(kind: 'project' | 'terms', data: unknown): Promise<PinnedMeta> {
    setPinning(true);
    setPinError(undefined);
    try {
      return await pinMetadata(kind, data);
    } catch (err) {
      setPinError(errorMessage(err));
      throw err;
    } finally {
      setPinning(false);
    }
  }

  async function submitProject(e: FormEvent) {
    e.preventDefault();
    const parsed = projectSchema.safeParse({ name, description, category, website: website.trim() });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setCreatedId(undefined);
    try {
      const meta = await pin('project', projectPayload());
      setProjectMeta(meta);
      setStep(1);
    } catch { /* pinError shown */ }
  }

  async function submitTerms(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const parsed = termsSchema.safeParse(termsPayload());
    if (!parsed.success) Object.assign(errs, fieldErrors(parsed.error));
    if (!parseGoal(goal, 18)) errs.goal = 'Enter a valid goal above zero in BOT.';
    Object.assign(errs, validateDates());
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    try {
      const meta = await pin('terms', termsPayload());
      setTermsMeta(meta);
      setStep(2);
    } catch { /* pinError shown */ }
  }

  async function publish() {
    if (preview || !rungAddress || !client) return;
    if (flow.phase !== 'idle' && flow.phase !== 'error') return;
    setFlow({ phase: 'pinning' });
    try {
      let project = projectMeta;
      let terms = termsMeta;
      if (!project) project = await pinMetadata('project', projectPayload());
      if (!terms) terms = await pinMetadata('terms', termsPayload());
      setProjectMeta(project);
      setTermsMeta(terms);

      let projectId = createdId;
      if (projectId == null) {
        setFlow({ phase: 'creating' });
        const firstHash = await createTx.send({
          address: rungAddress,
          abi: rungAbi,
          functionName: 'createProject',
          args: [name.trim(), project.uri, project.hash],
        });
        if (!firstHash) {
          setFlow({ phase: 'idle' });
          return;
        }
        const receipt = await client.getTransactionReceipt({ hash: firstHash });
        const created = parseEventLogs({ abi: rungAbi, logs: receipt.logs, eventName: 'ProjectCreated' });
        const mine = created.find(log => log.args.builder.toLowerCase() === (address ?? '').toLowerCase()) ?? created[0];
        if (!mine) throw new Error('ProjectCreated event was not found in the receipt.');
        projectId = Number(mine.args.projectId);
        setCreatedId(projectId);
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const deadline = resolveDeadline(deadlineDate, nowSec);
      const deliveryDeadline = resolveDelivery(deliveryDate, deadline);

      setFlow({ phase: 'opening' });
      const secondHash = await stageTx.send({
        address: rungAddress,
        abi: rungAbi,
        functionName: 'openStage',
        args: [BigInt(projectId), zeroAddress, parseGoal(goal, 18)!, BigInt(deadline), BigInt(deliveryDeadline), terms.uri, terms.hash],
      });
      if (!secondHash) {
        setFlow({ phase: 'error', error: `Project #${projectId} was created onchain, but opening the stage failed. Fix the issue below and publish again — only the stage transaction will be sent.` });
        return;
      }
      setFlow({ phase: 'done', projectId });
    } catch (err) {
      setFlow({ phase: 'error', error: errorMessage(err) });
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const reviewDeadline = deadlineDate ? resolveDeadline(deadlineDate, nowSec) : 0;
  const reviewDelivery = deliveryDate && reviewDeadline ? resolveDelivery(deliveryDate, reviewDeadline) : 0;
  const reviewGoal = parseGoal(goal, 18);
  const busy = pinning || createTx.pending || stageTx.pending || flow.phase === 'pinning' || flow.phase === 'creating' || flow.phase === 'opening';
  const localMetadata = [projectMeta?.uri, termsMeta?.uri].some(uri =>
    uri?.startsWith('http://localhost:') || uri?.startsWith('http://127.0.0.1:') || uri?.startsWith('http://[::1]:')
  );

  if (flow.phase === 'done' && flow.projectId != null) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <h2 className="text-lg font-semibold text-emerald-900">Project published</h2>
        <p className="mt-1 text-sm text-emerald-800">
          Project #{flow.projectId} and its first stage are live onchain. Redirecting you there…
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => router.push(`/project/${flow.projectId}`)}>View project now</Button>
          <Button variant="secondary" onClick={() => router.push('/workspace')}>
            Open workspace
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              i === step ? 'bg-zinc-900 text-white' : i < step ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            <span className="font-semibold">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {pinError && <Notice status="error" error={pinError} />}
      {flow.phase === 'error' && flow.error && <Notice status="error" error={flow.error} />}
      {restored && hydrated && flow.phase !== 'done' && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          <span>Draft restored from this browser — continue where you left off.</span>
          <button
            type="button"
            className="font-medium text-red-600 hover:underline"
            onClick={() => {
              clearDraft();
              setRestored(false);
              setStep(0);
              setName(''); setDescription(''); setWebsite('');
              setTitle(''); setDeliverable(''); setCriteria(''); setGoal('');
              setCreatedId(undefined); setProjectMeta(undefined); setTermsMeta(undefined);
            }}
          >
            Discard draft
          </button>
        </p>
      )}
      {flow.phase === 'pinning' && (
        <p className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Spinner />
          Pinning metadata…
        </p>
      )}

      {step === 0 && (
        <Card>
          <form onSubmit={submitProject} className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Project details</h2>
              <p className="mt-1 text-sm text-zinc-500">Published to IPFS-style storage and recorded onchain with your first stage.</p>
            </div>
            <Field label="Project name" hint="3–60 characters." error={errors.name}>
              <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="OpenKit" maxLength={60} />
            </Field>
            <Field label="Description" hint="20–600 characters — what you are building and for whom." error={errors.description}>
              <textarea
                className={`${inputClass} min-h-28`}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="An open-source toolkit that helps developers ship their first BOT Chain integration in an afternoon."
                maxLength={600}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" error={errors.category}>
                <select className={inputClass} value={category} onChange={e => setCategory(e.target.value as Category)}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Website (optional)" hint="HTTPS only." error={errors.website}>
                <input className={inputClass} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={pinning}>
                Continue
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <form onSubmit={submitTerms} className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">First stage terms</h2>
              <p className="mt-1 text-sm text-zinc-500">
                These terms are pinned, hashed, and stored in the escrow. Reviewers judge delivery against them.
              </p>
            </div>
            <Field label="Stage title" hint="5–100 characters." error={errors.title}>
              <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ship the transaction toolkit" maxLength={100} />
            </Field>
            <Field label="Deliverable" hint="20–1000 characters — what backers receive." error={errors.deliverable}>
              <textarea
                className={`${inputClass} min-h-24`}
                value={deliverable}
                onChange={e => setDeliverable(e.target.value)}
                placeholder="Publish a TypeScript package with wallet connection, transaction simulation, and receipt tracking."
              />
            </Field>
            <Field label="Acceptance criteria" hint="20–1000 characters — how contributing backers assess it." error={errors.criteria}>
              <textarea
                className={`${inputClass} min-h-24`}
                value={criteria}
                onChange={e => setCriteria(e.target.value)}
                placeholder="A public repository, published package, and two independent apps demonstrating the integration."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Goal (BOT)" hint="The amount is capped at this goal." error={errors.goal}>
                <input className={inputClass} value={goal} onChange={e => setGoal(e.target.value)} placeholder="12.5" inputMode="decimal" />
              </Field>
              <Field label="Funding deadline" hint={`1–90 days from today (${minDeadlineISO(nowSec)} – ${maxDeadlineISO(nowSec)}).`} error={errors.deadlineDate}>
                <input
                  type="date"
                  className={inputClass}
                  value={deadlineDate}
                  min={minDeadlineISO(nowSec)}
                  max={maxDeadlineISO(nowSec)}
                  onChange={e => setDeadlineDate(e.target.value)}
                />
              </Field>
              <Field label="Delivery deadline" hint="After funding ends, within 365 days of it." error={errors.deliveryDate}>
                <input
                  type="date"
                  className={inputClass}
                  value={deliveryDate}
                  min={deadlineDate ? isoPlusDays(1, new Date(`${deadlineDate}T12:00:00`)) : minDeadlineISO(nowSec)}
                  max={deadlineDate ? isoPlusDays(365, new Date(`${deadlineDate}T12:00:00`)) : ''}
                  onChange={e => setDeliveryDate(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(0)} disabled={busy}>
                Back
              </Button>
              <Button type="submit" loading={pinning}>
                Continue
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Review &amp; publish</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Two wallet transactions: <span className="font-mono text-xs">createProject</span> then{' '}
                <span className="font-mono text-xs">openStage</span>.
              </p>
            </div>

            <dl className="divide-y divide-zinc-100 rounded-xl bg-zinc-50 px-4 text-sm">
              <Row label="Name" value={name} />
              <Row label="Category" value={category} />
              {website.trim() && <Row label="Website" value={website.trim()} />}
              <Row label="Description" value={<span className="line-clamp-3 font-normal text-zinc-600">{description}</span>} />
              <Row label="Stage title" value={title} />
              <Row label="Asset" value="Native BOT" />
              <Row label="Goal" value={reviewGoal ? `${amount(reviewGoal.toString(), 18)} BOT` : '—'} />
              <Row
                label="Funding deadline"
                value={reviewDeadline ? `${formatDay(reviewDeadline)} · ${days(reviewDeadline)}d left` : '—'}
              />
              <Row
                label="Delivery deadline"
                value={reviewDelivery ? `${formatDay(reviewDelivery)} · ${days(reviewDelivery)}d left` : '—'}
              />
              <Row label="Deliverable" value={<span className="line-clamp-3 font-normal text-zinc-600">{deliverable}</span>} />
              <Row label="Criteria" value={<span className="line-clamp-3 font-normal text-zinc-600">{criteria}</span>} />
            </dl>

            {projectMeta && termsMeta && (
              <div className="space-y-1 rounded-xl border border-zinc-200 p-4 text-xs text-zinc-500">
                <p>
                  Project metadata: <span className="font-mono">{short(projectMeta.uri)}</span> · hash{' '}
                  <span className="font-mono">{short(projectMeta.hash)}</span>
                </p>
                <p>
                  Stage terms: <span className="font-mono">{short(termsMeta.uri)}</span> · hash{' '}
                  <span className="font-mono">{short(termsMeta.hash)}</span>
                </p>
              </div>
            )}

            {localMetadata && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Metadata is stored on this computer and its links use localhost. Use this for local testnet checks; configure durable pinning before sharing the project with other people.
              </p>
            )}

            {preview && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Preview mode — no contract address is configured (set NEXT_PUBLIC_RUNG_ADDRESS), so publishing is disabled.
                Your form is saved; configure the contract and publish for real.
              </p>
            )}

            <Notice status={createTx.status} hash={createTx.hash} error={createTx.error} />
            <Notice status={stageTx.status} hash={stageTx.hash} error={stageTx.error} />

            {!address ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3">
                <span className="text-sm text-zinc-600">Connect the wallet that will build this project.</span>
                <ConnectButton />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                Back
              </Button>
              {address ? (
                <Button onClick={publish} loading={busy} disabled={preview || !rungAddress}>
                  Publish project &amp; open stage
                </Button>
              ) : (
                <span className="text-sm text-zinc-500">Wallet required to publish</span>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-800">{value}</dd>
    </div>
  );
}
