import { ponder } from "ponder:registry";
import schema from "ponder:schema";
import { retroRoundAbi } from "../../src/lib/abi/RetroRound";
import { stageEscrowAbi } from "../../src/lib/abi/StageEscrow";
import { applicationStub, type Db, roundStub, stageEventId, stageStub, stamp } from "./lib";

const {
  applications,
  assets,
  contributions,
  projects,
  registryState,
  rounds,
  stageEvents,
  stages,
} = schema;

/** StageEscrow.ReviewState */
const REVIEW_SUBMITTED = 1;
const REVIEW_CHANGES_REQUESTED = 2;
const REVIEW_APPROVED = 3;

type StageEventRow = {
  stage: `0x${string}`;
  type: string;
  actor?: `0x${string}` | null;
  amount?: bigint | null;
  uri?: string;
  reason?: string;
  approved?: boolean | null;
  blockNumber: bigint;
  timestamp: bigint;
  txHash: `0x${string}`;
  logIndex: number;
};

/** Append one row to the stage activity log (idempotent on replay). */
const logStageEvent = async (db: Db, args: StageEventRow) => {
  await db
    .insert(stageEvents)
    .values({
      id: stageEventId(args.txHash, args.logIndex),
      stage: args.stage,
      type: args.type,
      actor: args.actor ?? null,
      amount: args.amount ?? null,
      uri: args.uri ?? "",
      reason: args.reason ?? "",
      approved: args.approved ?? null,
      blockNumber: args.blockNumber,
      timestamp: args.timestamp,
      txHash: args.txHash.toLowerCase() as `0x${string}`,
    })
    .onConflictDoNothing();
};

// ───────────────────────────── Rung (registry/factory) ─────────────────────────────

ponder.on("Rung:ProjectCreated", async ({ event, context }) => {
  const { db } = context;
  const { projectId, builder, name, uri, contentHash } = event.args;
  const s = stamp(event.block);

  await db
    .insert(projects)
    .values({
      id: projectId,
      builder,
      name,
      metadataURI: uri,
      metadataHash: contentHash,
      verified: false,
      stageNumber: 0n,
      latestStage: "0x0000000000000000000000000000000000000000",
      createdAtBlock: s.updatedAtBlock,
      createdAt: s.updatedAt,
      ...s,
    })
    .onConflictDoUpdate(() => ({
      builder,
      name,
      metadataURI: uri,
      metadataHash: contentHash,
      ...s,
    }));
});

ponder.on("Rung:StageCreated", async ({ event, context }) => {
  const { db, client } = context;
  const { projectId, stageNumber, stage, builder, asset, goal, deadline } = event.args;
  const s = stamp(event.block);

  // Not part of the StageCreated event; both are immutable, so read at latest.
  const [deliveryDeadline, termsURI, termsHash] = await Promise.all([
    client.readContract({
      abi: stageEscrowAbi,
      address: stage,
      functionName: "deliveryDeadline",
      cache: "immutable",
    }),
    client.readContract({
      abi: stageEscrowAbi,
      address: stage,
      functionName: "termsURI",
      cache: "immutable",
    }),
    client.readContract({
      abi: stageEscrowAbi,
      address: stage,
      functionName: "termsHash",
      cache: "immutable",
    }),
  ]);

  await db
    .insert(stages)
    .values(
      stageStub(stage, {
        projectId,
        stageNumber,
        builder,
        asset,
        goal,
        deadline,
        deliveryDeadline,
        termsURI,
        termsHash,
        ...s,
      }),
    )
    .onConflictDoUpdate(() => ({
      projectId,
      stageNumber,
      builder,
      asset,
      goal,
      deadline,
      deliveryDeadline,
      termsURI,
      termsHash,
      ...s,
    }));

  const project = await db.find(projects, { id: projectId });
  if (project) {
    await db.update(projects, { id: projectId }).set({ stageNumber, latestStage: stage, ...s });
  } else {
    console.warn(
      `project ${projectId} missing at StageCreated (block ${s.updatedAtBlock}); set RUNG_DEPLOY_BLOCK to the Rung deploy block`,
    );
  }
});

ponder.on("Rung:ProjectVerified", async ({ event, context }) => {
  const { db } = context;
  const { projectId } = event.args;
  const s = stamp(event.block);

  const project = await db.find(projects, { id: projectId });
  if (project) {
    if (!project.verified) {
      await db.update(projects, { id: projectId }).set({ verified: true, ...s });
    }
  } else {
    console.warn(
      `project ${projectId} missing at ProjectVerified (block ${s.updatedAtBlock}); set RUNG_DEPLOY_BLOCK to the Rung deploy block`,
    );
  }
});

