'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { Plus, Trash2 } from 'lucide-react';
import { preview } from '@/lib/chain';
import { retroRoundAbi } from '@/lib/abi';
import { fetchProjects } from '@/lib/clientReads';
import { useTx } from '@/lib/tx';
import { errorMessage } from '@/lib/format';
import { applicationSchema } from '@/lib/metadata';
import type { ApplicationView, ProjectView, RoundView } from '@/lib/types';
import { Badge, Button, Card, Field, Notice, Spinner, inputClass } from '@/components/ui';
import { postMetadata } from '@/components/retro/metadata';
import { sameAddress } from '@/components/retro/util';

type MetricRow = { label: string; value: string };

export function ApplyForm({ round, applications, open, onApplied }: {
  round: RoundView;
  applications: ApplicationView[];
  open: boolean;
  onApplied: () => void;
}): ReactNode {
  const { address } = useConnection();
  const { send, status, hash, error, pending } = useTx();
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [metrics, setMetrics] = useState<MetricRow[]>([{ label: '', value: '' }]);
  const [links, setLinks] = useState<string[]>(['']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchProjects()
      .then(list => { if (alive) setProjects(list); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const appliedIds = new Set(applications.map(a => a.projectId));
  // Preview sample data uses zero-address builders, so eligibility falls back to `verified`.
  const candidates = projects.filter(p => p.verified && (preview || sameAddress(p.builder, address)));
  const applied = projectId !== '' && appliedIds.has(Number(projectId));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPinError(undefined);

    const parsed = applicationSchema.safeParse({
      outcomes: outcomes.trim(),
      metrics: metrics
        .map(row => ({ label: row.label.trim(), value: row.value.trim() }))
        .filter(row => row.label && row.value),
      evidenceLinks: links.map(link => link.trim()).filter(Boolean),
    });
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        const index = issue.path[1];
        const key = typeof index === 'number' ? `${field}.${index}` : field;
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
    }
    if (!projectId) nextErrors.project = 'Choose the project you are applying for.';
    else if (appliedIds.has(Number(projectId))) nextErrors.project = 'This project already applied to the round.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsed.success) return;
    if (preview) {
      setPinError('Preview mode — application submissions are disabled.');
      return;
    }

    setPinning(true);
    try {
      const pinned = await postMetadata('application', parsed.data);
      await send(
        {
          address: round.address,
          abi: retroRoundAbi,
          functionName: 'submitApplication',
          args: [BigInt(projectId), pinned.uri, pinned.hash],
        },
        { onConfirm: onApplied },
      );
    } catch (e) {
      setPinError(errorMessage(e));
    } finally {
      setPinning(false);
    }
  };

  const busy = pinning || pending;

  if (!open) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Apply to this round</h2>
        <Badge tone="blue">Applications {round.deadline > Math.floor(Date.now() / 1000) ? 'open' : 'closed'}</Badge>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Only the builder of a verified project may apply, once per project. Evidence is pinned
        content-addressed before it goes onchain.
      </p>

      {!address && !preview ? (
        <p className="mt-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600">Connect your wallet to apply with one of your projects.</p>
      ) : loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading your projects…</p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Project" error={errors.project} hint="Verified projects only — at least one approved milestone.">
            <select className={inputClass} value={projectId} onChange={e => { setProjectId(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.project; return next; }); }}>
              <option value="">Select a project…</option>
              {candidates.map(project => (
                <option key={project.id} value={String(project.id)} disabled={appliedIds.has(project.id)}>
                  {project.name}{appliedIds.has(project.id) ? ' — already applied' : ''}
                </option>
              ))}
            </select>
          </Field>
          {candidates.length === 0 && (
            <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
              You have no verified projects yet. A project becomes verified after its contributing backers approve a milestone.
            </p>
          )}
          {applied && (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              This project has already applied to the round — one application per project.
            </p>
          )}

          <Field label="Outcomes" error={errors.outcomes} hint="What shipped, with measured results (20–2000 characters).">
            <textarea
              className={inputClass}
              rows={4}
              value={outcomes}
              onChange={e => { setOutcomes(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.outcomes; return next; }); }}
              placeholder="Shipped the transaction toolkit; three external apps adopted it within six weeks, with receipts published."
            />
          </Field>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-zinc-700">Metrics</span>
            {metrics.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClass} sm:w-64`}
                  placeholder="Metric (e.g. weekly active builders)"
                  value={row.label}
                  onChange={e => setMetrics(rows => rows.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                />
                <input
                  className={`${inputClass} sm:w-48`}
                  placeholder="Value (e.g. 128)"
                  value={row.value}
                  onChange={e => setMetrics(rows => rows.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                />
                <button
                  type="button"
                  aria-label="Remove metric"
                  onClick={() => setMetrics(rows => rows.filter((_, j) => j !== i))}
                  className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {errors[`metrics.${i}`] && <span className="w-full text-xs text-red-600">{errors[`metrics.${i}`]}</span>}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => setMetrics(rows => rows.length >= 8 ? rows : [...rows, { label: '', value: '' }])}>
                <Plus className="h-4 w-4" /> Add metric
              </Button>
              {errors.metrics && <span className="text-xs text-red-600">{errors.metrics}</span>}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-zinc-700">Evidence links</span>
            {links.map((link, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="https://…"
                  value={link}
                  onChange={e => setLinks(rows => rows.map((r, j) => j === i ? e.target.value : r))}
                />
                <button
                  type="button"
                  aria-label="Remove link"
                  onClick={() => setLinks(rows => rows.filter((_, j) => j !== i))}
                  className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {errors[`evidenceLinks.${i}`] && <span className="w-full text-xs text-red-600">{errors[`evidenceLinks.${i}`]}</span>}
              </div>
            ))}
            <Button variant="ghost" onClick={() => setLinks(rows => rows.length >= 10 ? rows : [...rows, ''])}>
              <Plus className="h-4 w-4" /> Add link
            </Button>
          </div>

          {pinError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{pinError}</p>}
          <Notice status={status} hash={hash} error={error} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={applied}>
              {busy ? (pinning ? 'Publishing evidence…' : 'Submitting…') : 'Submit application'}
            </Button>
            {preview && <span className="text-sm text-amber-700">Preview mode — submissions are disabled.</span>}
          </div>
        </form>
      )}
    </Card>
  );
}
