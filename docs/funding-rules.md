# BOT Chain Funding Rules

These rules describe the current contract and app interfaces. The protocol admin,
project builder, stage backers, round owner, and round reviewer have separate scopes.
The protocol admin is not a project or round reviewer.

## 1. Assets and shared controls

- Native BOT (`address(0)`) is enabled at deployment.
- The protocol admin can allowlist ERC-20 assets with code and pause creation.
- Fee-on-transfer tokens are rejected by exact received-balance checks for stage
  contributions and round funding.
- There is no protocol fee. The builder receives the full successful stage raise; the
  round owner receives any unallocated round budget.
- A creation pause blocks new projects, stages, and rounds. It never blocks refunds,
  claims, voting, or round exits.

## 2. Project and stage lifecycle

| State/action | Authorized actor | Rule |
|---|---|---|
| Create project | Any wallet | Creation must not be paused; builder becomes permanent project owner |
| Open stage | Project builder | Asset allowlisted, goal > 0; funding deadline 1–90 days out; delivery deadline after funding and no more than 365 days later |
| Contribute | Any non-builder backer | Before funding deadline; capped at the goal; native value or exact ERC-20 amount required |
| Claim raise | Builder | Stage fully funded; before delivery deadline; one time |
| Submit evidence | Builder | After claim and by delivery deadline; from `None` or `ChangesRequested` |
| Vote | Stage backer | Once per evidence submission, within 7 days; weight equals the backer's total contribution to this stage |
| Finalize vote | Anyone | After the 7-day window closes |
| Cancel stage | Builder | Before funds are claimed; a written reason makes all contributions refundable |
| Refund | Each backer | Stage cancelled, under goal at funding deadline, or unclaimed after delivery deadline |

The builder cannot contribute to their own stage. Voting weight is not transferable.
Votes are reset when revised evidence is submitted.

### Community decision rule

Approval requires total participation of at least half the amount raised and strictly
more yes weight than no weight. Exactly half of raised value satisfies quorum. A tie,
or turnout below quorum, records `ChangesRequested`. The builder may submit revised
evidence by the delivery deadline for a fresh seven-day vote. No appeal or arbiter
function exists in this version.

Approval marks the project verified and allows the builder to advance to the next stage
number. A refundable failed raise can be retried at the same stage number. If a builder
claimed funds but did not obtain approval, a new attempt at the same stage number becomes
available after the delivery deadline, once any submitted community vote has been
finalized. The old raise is not refundable after claim.

### Important funding limitation

The builder can claim a successful raise before submitting evidence and before community
approval. After claim, backers cannot recover funds through the escrow. The vote records
whether the published deliverable was accepted, but it does not claw back funds. This is
direct crowdfunding and should be communicated clearly before a backer contributes.

## 3. Retro rounds

- Any wallet or Safe can create and fully fund a round; the creator becomes the immutable
  `roundOwner` and `treasury`.
- The creator selects a separate reviewer address for that round. A Safe can represent
  an organization panel. The reviewer is fixed for the life of the round and cannot apply
  to that same round.
- Applications are open until the application deadline. Only the builder of a verified
  project may apply; one application per project per round.
- The reviewer sets awards with a written reason between the application and decision
  deadlines. The sum cannot exceed the escrowed budget. Only the reviewer can finalize.
- After finalization, each selected builder can claim their own award. The round owner can
  claim the unallocated balance.
- If no reviewer finalizes by the decision deadline, anyone can expire the round; the
  round owner can then claim the full budget.
- No ownership transfer or creator-controlled cancellation function exists after round
  creation in this version.

## 4. Stage state values

| Value | State |
|---:|---|
| 0 | None |
| 1 | Evidence submitted; community vote open or awaiting finalization |
| 2 | Changes requested; builder may resubmit before delivery deadline |
| 3 | Community approved |

Onchain contract state is authoritative. The app and Ponder indexer are read models and
must be reconciled against contract events and balances.
