# Release readiness and remaining tasks

## Implemented and locally validated

The contracts, app, and indexer implement [`architecture.md`](architecture.md): builders
own projects, stage backers vote on their stage, and each round creator owns and funds
their round with a round-specific reviewer. The protocol admin has only shared safety
controls.

- [x] Removed global reviewer and arbiter controls.
- [x] Added weighted backer votes, a seven-day voting window, quorum and approval rules,
  permissionless finalization, and revised-evidence voting.
- [x] Added a same-stage retry after a claimed, unapproved stage expires, and blocked a
  round reviewer from applying to their own round.
- [x] Updated the contract tests, generated ABIs, app, Ponder schema/handlers, deploy
  configuration, funding rules, and architecture flow.
- [x] `pnpm test:contracts`: 28 passed, including the 256-case fuzz test.
- [x] `forge build --sizes`: Rung 23,553 bytes (1,023 bytes below EIP-170).
- [x] `pnpm typecheck`, `pnpm indexer:check`, and `pnpm build` passed.
- [x] `pnpm test:web`: all nine routes passed in preview mode and against the local
  deployment.
- [x] Local Anvil E2E completed the project, stage, backer vote, verified-project,
  round creation, application, award, claim, and remainder path.
- [x] Ponder indexed the local project, stage vote, and round fields; reconciliation
  passed all eight checks.
- [x] Slither completed with 18 findings; each finding is dispositioned in
  [`slither-triage.md`](slither-triage.md). The review-finalization reentrancy warning
  was resolved with a guard.
- [x] The Bohr helper rejected a local chain ID of 31337 before broadcast.

The local app is running at `http://localhost:3000`, Ponder GraphQL at
`http://localhost:42069/graphql`, and the test registry on Anvil is
`0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6` (chain 31337, deploy block 14). These
local addresses and network settings are in ignored `.env.local`.

## Remaining before Bohr testnet

- [ ] Set a nonzero `RUNG_ADMIN` in ignored `.env`.
- [ ] Add a dedicated deploy wallet key to ignored `.env` as `RUNG_PRIVATE_KEY` and fund
  its public address with Bohr faucet tBOT.
- [ ] Run `bash scripts/deploy-testnet.sh`; the shell and Solidity checks require chain
  ID 968.
- [ ] Record the registry address and exact deploy block, verify deployment/admin on the
  Bohr explorer, then configure the app, Ponder, and reconciliation.
- [ ] Exercise round-owner, builder, backer, and round-reviewer flows with separate
  test wallets; reconcile indexed values.

The local `.env` currently has no `RUNG_ADMIN` and no deploy key, so no Bohr transaction
has been sent. The contract review in [`contracts-review.md`](contracts-review.md) is an
engineering review, not an independent audit. Arrange an independent review before any
deployment that will handle meaningful value. Supabase is optional; the current app does
not need Supabase API credentials.
