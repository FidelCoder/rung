import { bigint, boolean, hex, index, integer, onchainTable, primaryKey, text } from "ponder";

/**
 * Chain-derived read models for the Rung protocol.
 *
 * These tables are discovery/reconciliation aids only: financial truth stays
 * on chain. Amounts are stored with the ponder `bigint` column (numeric(78)),
 * addresses and content hashes with the `hex` column, and block timestamps as
 * unix seconds (bigint).
 *
 * Note: drizzle names columns after the JS property verbatim (no snake_case
 * conversion), so column names here (e.g. `metadataURI`) are also the Postgres
 * column names and the GraphQL field names.
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Projects created on the Rung registry. */
export const projects = onchainTable(
  "projects",
  (p) => ({
    id: p.bigint().primaryKey(),
    builder: p.hex().notNull(),
    name: p.text().notNull(),
    metadataURI: p.text().notNull(),
    metadataHash: p.hex().notNull(),
    verified: p.boolean().notNull().default(false),
    stageNumber: p.bigint().notNull().default(0n),
    latestStage: p.hex().notNull().default(ZERO_ADDRESS),
    createdAtBlock: p.bigint().notNull(),
    createdAt: p.bigint().notNull(),
    updatedAtBlock: p.bigint().notNull(),
    updatedAt: p.bigint().notNull(),
  }),
  (t) => ({
    builderIdx: index("projects_builder_idx").on(t.builder),
    verifiedIdx: index("projects_verified_idx").on(t.verified),
  }),
);

/**
 * One row per StageEscrow. `raised` is monotonic: it is the sum of Contributed
 * events and is never decremented by refunds. Balance =
 * raised - refunded - (claimed ? raised : 0); refunds and a claim are mutually
 * exclusive on chain.
 */
export const stages = onchainTable(
  "stages",
  (p) => ({
    address: p.hex().primaryKey(),
    projectId: p.bigint().notNull().default(0n),
    stageNumber: p.bigint().notNull().default(0n),
    builder: p.hex().notNull().default(ZERO_ADDRESS),
    asset: p.hex().notNull().default(ZERO_ADDRESS),
    goal: p.bigint().notNull().default(0n),
    deadline: p.bigint().notNull().default(0n),
    deliveryDeadline: p.bigint().notNull().default(0n),
    raised: p.bigint().notNull().default(0n),
    claimed: p.boolean().notNull().default(false),
    cancelled: p.boolean().notNull().default(false),
    // StageEscrow.ReviewState: 0 None, 1 Submitted, 2 ChangesRequested, 3 Approved
    reviewState: p.integer().notNull().default(0),
    submittedAt: p.bigint().notNull().default(0n),
    rejectedAt: p.bigint().notNull().default(0n),
    evidenceURI: p.text().notNull().default(""),
    evidenceHash: p.hex().notNull().default(ZERO_BYTES32),
    reviewReason: p.text().notNull().default(""),
    evidenceRound: p.bigint().notNull().default(0n),
    approvalWeight: p.bigint().notNull().default(0n),
    rejectionWeight: p.bigint().notNull().default(0n),
    participationWeight: p.bigint().notNull().default(0n),
    voterCount: p.bigint().notNull().default(0n),
    termsURI: p.text().notNull().default(""),
    termsHash: p.hex().notNull().default(ZERO_BYTES32),
    updatedAtBlock: p.bigint().notNull().default(0n),
    updatedAt: p.bigint().notNull().default(0n),
  }),
  (t) => ({
    projectIdx: index("stages_project_idx").on(t.projectId),
    builderIdx: index("stages_builder_idx").on(t.builder),
    updatedIdx: index("stages_updated_block_idx").on(t.updatedAtBlock),
  }),
);

/**
 * Per-backer running totals for one stage. `contributed` and `refunded` keep
 * the full history (the on-chain `contributions` mapping is zeroed by a
 * refund); `claimable = contributed - refunded` equals the on-chain
 * `contributions(backer)` and is only spendable while the stage is refundable.
 */
export const contributions = onchainTable(
  "contributions",
  (p) => ({
    stage: p.hex().notNull(),
    backer: p.hex().notNull(),
    contributed: p.bigint().notNull().default(0n),
    refunded: p.bigint().notNull().default(0n),
    claimable: p.bigint().notNull().default(0n),
    updatedAtBlock: p.bigint().notNull().default(0n),
    updatedAt: p.bigint().notNull().default(0n),
  }),
  (t) => ({
    pk: primaryKey({ name: "contributions_pk", columns: [t.stage, t.backer] }),
    stageIdx: index("contributions_stage_idx").on(t.stage),
    backerIdx: index("contributions_backer_idx").on(t.backer),
  }),
);

