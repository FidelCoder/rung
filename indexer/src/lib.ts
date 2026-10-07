import type { Context } from "ponder:registry";
import schema from "ponder:schema";

/** Write handle passed to indexing functions (`context.db`). */
export type Db = Context<"StageEscrow:Contributed">["db"];

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export type StageInsert = typeof schema.stages.$inferInsert;
export type RoundInsert = typeof schema.rounds.$inferInsert;
export type ApplicationInsert = typeof schema.applications.$inferInsert;

export type BlockStamp = {
  updatedAtBlock: bigint;
  updatedAt: bigint;
};

/** Block number + timestamp stamp shared by every write. */
export const stamp = (block: { number: bigint; timestamp: bigint }): BlockStamp => ({
  updatedAtBlock: block.number,
  updatedAt: block.timestamp,
});

/** Stable id for an activity-log row. `logIndex` is unique within a block. */
export const stageEventId = (txHash: string, logIndex: number) =>
  `${txHash.toLowerCase()}:${logIndex}`;

/**
 * Full row for a StageEscrow. Used as the insert half of an
 * `insert().onConflictDoUpdate()` upsert: when the StageCreated event has not
 * been indexed (e.g. RUNG_DEPLOY_BLOCK was set past the factory event) the row
 * is created with zeroed metadata and event-derived values instead of failing.
 */
export const stageStub = (address: `0x${string}`, extra: Partial<StageInsert> = {}): StageInsert => ({
  address,
  projectId: 0n,
  stageNumber: 0n,
  builder: ZERO_ADDRESS,
  asset: ZERO_ADDRESS,
  goal: 0n,
  deadline: 0n,
  deliveryDeadline: 0n,
  raised: 0n,
  claimed: false,
  cancelled: false,
  reviewState: 0,
  submittedAt: 0n,
  rejectedAt: 0n,
  evidenceURI: "",
  evidenceHash: ZERO_BYTES32,
  reviewReason: "",
  evidenceRound: 0n,
  approvalWeight: 0n,
  rejectionWeight: 0n,
  participationWeight: 0n,
  voterCount: 0n,
  termsURI: "",
  termsHash: ZERO_BYTES32,
  updatedAtBlock: 0n,
  updatedAt: 0n,
  ...extra,
});

/** Full row for a RetroRound (see stageStub). */
export const roundStub = (address: `0x${string}`, extra: Partial<RoundInsert> = {}): RoundInsert => ({
  address,
  roundId: 0n,
  asset: ZERO_ADDRESS,
  roundOwner: ZERO_ADDRESS,
  reviewer: ZERO_ADDRESS,
  treasury: ZERO_ADDRESS,
  budget: 0n,
  allocated: 0n,
  applicationDeadline: 0n,
  decisionDeadline: 0n,
  rulesURI: "",
  rulesHash: ZERO_BYTES32,
  finalized: false,
  cancelled: false,
  remainderClaimed: false,
  createdAtBlock: 0n,
  updatedAtBlock: 0n,
  updatedAt: 0n,
  ...extra,
});

/** Full row for a round application (see stageStub). */
export const applicationStub = (
  round: `0x${string}`,
  applicationId: bigint,
  extra: Partial<ApplicationInsert> = {},
): ApplicationInsert => ({
  round,
  applicationId,
  projectId: 0n,
  recipient: ZERO_ADDRESS,
  evidenceURI: "",
  evidenceHash: ZERO_BYTES32,
  award: 0n,
  claimed: false,
  reason: "",
  appliedAt: 0n,
  updatedAtBlock: 0n,
  updatedAt: 0n,
  ...extra,
});
