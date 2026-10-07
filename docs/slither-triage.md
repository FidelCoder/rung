# Slither findings triage

Run with:

```bash
slither . --filter-paths 'node_modules|out|cache' --exclude-dependencies --fail-none
```

Current source result: Slither 0.11.3, 100 detectors, **18 findings** across 14
contracts. No finding class is suppressed by configuration.

| Detector | Count | Disposition |
|---|---:|---|
| `arbitrary-send-eth` | 1 | Accepted. Native `_send` recipients are fixed by the calling path: a backer's recorded contribution, the immutable builder, a recorded application recipient, or the immutable round owner. No caller selects an arbitrary payout address. |
| `missing-zero-check` | 2 | Accepted. A zero asset address intentionally represents native BOT. Registry factory methods check `allowedAsset[asset]`; native BOT is enabled by default. |
| `timestamp` | 13 | Accepted. Comparisons enforce day-scale funding, delivery, seven-day voting, and round deadlines. Late calls either remain available after the deadline (refund, retry, round expiry) or fail closed. Miner timestamp drift cannot redirect funds. |
| `low-level-calls` | 2 | Accepted. Native payouts use checked `call{value:}` and revert on failure; ERC-20 transfers use OpenZeppelin `SafeERC20`. |

The earlier `reentrancy-events` warning on `StageEscrow.finalizeReview` was resolved by
adding `nonReentrant` around the registry approval callback. Re-run this check after any
contract change. A new finding class must be reviewed before merge; do not broaden
filters or suppress detectors just to make CI pass.