ponder.on("Rung:RoundCreated", async ({ event, context }) => {
  const { db, client } = context;
  const { roundId, round, creator, reviewer, asset, budget } = event.args;
  const s = stamp(event.block);

  // Not part of the RoundCreated event; all are immutable, so read at latest.
  const [applicationDeadline, decisionDeadline, rulesURI, rulesHash] =
    await Promise.all([
      client.readContract({
        abi: retroRoundAbi,
        address: round,
        functionName: "applicationDeadline",
        cache: "immutable",
      }),
      client.readContract({
        abi: retroRoundAbi,
        address: round,
        functionName: "decisionDeadline",
        cache: "immutable",
      }),
      client.readContract({
        abi: retroRoundAbi,
        address: round,
        functionName: "rulesURI",
        cache: "immutable",
      }),
      client.readContract({
        abi: retroRoundAbi,
        address: round,
        functionName: "rulesHash",
        cache: "immutable",
      }),
    ]);

  await db
    .insert(rounds)
    .values(
      roundStub(round, {
        roundId,
        asset,
        roundOwner: creator,
        reviewer,
        treasury: creator,
        budget,
        applicationDeadline,
        decisionDeadline,
        rulesURI,
        rulesHash,
        createdAtBlock: s.updatedAtBlock,
        ...s,
      }),
    )
    .onConflictDoUpdate(() => ({
      roundId,
      asset,
      roundOwner: creator,
      reviewer,
      treasury: creator,
      budget,
      applicationDeadline,
      decisionDeadline,
      rulesURI,
      rulesHash,
      ...s,
    }));
});

ponder.on("Rung:AssetAllowed", async ({ event, context }) => {
  const { db } = context;
  const { asset, allowed } = event.args;
  const s = stamp(event.block);

  await db
    .insert(assets)
    .values({ address: asset, allowed, ...s })
    .onConflictDoUpdate(() => ({ allowed, ...s }));
});

ponder.on("Rung:CreationPaused", async ({ event, context }) => {
  const { db } = context;
  const { paused } = event.args;
  const s = stamp(event.block);

  await db
    .insert(registryState)
    .values({ id: 0, creationPaused: paused, ...s })
    .onConflictDoUpdate(() => ({ creationPaused: paused, ...s }));
});

// ───────────────────────────── StageEscrow ─────────────────────────────

