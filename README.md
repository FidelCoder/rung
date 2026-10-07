# Rung — staged crowdfunding on BOT Chain

Rung helps builders raise funds one deliverable at a time, document what shipped, and
qualify for organization-funded retro rounds.

**Product model:** builders own their projects; the backers who funded a stage vote on
its evidence; each organization creates and funds its own retro round, owns that round,
and selects its reviewer. The protocol admin only manages shared safety settings.
Details and the role-flow diagram are in [`docs/architecture.md`](docs/architecture.md).

## Architecture

| Layer | Responsibility |
|---|---|
| `contracts/` | `Rung` registry/factories, isolated `StageEscrow`, organization-owned `RetroRound`; all funds and authorization stay onchain |
| `src/` | Next.js 16 / React 19 web app; wagmi/viem wallet reads and writes |
| `indexer/` | Ponder chain-derived project, stage, contribution, vote, round, and application read models plus GraphQL |
| `scripts/reconcile.mjs` | Rebuilds event ledgers and compares them with contract state and optional indexer data |
| `src/app/api/metadata/` | Validates and stores project/stage/round metadata; records URI and content hash onchain |

The indexer is a discovery cache, not a financial authority. Reconcile it against the
contracts. Funding and review rules are described in
[`docs/funding-rules.md`](docs/funding-rules.md).

## Quick start

Use Node.js **24.21.0** (the version in `.nvmrc`) and pnpm **12.10.1** (the
`packageManager` pin) for local development and CI. Use Foundry **1.8.5** for contract
commands (`foundryup --install v1.8.5`); CI pins the same release.

```bash
nvm install
nvm use
pnpm install
cp .env.example .env.local
pnpm contracts
pnpm typecheck
pnpm dev
```

Without `NEXT_PUBLIC_RUNG_ADDRESS`, the app runs with sample data and disables wallet
transactions. Project drafts are saved in browser `localStorage`.

## Local contract deployment

Run Anvil (`anvil --chain-id 31337`), set `ANVIL_TEST_KEY` and `ANVIL_ADMIN_ADDRESS`
from a disposable Anvil account, deploy the registry with that account as protocol
admin, and configure the app with `NEXT_PUBLIC_CHAIN_ID=31337`,
`NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`, and the deployed
`NEXT_PUBLIC_RUNG_ADDRESS`. For example:

```bash
forge create contracts/Rung.sol:Rung \
  --rpc-url http://127.0.0.1:8545 \
  --private-key "$ANVIL_TEST_KEY" \
  --broadcast \
  --constructor-args "$ANVIL_ADMIN_ADDRESS"
```

Use only Anvil's disposable development key for this local command. Then run
`bash scripts/e2e-seed.sh` to exercise project funding, community vote finalization,
and organization retrofunding against the local registry.

## Checks

```bash
pnpm test:contracts
forge build --sizes
pnpm typecheck
pnpm indexer:check
pnpm build
pnpm test:web
```

`pnpm test:web` starts the production build on `http://localhost:3111` by default; set
`BASE_URL` to point it at an existing server. The detailed remaining local and testnet
gates are in [`docs/release-readiness.md`](docs/release-readiness.md).

## Bohr testnet

The testnet deploy helper expects `RUNG_ADMIN` and `RUNG_PRIVATE_KEY` in local ignored
`.env`, checks that the RPC reports chain ID 968, and has a matching Solidity chain
guard. Complete local validation before running it. The local key has not been supplied,
so no testnet transaction has been sent. See
[`docs/testnet-deployment.md`](docs/testnet-deployment.md) for environment setup, faucet
steps, and post-deployment validation.

Supabase is optional: Ponder uses local PGlite unless `DATABASE_URL` is set, and the app
does not currently require Supabase API keys.

## Environment variables

See [`.env.example`](.env.example) for the full list. Common settings:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` | Web wallet network and RPC |
| `NEXT_PUBLIC_RUNG_ADDRESS` / `NEXT_PUBLIC_RUNG_DEPLOY_BLOCK` | Deployed registry and history scan start |
| `RUNG_ADMIN` | Protocol admin set at registry deployment |
| `RUNG_RPC_URL` / `RUNG_PRIVATE_KEY` | Testnet deploy RPC and local-only signing key |
| `PONDER_CHAIN_ID` / `PONDER_RPC_URL_968` / `RUNG_ADDRESS` / `RUNG_DEPLOY_BLOCK` | Indexer target |
| `INDEXER_URL` | Optional GraphQL endpoint for app discovery and reconciliation |
| `RPC_URL` / `EXPECTED_CHAIN_ID` | Reconciliation network |
| `PINNING_ENDPOINT` / `PINNING_TOKEN` | Durable metadata pinning for hosted production; local testing can opt into file-backed metadata with `ALLOW_LOCAL_METADATA=true` and a localhost app URL |
| `DATABASE_URL` | Optional hosted Ponder Postgres database |

## Routes

- `/` — project discovery and retro rounds
- `/new` — create a builder-owned project
- `/project/[id]` — stage details, funding, refunds, activity, and community vote state
- `/workspace` — manage project stages, claim funds, cancel, and submit evidence
- `/review` — backer votes and permissionless vote finalization
- `/admin` — protocol admin asset allowlist and creation pause
- `/rounds` and `/rounds/[address]` — create/fund organization rounds, apply, review awards, and claim
- `/api/metadata` — validated project and stage metadata
- `/api/projects` — project read model

## Security notes

- Contracts are non-upgradeable. Each stage and round escrows one asset.
- ERC-20 transfers use exact balance-delta checks; fee-on-transfer tokens revert.
- `Ownable2Step` protects protocol admin transfer; pause blocks creation only.
- Backers vote with the amount they contributed. Approval needs at least half of raised
  value to participate and more yes weight than no weight. Anyone can finalize after
  seven days.
- Builders claim successful raises before milestone review; funds cannot be clawed back
  after claim. This direct-funding limitation is shown in the funding rules.
- Retro budgets are fully escrowed at creation. A round's reviewer is scoped to that
  round, and a reviewer cannot apply to their own round.
- Static analysis findings are tracked in [`docs/slither-triage.md`](docs/slither-triage.md).
  Contract review notes and release gates are in [`docs/contracts-review.md`](docs/contracts-review.md)
  and [`docs/release-readiness.md`](docs/release-readiness.md).
