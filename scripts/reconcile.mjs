#!/usr/bin/env node
/**
 * Reconciliation for the Rung indexer.
 *
 * Compares log-derived totals and the ponder read model against contract state
 * on BOT Chain or Bohr testnet. Financial truth stays on chain; this script is
 * the check that the indexed read model agrees with it.
 *
 * Env:
 *   RUNG_ADDRESS  deployed Rung registry (required; exits 0 when unset)
 *   RPC_URL       default https://rpc.bohr.life
 *   EXPECTED_CHAIN_ID expected chain id (defaults to 968)
 *   INDEXER_URL   ponder GraphQL endpoint, default http://localhost:42069/graphql
 *                 (set INDEXER_URL= to disable the indexer comparison)
 *   RUNG_DEPLOY_BLOCK  block to start scanning factory logs from (default 0)
 *
 * Exit code: 0 = all checks passed (or nothing deployed), 1 = at least one
 * check failed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";

// ── tiny env loader (.env.local wins over .env; real env vars win over both) ──
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const full = path.join(repoRoot, file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (value !== "") process.env[key] = value;
  }
}

const RPC_URL = process.env.RPC_URL || "https://rpc.bohr.life";
const EXPECTED_CHAIN_ID = Number.parseInt(process.env.EXPECTED_CHAIN_ID || "968", 10);
const RUNG_ADDRESS = process.env.RUNG_ADDRESS;
const INDEXER_URL =
  process.env.INDEXER_URL === undefined
    ? "http://localhost:42069/graphql"
    : process.env.INDEXER_URL;
const START_BLOCK = (() => {
  const parsed = Number.parseInt(process.env.RUNG_DEPLOY_BLOCK || "0", 10);
  return BigInt(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
})();

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ── ABIs ──
const rungAbi = parseAbi([
  "function projectCount() view returns (uint256)",
  "function roundCount() view returns (uint256)",
  "function rounds(uint256) view returns (address)",
  "function verified(uint256) view returns (bool)",
  "function getProject(uint256 id) view returns ((address builder, string name, string metadataURI, bytes32 metadataHash, address latestStage, uint256 stageNumber))",
]);

const stageEscrowAbi = parseAbi([
  "function raised() view returns (uint256)",
  "function claimed() view returns (bool)",
  "function cancelled() view returns (bool)",
  "function goal() view returns (uint256)",
  "function contributions(address) view returns (uint256)",
]);

const retroRoundAbi = parseAbi([
  "function budget() view returns (uint256)",
  "function allocated() view returns (uint256)",
  "function finalized() view returns (bool)",
  "function cancelled() view returns (bool)",
  "function remainderClaimed() view returns (bool)",
]);

const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const stageCreatedEvent = parseAbiItem(
  "event StageCreated(uint256 indexed projectId, uint256 indexed stageNumber, address indexed stage, address builder, address asset, uint256 goal, uint64 deadline)",
);
const roundCreatedEvent = parseAbiItem(
  "event RoundCreated(uint256 indexed roundId, address indexed round, address asset, uint256 budget)",
);
const contributedEvent = parseAbiItem(
  "event Contributed(address indexed backer, uint256 amount)",
);
const refundedEvent = parseAbiItem("event Refunded(address indexed backer, uint256 amount)");
const fundsClaimedEvent = parseAbiItem("event FundsClaimed(uint256 amount)");
const stageCancelledEvent = parseAbiItem("event Cancelled(string reason)");
const awardSetEvent = parseAbiItem(
  "event AwardSet(uint256 indexed applicationId, uint256 amount, string reason)",
);
const awardClaimedEvent = parseAbiItem(
  "event AwardClaimed(uint256 indexed applicationId, address indexed recipient, uint256 amount)",
);
const roundCancelledEvent = parseAbiItem("event Cancelled()");
const finalizedEvent = parseAbiItem("event Finalized(uint256 allocated)");
const remainderClaimedEvent = parseAbiItem("event RemainderClaimed(uint256 amount)");

// ── reporting ──
const rows = [];
let failureCount = 0;

const short = (value) =>
  typeof value === "string" && value.length > 14
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : String(value);

const record = ({ id, target, check, expected, actual, ok, note = "" }) => {
  if (!ok) failureCount += 1;
  rows.push({
    id,
    target: short(target),
    check,
    expected: String(expected),
    actual: String(actual),
    result: ok ? "PASS" : "FAIL",
    note,
  });
};

const checkEqual = ({ id, target, check, expected, actual, note }) =>
  record({
    id,
    target,
    check,
    expected,
    actual,
    ok: String(expected) === String(actual),
    note,
  });

const recordError = ({ id, target, check, error }) =>
  record({
    id,
    target,
    check,
    expected: "—",
    actual: `ERROR: ${error?.shortMessage || error?.message || error}`,
    ok: false,
  });

const recordSkip = ({ id, target, check, note }) =>
  rows.push({
    id,
    target: short(target),
    check,
    expected: "—",
    actual: "—",
    result: "SKIP",
    note,
  });

const printRows = () => {
  const headers = ["#", "TARGET", "CHECK", "EXPECTED", "ACTUAL", "RESULT", "NOTE"];
  const data = rows.map((row) => [
    row.id,
    row.target,
    row.check,
    row.expected,
    row.actual,
    row.result,
    row.note,
  ]);
  const widths = headers.map((header, i) =>
    Math.min(
      Math.max(header.length, ...data.map((line) => line[i].length)),
      i === 2 || i === 6 ? 54 : 24,
    ),
  );
  const clip = (cell, width) => {
    const value = String(cell);
    return value.length > width ? `${value.slice(0, width - 1)}…` : value;
  };
  const line = (cells) =>
    cells.map((cell, i) => clip(cell, widths[i]).padEnd(widths[i])).join("  ").trimEnd();
  console.log(line(headers));
  console.log(widths.map((width) => "─".repeat(width)).join("  "));
  for (const cells of data) console.log(line(cells));
};

// ── helpers ──
const client = createPublicClient({ transport: http(RPC_URL) });

const read = (address, abi, functionName, args) =>
  client.readContract({ address, abi, functionName, args });

/**
 * eth_getLogs over a range, chunked. Public RPCs commonly cap either the block
 * range or the result count, so the chunk shrinks on failure and only then
 * surfaces the error.
 */
