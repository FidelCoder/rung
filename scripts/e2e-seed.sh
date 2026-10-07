#!/usr/bin/env bash
# Local E2E seed: builder → backer community vote → organization retro round.
set -euo pipefail

if [[ -f .env.local ]]; then
  saved_rpc="${RPC:-}"
  saved_rung="${RUNG:-}"
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
  [[ -z "$saved_rpc" ]] || RPC="$saved_rpc"
  [[ -z "$saved_rung" ]] || RUNG="$saved_rung"
fi

RPC="${RPC:-http://127.0.0.1:8545}"
RUNG="${RUNG:-${NEXT_PUBLIC_RUNG_ADDRESS:-${RUNG_ADDRESS:-0x5fbdb2315678afecb367f032d93f642f64180aa3}}}"
BUILDER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
REVIEWER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
BACKER_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
HASH="$(cast keccak "rung-local-e2e")"

if [[ -z "${PROJECT_URI:-}" || -z "${TERMS_URI:-}" ]]; then
  eval "$(node scripts/e2e-metadata.mjs)"
fi

now() { cast block latest --rpc-url "$RPC" --json | node -pe "BigInt(JSON.parse(require('fs').readFileSync(0,'utf8')).timestamp).toString()"; }
advance_time() {
  cast rpc --rpc-url "$RPC" anvil_increaseTime "$1" >/dev/null
  cast rpc --rpc-url "$RPC" anvil_mine 0x1 >/dev/null
}
send_ok() {
  local output
  output="$("$@" --json)"
  [[ "$(node -pe "JSON.parse(process.argv[1]).status" "$output")" == "0x1" ]]
}

echo '== create builder project'
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$RUNG" \
  'createProject(string,string,bytes32)' 'OpenKit' "$PROJECT_URI" "$HASH"
PROJECT_ID="$(cast call --rpc-url "$RPC" "$RUNG" 'projectCount()(uint256)' | tr -d '\r')"

NOW="$(now)"
echo '== open fully funded stage'
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$RUNG" \
  'openStage(uint256,address,uint256,uint64,uint64,string,bytes32)' \
  "$PROJECT_ID" 0x0000000000000000000000000000000000000000 10000000000000000000 \
  "$((NOW + 172800))" "$((NOW + 2592000))" "$TERMS_URI" "$HASH"
STAGE="$(cast call --rpc-url "$RPC" "$RUNG" 'getProject(uint256)((address,string,string,bytes32,address,uint256))' "$PROJECT_ID" | cut -d, -f5 | tr -d ' ()\r')"
echo "stage=$STAGE"

echo '== backer funds the stage; builder claims and submits evidence'
send_ok cast send --rpc-url "$RPC" --private-key "$BACKER_KEY" "$STAGE" \
  'contribute(uint256)' 10000000000000000000 --value 10000000000000000000
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$STAGE" 'claimFunds()'
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$STAGE" \
  'submitEvidence(string,bytes32)' "$PROJECT_URI" "$HASH"

echo '== contributing backer votes yes; any wallet finalizes after seven days'
send_ok cast send --rpc-url "$RPC" --private-key "$BACKER_KEY" "$STAGE" 'castVote(bool)' true
advance_time 604801
send_ok cast send --rpc-url "$RPC" --private-key "$REVIEWER_KEY" "$STAGE" 'finalizeReview()'
[[ "$(cast call --rpc-url "$RPC" "$RUNG" 'verified(uint256)(bool)' "$PROJECT_ID" | tr -d '\r')" == 'true' ]]
[[ "$(cast call --rpc-url "$RPC" "$STAGE" 'reviewState()(uint8)' | tr -d '\r')" == '3' ]]

NOW="$(now)"
APP_DEADLINE="$((NOW + 172800))"
DECISION_DEADLINE="$((NOW + 864000))"
echo '== organization creates and funds its own retro round'
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$RUNG" \
  'createRound(address,uint256,uint64,uint64,address,string,bytes32)' \
  0x0000000000000000000000000000000000000000 2000000000000000000 \
  "$APP_DEADLINE" "$DECISION_DEADLINE" "$(cast wallet address --private-key "$REVIEWER_KEY")" \
  "$TERMS_URI" "$HASH" --value 2000000000000000000
ROUND_COUNT="$(cast call --rpc-url "$RPC" "$RUNG" 'roundCount()(uint256)' | tr -d '\r')"
ROUND_INDEX="$((ROUND_COUNT - 1))"
ROUND="$(cast call --rpc-url "$RPC" "$RUNG" 'rounds(uint256)(address)' "$ROUND_INDEX" | tr -d '\r')"

echo '== verified builder applies; round reviewer assigns award and finalizes'
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$ROUND" \
  'submitApplication(uint256,string,bytes32)' "$PROJECT_ID" "$PROJECT_URI" "$HASH"
advance_time 172801
send_ok cast send --rpc-url "$RPC" --private-key "$REVIEWER_KEY" "$ROUND" \
  'setAward(uint256,uint256,string)' 0 1250000000000000000 'Impact verified from shipped work'
send_ok cast send --rpc-url "$RPC" --private-key "$REVIEWER_KEY" "$ROUND" 'finalize()'
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$ROUND" 'claim(uint256)' 0
send_ok cast send --rpc-url "$RPC" --private-key "$BUILDER_KEY" "$ROUND" 'claimRemainder()'

echo '== verify resulting state'
echo "verified=$(cast call --rpc-url "$RPC" "$RUNG" 'verified(uint256)(bool)' "$PROJECT_ID")"
echo "raised=$(cast call --rpc-url "$RPC" "$STAGE" 'raised()(uint256)')"
echo "reviewState=$(cast call --rpc-url "$RPC" "$STAGE" 'reviewState()(uint8)')"
echo "roundOwner=$(cast call --rpc-url "$RPC" "$ROUND" 'roundOwner()(address)')"
echo "reviewer=$(cast call --rpc-url "$RPC" "$ROUND" 'reviewer()(address)')"
echo "finalized=$(cast call --rpc-url "$RPC" "$ROUND" 'finalized()(bool)')"
echo "roundBalance=$(cast balance --rpc-url "$RPC" "$ROUND")"
