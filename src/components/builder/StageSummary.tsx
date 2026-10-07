import { Badge, ProgressBar } from '@/components/ui';
import { amount, days } from '@/lib/format';
import { reviewStateLabel } from '@/lib/reads';
import type { ProjectView } from '@/lib/types';

type Tone = 'default' | 'green' | 'amber' | 'red' | 'blue';

const REVIEW_TONES: Tone[] = ['default', 'blue', 'amber', 'green'];
const REVIEW_WINDOW = 7 * 86400;

export function StageSummary({ project }: { project: ProjectView }) {
  const stage = project.stage;
  if (!stage) {
    return <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">No stage opened yet — this project has no active escrow.</p>;
  }

  const now = Math.floor(Date.now() / 1000);
  const funded = stage.raised === stage.goal;
  const pastDeadline = now >= stage.deadline;
  const pastDelivery = now > stage.deliveryDeadline;
  const reviewOpen = stage.reviewState === 1 && now <= stage.submittedAt + REVIEW_WINDOW;
  const reviewReadyToFinalize = stage.reviewState === 1 && !reviewOpen;

  return (
    <div className="space-y-3 rounded-xl bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {stage.reviewState > 0 && (
          <Badge tone={REVIEW_TONES[stage.reviewState] ?? 'default'}>{reviewStateLabel(stage.reviewState)}</Badge>
        )}
        {stage.cancelled && <Badge tone="red">Cancelled · refunds open</Badge>}
        {stage.claimed && <Badge tone="green">Funds claimed</Badge>}
        {!stage.claimed && !stage.cancelled && stage.refundable && <Badge tone="amber">Refundable</Badge>}
        {funded && !stage.claimed && !stage.cancelled && <Badge tone="blue">Fully funded</Badge>}
        {!funded && pastDeadline && !stage.claimed && !stage.cancelled && <Badge tone="amber">Under goal · refundable</Badge>}
        {pastDelivery && !stage.claimed && !stage.cancelled && <Badge tone="red">Delivery window closed</Badge>}
      </div>

      <ProgressBar raised={BigInt(stage.raised)} goal={BigInt(stage.goal)} />

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">
          {amount(stage.raised, stage.decimals)} / {amount(stage.goal, stage.decimals)} {stage.symbol}
        </span>
        <span>{pastDeadline ? 'Funding closed' : `${days(stage.deadline)}d left to fund`}</span>
      </div>

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          Stage {project.stageNumber} · {stage.terms.title}
        </span>
        <span>{pastDelivery ? 'Delivery window closed' : `${days(stage.deliveryDeadline)}d to deliver`}</span>
      </div>

      {stage.reviewState === 1 && (
        <div className="space-y-1 text-xs text-zinc-600">
          <p>{reviewOpen ? `Backer vote closes in ${days(stage.submittedAt + REVIEW_WINDOW)}d.` : 'Voting window closed. Anyone can finalize the community decision.'}</p>
          <p>{stage.voterCount} voters · {amount(stage.participationWeight, stage.decimals)} participated · {amount(stage.approvalWeight, stage.decimals)} yes · {amount(stage.rejectionWeight, stage.decimals)} no</p>
        </div>
      )}
      {reviewReadyToFinalize && <p className="text-xs text-amber-700">Anyone can finalize this vote. Approval needs participation from at least half of the raised value and more yes weight than no weight.</p>}
      {stage.reviewState === 2 && <p className="text-xs text-amber-700">Changes requested — the builder can submit revised evidence for a new vote.</p>}
      {stage.reviewReason && <p className="text-xs leading-5 text-zinc-600">Community outcome: “{stage.reviewReason}”</p>}
    </div>
  );
}
