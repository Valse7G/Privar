# Fix — rate limit (round 3): fully sequential stats calls, based on the exact captured error

## The decisive evidence

First time this session with the literal error object, not just a log
line: `{code: -32005, message: 'Request exceeds defined limit...rate
limit exceeded', ...version: viem@2.47.6}` — captured via Chrome DevTools
on desktop, so not a mobile-connectivity artifact this time. Still
`16/21` and `11/21` stats calls failing after round 2's fix.

## Root cause of this specific residual failure

Round 2 added proactive spacing (minimum 500ms) BETWEEN separate
`runPrivarThrottled()` calls. But the 21-call stats poll's OWN internal
chunking still fired **5 calls at once** (`Promise.allSettled` over a
group of 5) every 400ms — a burst the outer spacing mechanism never saw,
because it only meters when a `runPrivarThrottled()` call *starts*, not
what that call does internally once it's running. This provider's real
limit is evidently stricter than "5 concurrent requests every 400ms is
fine" — confirmed directly by `-32005` still firing on exactly this call.

## Fix

The 21 calls now run **fully sequentially** — one at a time, 350ms gap
between each — instead of 5-at-once groups. Slower for a single stats
refresh (roughly 7 seconds worst-case instead of under 2), but this is a
background poll nothing in the UI blocks on, and it's what actually
respects a limit this tight instead of resizing the same kind of burst
that kept tripping it.

## Not yet touched — smaller concurrent bursts elsewhere

A handful of other spots in this file still fire 2–4 calls concurrently
via `Promise.all([...])` (e.g. the cloud-vault resync's initial
`latestVersion`/`lastCheckpointBlock` read, a couple of fee-preview
reads). These are smaller and far less frequent than the 21-call poll,
and the captured error this round points specifically at the stats path
— so that's what got fixed. If a future log shows one of these smaller
spots as the source of a `-32005`, the same fully-sequential treatment
applies there too.

## Files changed
- `src/DApp.jsx` only.
