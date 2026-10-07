# Smart contract review

Review scope: current `Rung`, `StageEscrow`, and `RetroRound` sources, Foundry suite,
Bohr deployment script, and local reconciliation. This is an engineering review, not an
independent security audit.

## Role and lifecycle changes

- Removed protocol-wide reviewer and arbiter roles. The protocol admin only manages the
  shared ERC-20 allowlist and creation pause.
- Kept project ownership with its builder and rejected builder self-funding.
- Added one vote per backer per evidence submission, weighted by that backer's stage
  contribution. Approval requires at least half of raised value to participate and
  strictly more yes weight than no weight. Voting closes after seven days; anyone can
  finalize it. Missed quorum and ties request changes.
- Added a safe retry for a claimed but unapproved stage after its delivery deadline. A
  submitted vote must be finalized before the builder can retry; retries stay at the
  same stage number.
- Made each round creator its immutable owner and treasury, with one reviewer address
  fixed per round. The reviewer cannot apply to their own round.
- Kept exact received-balance checks for ERC-20 contributions and round funding.
- Added `nonReentrant` to vote finalization around the registry approval callback.
- Updated the app, ABIs, indexer read model, deployment input, and reconciliation-facing
  event model to match these roles and states.

## Validation

- Foundry: **28 tests passed**, including the 256-case refund-conservation fuzz test.
- Contract sizes (`forge build --sizes`): `Rung` 23,553 bytes (1,023 bytes below
  EIP-170); `StageEscrow` 8,034 bytes; `RetroRound` 6,252 bytes.
- Slither: **18 findings** across the expected classes documented in
  [`slither-triage.md`](slither-triage.md); the `finalizeReview` reentrancy finding was
  eliminated by adding the guard.
- Web production build completed, and all nine Playwright smoke routes passed.
- App and indexer TypeScript checks pass.
- Local Anvil: deployed the redesigned registry at
  `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6` (chain 31337, block 14). The full path
  created and funded a stage, claimed, submitted evidence, voted, finalized, verified
  the project, created a funded round, applied, awarded, claimed, and returned the
  remainder to the owner.
- Ponder indexed the resulting stage weights/state and round owner/reviewer/allocation.
  Reconciliation passed all eight chain/indexer checks.
- The app and indexer are running locally for browser testing.
- Bohr RPC reports chain ID `968`. No testnet transaction has been sent.

## Remaining risks

- The builder can claim a successful raise before delivering work or receiving community
  approval. Claimed funds are not clawed back; make this direct-funding rule clear to
  backers before they contribute.
- Contribution-weighted voting gives larger backers more decision weight. A quorum is
  based on raised value, not voter count. A low-turnout or tied decision requests
  changes; there is no appeal path in this version.
- The round reviewer is one address. Organizations can use a Safe for a panel, but the
  contract does not manage organization membership or detect conflicts across related
  wallets.
- Asset allowlisting remains trusted protocol governance. Exact-balance checks reject
  fee-on-transfer behavior but cannot protect against token freezing, rebasing,
  blacklisting, upgrades, or other unusual token behavior.
- `Rung` has 1,023 bytes of EIP-170 runtime headroom. Continue checking sizes before
  adding registry features.
- Slither and local tests are not a substitute for an independent audit or testnet
  exercise using separate wallets.
