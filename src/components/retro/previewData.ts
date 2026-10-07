import { parseEther, type Address } from 'viem';
import { examples } from '@/lib/examples';
import type { ProjectView, RoundView } from '@/lib/types';

// Sample protocol and organization accounts used only in preview mode.
export const previewOwner = '0x4444444444444444444444444444444444444444' as const;
export const previewRoundReviewer = '0x1111111111111111111111111111111111111111' as const;
export const previewOrganization = '0x2222222222222222222222222222222222222222' as const;
export const previewTreasury = previewOrganization;
export const previewRecipientA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
export const previewRecipientB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

const REVIEW_WINDOW = 7 * 86400;

/**
 * Sample community queue: two live submissions and two settled decisions.
 */
export function sampleReviewProjects(): ProjectView[] {
  const now = Math.floor(Date.now() / 1000);
  const states = [1, 1, 3, 2];
  const submittedDaysAgo = [2, 6, 10, 9];
  const reasons = [
    '',
    '',
    'Meets every published criterion; reproducible artifacts and independent adoption confirmed.',
    'Reproduction guide skips steps 3–5. Publish a full walkthrough and resubmit evidence.',
  ];
  return examples.map((project, i) => ({
    ...project,
    stage: project.stage ? {
      ...project.stage,
      reviewState: states[i],
      submittedAt: now - submittedDaysAgo[i] * 86400,
      rejectedAt: states[i] === 2 ? now - (submittedDaysAgo[i] - 1) * 86400 : 0,
      evidenceURI: states[i] === 1 || states[i] === 3 ? `ipfs://bafyreviewevidence${i}` : '',
      reviewReason: reasons[i],
      evidenceRound: 1,
      approvalWeight: parseEther(states[i] === 3 ? '3' : i === 0 ? '1' : '0').toString(),
      rejectionWeight: parseEther(states[i] === 2 ? '2' : '0').toString(),
      participationWeight: parseEther(states[i] === 3 ? '3' : states[i] === 2 ? '2' : i === 0 ? '1' : '0').toString(),
      voterCount: states[i] === 1 ? (i === 0 ? 1 : 0) : 1,
    } : undefined,
  }));
}

export function reviewWindowEnd(submittedAt: number): number {
  return submittedAt + REVIEW_WINDOW;
}

/** Sample round for preview mode: open for applications, two awarded applications. */
export function sampleRound(address: Address): RoundView {
  const now = Math.floor(Date.now() / 1000);
  return {
    address,
    title: 'The builder round',
    description:
      'Recognizing open tools, practical infrastructure, and the people making BOT Chain easier to build on. Awards favor shipped work with reproducible evidence over plans.',
    rules:
      'Published work, independent adoption, and evidence of sustained benefit. A project must have an approved milestone to apply. Rubric: impact on builders/users (0–50), evidence quality (0–30), sustained benefit (0–20).',
    rulesURI: 'ipfs://bafyrulesample',
    symbol: 'BOT',
    decimals: 18,
    budget: parseEther('50000').toString(),
    allocated: parseEther('14000').toString(),
    deadline: now + 7 * 86400,
    decisionDeadline: now + 21 * 86400,
    roundOwner: previewOrganization,
    reviewer: previewRoundReviewer,
    treasury: previewTreasury,
    finalized: false,
    cancelled: false,
    source: 'preview',
    applications: [
      {
        id: 0, projectId: 2, recipient: previewRecipientA, evidenceURI: 'ipfs://bafyapplication0',
        award: parseEther('9000').toString(), claimed: false,
        reason: 'Meets the impact rubric with reproducible adoption data and sustained maintenance.',
      },
      {
        id: 1, projectId: 3, recipient: previewRecipientB, evidenceURI: 'ipfs://bafyapplication1',
        award: parseEther('5000').toString(), claimed: false,
        reason: 'Solid evidence quality; partial credit for missing third-party confirmations.',
      },
      {
        id: 2, projectId: 4, recipient: previewRecipientA, evidenceURI: 'https://github.com/example/rung-evidence',
        award: '0', claimed: false, reason: '',
      },
    ],
  };
}