const getLogs = async ({ address, event, fromBlock, toBlock }) => {
  const logs = [];
  let chunk = 200_000n;
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    try {
      const found = await client.getLogs({ address, event, fromBlock: start, toBlock: end });
      logs.push(...found);
      start = end + 1n;
    } catch (error) {
      if (chunk > 100n) {
        chunk = chunk / 2n > 100n ? chunk / 2n : 100n;
        continue;
      }
      throw error;
    }
  }
  return logs;
};

const balanceOf = async (asset, holder) =>
  asset.toLowerCase() === ZERO_ADDRESS
    ? client.getBalance({ address: holder })
    : read(asset, erc20Abi, "balanceOf", [holder]);

// ── indexer comparison ──
const queryIndexer = async (query) => {
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  return payload.data;
};

const compareWithIndexer = async ({ stageRows, projectRows }) => {
  const id = "IDX";
  if (!INDEXER_URL) {
    recordSkip({ id, target: "indexer", check: "indexed vs chain totals", note: "INDEXER_URL empty" });
    return;
  }
  let data;
  try {
    // Ponder 0.17 pluralizes by appending "s": the list query for `stages` is `stagess`.
    data = await queryIndexer(
      `{ stagess(limit: 1000) { totalCount items { address raised claimed } } ` +
        `projectss(limit: 1000) { totalCount items { id verified } } }`,
    );
  } catch (error) {
    recordSkip({
      id,
      target: "indexer",
      check: "indexed vs chain totals",
      note: `unreachable (${error.shortMessage || error.message})`,
    });
    return;
  }

  const indexedStages = new Map((data.stagess?.items ?? []).map((row) => [row.address, row]));
  const indexedProjects = new Map((data.projectss?.items ?? []).map((row) => [row.id, row]));

  if (indexedStages.size === 0 && indexedProjects.size === 0) {
    recordSkip({
      id,
      target: "indexer",
      check: "indexed vs chain totals",
      note: "reachable but empty (still backfilling?)",
    });
    return;
  }

  let mismatches = 0;
  const details = [];
  for (const stage of stageRows) {
    const row = indexedStages.get(stage.address.toLowerCase());
    if (!row) {
      mismatches += 1;
      details.push(`${short(stage.address)} missing`);
      continue;
    }
    if (BigInt(row.raised) !== stage.raised) {
      mismatches += 1;
      details.push(`${short(stage.address)} raised ${row.raised}≠${stage.raised}`);
    }
    if (Boolean(row.claimed) !== stage.claimed) {
      mismatches += 1;
      details.push(`${short(stage.address)} claimed ${row.claimed}≠${stage.claimed}`);
    }
  }
  for (const project of projectRows) {
    const row = indexedProjects.get(String(project.id));
    if (!row) {
      mismatches += 1;
      details.push(`project ${project.id} missing`);
      continue;
    }
    if (Boolean(row.verified) !== project.verified) {
      mismatches += 1;
      details.push(`project ${project.id} verified ${row.verified}≠${project.verified}`);
    }
  }

  record({
    id,
    target: "indexer",
    check: "indexed raised/claimed/verified == chain",
    expected: "0 mismatches",
    actual: `${mismatches} mismatches`,
    ok: mismatches === 0,
    note: details.slice(0, 3).join("; "),
  });
};

