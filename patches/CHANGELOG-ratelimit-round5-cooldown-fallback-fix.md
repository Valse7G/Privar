# Fix — rate limit (round 5): fallback loops now respect the shared cooldown

## The log

```
balance fetch failed: rate limit exceeded (eth_getBalance)
[Privar] stats: Multicall3 failed, falling back to sequential eth_call: rate limit exceeded
stats fetch: 21/21 calls failed
```

Multicall3 (round 4) correctly cut 21 calls down to 1 — but that single
call still got rate-limited, AND the sequential fallback that's supposed
to catch exactly this case then failed on **all 21** of its own calls
too. No console errors from `reconcileAndVerifyNotes` in this particular
log, but the "verifying…" label the user was tracking depends on that
same RPC succeeding at least once — a sustained outage like this one
explains why it wasn't resolving, without needing a separate bug.

## Root cause of the fallback also failing completely

The fallback loops (in `useProtocolStats` and in `multicallRead`) had
their own flat inter-call delay (350ms) but never checked the **shared**
cooldown (`__privarBgCooldownUntil`) that a rate-limit hit sets elsewhere
in this file. So when call #1 of the fallback got rate-limited — which
also extends that shared cooldown — calls #2 through #21 had no idea and
kept retrying every 350ms straight into the same still-active window.
The whole fallback pass was spent hammering a wall instead of waiting
for it to actually clear.

## Fix

Both fallback loops now check and wait out `__privarBgCooldownUntil`
before every individual call, and feed it on every failure — same
cooldown-respecting discipline the primary paths already had, now
applied to the loops that exist specifically to catch primary-path
failures. Also raised the cooldown cap from 24s to 60s (6s → 12s → 24s →
48s → 60s): the log showed a real case where the provider's actual
rate-limit window outlasted a 24s cap, so the app went back to hammering
it too soon.

## What this doesn't change

This still can't make a genuinely scarce public rate limit bigger — if
the provider is in a multi-minute sustained outage, waiting it out
properly (this fix) is the correct behavior, but it's still a wait, not
a bypass. The cross-device "verifying…" question from the last couple of
turns is very plausibly just this same sustained window, not a separate
reconciliation bug — worth retesting once this deploys, ideally on a
different RPC-quiet moment, before concluding otherwise.

## Files changed
- `src/DApp.jsx` only.
