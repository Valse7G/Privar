# Fix — cross-device sync: the missing piece wasn't reliability, it was time

## Why this kept recurring despite every RPC fix

Every fix so far addressed calls *failing*. This turn's finding is
different: on a brand-new device, cross-device note discovery can be
slow enough to look broken even when nothing is actually failing.

`fetchLogsPaginatedInner`'s RPC-fallback path (used whenever Blockscout
is down — the fast path that normally gets a whole range in one shot)
only advances up to `MAX_CHUNKS_PER_CALL(6) * 2000 = 12,000` blocks per
call, by design, to stay polite to a tight rate limit — then saves
progress and returns, to be continued on the *next* call. That's the
right behavior once a device is caught up. But a brand-new device has to
walk potentially **millions** of blocks from each scanner's genesis
block, 12,000 at a time — and this same session's own earlier fix moved
the steady-state rescan interval from 2 minutes to 3 (to reduce sustained
load). Combined, a device stuck on the slow path could take a very long
time to fully backfill, indistinguishable from "sync is broken" to
someone testing a few minutes after connecting on a second device —
which matches every cross-device report this session, including the
Rabby test where the balance visibly kept climbing between screenshots
rather than appearing all at once.

## Fix

A second, short-lived timer now runs alongside the existing 3-minute
steady-state one: for the first ~2 minutes after connecting, all four
scanners (stealth notes, note relay, cloud vault, shield vault journal)
get an extra pass every 12 seconds instead of waiting the full 3 minutes
— still fully respecting the shared throttle queue and cooldown (this
doesn't bypass any rate-limit protection, it just asks more often).

This is self-limiting by design, not a permanent load increase:
`fetchLogsPaginatedInner` already has an "already caught up to head"
fast-path that makes each extra call cheap once a scanner has nothing
left to backfill — so this naturally behaves like a fast catch-up burst
on a fresh device and a negligible no-op on one that's already synced.
Caps at 10 extra passes (~2 minutes) and stops.

## What this doesn't change
If Blockscout is reachable, this mostly doesn't matter — it already
fetches a whole range in one call. This specifically helps the case
where Blockscout is unavailable and every scanner is walking the slow
RPC-paginated path, which is exactly the scenario a fresh, undersynced
device is most likely to hit.

## Files changed
- `src/DApp.jsx` only.
