# Fix — signature-request prompt indistinguishable from the transaction confirmation

## New evidence from the user

Asked whether the Shield failure also reproduces on a 2nd/3rd attempt with
the same already-connected address (which would rule out the connect-time
registration race as the sole cause, since that race can only fire once
per address — see its own "attempted" flag). Answer: yes, and more
precisely — *"sometimes the wallet sends the transaction confirmation
notification and we confirm it, but the transaction fails, or rather
nothing happens (no transaction is created on-chain)."*

## What this rules out and what it points to

- It rules out a hard, deterministic bug (a wrong selector, a wrong
  address) — those would fail every time, not "sometimes."
- It rules out the transaction being rejected on-chain (a revert) — the
  user is explicit that no transaction is created at all, not that one
  failed.
- It matches, precisely, a wallet **signature request** (`personal_sign`)
  being mistaken for the **transaction confirmation** (`eth_sendTransaction`) that
  is supposed to follow it.

## Root cause

`ensureSpendKeyReady()` — called partway through every Shield/Swap/Send/
Withdraw/Bridge submit(), AFTER the fee preview but BEFORE the operation's
own on-screen confirmation modal — triggers a `personal_sign` wallet
prompt whenever the connect-time signature (from the `useEffect` that
fires on wallet connect) hasn't been cached yet. On most wallets this
prompt is visually generic — nothing distinguishes "please sign this
message" from "please confirm this transaction." A user who approves it
and assumes that WAS the transaction has no reason to expect a SECOND,
separate prompt (the real `eth_sendTransaction`) moments later. If they
stop watching, navigate away, or the wallet's in-app browser loses focus
in that gap, the real transaction is never sent — exactly "we confirmed
something, then nothing happened."

This also explains reproducing on repeat attempts: if that first
`personal_sign` call ever fails to complete cleanly (dismissed, wallet
bridge glitch, anything short of a clean success), nothing gets cached,
so the NEXT attempt hits the exact same unexpected prompt again — and
again — indefinitely, rather than being a one-time event.

## Fix

`ensureSelfBackupKeyReady()` and `ensureSpendKeyReady()` now accept an
optional `notify` callback. Every panel (Shield/Swap/Send/Withdraw/
Bridge) and the connect-time effect already have `notify` in scope and
now pass it through. Right before requesting the signature — and ONLY
when a prompt is actually about to fire (a cached signature never shows
this) — the user sees an explicit, distinct message:

> "One-time signature request — this is NOT your transaction yet.
> Approve it, then a separate confirmation for your actual transaction
> will follow."

Background-only callers (stealth-note scanning, cloud-vault resync, etc.)
don't have `notify` in scope and simply don't show the message — the
parameter is optional and safe to omit there.

## What this does not change
This doesn't touch the underlying wallet/RPC behavior — if a wallet's
in-app browser genuinely drops a pending request when backgrounded, that
remains a wallet-side limitation. What changes is that the user now has
a clear signal for which prompt is which, so they know to wait for and
approve the second one instead of assuming the first was sufficient.

## Files changed
- `src/DApp.jsx` only.