ponder.on("StageEscrow:Contributed", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const { backer, amount } = event.args;
  const s = stamp(event.block);

  await db
    .insert(contributions)
    .values({ stage, backer, contributed: amount, refunded: 0n, claimable: amount, ...s })
    .onConflictDoUpdate((row) => ({
      contributed: row.contributed + amount,
      claimable: row.contributed + amount - row.refunded,
      ...s,
    }));

  // raised is monotonic: refunds never decrement it.
  await db
    .insert(stages)
    .values(stageStub(stage, { raised: amount, ...s }))
    .onConflictDoUpdate((row) => ({ raised: row.raised + amount, ...s }));

  await logStageEvent(db, {
    stage,
    type: "contributed",
    actor: backer,
    amount,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:Refunded", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const { backer, amount } = event.args;
  const s = stamp(event.block);

  await db
    .insert(contributions)
    .values({ stage, backer, contributed: amount, refunded: amount, claimable: 0n, ...s })
    .onConflictDoUpdate((row) => ({
      refunded: row.refunded + amount,
      claimable: row.contributed - row.refunded - amount,
      ...s,
    }));

  await logStageEvent(db, {
    stage,
    type: "refunded",
    actor: backer,
    amount,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:FundsClaimed", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const s = stamp(event.block);

  await db
    .insert(stages)
    .values(stageStub(stage, { claimed: true, ...s }))
    .onConflictDoUpdate(() => ({ claimed: true, ...s }));

  await logStageEvent(db, {
    stage,
    type: "claimed",
    actor: event.transaction.from,
    amount: event.args.amount,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:Cancelled", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const s = stamp(event.block);

  await db
    .insert(stages)
    .values(stageStub(stage, { cancelled: true, ...s }))
    .onConflictDoUpdate(() => ({ cancelled: true, ...s }));

  await logStageEvent(db, {
    stage,
    type: "cancelled",
    actor: event.transaction.from,
    reason: event.args.reason,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:EvidenceSubmitted", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const { uri, contentHash, evidenceRound } = event.args;
  const s = stamp(event.block);
  const patch = {
    evidenceURI: uri,
    evidenceHash: contentHash,
    submittedAt: s.updatedAt,
    reviewState: REVIEW_SUBMITTED,
    evidenceRound,
    approvalWeight: 0n,
    rejectionWeight: 0n,
    participationWeight: 0n,
    voterCount: 0n,
    ...s,
  };

  await db.insert(stages).values(stageStub(stage, patch)).onConflictDoUpdate(() => patch);

  await logStageEvent(db, {
    stage,
    type: "evidence",
    actor: event.transaction.from,
    uri,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:Reviewed", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const { approved, reason } = event.args;
  const s = stamp(event.block);

  const patch: Partial<(typeof stages)["$inferInsert"]> = {
    reviewState: approved ? REVIEW_APPROVED : REVIEW_CHANGES_REQUESTED,
    reviewReason: reason,
    ...s,
  };
  // The contract only writes rejectedAt on a rejection; never clear it.
  if (!approved) patch.rejectedAt = s.updatedAt;

  await db.insert(stages).values(stageStub(stage, patch)).onConflictDoUpdate(() => patch);

  if (approved) {
    // Belt and braces alongside Rung:ProjectVerified.
    const stageRow = await db.find(stages, { address: stage });
    if (stageRow && stageRow.projectId > 0n) {
      const project = await db.find(projects, { id: stageRow.projectId });
      if (project) {
        if (!project.verified) {
          await db.update(projects, { id: stageRow.projectId }).set({ verified: true, ...s });
        }
      } else {
        console.warn(`project ${stageRow.projectId} missing when stage ${stage} was approved`);
      }
    }
  }

  await logStageEvent(db, {
    stage,
    type: "reviewed",
    actor: event.transaction.from,
    reason,
    approved,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:VoteCast", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const { backer, approve, weight } = event.args;
  const s = stamp(event.block);
  const patch = approve
    ? { approvalWeight: weight, participationWeight: weight, voterCount: 1n, ...s }
    : { rejectionWeight: weight, participationWeight: weight, voterCount: 1n, ...s };

  await db.insert(stages).values(stageStub(stage, patch)).onConflictDoUpdate((row) => ({
    approvalWeight: row.approvalWeight + (approve ? weight : 0n),
    rejectionWeight: row.rejectionWeight + (approve ? 0n : weight),
    participationWeight: row.participationWeight + weight,
    voterCount: row.voterCount + 1n,
    ...s,
  }));

  await logStageEvent(db, {
    stage,
    type: "vote",
    actor: backer,
    amount: weight,
    approved: approve,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("StageEscrow:CommunityReviewFinalized", async ({ event, context }) => {
  const { db } = context;
  const stage = event.log.address;
  const { approved, quorumReached, approvalWeight, rejectionWeight, participationWeight, voterCount } = event.args;
  const s = stamp(event.block);
  const patch = { approvalWeight, rejectionWeight, participationWeight, voterCount, ...s };

  await db.insert(stages).values(stageStub(stage, patch)).onConflictDoUpdate(() => patch);

  await logStageEvent(db, {
    stage,
    type: "community_review_finalized",
    actor: event.transaction.from,
    amount: participationWeight,
    reason: quorumReached ? "Quorum reached." : "Quorum not reached.",
    approved,
    blockNumber: s.updatedAtBlock,
    timestamp: s.updatedAt,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

// ───────────────────────────── RetroRound ─────────────────────────────

ponder.on("RetroRound:Applied", async ({ event, context }) => {
  const { db } = context;
  const round = event.log.address;
  const { applicationId, projectId, recipient, uri, contentHash } = event.args;
  const s = stamp(event.block);
  const patch = {
    projectId,
    recipient,
    evidenceURI: uri,
    evidenceHash: contentHash,
    appliedAt: s.updatedAt,
    ...s,
  };

  await db
    .insert(applications)
    .values(applicationStub(round, applicationId, patch))
    .onConflictDoUpdate(() => patch);
});

ponder.on("RetroRound:AwardSet", async ({ event, context }) => {
  const { db } = context;
  const round = event.log.address;
  const { applicationId, amount, reason } = event.args;
  const s = stamp(event.block);

  const existing = await db.find(applications, { round, applicationId });
  const previousAward = existing?.award ?? 0n;

  await db
    .insert(applications)
    .values(applicationStub(round, applicationId, { award: amount, reason, ...s }))
    .onConflictDoUpdate(() => ({ award: amount, reason, ...s }));

  // allocated = allocated - previousAward + amount (last write wins per application).
  await db
    .insert(rounds)
    .values(roundStub(round, { allocated: amount, ...s }))
    .onConflictDoUpdate((row) => ({ allocated: row.allocated - previousAward + amount, ...s }));
});

ponder.on("RetroRound:Finalized", async ({ event, context }) => {
  const { db } = context;
  const round = event.log.address;
  const { allocated } = event.args;
  const s = stamp(event.block);
  const patch = { finalized: true, allocated, ...s };

  await db.insert(rounds).values(roundStub(round, patch)).onConflictDoUpdate(() => patch);
});

ponder.on("RetroRound:Cancelled", async ({ event, context }) => {
  const { db } = context;
  const round = event.log.address;
  const s = stamp(event.block);
  const patch = { cancelled: true, ...s };

  await db.insert(rounds).values(roundStub(round, patch)).onConflictDoUpdate(() => patch);
});

ponder.on("RetroRound:RemainderClaimed", async ({ event, context }) => {
  const { db } = context;
  const round = event.log.address;
  const s = stamp(event.block);
  const patch = { remainderClaimed: true, ...s };

  await db.insert(rounds).values(roundStub(round, patch)).onConflictDoUpdate(() => patch);
});

ponder.on("RetroRound:AwardClaimed", async ({ event, context }) => {
  const { db } = context;
  const round = event.log.address;
  const { applicationId } = event.args;
  const s = stamp(event.block);
  const patch = { claimed: true, ...s };

  await db
    .insert(applications)
    .values(applicationStub(round, applicationId, patch))
    .onConflictDoUpdate(() => patch);
});
