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

---

## v21.1.0 — one-time approve (not one per Shield/Stake), fewer round trips before every wallet prompt

Follow-up to v21.0.0, addressing two reports: "Approve EURC Failed" recurring
on every Shield of a non-native token, and the Processing button taking a
long time before the wallet even shows a confirmation prompt.

### Shield/Stake no longer re-approve every time
`needsApproveBeforeDeposit()` fired an `approve()` transaction on **every**
EURC/cirBTC Shield and **every** Stake, unconditionally — even when a prior
approve already granted enough allowance. Two wallet-prompted transactions
back-to-back, every time, is exactly the failure mode in the reported
screenshot (an approve competing with the deposit tx for the same nonce
sequence). Now: allowance is checked first (folded into the same multicall
as the fee/support reads — no extra round trip), and approve is only sent
when it's actually insufficient. When it IS sent, it approves `MAX_UINT256`
instead of the exact amount, so it's the **last** approve that token/action
ever needs — every subsequent Shield or Stake of any size becomes
single-step. Applied to both the Shield panel (EURC/cirBTC → vault) and the
Staking panel (USDC → PrivarStaking).

**Honesty note:** this is the closest achievable result *without* changing
the contracts. A true single-*transaction* approve+deposit (EIP-2612
`permit()`) would need `PrivarMockERC20`/`PrivarShieldVault` to support it —
neither does today (checked the Solidity source directly: no `permit()`, no
permit-accepting `deposit()` overload). Native USDC was already single-step
because it pays via `msg.value`, not `approve()`+`transferFrom()` — there
was never a second step to remove there. Withdraw/Swap/Send/Bridge were
already single-step (they move funds already held by the vault via the
shielded note's nullifier, not an external ERC20 transfer) — confirmed by
reading each panel's submit function, not just asserted.

### Fewer RPC round trips before the wallet prompt
- **Shield**: the token-support pre-flight check, fee preview, and (new)
  allowance check were 2 sequential round trips before any approve/deposit
  tx — now 1 merged multicall.
- **Send**: the merkle-root read and flat-fee read were 2 separate
  sequential `eth_call`s (one right at submit, one right before the confirm
  modal) — merged into 1 multicall, matching the pattern Swap/Withdraw/
  Bridge already used.
- **Bridge**: the merkle-root read and flat-fee read were 2 separate
  single-item `multicallRead` calls — merged into 1.

None of this removes wallet/network latency itself (outside frontend
control), but it removes RPC round trips this app was adding on top of it,
on the direct path to the first wallet popup, for every operation.

---

## v21.2.0 — cross-device balance divergence, stuck "verifying…", scalability hook

Addresses live evidence (screenshots, same wallet on two devices) showing:
different shielded balances per device, "verifying…" not resolving, and
stats failing to load with 2 devices connected at once.

### Root cause found: cross-device deposit discovery was starting from block 0
`SHIELD_VAULT_JOURNAL_GENESIS_BLOCK` — the floor block for the scan that
lets one device discover a deposit made on ANOTHER device — was hardcoded to
`0`, with a TODO left in the code itself acknowledging it needed the real
deployment block "once known." Arc Testnet is 55M+ blocks deep. Whenever
Blockscout is unavailable and this falls back to raw chunked `eth_getLogs`,
progress advances only ~12,000 blocks per 2-minute pass — a 55M-block
backlog would take days, not minutes, to clear. This is the concrete
mechanism behind "my other device's Shield never shows up here": it isn't
lost, the discovery scan just hasn't reached that block yet, and may not
for a very long time.

**Fix**: `getContractDeploymentBlock()` finds the REAL deployment block at
runtime — first via Blockscout's `getcontractcreation` endpoint, falling
back to a binary search over `eth_getCode` (provably correct, no
dependency on Blockscout, ~26 one-time calls, gently paced) if that's
unavailable — and caches it permanently in localStorage. Unlike a
hardcoded constant, this never goes stale on the NEXT redeployment either
(this codebase alone has been through v3.4 → v5.0 → v5.1 → v5.2 → v5.3).

### "Verifying…" made to resolve immediately after an action, not up to 120s later
Shield/Swap/Send/Withdraw/Bridge already refresh stats and the native
balance the instant they confirm — but not the shielded-balance
reconciliation pass that clears the "verifying…" badge, which only ran on
its own 2-minute timer. Now every action's success handler also triggers
an immediate reconcile pass, the same way it already does for stats.

### Scalability: the "2 devices = no stats" ceiling is upstream of the frontend
Traced `rpcCall()`: every RPC method goes through `window.ethereum.request`
— i.e. through the CONNECTED WALLET's own RPC connection for Arc Testnet,
which for essentially every wallet is the same public
`rpc.testnet.arc.network` endpoint this app itself supplies via
`wallet_addEthereumChain`. That means Privar's traffic — from this user's
2 devices, or from anyone else's — shares ONE public testnet node's budget
with the entire Arc Testnet ecosystem. No amount of merging/reducing calls
inside this app (v21.0.0/v21.1.0) changes a budget that outside traffic
can also exhaust. **Added `PRIVAR_READ_RPC_URL`**: an opt-in dedicated
endpoint for read-only calls (`eth_call`/`eth_getLogs`/`eth_blockNumber`/
`eth_getBalance`/`eth_getCode`/`eth_chainId`/`eth_getTransactionReceipt`),
fetched directly instead of through the wallet, falling back to today's
exact behavior if unset or if it fails. Left empty by default — this
environment has no way to provision or verify a real production endpoint,
so nothing is guessed. **This is the actual fix for "must scale to many
concurrent devices"**: provision a paid Arc Testnet RPC endpoint (Alchemy/
Infura/QuickNode, or a self-run node) and set this constant. Wallet-signing
methods (`eth_sendTransaction`, `eth_requestAccounts`, etc.) are untouched
— always go through the wallet, as they must.

### What wasn't touched
Per the request to not alter what already works: the shared throttle queue,
the merged-scan helpers from v21.0.0/v21.1.0, the note lifecycle
(pendingOps/lockNotesForOp), and the one-time-approve logic are all
unchanged — this release only adds the deployment-block lookup, the
immediate-reconcile trigger, and the opt-in dedicated-RPC hook, all
additive and fail-safe to prior behavior.
