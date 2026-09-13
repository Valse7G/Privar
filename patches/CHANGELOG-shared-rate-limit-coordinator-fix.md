# Fix — shared RPC/Blockscout rate-limit coordinator (the real systemic root cause)

## The evidence

The user supplied a full browser console log covering one session. It
changes the diagnosis completely — this was never three separate problems
(slow Shield, disappearing swap balance, confusing ZIP contents). It was
one systemic problem, and every earlier fix this session had been
unknowingly making it *worse* by adding more things to scan.

Counting distinct background scanners active in that single log:

```
135  [Privar stealth scan] scan(8aa4f1b6)
 63  [Privar] scan(2a8a0042)              — ShieldedSent (note-spend detection)
 59  [shield vault journal resync] scan(7165dc7f)
 55  [Privar] scan(a6786aab)              — Withdrawn
 53  [Privar] scan(addba84d)              — PrivateBridged
 44  [Privar] scan(9296d8b3)              — legacy Bridged
 39  [Privar] scan(e758dd58)              — Deposited
 34  [Privar tx-history]                  — Staked/Unstaked/RewardsClaimed
 20  [Privar] scan(74f45694)              — PrivateSwap
 11  [cloud vault resync]
```

Plus a 21-call protocol-stats poll firing every 30 seconds, independent of
all of the above.

Aggregate severity in that one log: **400** "rate limited, backing off"
retries, **89** HTTP 429s from Blockscout, **32** hard `-32005 Request
exceeds defined limit` errors from the RPC node itself, and `stats fetch:
21/21 calls failed` recurring **5 separate times** rather than ever
clearing.

## Root cause

At least 9 independent background processes — the protocol-stats poll,
stealth-note scan, note-relay scan, shield-vault journal resync,
cloud-vault resync, and (after this session's earlier fixes)
`reconcileAndVerifyNotes`'s 6 event scans plus `tx-history`'s Staking
scans — all funnel through the same low-level fetcher
(`fetchLogsPaginated`) or make direct `eth_call`s, with **zero awareness
of each other**. Each one has its own local 3-retry backoff. When
Blockscout or the RPC node rate-limits one of them, the other 8 have no
idea — they keep firing on their own schedule, so the retries pile up
into new 429s instead of ever letting the limit window close. This is a
classic thundering herd: individually polite, collectively relentless.

Every earlier fix this session that added a new event type to scan
(4 new spend-detection scans, 3 new staking scans) made this measurably
worse, because none of it had a shared brake — more scanners just meant a
bigger herd hitting the same wall.

This single systemic cause explains everything reported:
- **~20 retries needed for Shield/Swap/Withdraw**: the foreground
  operation's own `eth_call`s/`eth_sendTransaction` were competing with
  this storm for the same scarce RPC/Blockscout budget.
- **Shielded balance disappearing during swap**: `stats fetch: 21/21
  calls failed` was happening repeatedly — the UI was working with
  stale or error state through most of the session, not just the
  correctly-locked note.

## Fix

A shared coordinator (`runPrivarThrottled`, next to a shared
`__privarBgCooldownUntil` timestamp) now sits at the one low-level choke
point nearly every scanner already passes through
(`fetchLogsPaginated`), plus the two remaining direct-`eth_call` paths
(the 21-call stats poll, and the 4 top-level scanners' entry points in
the connect/periodic-resync effect):

- **Serialized, not concurrent**: only one throttled call runs at a time
  globally, instead of up to 9 simultaneously.
- **Shared cooldown**: the instant ANY of them sees a 429 or a rate-limit
  RPC error, every other one waits out the SAME cooldown window before
  its next attempt — one orderly queue instead of 9 independent retry
  storms.

This does not and cannot make the underlying public rate limit bigger —
it's still a scarce shared resource. What it fixes is the app being the
reason that limit never got a chance to reset.

## Also fixed this turn (smaller items from the same report)

- Confirmed and explained: the `.patch.diff`/`.md` files at the archive
  root cannot cause "wrong file" confusion — `index.html` has exactly one
  `<script>` entry point (`/src/main.jsx`), and Vite's module graph only
  follows real `import` statements from there. Nothing outside that graph
  is ever bundled or read.
- The shielded-balance display now shows a note locked mid-operation as
  "+$X pending…" instead of letting the balance silently read as a bare
  lower amount with no explanation — this was correct, safe behavior
  (preventing a double-spend of the same note) but looked alarming with
  no visible cause.

## Files changed
- `src/DApp.jsx` only.
