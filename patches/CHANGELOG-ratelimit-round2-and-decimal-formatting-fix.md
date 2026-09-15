# Fix — rate-limit coordinator hardened (round 2) + consistent volume/fee decimal formatting

## New evidence

Fresh log from `v20.0.0`, after the shared rate-limit coordinator was
already deployed:

```
stats fetch: 17/21 calls failed
[Privar stealth scan] Request limit exceeded.
[Privar] reconcileAndVerifyNotes failed: Request limit exceeded.
[note relay scan] Request limit exceeded.
[cloud vault resync] ...on-chain latestVersion=0   ← this one succeeded
```

Better than the original 400+ backoff storm, but still real: the
coordinator was correctly serializing calls and sharing a cooldown after
a 429 — but a flat 4-second cooldown, applied only *after* a limit was
already hit, wasn't conservative enough for how tight this budget
actually is. The queue would start hammering again while the provider's
own (apparently longer) window was still in effect, re-triggering the
same limit almost immediately.

## Fix

Two changes to the same coordinator (`runPrivarThrottled`), same
architecture, just tuned:

1. **Proactive spacing, not just reactive backoff**: every throttled call
   now waits at least 500ms since the last one started, always — not only
   after a failure. Spaces requests out before hitting the wall instead
   of only backing off after already hitting it.
2. **Growing cooldown on consecutive hits**: 6s → 12s → 24s (capped),
   instead of a flat 4s every time — resets back to the base once a call
   actually succeeds, so a momentarily-busy provider doesn't permanently
   over-throttle a since-recovered connection.

Also reduced sustained request volume directly: the stats poll moved
from 30s → 45s, and the four periodic background scanners (stealth
notes, note relay, cloud vault, shield vault journal) moved from every
2 minutes → every 3. Less total traffic against the same tight budget,
on top of better spacing.

## Fix — inconsistent decimal places in Volume/Fees displays

Root cause, finally pinned down: every volume/fee display used
`toLocaleString(undefined, {maximumFractionDigits: N})` with **no**
`minimumFractionDigits` set. Without it, `toLocaleString` trims trailing
zeros — so the exact same kind of figure could render as `$45,913,826`
(0 decimals, because that particular value happened to be a round
number) in one view and `$39,880,028.01` (2 decimals) in another,
depending purely on what the underlying number happened to be at that
moment — not a magnitude bug, a formatting one. Fixed by setting
`minimumFractionDigits` equal to `maximumFractionDigits` (2 for volume,
2–4 for fees) at all 5 call sites that render these figures, so the same
kind of number always renders with the same number of decimals
everywhere in the app.

## Not touched (still true from the last audit)

The underlying magnitude of the cumulative on-chain volume counter
itself is unaffected by either of these fixes — that's immutable,
historical on-chain data, not a frontend concern. New increments
continue to look proportionate and small (confirmed in the previous
turn), which is the relevant signal that the live math is healthy.

## Files changed
- `src/DApp.jsx` only.
