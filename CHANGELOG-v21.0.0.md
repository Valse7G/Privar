# Privar Frontend v21.0.0 — consolidated release notes

This replaces `patches/` (20 separate `CHANGELOG-*.md` files + `.diff`
patches accumulated across v19.2.0–v20.9.0). Going forward there is **one**
changelog per release, here and in `README.md`'s Changelog section — no more
patch-file archive.

## Scope and honesty note

`patches/`'s own history shows the same RPC rate-limit / cross-device
symptom patched five separate times (rounds 2, 3, 5, Multicall3 integration,
shared coordinator), each round fixing a real regression the previous one
introduced. That pattern — not any single bug — is what this release
targets: **fewer, merged round trips**, verified against the Solidity event
signatures in `privar-contracts-v5_3_0-noteengine.zip` rather than assumed.

This was **not** rebuilt from an empty file. `DApp.jsx` is 8,600+ lines of
working, previously-hardened wallet/note/crypto logic (much of it correct
specifically *because* of the fixes recorded in the old patch history); a
from-scratch rewrite of that in one pass, with no way to test against a live
Arc Testnet RPC or a real wallet from this environment, would trade a known-
working baseline for an unverifiable one. What follows is a real, targeted
audit and refactor: every change below is either (a) verified directly
against `PrivarShieldVault.sol` / `PrivarStaking.sol`'s actual `event`
declarations, or (b) a structural consolidation with no behavior change.
**None of this has been run against a live chain — test each item in the
checklist below before treating it as verified in production.**

## RPC round-trip reductions (the "too many RPC calls" report)

- **`reconcileAndVerifyNotes()`**: the 5 `PrivarShieldVault` event scans
  (`Withdrawn`, `Deposited`, `PrivateSwap`, `ShieldedSent`, `PrivateBridged`)
  ran as 5 sequential `eth_getLogs` calls. None of them filter beyond
  `topics[0]` (verified: none of these events index a field this app was
  actually filtering on), so they're merged into **one** call using
  `eth_getLogs`'s native OR-at-one-topic-position support
  (`topics: [[hash1, hash2, ...]]`). The legacy `LiFiPrivacyBridge.Bridged`
  event lives on a different contract address and stays separate.
  **6 calls → 2 per reconcile pass.** New helper: `fetchLogsPaginatedMerged()`
  (`src/DApp.jsx`). Existing per-account scan-progress checkpoints are
  migrated (seeded from the minimum of the 5 old checkpoints) so devices
  already caught up under v20.9.0 don't fall back to a cold multi-million-
  block replay.
- **`buildTxHistoryFromChain()`**: `PrivarStaking`'s `Staked`/`Unstaked`/
  `RewardsClaimed` all index `user` at the identical topic position
  (verified against `PrivarStaking.sol`) — merged into one call the same
  way. **3 calls → 1.** New helper: `fetchLogsPaginatedMergedFiltered()`
  (same file), with its own checkpoint migration.
- Both merges include a Blockscout-path equivalent (fetch the whole
  contract+range unfiltered, filter client-side) since the Etherscan-style
  API has no OR-within-one-topic-position — so the reduction applies whether
  or not Blockscout is up, not just on the RPC fallback path.

## Bug fix: "Shield" entries never appeared in tx history

`PrivarShieldVault.Deposited` only indexes `(bytes32 commitment, address
token)` — verified against the contract source. `buildTxHistoryFromChain()`
was filtering `topics[2] == <user's address>`, i.e. comparing a **token**
address against the **depositor's wallet** address — never equal for any
real token. Every Shield entry was silently dropped, for every account,
every time. There's no indexed depositor field to filter on directly (by
design — see the file's existing notes on `PrivateSwap`/`ShieldedSent`/
`PrivateBridged` for the same constraint), so the fix mirrors the pattern
already used for those: scan unfiltered, keep only entries whose commitment
matches a note this device knows about (`getNotes()` — includes notes
recovered from every cross-device path, so this makes Shield history
cross-device too, unlike before).

## Reviewed and confirmed correct (no change)

- Nonce handling: `sendRealTx()` lets the wallet manage its own nonce
  (no explicit `eth_getTransactionCount` pre-fetch) — the round that
  reverted this (see old `CHANGELOG-nonce-revert-and-stats-cache-fix.md`)
  was correct and is unchanged here. A caller-supplied nonce one behind a
  wallet's own optimistic counter is what caused the "Approve fails after
  the first attempt" pattern; don't reintroduce it.
- `Withdrawn`'s existing `recipient` topic filter (`topics[3]`) — verified
  correct against the contract source, unlike `Deposited`'s.
- The shared RPC/Blockscout throttle queue (`runPrivarThrottled`,
  `markPrivarRateLimited`, proactive min-gap + exponential cooldown) —
  already a sound design after 5 rounds of tuning; kept as-is.

## Housekeeping

- `patches/` (20 files) removed. This file + the README `## Changelog`
  section are the single source of truth going forward.
- `package.json` version: `18.11.1` → `21.0.0` (was already out of sync
  with the frontend's own release numbering — the archive this shipped in
  was named `v20.9.0` while `package.json` still said `18.11.1`).
  `PROTOCOL_VERSION` in `src/contracts.js` (`5.3.0`) is the **contracts**
  version, tracked separately — unchanged, since no new contracts were
  provided with this request.
- Added a `.gitignore` (`node_modules/`, `dist/`, `.env*`) — none existed.

## Suggested test checklist before deploying

1. Shield (Deposit) USDC/EURC/cirBTC on a fresh session — confirm it
   succeeds and appears in tx history under "Shield" (previously silently
   never did).
2. Second Shield/Approve in the same session — confirm no nonce-related
   failure.
3. Connect a second device/browser with the same wallet — time how long the
   shielded balance and tx history take to reflect a swap/send/bridge done
   on the first device.
4. Open the browser console during normal use and count
   `merged-scan(...)` log lines vs. the previous per-event `scan(...)`
   lines — should be visibly fewer round trips for the same activity.
5. Force a Blockscout outage (or just watch a session where it's down) to
   confirm the RPC-fallback branch of both new merge helpers still returns
   correct, non-duplicated results.
