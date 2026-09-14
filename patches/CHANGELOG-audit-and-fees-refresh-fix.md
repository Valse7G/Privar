# Audit + fixes — all-time Fees Collected, delayed TVL refresh after an operation

## Audit summary (no changes needed — confirmed safe)

- **XSS**: no `dangerouslySetInnerHTML` anywhere in the file. React escapes
  all rendered text by default; nothing bypasses that.
- **Double-submit / race on rapid clicks**: the shared `ArcBtn` component
  (used by every panel) already disables itself via `disabled={loading||disabled}`
  — a second click while an operation is in flight is a no-op at the DOM
  level, not just a UI suggestion.
- **Secret/key leakage in logs**: spot-checked every `console.*` call
  near spend-key/view-key/signature code — none log the secret material
  itself, only status/error messages.
- **localStorage writes**: spot-checked the writes that looked unguarded
  at a glance — all are inside an enclosing `try/catch` (just not on the
  same line as the `.setItem` call), so a quota-exceeded or private-
  browsing-mode failure degrades gracefully instead of throwing into a
  critical path.

## Fixed — "Fees Collected" hardcoded to $0 (all-time)

`AnalyticsPanel`'s own stats effect had a stale comment claiming
`feesCollectedByToken(address)` "does NOT exist on the deployed
PrivarShieldVault v3.0.0" and hardcoded `feesUsdc = 0; feesEurc = 0;` as a
result. Checked directly against the current contract source: the
function exists, and its selector was already independently verified
elsewhere in this file (`useProtocolStats`) against a recomputed
keccak256 hash. The comment was simply never updated after the contract
moved past v3.0.0. Now reads the real value, with the same
native-wei→USDC-6dec→dollar scaling already used consistently elsewhere
in this file.

## Fixed — TVL/volume/fees not updating "instantly" after an operation

Root cause: `useProtocolStats`'s `refresh()` — called automatically after
every confirmed Shield/Swap/Send/Withdraw/Bridge via each panel's
`onSuccess` callback — shares the exact same function as the routine
30-second background poll, including this session's earlier fix that
routes that poll through the shared rate-limit queue
(`runPrivarThrottled`). That fix was correct for the *routine* poll (no
reason for idle housekeeping to jump ahead of anything), but it meant a
refresh triggered by the user's OWN just-confirmed transaction could sit
queued behind an arbitrary number of unrelated background scans before
the dashboard numbers updated — reading as "doesn't update instantly."

Fixed: `refresh()` now takes an optional `priority` flag. Every
`onSuccess` callback passes `refresh(true)`, which skips the shared queue
entirely (still internally chunked in groups of 5 — that was a separate,
already-fixed problem) so a confirmed transaction's own stats update
doesn't wait behind anything. The routine 30s poll is unchanged and stays
queued like every other background scan.

## Investigated, not changed — "bad volume formatting"

Found a real architectural inconsistency worth flagging even though I
didn't touch it this turn (to avoid the regression risk explicitly asked
to be avoided): there are **three separate, parallel implementations**
computing similar volume/fee/tx-count figures —
1. `useProtocolStats` — direct contract reads (`totalVolumeByToken`,
   `feesCollectedByToken`), the primary source most panels use.
2. `useOnChainActivity` — a fallback that reconstructs the same figures
   from `Deposited`/`Withdrawn`/`PrivateSwap`/`FeeUpdated` event logs.
   Verified: genuinely computes real values (not hardcoded), including
   the FeeCollected event topic checked against the contract source.
3. `AnalyticsPanel`'s own standalone effect — the one just fixed above.

All three are individually correct once fixed, but having three
independent code paths for the same numbers is exactly the kind of setup
that produces the inconsistent-looking figures reported (different
values in different views, depending on which path happened to succeed
that poll). Consolidating to one shared source is worth doing as a
follow-up, deliberately not attempted in this same turn as a live-
contention fix — that combination is how regressions get introduced.

## Files changed
- `src/DApp.jsx` only.
