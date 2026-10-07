#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  had_admin=0
  had_key=0
  had_rpc=0
  [[ -v RUNG_ADMIN ]] && { had_admin=1; admin_override="$RUNG_ADMIN"; }
  [[ -v RUNG_PRIVATE_KEY ]] && { had_key=1; key_override="$RUNG_PRIVATE_KEY"; }
  [[ -v RUNG_RPC_URL ]] && { had_rpc=1; rpc_override="$RUNG_RPC_URL"; }
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  (( had_admin == 0 )) || RUNG_ADMIN="$admin_override"
  (( had_key == 0 )) || RUNG_PRIVATE_KEY="$key_override"
  (( had_rpc == 0 )) || RUNG_RPC_URL="$rpc_override"
fi

RUNG_RPC_URL="${RUNG_RPC_URL:-https://rpc.bohr.life}"

if [[ -z "${RUNG_PRIVATE_KEY:-}" ]]; then
  printf '%s\n' 'RUNG_PRIVATE_KEY is empty. Add the deploy wallet key to ignored .env.' >&2
  exit 1
fi
if [[ ! "$RUNG_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  printf '%s\n' 'RUNG_PRIVATE_KEY must be a 0x-prefixed 32-byte EVM key.' >&2
  exit 1
fi
if [[ ! "${RUNG_ADMIN:-}" =~ ^0x[0-9a-fA-F]{40}$ || "${RUNG_ADMIN,,}" == "0x0000000000000000000000000000000000000000" ]]; then
  printf '%s\n' 'RUNG_ADMIN must be a nonzero EVM address.' >&2
  exit 1
fi

actual_chain_id="$(cast chain-id --rpc-url "$RUNG_RPC_URL")"
if [[ "$actual_chain_id" != "968" ]]; then
  printf 'Refusing to deploy: RPC reports chain %s; expected Bohr testnet (968).\n' "$actual_chain_id" >&2
  exit 1
fi

printf '%s\n' 'Deploying Rung to Bohr testnet (chain 968)…'
# Deploy.s.sol reads the signing key from the process environment; it is not placed
# in Forge's command-line arguments. The Solidity script repeats the chain guard.
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url "$RUNG_RPC_URL" \
  --broadcast \
  --slow \
  --non-interactive
