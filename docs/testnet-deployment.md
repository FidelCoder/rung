# Bohr testnet deployment

## Deployment status

Rung is deployed to **Bohr Testnet (chain ID `968`)** and the app and indexer are
configured to use it.

| Field | Verified value |
|---|---|
| Registry | `0xfebe42def37948148a3ba34fdce2df5928a7dc24` |
| Deployment transaction | `0xfcbda02a9be6ef6f607497ff72ecd2fdcc8173417491a31752be9a2f862df579` |
| Deployment block | `26029376` |
| RPC | `https://rpc.bohr.life` |
| Explorer | [Bohr Scan](https://scan.bohr.life/address/0xfebe42def37948148a3ba34fdce2df5928a7dc24) |

Read-only checks confirmed deployed bytecode, the configured admin as owner, native BOT
enabled, and project creation unpaused. The registry currently has zero projects; this is
an empty test deployment, ready for the first test project. Do not redeploy to this
network unless intentionally starting a new registry.

The deployment key is stored only in ignored local `.env`. Keep it out of chat, source
control, `NEXT_PUBLIC_` variables, and command-line arguments. The deploy helper validates
the key format, nonzero admin, and RPC chain ID before broadcasting.

### Local services

The Next.js app is served at `http://localhost:3000`, and Ponder GraphQL is served at
`http://localhost:42069/graphql`. Ponder is using local PGlite because hosted `DATABASE_URL`
is optional. The app, indexer, and reconciliation environment point to the same registry
and deployment block. `INDEXER_URL` targets the local GraphQL endpoint.

For local testnet publishing, `ALLOW_LOCAL_METADATA=true` enables file-backed metadata
in `.data/metadata` while `NEXT_PUBLIC_APP_URL` uses localhost. These links work from this
machine only. Hosted deployments must configure `PINNING_ENDPOINT` for durable metadata;
the local override is rejected when the app origin is not a loopback address.

## Bohr testnet and faucet

Bohr testnet uses chain ID `968`, RPC `https://rpc.bohr.life`, and explorer
`https://scan.bohr.life`. To get test funds, use the [BOT Chain faucet](https://faucet.botchain.ai/en/basic):

1. Open the faucet and enter the **public address** derived from the dedicated deploy
   wallet. Never enter its private key.
2. Complete the faucet's verification and claim flow.
3. Check the tBOT balance and transaction on the [Bohr explorer](https://scan.bohr.life/).
4. Repeat for separate test wallets that will act as builders, backers, round owners,
   and round reviewers.

Faucet limits and claim requirements can change; follow the current instructions linked
from the faucet page.

## Environment

The deployment helper reads these values from ignored local `.env`:

| Variable | Purpose |
|---|---|
| `RUNG_RPC_URL` | Bohr RPC; defaults to `https://rpc.bohr.life` |
| `RUNG_PRIVATE_KEY` | Dedicated deployment wallet key; `0x` plus 64 hex characters |
| `RUNG_ADMIN` | Protocol admin address for shared asset allowlisting and creation pause |
| `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` | Web app network, set to `968` / Bohr RPC |
| `NEXT_PUBLIC_RUNG_ADDRESS` / `NEXT_PUBLIC_RUNG_DEPLOY_BLOCK` | Registry address and exact deploy block for the web app |
| `PONDER_CHAIN_ID` / `PONDER_RPC_URL_968` / `RUNG_ADDRESS` / `RUNG_DEPLOY_BLOCK` | Indexer target and exact backfill start |
| `RPC_URL` / `EXPECTED_CHAIN_ID` | Reconciliation target, set to Bohr / `968` |
| `PINNING_ENDPOINT` / `PINNING_TOKEN` | Optional durable production metadata pinning |

Supabase is not required. Ponder uses local PGlite unless `DATABASE_URL` is configured,
and the web app currently does not initialize a Supabase client. For hosted persistent
indexing, create a Supabase project and use its database URI as server-side
`DATABASE_URL`; do not place database credentials in client variables.

## Next validation steps

1. Verify the contract source and constructor argument on the Bohr explorer.
2. Create a small test project, fund a stage, approve evidence, and reconcile contract,
   indexer, and app state using separate test wallets.
3. Record verified project and transaction details before inviting external testers.
