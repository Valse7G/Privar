# Fix — revert nonce pre-fetch regression, add last-known-stats cache, honest note on multi-device scaling

## 1. Reverted: EURC/cirBTC Approve failing on every attempt after the first

Reported pattern: after deploying the latest version, the first
EURC/cirBTC Shield of a session may work, but every attempt after that
fails at the Approve step.

Checked the token contract first (`PrivarMockERC20.sol` — plain
OpenZeppelin ERC20, no allowance-reset-before-reuse restriction), which
rules out a contract-side explanation for a "works once, fails after"
pattern.

Most likely cause: the nonce pre-fetch added two turns ago
(`sendTransaction()` explicitly passing a `nonce` fetched via
`eth_getTransactionCount`). That fix assumed a wallet either honors an
explicit nonce or ignores it harmlessly. In practice, many wallets track
"next nonce" optimistically in memory immediately after broadcasting a
transaction, without waiting for the RPC to catch up — so this app's own
freshly-fetched "latest" nonce can be **stale** relative to what the
wallet already expects, especially for the second-or-later transaction
of a session. A stale caller-supplied nonce reads as invalid to some
wallets rather than being silently ignored — which matches the
deterministic "works once, fails after" pattern far better than the
original intermittent rate-limit symptom that fix was meant to address.

Reverted `sendTransaction()` to let the wallet manage its own nonce
entirely, as it did before that change. This session's other, much
larger fixes since then (Multicall3, cooldown-respecting fallback loops,
batched pre-flight reads) have substantially reduced overall RPC
pressure, which should make the wallet's own nonce lookup succeed more
often on its own anyway.

## 2. Added: last-known-stats cache for cold-start contention

New regression reported: with desktop and phone connected to the same
address simultaneously, stats show only "—" everywhere.

Root cause: this app's rate-limit coordination (the shared throttle
queue, cooldown, Multicall3) is entirely **in-memory, per browser tab**.
It has zero visibility into what any other device or tab is doing
against the same public RPC. Two independently well-behaved sessions can
together exceed a provider's real limit without either one knowing — a
genuine architectural ceiling for a frontend-only fix. A true guarantee
for N simultaneous devices needs a shared, server-side coordination
point (a small proxy/cache layer every client goes through), which is
out of scope for a frontend patch.

What's fixable client-side: the existing `prev.field` fallback in the
stats poll already keeps the last-known-good value within one page load
— but a **fresh page load** starts with nothing to fall back to, so if
its very first poll(s) fail under this kind of contention, there's
nothing to show but dashes. Now persists the last reasonably-complete
poll result to this device's own `localStorage` (cheap, no server) and
seeds a fresh page load's initial state from it — so reconnecting shows
the last real numbers this device saw, even while today's first poll is
still in flight or losing the race against another simultaneously
connected device. Self-correcting once any poll succeeds; ignored if
older than 24h.

## Honest note on true multi-device scale

The user's ask — a system that scales to many simultaneously connected
devices without rate-limit crashes — is a reasonable one, but a complete
guarantee genuinely needs shared, server-side rate limiting/caching
(e.g., a small proxy every client calls instead of the public RPC
directly, which caches short-lived reads like the stats poll across ALL
connected devices at once). That's an infrastructure decision, not a
frontend code change, and worth planning for separately if this app is
expected to scale past a handful of concurrent users on this same public
RPC.

## Files changed
- `src/DApp.jsx` only.
