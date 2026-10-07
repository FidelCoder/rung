import type { Address } from 'viem';
export type Category = 'Developer tools' | 'AI & agents' | 'DePIN' | 'Public goods';
export type ProjectMetadata = { name: string; description: string; category: Category; website?: string };
export type StageTerms = { title: string; deliverable: string; criteria: string };
export type StageView = {
  address: Address; asset: Address; symbol: string; decimals: number; goal: string; raised: string;
  deadline: number; deliveryDeadline: number; claimed: boolean; cancelled: boolean;
  refundable: boolean; reviewState: number; terms: StageTerms; evidenceURI: string;
  reviewReason: string; submittedAt: number; rejectedAt: number; evidenceRound: number;
  approvalWeight: string; rejectionWeight: string; participationWeight: string; voterCount: number;
};
export type ProjectView = ProjectMetadata & { id: number; builder: Address; verified: boolean; stageNumber: number; stage?: StageView; source: 'preview' | 'chain' };
export type RoundView = { address: Address; title: string; description: string; rules: string; rulesURI: string; symbol: string; decimals: number; budget: string; allocated: string; deadline: number; decisionDeadline: number; roundOwner: Address; reviewer: Address; treasury: Address; finalized: boolean; cancelled: boolean; source: 'preview' | 'chain'; applications: ApplicationView[] };
export type ApplicationView = { id: number; projectId: number; recipient: Address; evidenceURI: string; award: string; claimed: boolean; reason: string };