/** Activity log for StageEscrow state transitions (includes reviews). */
export const stageEvents = onchainTable(
  "stage_events",
  (p) => ({
    // `${txHash}:${logIndex}` — logIndex is unique per block.
    id: p.text().primaryKey(),
    stage: p.hex().notNull(),
    type: p.text().notNull(),
    actor: p.hex(),
    amount: p.bigint(),
    uri: p.text().notNull().default(""),
    reason: p.text().notNull().default(""),
    approved: p.boolean(),
    blockNumber: p.bigint().notNull(),
    timestamp: p.bigint().notNull(),
    txHash: p.hex().notNull(),
  }),
  (t) => ({
    stageIdx: index("stage_events_stage_idx").on(t.stage, t.blockNumber),
    typeIdx: index("stage_events_type_idx").on(t.type),
  }),
);

/** Retro rounds created by the Rung registry. */
export const rounds = onchainTable(
  "rounds",
  (p) => ({
    address: p.hex().primaryKey(),
    roundId: p.bigint().notNull().default(0n),
    asset: p.hex().notNull().default(ZERO_ADDRESS),
    roundOwner: p.hex().notNull().default(ZERO_ADDRESS),
    reviewer: p.hex().notNull().default(ZERO_ADDRESS),
    treasury: p.hex().notNull().default(ZERO_ADDRESS),
    budget: p.bigint().notNull().default(0n),
    allocated: p.bigint().notNull().default(0n),
    applicationDeadline: p.bigint().notNull().default(0n),
    decisionDeadline: p.bigint().notNull().default(0n),
    rulesURI: p.text().notNull().default(""),
    rulesHash: p.hex().notNull().default(ZERO_BYTES32),
    finalized: p.boolean().notNull().default(false),
    cancelled: p.boolean().notNull().default(false),
    remainderClaimed: p.boolean().notNull().default(false),
    createdAtBlock: p.bigint().notNull().default(0n),
    updatedAtBlock: p.bigint().notNull().default(0n),
    updatedAt: p.bigint().notNull().default(0n),
  }),
  (t) => ({
    roundIdIdx: index("rounds_round_id_idx").on(t.roundId),
    assetIdx: index("rounds_asset_idx").on(t.asset),
    updatedIdx: index("rounds_updated_block_idx").on(t.updatedAtBlock),
  }),
);

/** Retro round applications (one per project per round). */
export const applications = onchainTable(
  "applications",
  (p) => ({
    round: p.hex().notNull(),
    applicationId: p.bigint().notNull(),
    projectId: p.bigint().notNull().default(0n),
    recipient: p.hex().notNull().default(ZERO_ADDRESS),
    evidenceURI: p.text().notNull().default(""),
    evidenceHash: p.hex().notNull().default(ZERO_BYTES32),
    award: p.bigint().notNull().default(0n),
    claimed: p.boolean().notNull().default(false),
    reason: p.text().notNull().default(""),
    appliedAt: p.bigint().notNull().default(0n),
    updatedAtBlock: p.bigint().notNull().default(0n),
    updatedAt: p.bigint().notNull().default(0n),
  }),
  (t) => ({
    pk: primaryKey({ name: "applications_pk", columns: [t.round, t.applicationId] }),
    roundIdx: index("applications_round_idx").on(t.round),
    projectIdx: index("applications_project_idx").on(t.projectId),
    recipientIdx: index("applications_recipient_idx").on(t.recipient),
  }),
);

/** Allow-listed campaign/round assets from `AssetAllowed`. */
export const assets = onchainTable(
  "assets",
  (p) => ({
    address: p.hex().primaryKey(),
    allowed: p.boolean().notNull().default(false),
    updatedAtBlock: p.bigint().notNull().default(0n),
    updatedAt: p.bigint().notNull().default(0n),
  }),
  (t) => ({
    allowedIdx: index("assets_allowed_idx").on(t.allowed),
  }),
);

/**
 * Protocol-level creation-pause flag. Review policy is scoped to each stage
 * or retro round, not configured globally.
 */
export const registryState = onchainTable(
  "registry_state",
  (p) => ({
    id: p.integer().primaryKey(),
    creationPaused: p.boolean().notNull().default(false),
    updatedAtBlock: p.bigint().notNull().default(0n),
    updatedAt: p.bigint().notNull().default(0n),
  }),
  (t) => ({
    updatedIdx: index("registry_state_updated_block_idx").on(t.updatedAtBlock),
  }),
);
