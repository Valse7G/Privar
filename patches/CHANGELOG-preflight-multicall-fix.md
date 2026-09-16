# Fix — batch Merkle root + fee reads via Multicall3 (the last remaining friction point)

## The user's report, verified precisely

Three exact error messages, all traced to their source lines:
- `Withdraw — Could not read Merkle root. Ensure you are on Arc Testnet.`
- `Swap — Could not read the Merkle root.`
- `Shield/Swap/Withdraw/Bridge — Could not read current fees (slow network) — please retry.`

And the key diagnostic detail: *"quand on n'a pas ces erreurs, les opérations
fonctionnent parfaitement"* — confirming this genuinely is the last gap,
not a new mystery.

## Why the Multicall3 fix from two turns ago didn't cover this

That fix batched the **dashboard's 21-call background stats poll**. These
three errors come from a completely different place: **foreground
pre-flight reads inside each panel's own `submit()`**, run once per
operation attempt. Each was its own bare `rpcCallWithRetry` (3 attempts,
900ms) — reasonable, but every spend operation (Swap/Withdraw/Bridge)
needs a Merkle root read AND a fee read, back-to-back, as two separate
round-trips on the same tight RPC. Two chances to fail instead of one,
on every single attempt.

## Fix

New shared helper `multicallRead(descriptors)`: batches all the reads a
given operation needs into ONE Multicall3 call, falling back to
sequential reads with a **more generous** retry (4 attempts, 1000ms —
up from 3/900) if Multicall3 itself fails.

Applied to all four operations:
- **Shield**: `protocolFeeBps` + `flatFeeUsdc` — 2 calls → 1.
- **Swap**: Merkle root + `flatFeeUsdc` + `swapFeeBps` — 3 calls → 1.
- **Withdraw**: Merkle root + fee (bps or flat, depending on token) —
  2 calls → 1.
- **Bridge**: Merkle root and the fee read are separated by an external
  LI.FI HTTP quote in between, so they can't be merged into each other —
  each is still routed through `multicallRead` individually for the
  improved fallback retry, even as a single-item batch.

## Cross-device sync (the other report)

Not independently re-diagnosed this turn — only 2 of the 4 described
screenshots (TokenPocket) were attached; the Rabby-wallet pair wasn't
included, so there's nothing to compare against yet. Worth noting:
cross-device recovery depends entirely on the same background scanners
(stealth-note scan, note-relay scan, cloud-vault resync, shield-vault
journal resync) whose RPC starvation was the subject of the last several
fixes — it may already be meaningfully better now that those aren't
being rate-limited as often, but that's an expectation, not a confirmed
fix. A fresh test with the console log from whichever device shows the
LOWER balance (to see whether those specific scanners are completing)
would settle it either way.

## Files changed
- `src/DApp.jsx` only.
