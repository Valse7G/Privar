# Fix — "Processing..." stuck after a confirmed transaction (self-inflicted regression) + misleading zero-balance banner

## Report

Two screenshots: a Withdraw stuck on "PROCESSING..." indefinitely despite
the withdrawal having actually succeeded on-chain (confirmed by the
user), and a Shield panel showing an implausible "Volume (Total):
$83,810,972.87" against a $46.89 TVL. Also reported: this stuck-
processing behavior happens on swap, withdraw, "and any other
operation" — and cross-device shielded balance sync "seems broken."

## Root cause — self-inflicted by this session's own rate-limit fix

`sendRealTx()` (shared by every panel) used to `await refreshBalance(...)`
directly in its success path, BEFORE returning — meaning the panel's
"Processing..." button (gated on that same `await` chain resolving)
stayed up until this balance re-read finished, even though the actual
operation was already confirmed one line above. This was harmless when
`getNativeBalance()` was a fast, single, unthrottled call — but this
session's own earlier rate-limit fix correctly routed it through the
shared background queue (`runPrivarThrottled`) for good reason. The
unintended side effect: a successful, already-confirmed transaction could
now sit waiting behind an arbitrary number of OTHER background scans
before its own "Processing..." button ever cleared — a priority
inversion between a foreground completion signal and background
housekeeping.

Fixed: `refreshBalance()` is now fire-and-forget in `sendRealTx`'s success
path — the balance still refreshes, it just no longer holds the button
hostage to it. This applies uniformly to Shield/Swap/Send/Withdraw/Bridge,
since they all share this one function.

## Volume showing $83.8M against $46.89 TVL

Verified the frontend side is correct: `totalVolumeByToken`'s selector
matches the contract exactly, and the native-to-display unit conversion
(`nativeToUsdc6` → `/1e6` in the blend helper) is applied consistently —
this is not a decoding or scaling bug on the frontend. The number itself
comes straight from a public, cumulative, monotonically-increasing
on-chain counter (`PrivarShieldVault.totalVolumeByToken`) that anyone
interacting with this shared testnet contract contributes to — I can't
rule out a single outlier transaction (anyone's) without querying the
actual event history, which needs live chain access this environment
doesn't have. If this needs a definitive answer, the fastest path is
pulling the `Deposited`/`PrivateSwap`/`Withdrawn`/`PrivateBridged`
amounts from `testnet.arcscan.app` for this vault and checking for one
unusually large entry.

## Also fixed — misleading "balance is zero" banner

The Withdraw panel's "⚠ Shielded USDC balance is zero. Select another
token or shield USDC first." banner used to fire purely off the spendable
(unlocked) balance being 0 — including while that same token had a
nonzero LOCKED/pending amount from an operation already in flight (the
exact scenario in the screenshot: "+$30.92 pending…" shown one line
above the banner telling the user to go shield USDC from scratch). Now
suppressed whenever the token has a pending amount.

## Cross-device sync

Not independently reproduced this turn — but worth noting: cross-device
sync depends entirely on `resyncFromCloudVault`/`scanStealthNotes`/
`scanNoteRelay`/`resyncFromShieldVaultJournal`, the exact four scanners
whose rate-limit starvation was the subject of the last two fixes. Retest
after this deploy before treating it as a separate bug — if it's still
broken with fresh logs, that's the next thing to dig into with real
evidence rather than a guess.

## Files changed
- `src/DApp.jsx` only.
