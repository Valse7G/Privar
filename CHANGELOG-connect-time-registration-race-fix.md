# Fix — connect-time auto-registration transactions colliding with user operations

## How this was found

The user provided `privar-frontend-v19_1_0.zip`, confirmed as the last
version where Shield (and other operations) worked reliably, and asked
for a concrete code-level diagnosis — not another network-related
hypothesis.

Diffing v19_1_0 against the current codebase line-by-line surfaced a
function that **does not exist at all in v19_1_0**:
`ensureSpendKeyRegistered()` (and its counterpart
`ensureViewKeyRegistered()`, present in both but never audited for this
specific interaction before). Both are wired into a `useEffect` that
fires on every wallet connect.

## Root cause — confirmed, not hypothetical

On every wallet connect, if the connecting address hasn't registered a
view key and/or a spend key yet, **each check independently fires a full
on-chain transaction** — `buildTx` → wallet confirmation prompt →
`eth_sendTransaction` → `waitForReceipt` — via the exact same
`sendRealTx()` used by the Shield/Swap/Send/Withdraw/Bridge panels
themselves. Both checks were fired **concurrently** (no `await` between
them), so on an address that is unregistered on *both* registries — which
is every address on this fresh v5.3.0 deployment (18 total commitments,
per the dashboard) — **two automatic transactions** fire back-to-back
from the same wallet, immediately after connecting.

Those two transactions compete for:
- the same nonce sequence,
- the same single RPC channel the wallet's injected provider exposes
  (`window.ethereum.request` has no separate lane for "background
  housekeeping" vs. "user-initiated" calls),

exactly when the user's very next action — Shield, in the reports —
needs that same channel for its own pre-flight `eth_call`s and its own
`eth_sendTransaction`. That collision, not the user's internet
connection, produced the reported sequence: `Could not verify token
support` → `Could not read current fees` → generic `Transaction failed`.

This explains why v19_1_0 never showed this behavior (the function
didn't exist yet) and why it reproduces reliably rather than
intermittently on this deployment (every connecting address is
unregistered right now, so the two-transaction burst fires every single
time).

## Fix

### 1. Sequential registration, not concurrent
`ensureSpendKeyRegistered()` no longer starts until
`ensureViewKeyRegistered()` has fully settled. At most one automatic
transaction is now ever in flight at a time instead of two racing each
other.

### 2. Foreground-operation guard extended to cover this case
`__privarForegroundOpsInFlight` (added in the previous session's RPC
contention fix) is already incremented/decremented inside `sendRealTx()`
— which both registration checks and every panel operation share. Each
panel's submit handler (Shield/Swap/Send/Withdraw/Bridge/Public Send) now
checks this counter before doing anything else: if a connect-time
registration transaction is still in flight, the user gets a clear
"Still finishing wallet setup from connect — please wait a few seconds
and try again" instead of racing it into a confusing failure.

## Not eliminated, by design
The up-to-two-transaction bootstrap cost on a brand-new address is
inherent to registering on two independent registries and hasn't been
removed — only serialized and shielded from colliding with whatever the
user does next. A returning, already-registered address never triggers
either transaction (the existing free `eth_call` existence check short-
circuits both), so this cost is genuinely one-time per address.

## Files changed
- `src/DApp.jsx` only.