// ── main ──
const main = async () => {
  if (!RUNG_ADDRESS) {
    console.log(
      "RUNG_ADDRESS is not set — no deployed registry to reconcile against. Nothing to do (exit 0).",
    );
    process.exit(0);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(RUNG_ADDRESS)) {
    console.error(`RUNG_ADDRESS "${RUNG_ADDRESS}" is not a valid address.`);
    process.exit(1);
  }
  let actualChainId;
  try {
    actualChainId = await client.getChainId();
  } catch (error) {
    console.error(`Could not read chain id from ${RPC_URL}: ${error?.shortMessage || error?.message || error}`);
    process.exit(1);
  }
  if (actualChainId !== EXPECTED_CHAIN_ID) {
    console.error(
      `Wrong RPC network: ${RPC_URL} reports chain id ${actualChainId}; expected ${EXPECTED_CHAIN_ID}.`,
    );
    process.exit(1);
  }
  const rung = RUNG_ADDRESS.toLowerCase();

  let projectCount;
  let roundCount;
  try {
    [projectCount, roundCount] = await Promise.all([
      read(rung, rungAbi, "projectCount"),
      read(rung, rungAbi, "roundCount"),
    ]);
  } catch (error) {
    console.error(
      `Could not read projectCount()/roundCount() at ${rung} via ${RPC_URL}:\n  ${
        error?.shortMessage || error?.message || error
      }\nIs RUNG_ADDRESS deployed on this RPC?`,
    );
    process.exit(1);
  }

  if (projectCount === 0n && roundCount === 0n) {
    console.log("projectCount == 0 and roundCount == 0 — nothing deployed/indexed (exit 0).");
    process.exit(0);
  }

  console.log(
    `Reconciling Rung at ${rung} on ${RPC_URL} — ${projectCount} project(s), ${roundCount} round(s)\n`,
  );

  const latestBlock = await client.getBlockNumber();

  // ── factory logs: every stage and round ever created ──
  const stageLogs = await getLogs({
    address: rung,
    event: stageCreatedEvent,
    fromBlock: START_BLOCK,
    toBlock: latestBlock,
  });
  const roundLogs = await getLogs({
    address: rung,
    event: roundCreatedEvent,
    fromBlock: START_BLOCK,
    toBlock: latestBlock,
  });

  const stagesByProject = new Map();
  for (const log of stageLogs) {
    const { projectId } = log.args;
    const list = stagesByProject.get(projectId) ?? [];
    list.push(log);
    stagesByProject.set(projectId, list);
  }
  for (const list of stagesByProject.values()) {
    list.sort((a, b) =>
      a.args.stageNumber === b.args.stageNumber
        ? 0
        : a.args.stageNumber > b.args.stageNumber
          ? 1
          : -1,
    );
  }

  // ── per project: latestStage walk ──
  const projectRows = [];
  for (let id = 1n; id <= projectCount; id++) {
    const target = `project ${id}`;
    try {
      const onChain = await read(rung, rungAbi, "getProject", [id]);
      const verified = await read(rung, rungAbi, "verified", [id]);
      const list = stagesByProject.get(id) ?? [];
      const latestFromLogs = list.length ? list[list.length - 1].args.stage : ZERO_ADDRESS;

      checkEqual({
        id: `P${id}`,
        target,
        check: "getProject().latestStage == last StageCreated",
        expected: onChain.latestStage.toLowerCase(),
        actual: latestFromLogs.toLowerCase(),
      });
      if (list.length > 0) {
        checkEqual({
          id: `P${id}b`,
          target,
          check: "getProject().stageNumber == max StageCreated",
          expected: onChain.stageNumber,
          actual: list[list.length - 1].args.stageNumber,
        });
      } else if (START_BLOCK > 0n) {
        recordSkip({
          id: `P${id}b`,
          target,
          check: "stage walk",
          note: "no StageCreated logs from RUNG_DEPLOY_BLOCK",
        });
      }
      projectRows.push({ id, verified });
    } catch (error) {
      recordError({ id: `P${id}`, target, check: "getProject/verified read", error });
    }
  }

  // ── per stage: escrow invariants ──
  const stageRows = [];
  for (const log of stageLogs) {
    const { stage, asset, projectId } = log.args;
    const target = stage.toLowerCase();
    try {
      const from = log.blockNumber ?? START_BLOCK;
      const [contributedLogs, refundedLogs, claimedLogs, cancelledLogs, raised, claimed, cancelled] =
        await Promise.all([
          getLogs({ address: target, event: contributedEvent, fromBlock: from, toBlock: latestBlock }),
          getLogs({ address: target, event: refundedEvent, fromBlock: from, toBlock: latestBlock }),
          getLogs({ address: target, event: fundsClaimedEvent, fromBlock: from, toBlock: latestBlock }),
          getLogs({ address: target, event: stageCancelledEvent, fromBlock: from, toBlock: latestBlock }),
          read(target, stageEscrowAbi, "raised"),
          read(target, stageEscrowAbi, "claimed"),
          read(target, stageEscrowAbi, "cancelled"),
        ]);

      const sumContributed = contributedLogs.reduce((sum, entry) => sum + entry.args.amount, 0n);
      const sumRefunded = refundedLogs.reduce((sum, entry) => sum + entry.args.amount, 0n);
      const balance = await balanceOf(asset, target);
      const expectedBalance = claimed ? 0n : raised - sumRefunded;

      checkEqual({
        id: `S1-${short(target)}`,
        target,
        check: "1. sum(Contributed) == raised()",
        expected: raised,
        actual: sumContributed,
      });
      checkEqual({
        id: `S2-${short(target)}`,
        target,
        check: "2. balance == raised - refunded - claimed",
        expected: expectedBalance,
        actual: balance,
        note: claimed ? "claimed" : "refundable",
      });
      checkEqual({
        id: `S3a-${short(target)}`,
        target,
        check: "3a. claimed() == FundsClaimed log",
        expected: claimedLogs.length > 0,
        actual: claimed,
      });
      checkEqual({
        id: `S3b-${short(target)}`,
        target,
        check: "3b. cancelled() == Cancelled log",
        expected: cancelledLogs.length > 0,
        actual: cancelled,
      });

      const backers = new Set([
        ...contributedLogs.map((entry) => entry.args.backer.toLowerCase()),
        ...refundedLogs.map((entry) => entry.args.backer.toLowerCase()),
      ]);
      let badBackers = 0;
      const badExamples = [];
      for (const backer of backers) {
        const contributed = contributedLogs
          .filter((entry) => entry.args.backer.toLowerCase() === backer)
          .reduce((sum, entry) => sum + entry.args.amount, 0n);
        const refunded = refundedLogs
          .filter((entry) => entry.args.backer.toLowerCase() === backer)
          .reduce((sum, entry) => sum + entry.args.amount, 0n);
        const outstanding = contributed - refunded;
        const onChain = await read(target, stageEscrowAbi, "contributions", [backer]);
        if (outstanding !== onChain) {
          badBackers += 1;
          if (badExamples.length < 3) {
            badExamples.push(`${short(backer)} ${outstanding}≠${onChain}`);
          }
        }
      }
      record({
        id: `S4-${short(target)}`,
        target,
        check: "4. per-backer contributed-refunded == 0 or contributions()",
        expected: "0 mismatches",
        actual: `${badBackers} mismatches`,
        ok: badBackers === 0,
        note: badExamples.join("; "),
      });

      stageRows.push({
        address: target,
        projectId,
        raised,
        claimed,
        cancelled,
        asset,
        sumContributed,
        sumRefunded,
        balance,
      });
    } catch (error) {
      recordError({ id: `S-${short(target)}`, target, check: "stage reads/logs", error });
    }
  }

  // ── per round: award ledger + balance invariants ──
  for (const log of roundLogs) {
    const { round, asset } = log.args;
    const target = round.toLowerCase();
    try {
      const from = log.blockNumber ?? START_BLOCK;
      const [
        awardSetLogs,
        awardClaimedLogs,
        finalizedLogs,
        cancelledLogs,
        remainderLogs,
        budget,
        allocated,
        finalized,
        cancelled,
        remainderClaimed,
      ] = await Promise.all([
        getLogs({ address: target, event: awardSetEvent, fromBlock: from, toBlock: latestBlock }),
        getLogs({ address: target, event: awardClaimedEvent, fromBlock: from, toBlock: latestBlock }),
        getLogs({ address: target, event: finalizedEvent, fromBlock: from, toBlock: latestBlock }),
        getLogs({ address: target, event: roundCancelledEvent, fromBlock: from, toBlock: latestBlock }),
        getLogs({ address: target, event: remainderClaimedEvent, fromBlock: from, toBlock: latestBlock }),
        read(target, retroRoundAbi, "budget"),
        read(target, retroRoundAbi, "allocated"),
        read(target, retroRoundAbi, "finalized"),
        read(target, retroRoundAbi, "cancelled"),
        read(target, retroRoundAbi, "remainderClaimed"),
      ]);

      // Last AwardSet write wins per applicationId.
      const finalAwards = new Map();
      for (const entry of awardSetLogs) {
        finalAwards.set(entry.args.applicationId, entry.args.amount);
      }
      const sumAwards = [...finalAwards.values()].reduce((sum, amount) => sum + amount, 0n);
      const sumClaimed = awardClaimedLogs.reduce((sum, entry) => sum + entry.args.amount, 0n);
      const balance = await balanceOf(asset, target);
      const remainder = cancelled ? budget : budget - allocated;
      const expectedBalance = budget - sumClaimed - (remainderClaimed ? remainder : 0n);

      checkEqual({
        id: `R1-${short(target)}`,
        target,
        check: "5a. allocated() == last AwardSet per application",
        expected: allocated,
        actual: sumAwards,
      });
      checkEqual({
        id: `R2-${short(target)}`,
        target,
        check: "5b. balance == budget - claimed - remainder",
        expected: expectedBalance,
        actual: balance,
        note: remainderClaimed ? "remainder claimed" : "remainder pending",
      });
      if (finalizedLogs.length > 0) {
        checkEqual({
          id: `R3-${short(target)}`,
          target,
          check: "Finalized(allocated) == allocated()",
          expected: allocated,
          actual: finalizedLogs[finalizedLogs.length - 1].args.allocated,
        });
      }
      checkEqual({
        id: `R4-${short(target)}`,
        target,
        check: "cancelled() == Cancelled log",
        expected: cancelledLogs.length > 0,
        actual: cancelled,
      });
      checkEqual({
        id: `R5-${short(target)}`,
        target,
        check: "finalized() == Finalized log",
        expected: finalizedLogs.length > 0,
        actual: finalized,
      });
      checkEqual({
        id: `R6-${short(target)}`,
        target,
        check: "remainderClaimed() == RemainderClaimed log",
        expected: remainderLogs.length > 0,
        actual: remainderClaimed,
      });
    } catch (error) {
      recordError({ id: `R-${short(target)}`, target, check: "round reads/logs", error });
    }
  }

  // ── indexer read model vs chain ──
  await compareWithIndexer({ stageRows, projectRows });

  printRows();
  const passed = rows.filter((row) => row.result === "PASS").length;
  const skipped = rows.filter((row) => row.result === "SKIP").length;
  console.log(
    `\n${rows.length} checks — ${passed} passed, ${failureCount} failed, ${skipped} skipped`,
  );
  process.exit(failureCount > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
