# Indexer (Chunk 4 — indexing and project discovery)

Ponder 0.17.12 indexer for the Rung protocol on BOT Chain mainnet (677) or Bohr
testnet (968). It
turns contract events into the read model the app queries (project pages, stage
progress, contribution totals, retro-round status) and ships a reconciliation
script that checks those totals against contract state.

Financial truth stays on chain: these tables are a cache that must reconcile,
never a second ledger.

## What's in here

| File | Purpose |
| --- | --- |
| `ponder.config.ts` | Chain selected by `PONDER_CHAIN_ID` (default 968), matching `PONDER_RPC_URL_<chain id>`, `Rung` address, and factory-created escrows/rounds |
| `ponder.schema.ts` | Chain-derived tables: `projects`, `stages`, `contributions`, `stage_events`, `rounds`, `applications`, `assets`, `registry_state` |
| `src/index.ts` | Event handlers for project/stage creation, contributions, refunds, claims, community votes, round lifecycle, applications, awards, pause, and asset allowlisting |
| `src/lib.ts` | Shared column types, zero-address defaults, event id helper |
| `src/api/index.ts` | Required API file: mounts GraphQL on the HTTP server |
| `ponder-env.d.ts` | Generated types (`pnpx ponder codegen --root indexer`) — regenerate after schema changes |
| `tsconfig.json` | `npx tsc --noEmit -p indexer` typechecks the whole indexer |
| `supabase/migrations/` | Row-level security for writable application data |

## Running

```bash
cp .env.example .env.local      # then fill in RUNG_ADDRESS / RUNG_DEPLOY_BLOCK
pnpm indexer                    # ponder dev --root indexer
```

Ponder reads **`.env.local` in the repo root** (only that file — not `.env`).
It binds `http://localhost:42069` and shows indexing progress in the terminal.

| Variable | Meaning |
| --- | --- |
| `RUNG_ADDRESS` | Deployed `Rung` registry. If unset, the indexer still boots and indexes nothing (placeholders everywhere), so the dev server works before a deployment. |
| `RUNG_DEPLOY_BLOCK` | Block the `Rung` registry was deployed at. **Must be exact**: too low and the backfill scans the whole chain from genesis; too high and factory events before it are never seen. `0` (the default) is safe but slow. |
| `PONDER_CHAIN_ID` | Chain id, defaults to Bohr testnet `968`; set `677` for BOT Chain mainnet |
| `PONDER_RPC_URL_968` / `PONDER_RPC_URL_677` | RPC endpoint for the selected chain; defaults to the official Bohr or mainnet RPC |
| `DATABASE_URL` | Optional. Set it to use a server Postgres; unset, ponder uses its local PGlite in `indexer/.ponder/` (gitignored) |
| `INDEXER_URL` | GraphQL endpoint used by app discovery and `scripts/reconcile.mjs`; not used by the indexer process itself |

Production: `pnpm indexer:start` (`ponder start --root indexer`).

## GraphQL

When `INDEXER_URL` is set in the web app environment, project and round discovery
uses this API to find project ids and round addresses. The app then reads current
project, escrow, and award state from the contracts over RPC; the indexer remains
a discovery read model rather than a financial authority. If the endpoint is
unset or unavailable, discovery falls back to direct registry reads.

```bash
curl -N -X POST http://localhost:42069/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ stagess(limit: 10) { totalCount items { address raised claimed } } }"}'
```

**Ponder 0.17 pluralization quirk:** the singular by-id query is the table name
itself, and the list query appends an `s`. `stages` therefore has both
`stages(address: String)` and `stagess(...)`, `projects` has `projects(id:)`
and `projectss(...)`, and so on:

| Table | by-id query | list query |
| --- | --- | --- |
| `projects` | `projects(id: BigInt)` | `projectss` |
| `stages` | `stages(address: String)` | `stagess` |
| `contributions` | `contributions(stage: String, backer: String)` | `contributionss` |
| `stage_events` | `stageEvents(id: String)` | `stageEventss` |
| `rounds` | `rounds(address: String)` | `roundss` |
| `applications` | `applications(round: String, applicationId: BigInt)` | `applicationss` |
| `assets` | `assets(address: String)` | `assetss` |
| `registry_state` | `registryState(id: Int)` | `registryStates` |

List queries return `{ totalCount, items, pageInfo }`. Numeric values (`bigint`
columns such as `raised`, `goal`, `budget`) are returned as JSON strings, so
parse them with `BigInt(...)`.

HTTP endpoints: `/` (info), `/status`, `/health` (200 when live), `/ready`
(200 only once the backfill is done), `/graphql`.

## Reconciliation

```bash
node scripts/reconcile.mjs      # or: pnpm reconcile, if that script is wired up
```

Exit code 0 means every check passed (or there is nothing deployed yet); 1 means
at least one check failed. It:

1. walks `StageCreated`/`RoundCreated` logs and rebuilds the escrow/round ledger
   with chunked `eth_getLogs` (the chunk shrinks automatically when the RPC caps
   a range);
2. checks the invariants from the contract spec — `sum(Contributed) == raised`,
   `balance == raised - refunded - claimed`, `claimed()`/`cancelled()` agree with
   their events, per-backer `contributed - refunded` equals `contributions()`,
   `allocated() == sum of last AwardSet per application`, and
   `balance == budget - claimed - remainder`;
3. compares `raised`, `claimed` and `verified` with the indexer's GraphQL read
   model and reports any mismatch.

Env: `RUNG_ADDRESS` (required), `RPC_URL` (default `https://rpc.botchain.ai`),
`INDEXER_URL` (default `http://localhost:42069/graphql`, empty string disables
the comparison), `RUNG_DEPLOY_BLOCK`. `.env`/`.env.local` in the repo root are
read too.

## Supabase / row-level security

`supabase/migrations/00000000000000000000_rls.sql` separates the two kinds of
data the schema mentions:

- **chain-derived read model** (ponder's tables) — readable by `anon` and
  `authenticated`, never writable by them (or by `service_role`), because only
  the indexer writes them;
- **writable application data** — `drafts` (offchain campaign drafts, owned by
  one wallet) and `metadata_cache` (shared IPFS metadata). These are the only
  client-writable tables, and both have RLS enabled. Draft ownership comes from
  `app.current_wallet()`, which reads the wallet out of the Supabase Auth JWT
  (`wallet`/`wallet_address` claim, falling back to `sub`); unauthenticated
  requests get `NULL`, so every policy fails closed.
- `stage_read_model` — a `security_invoker` view over `public.stages`, for app
  code that reads the read model over SQL.

The chain-derived tables are created the first time `pnpm indexer` boots, which
may be after the migration runs. Every statement that touches them is guarded
and prints a `NOTICE` instead of failing, so **boot the indexer once and then
apply the migration** (or re-apply it) to pick up the grants and the view.

## Notes

- Schema and indexing live under `indexer/`; the app reads the data through
  GraphQL or (for the Supabase tables) Postgres. Nothing here writes to chain.
- Running `pnpm indexer` from the repo root makes ponder drop a generated
  `generated/schema.graphql` **at the repo root** (outside `indexer/`). It is
  purely a copy of the schema for tooling; delete it if you don't want it
  untracked.
- Metadata columns mirror the contracts: `metadataURI`, `evidenceURI`,
  `termsURI`, `rulesURI` are the URIs the contracts emit; the matching
  `*Hash` columns are the content hashes recorded onchain. In Postgres those
  columns are snake_case (`metadata_uri`); ponder's GraphQL exposes them in
  camelCase (`metadataURI`).
