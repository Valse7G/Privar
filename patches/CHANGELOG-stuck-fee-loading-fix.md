# Analysis — confirmed real network outage in this test, one genuine UI bug fixed

## New evidence: `logs.txt`

This log is short (21 lines) and contains something none of the previous
ones did — a browser-level network error, not an application error:

```
api.coingecko.com/... Failed to load resource: net::ERR_INTERNET_DISCONNECTED
[Privar] reconcileAndVerifyNotes failed: HTTP request failed.
  URL: https://rpc.testnet.arc.network/
  Details: Failed to fetch
```

`ERR_INTERNET_DISCONNECTED` and `Failed to fetch` are Chrome's own
network-stack errors for "this device could not reach the internet at
all" — categorically different from a 429 or a JSON-RPC rate-limit
error, which both require the server to be reachable in the first place.
This is the device's own connection dropping, confirmed independently by
the screenshots' own throughput indicator (0.30 Ko/s, 4.58 Ko/s — near
zero). No frontend code can work around an absent network connection;
this is not something to "fix" in `DApp.jsx`.

Also present, less severe than before: `stats fetch: 16/21 calls failed`
and `[Privar stealth scan] Request limit exceeded.` — real residual
rate-limiting, improved from the 400+ backoffs seen before the shared
coordinator fix, but not fully eliminated. Likely compounded by the same
connectivity instability making retries collide more often.

## Every visual artifact in the three screenshots traces back to these two causes

- **"VAULT: —", "TVL EURC: —", "TVL cirBTC: —"** — these fields already
  correctly fall back to "—" when their poll call didn't succeed (this
  was working as designed before this turn) — exactly the fields among
  the 16/21 that failed this round.
- **"Protocol Fee: loading…" stuck** — this one was a genuine bug: no
  fallback existed for "this field failed and isn't coming" versus
  "still loading for the first time" — so it stayed on "loading…"
  forever once the underlying `protocolFeeBps`/`flatFeeUsdc` call failed
  enough times in a row. **Fixed below.**
- **Swap panel: "verifying…" stuck, "$0.00 USD"** — this is the direct,
  correct downstream effect of `reconcileAndVerifyNotes failed: ...
  Failed to fetch` above: verification never completed even once, so the
  UI honestly reports "verifying…" rather than claiming a stale or
  fabricated "verified" status. This is intentional, safety-first
  behavior, not a bug — it should self-resolve as soon as one verify
  pass succeeds after the connection stabilizes.

## Fix — Protocol Fee's stuck "loading…"

`useProtocolStats()`'s state now tracks `pollCount` (how many poll cycles
have actually completed, success or partial failure). The Shield panel's
fee preview uses it to distinguish "still on the very first load" (shows
"loading…") from "tried at least twice, still no value" (shows "—"
instead of an infinite spinner). Same logic used elsewhere in this file
already for TVL/Vault Status.

## Volume ($45.9M → $108.7M between the two screenshots)

Still can't be fully audited from here — it's a public, cumulative,
on-chain counter (`totalVolumeByToken`) that every user of this shared
testnet vault contributes to, and I don't have live chain access in this
environment. Worth flagging: the jump between the two screenshots (+$62.8M
volume against only +$5 TVL and +1 commitment) is large enough to be
worth checking directly against individual event amounts on
`testnet.arcscan.app` for this vault if a definitive answer is needed.

## What to do next
If the same issues persist on a **stable** connection (WiFi, not the
0.3–4.5 Ko/s mobile connection in these screenshots), that would be new,
genuinely actionable evidence pointing at a real code bug rather than
environment — a fresh console log from that test would be the fastest
path to it.

## Files changed
- `src/DApp.jsx` only.
