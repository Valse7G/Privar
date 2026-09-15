# Fix — Multicall3 integration: 21 RPC calls become 1 (the actual root-cause fix)

## Why rounds 2 and 3 weren't enough

Both previous rounds reshaped the SAME 21 individual `eth_call` requests
the protocol-stats poll makes every cycle — first adding proactive
spacing, then making them fully sequential. Both reduced the failure
rate but never eliminated it, because the underlying problem was never
the *arrangement* of the 21 calls — it was that there were 21 of them at
all. The user's own diagnosis, in plain language, was exactly right:
"trop d'appels RPC" (too many RPC calls).

## The actual fix

Every one of those 21 calls targets one of only two contracts
(`PrivarShieldVault`, `PrivarMerkleTreeManager`) — exactly the situation
**Multicall3** exists for: batch many independent read calls into ONE
`eth_call`. Confirmed Arc Testnet has the canonical Multicall3 deployed
at the same address used on 250+ other EVM chains
(`0xcA11bde05977b3631167028862bE2a173976CA11`, verified against Arc's own
RPC documentation).

Implemented `buildAggregate3Calldata()` / `decodeAggregate3Result()` in
`contracts.js` — hand-rolled ABI encoding/decoding for
`Multicall3.aggregate3((address,bool,bytes)[])`, since this project
doesn't carry an ABI-encoding library. **Tested end-to-end before wiring
it in**: since these are plain JS functions (no JSX), I could actually
execute a round-trip test (encode a batch of calls, decode a
hand-constructed mock Multicall3 response, assert the decoded values
match) rather than only checking syntax — all assertions passed.

The protocol-stats poll now:
1. Builds one `aggregate3` call for all 21 reads (`allowFailure: true`
   per call, so one reverting read doesn't lose the other 20).
2. Sends it as a single `eth_call` — 21 round-trips become 1.
3. Falls back to the previous fully-sequential approach if the
   Multicall3 call itself fails for any reason (same defensive pattern
   already used elsewhere in this file for Blockscout-then-RPC).

## Expected effect on the EURC Shield "Rejected by user" failure

Not directly touched by this fix, but worth watching on the next test:
the reported sequence (Approve succeeds → Shield confirmation appears →
user clicks confirm → wallet reports rejection) is a known pattern when
a wallet's own background gas-estimation/simulation call fails against a
rate-limited RPC — some wallets surface that as an authentic-looking
"rejected by user" even though the user did click confirm. Cutting the
single largest, most frequent source of RPC pressure by ~95% should
meaningfully reduce how often that collision happens, even though it
isn't a guaranteed fix for a wallet-side behavior. Worth a fresh test
specifically on this after deploying.

## Not yet converted
A handful of smaller `Promise.all([...])` bursts elsewhere (2–4 calls
each — e.g. cloud-vault resync's initial version check, a couple of fee
previews) still fire as small concurrent groups. Far smaller and less
frequent than the 21-call poll that was just fixed; left as-is unless a
future log points at one of them specifically.

## Files changed
- `src/contracts.js` — `CONTRACTS.Multicall3`, `SEL.aggregate3`,
  `buildAggregate3Calldata()`, `decodeAggregate3Result()`.
- `src/DApp.jsx` — `useProtocolStats()` rewired to use them, with
  sequential fallback.
