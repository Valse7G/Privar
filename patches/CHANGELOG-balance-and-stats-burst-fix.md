# Fix — two remaining rate-limit gaps (native balance fetch + stats-poll internal burst)

## Context

Follow-up log after the shared rate-limit coordinator fix
(`CHANGELOG-shared-rate-limit-coordinator-fix.md`). Dramatically shorter
than the previous one — 10 lines instead of 1300+, no repeated "rate
limited, backing off" spam, no sign of the 9-scanner thundering herd. The
coordinator fix is working. Two gaps remained, both outside its coverage:

```
balance fetch failed: Request exceeds defined limit.
  eth_getBalance — rate limit exceeded
stats fetch: 21/21 calls failed
```

## Gap 1 — `getNativeBalance()` (the wallet's native gas-token balance)

Never went through the shared coordinator at all, and used a bare
`rpcCall()` with **no retry whatsoever** — a single attempt, fail once,
done. Confirmed happening at the same moment as the stats-poll failure,
both drawing on the same exhausted budget with no coordination.

Fixed: routed through `runPrivarThrottled` (same shared queue/cooldown as
every other background RPC call) and given the same 3-attempt retry
(`rpcCallWithRetry`) used elsewhere in the file.

## Gap 2 — the 21-call stats poll's internal burst

This was already wrapped in `runPrivarThrottled` by the previous fix,
which correctly stopped it from overlapping with the OTHER background
scanners — but the previous fix didn't address the burst *within* the
call itself: all 21 `eth_call`s still fired **simultaneously** via a
single `Promise.allSettled`. On this RPC's rate limit, 21 requests in one
breath can trip the limit entirely on their own, independent of anything
else running.

Fixed: the same 21 calls now fire in **groups of 5**, with a short pause
between groups, instead of all at once. Same total calls, same result
shape (`results[i]` still matches `calls[i]` exactly) — just spread out
enough to stay under a limit that a single 21-wide burst was hitting by
itself.

## Files changed
- `src/DApp.jsx` only.
