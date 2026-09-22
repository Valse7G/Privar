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

---

## v21.2.3 — the real cross-device regression: a self-deadlocking shared queue

The user supplied a working `v17.0.0` build for comparison. `v17.0.0` has
**zero** occurrences of `runPrivarThrottled` — the shared RPC queue
(introduced later, v20.x era, to fix the "9 independent scanners"
thundering-herd problem) simply didn't exist yet. Diffing the two versions'
cross-device discovery wiring against each other found the actual
regression, and it's a genuine bug, not a timing/environment difference.

### The bug
Four cross-device discovery functions — `scanStealthNotes`, `scanNoteRelay`,
`resyncFromCloudVault`, `resyncFromShieldVaultJournal` — each already
throttle their OWN network calls internally, via `fetchLogsPaginated()`
(which itself is `runPrivarThrottled(() => fetchLogsPaginatedInner(...))`).
But at their three top-level trigger points (initial connect, the 2-minute
poll, the visibility-change re-check), each of these four was ALSO wrapped
a second time: `runPrivarThrottled(() => scanStealthNotes(...))`.

That double-wrap is a real deadlock, provable from the queue's own
implementation, not just a performance concern:

1. `runPrivarThrottled` chains a strict FIFO onto a single module-level
   promise (`__privarBgQueue = __privarBgQueue.then(run, run)`).
2. The OUTER call (e.g. `resyncFromCloudVault`) claims a slot in that
   chain and starts running.
3. While still running — before it resolves — it calls
   `fetchLogsPaginated()` internally, which calls `runPrivarThrottled`
   AGAIN. This inner call chains onto `__privarBgQueue` too — but
   `__privarBgQueue` was already advanced to a promise that only settles
   once the OUTER call finishes.
4. The outer call can't finish until the inner one runs. The inner one
   can't run until the outer one finishes. Neither ever does.

Once this fires, `__privarBgQueue` itself is a promise that will never
settle — and because it's shared module state, **every other call that
goes through `runPrivarThrottled` from that point on, from any part of the
app, permanently stalls too** (protocol stats, tx-history, reconcile —
whatever hasn't already claimed a slot ahead of the stuck one). It doesn't
crash anything visibly; things just silently stop updating. This is a
better fit for the reported symptoms than anything in v21.0–v21.2 so far:
a note shielded on one device never appearing on another (its own
discovery call deadlocks itself before it can find anything), and the "no
stats with 2 devices" report (each device runs this same connect-time
effect, so each independently has a very good chance of self-poisoning its
own queue on ordinary use — not something that actually required a second
device, just correlated with using the app enough to trigger it).

### The fix
Removed the redundant outer `runPrivarThrottled(...)` wrapper at all 12
call sites (4 functions × 3 trigger points), restoring the exact call
shape v17.0.0 already had and is proven to work: these four functions are
invoked directly, and their own internal `fetchLogsPaginated` calls remain
fully throttled through the shared queue exactly as before — nothing about
the actual rate-limit protection changes, only the self-deadlocking
duplicate layer is gone. Audited every remaining `runPrivarThrottled` call
site in the file (4 total) to confirm none of them has this same nesting
problem — `getContractDeploymentBlock`, `fetchLogsPaginatedInner`,
`fetchLogsPaginatedMergedInner`, `fetchLogsPaginatedMergedFilteredInner`,
and the protocol-stats poll (`runStatsFetch`) all call only genuine leaf
functions (`rpcCall`/`rpcCallWithRetry`/`rpcCallWithBackoff`) with no
further `runPrivarThrottled` inside them.

### What wasn't touched
The shared queue itself, its cooldown/backoff logic, the merged-scan
helpers, the one-time-approve logic, the dynamic deployment-block lookup,
and the immediate-reconcile trigger are all unchanged. This release is a
pure subtraction (12 redundant wrapper calls removed) — no new mechanism,
so no new surface for a fresh regression.

---

## v21.2.4 — the checkpoint was burning blocks it couldn't decrypt yet

v21.2.3's deadlock fix was real and worth keeping, but the user confirmed
cross-device sync was still broken after it. Dug further and found a
second, independent bug in the same pipeline — this one is very likely the
actual dominant cause, since it can silently and permanently disable
cross-device discovery on a device from its very first page load.

### Verified along the way, ruled out
- `NOTE_JOURNAL_TOPIC`'s hash: implemented and cross-checked a Keccak-256
  routine against two independently-known Ethereum constants (the
  `transfer(address,uint256)` selector `0xa9059cbb` and the ERC20
  `Transfer` event topic) to be sure the check itself was trustworthy, then
  confirmed `NOTE_JOURNAL_TOPIC` exactly matches `keccak256("NoteJournal(address,bytes)")`
  against `PrivarShieldVault.sol`'s actual event. Not the bug.
- The backup-key derivation (`deriveSelfBackupKey`): deliberately
  `personal_sign`-only (never EIP-712) specifically so it produces an
  identical, wallet-agnostic key on any device for the same account — this
  was already correctly engineered. Not the bug.
- `scanStealthNotes`'s dependency on `ViewKeyRegistry`: that contract isn't
  present at all in the current v5.3.0 contract set, so this path is
  already a graceful, harmless no-op — not currently active, not the bug.
- The mount-time flow already awaits `ensureSelfBackupKeyReady(address, notify)` —
  with a real, visible notification — before running any of the 4
  discovery scans. Not missing.

### The actual bug: a scan run before the key exists poisons its own future
`fetchLogsPaginated()`'s checkpoint advances based on "which blocks were
fetched," completely independent of whether anything found in them could
actually be decrypted. `_resyncFromCloudVaultImpl` and
`_resyncFromShieldVaultJournalImpl` both call
`ensureSelfBackupKeyReady(address)` but never checked whether it actually
succeeded before scanning anyway. If the one-time signature prompt is
declined, dismissed, or simply not answered before the scan runs — very
plausible on a brand-new device's very first connect, with no way to
retry that specific attempt — the scan still fetches the real on-chain
logs, fails to decrypt every one of them (no key), and the checkpoint
still advances past those blocks as if the pass had succeeded. Every
later attempt, even after the user approves the signature, starts from
the NEW checkpoint and can never see those blocks again. The note isn't
missing from the chain and isn't undiscoverable in principle — the scan
that could have found it already ran, without a key, and burned that
window permanently.

### The fix
1. Both resync functions now check `getCachedBackupSignature(address)`
   themselves, right after `ensureSelfBackupKeyReady`, and bail out
   **before touching anything** — no fetch, no checkpoint write — if no
   signature is cached yet. A skipped pass costs nothing and leaves the
   next attempt free to start from the correct block.
2. Added `window._privarTriggerCrossDeviceSync`, wired into all 5 panels'
   `onSuccess` (alongside the existing immediate-reconcile trigger from
   v21.2.0) — every action that succeeds is a moment the backup signature
   is guaranteed to already be cached (that flow calls
   `ensureSelfBackupKeyReady` itself first), so it's the most reliable
   point to retry a discovery scan that may have been skipped earlier,
   rather than waiting up to 2 minutes for the next poll.

### What wasn't touched
The queue/cooldown mechanism, the merged-scan helpers, the one-time-approve
logic, and the dynamic deployment-block lookup are all unchanged.

---

## v21.2.5 — the actual root cause: Blockscout has always been CORS-blocked

The user supplied real browser console logs. They settle the question: every
theory in v21.0.0–v21.2.4 was a real bug worth fixing, but none of them was
the dominant cause. This is:

```
Access to fetch at 'https://testnet.arcscan.app/api?...' from origin
'https://privar.vercel.app' has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

...on **every single Blockscout call**, with no exception, in the log —
the pre-flight token check, the `getcontractcreation` deployment-block
lookup added in v21.2.0, the merged reconcile scan, the tx-history scan,
all of it. `testnet.arcscan.app`'s API does not send an
`Access-Control-Allow-Origin` header, so the browser blocks every one of
these requests before the frontend ever sees a response. This is not
something a frontend fetch() retry, header, or option can work around —
CORS is enforced by the browser based on the SERVER's response headers, and
that server (Blockscout, not something this codebase controls) never sends
one.

### What this explains, precisely
Because Blockscout was 100% unreachable from the browser the entire time,
**100% of this app's log-scanning traffic — not most of it, all of it —
has always silently run through the raw, tightly-chunked `eth_getLogs` RPC
fallback**, which is nowhere near fast enough on its own: the log shows one
scan stream sitting 867,940 blocks behind head after falling back. That
volume of raw RPC calls, all at once, across every background scanner
(stealth scan, note relay, cloud vault, reconcile, tx-history) is exactly
what then cascades into the wall of "Request limit exceeded" / "rate limit
exceeded" errors filling the rest of the log — including v21.2.0's own
deployment-block lookup, whose Blockscout attempt failed (CORS) and whose
binary-search RPC fallback ALSO failed (already rate-limited by then),
landing back on block 0 anyway. Every fix in v21.0.0–v21.2.4 was real and
stays in — they just couldn't matter much while every one of them was
starved down to the same overloaded RPC fallback path underneath.

### The fix
CORS is bypassed the standard, correct way: route the request through a
same-origin server-side proxy instead of calling the third-party API
directly from the browser. Server-to-server HTTP requests aren't subject to
CORS at all.

- Added `api/blockscout-proxy.js` — a Vercel serverless function (this
  project already deploys on Vercel) that forwards the query string to
  `testnet.arcscan.app/api` and relays the response, with a 5-second shared
  cache since this is read-only, idempotent blockchain data.
- `BLOCKSCOUT_API_BASE` now points to `/api/blockscout-proxy` (same-origin)
  instead of `https://testnet.arcscan.app/api` directly. This one constant
  change fixes every caller — `fetchLogsViaBlockscout` and the
  `getcontractcreation` lookup both already funnel through it.
- `vercel.json`'s SPA catch-all rewrite (`/(.*)` → `/index.html`) was
  updated to `/((?!api/).*)` so it can never shadow the new `/api/*`
  serverless function — Vercel's filesystem routing already takes priority
  over rewrites, but excluding `/api/` explicitly removes any doubt rather
  than relying on that implicitly (real projects have hit exactly this
  ambiguity).

### What wasn't touched
Every fix from v21.0.0 through v21.2.4 stays — the merged scans, the
one-time approve, the deployment-block lookup, the deadlock removal, the
checkpoint-preservation guard. None of them was wrong; they were just
running on top of a transport layer that never worked. This release adds
one new file and changes two lines elsewhere (a constant and a rewrite
pattern) — nothing existing was restructured.

---

## v21.2.6 — mobile now syncs in 15–30s; desktop's new logs show real progress and one remaining problem

Confirmation the v21.2.5 CORS fix works: mobile (TokenPocket) now shows the
correct cross-device shielded balance in 15–30 seconds. Desktop's new logs
(post-proxy) show the CORS errors are gone entirely, AND — good sign — the
shield-vault journal resync actually succeeded mid-log: `pass done — 3
log(s) this call... decrypted 3, failed 0`. The v21.2.0–v21.2.4 fixes are
doing real work now that they can actually reach Blockscout.

### What's different on desktop: Blockscout's OWN rate limit, now visible for the first time
```
/api/blockscout-proxy?...  Failed to load resource: the server responded
with a status of 429 ()
```
Before v21.2.5, every Blockscout request was silently discarded by the
browser's CORS check — meaning Blockscout's own response was NEVER actually
seen, including whenever it was a 429. That budget was untested, not
confirmed sufficient. Now that the proxy reaches it for real, Blockscout is
rate-limiting a meaningful fraction of desktop's requests — likely because
desktop had a much larger backlog to work through in one session (its
reconcile scan alone showed 5,000,080 blocks remaining) than mobile did.

### The compounding bug this exposed
On a Blockscout rate-limit, the code immediately fell through to the RPC
fallback in the SAME pass — right after the 429, the very next lines in the
log are an `eth_getLogs` call that itself gets rate-limited 3 retries in a
row. A Blockscout 429 was making things worse, not just failing over:
every rate-limited Blockscout call was immediately followed by an
ALSO-likely-to-fail RPC call, doubling load at exactly the moment neither
budget could spare it.

### The fix
1. **`api/blockscout-proxy.js`**: retries an upstream 429 up to 2 more
   times with a short server-side delay before giving up — absorbs brief
   bursts without the client ever seeing a failure, and costs nothing extra
   client-side since it happens once per request on Vercel's infrastructure.
2. **`fetchLogsPaginatedInner` / `fetchLogsPaginatedMergedInner` /
   `fetchLogsPaginatedMergedFilteredInner`**: a Blockscout rate-limit error
   specifically (not a generic failure) now ends the pass right there —
   checkpoint untouched, no RPC fallback attempted in the same breath. The
   shared cooldown `markPrivarRateLimited()` already set takes care of
   pacing the next attempt; doubling up immediately was only making that
   cooldown's job harder.

### What wasn't touched
Every fix from v21.0.0 through v21.2.5 stays as-is — including the
CORS-fixing proxy itself, which is confirmed working. This release only
changes how a Blockscout-specific rate-limit response is handled, in three
near-identical spots plus the proxy's own retry.

---

## v21.2.7 — "No logs found" was being treated as an error; the Multicall question answered

New logs show real progress: Blockscout succeeding directly for the merged
reconcile scan (139/350 logs) and tx-history (48 logs) — the CORS/proxy fix
and the rate-limit fixes are working. Two things from this round:

### Bug: a normal empty result was triggering a wasted RPC fallback
```
[Privar note-relay scan] scan(10938b0a): Blockscout API unavailable
(Blockscout: No logs found), falling back to paginated RPC
```
This Blockscout instance returns the message **"No logs found"** for a
legitimately empty (but successful) range — this codebase's own check only
recognized `"no records"`, a different phrase, so every genuinely-empty
scan was misclassified as a failure and fell through to the RPC path
anyway, for no reason: there was nothing to find, Blockscout already said
so correctly. Fixed: `fetchLogsViaBlockscout()` now also recognizes "no
logs found" (and "no transactions found") as a clean empty result. This
matters more than it looks: the note-relay and stealth-scan contracts have
no history at all for this account yet, so EVERY pass was hitting this
exact false failure and burning an RPC fallback attempt on it.

### "Et le multicall ? Ça ne pourrait pas résoudre le problème ?"
Multicall3 already IS used, everywhere it can be: the protocol-stats poll
and every fee/allowance/support-check read in Shield/Swap/Send/Withdraw/
Bridge batch multiple `eth_call`s into one round trip through it (that's
what "139/350 log(s)" and the merged reconcile scan from v21.0.0 also do
conceptually, just via `eth_getLogs`'s own OR-topic feature instead, since
Multicall3 doesn't apply there — see below).

It can't help with the actual bottleneck in these logs, though, and it's
worth being precise about why: **Multicall3 is a smart contract.** It
batches multiple `eth_call`s (read a value from a contract's current state)
into one round trip by having ONE contract call several others internally
and return all the results together. `eth_getLogs` — everything this
thread has been chasing — is a completely different thing: it asks the RPC
node to search its **historical event-log index** over a block range.
That index isn't contract state, so there's no function on any contract,
Multicall3 included, that could hand it back — a smart contract has no way
to read historical logs at all, from itself or anyone else. There's no
version of "wrap it in Multicall3" that applies to log scanning; the two
problems are different shapes.

### On the 8 USDC vs 9.97 USDC seen in the screenshot
Given the same log shows several scans still mid-catch-up (note-relay:
~4,000,000 blocks remaining; stealth scan: ~4,400,000 remaining) at the
moment of that screenshot, this reads as a **partial sync snapshot**, not a
new bug — a device correctly showing the notes it's found *so far* while
others are still in flight, exactly the transient state the last several
releases have been shortening. Worth re-checking once those two scans
report caught up; flag it again with fresh logs if the gap is still there
after that.

### Unrelated to Privar: the second half of the log
Everything from the `net::ERR_INTERNET_DISCONNECTED` line onward is the
machine's own internet connection dropping — not a rate limit, not
Blockscout, not this app. Every subsequent "HTTP request failed" /
"Failed to fetch" in that stretch is a symptom of that, not a new finding.

### What wasn't touched
Every fix from v21.0.0 through v21.2.6 stays as-is. This release changes
one string-matching check in `fetchLogsViaBlockscout`.

---

## v21.2.8 — connect-time signature address casing (cosmetic), and confirmation sync fully caught up

### The screenshot: address shown in different casing between Rabby and TokenPocket
Checked both signature messages in this codebase:
- **`BACKUP_SIG_MESSAGE`** (the one that actually matters — its signature
  derives the cross-device decryption key) already does
  `address.toLowerCase()`, deliberately, specifically so it produces the
  identical key on any device regardless of which wallet's own casing
  convention returned the address. Already correct — confirmed by reading
  it again, not assumed.
- **The "Sign in to Privar OS" message** (the one in the screenshot) did
  NOT normalize casing — `Address: ${addr}` used whatever casing the
  connecting wallet happened to return. Different wallets do genuinely
  return different casing for the same account (some checksum, some
  don't), so this message legitimately displayed differently on Rabby vs
  TokenPocket, as observed.

The distinction that matters: this second signature includes a fresh
random nonce and timestamp every time (by design, as an anti-replay login
credential) — nothing decrypts or derives a key from it, and grepping the
codebase confirms the resulting signature is captured on connect and never
read again anywhere. So this was a real but purely cosmetic inconsistency,
not a contributor to the cross-device sync issue. Fixed anyway for
consistency: `Address: ${addr.toLowerCase()}`, matching the pattern
`BACKUP_SIG_MESSAGE` already uses.

### Good news from the accompanying log: everything is caught up
Every scan stream in the log — the merged reconcile scan, stealth scan,
note-relay scan, tx-history (both topics), shield-vault journal — is now
resuming from a block within a few thousand of the reported chain head
(~62,953,xxx), not millions behind. The v21.2.0–v21.2.7 fixes did their
job: the historical backlog is cleared. What's left in this log is
steady-state polling occasionally hitting Blockscout's per-request rate
limit, each time correctly waiting for the shared cooldown instead of
compounding (per v21.2.6) — no data loss, no wasted double-calls, just an
occasional short delay before a given poll's turn comes back around.

### What wasn't touched
Every fix from v21.0.0 through v21.2.7 stays as-is. This release changes
one line (address casing in a non-cryptographic signature message).

---

## v21.2.9 — CRITICAL: rate-limiting was causing real note deletion (data loss), not just slow sync

The most serious bug found in this entire thread, and it's a regression
I (Claude) introduced myself in v21.2.6. Found directly in a user-supplied
log:

```
[Privar] Quarantined 2 unbacked note(s) for 0x1dc724…
— no matching Deposited event found on-chain.
```

...appearing right in the middle of a wave of Blockscout 429s. That log
line means real, previously-shielded notes were just **deleted from local
storage** — not "still syncing," gone.

### How v21.2.6 caused this
`reconcileAndVerifyNotes()` uses one signal to decide whether it's safe to
delete a note for having "no matching Deposited event": whether the merged
event scan came back as an array at all (`Array.isArray(depositedLogs)`).
Before v21.2.6, a Blockscout rate-limit during that scan was an exception,
so this check correctly stayed `false` — no deletion. v21.2.6 changed the
rate-limit branch to `return []` instead of throwing (to stop compounding
load on an already-strained RPC, which was itself the right call) — but an
empty ARRAY is indistinguishable from an exception-free, fully-successful
scan that genuinely found nothing. From that point on, a note could be
deleted precisely because the check that was supposed to confirm its
absence never actually ran.

Worse, this wasn't only a rate-limit problem: the RPC fallback path already
had the same flaw independently — it returns whatever it accumulated
(`all`) as a normal result even when it only got partway to the chain head
in a single pass (bounded by `MAX_CHUNKS_PER_CALL`), with no way for the
caller to tell "confirmed empty" apart from "didn't get that far yet."
Given the multi-million-block backlogs seen throughout this thread, this
was a live risk independent of v21.2.6.

### The fix
`fetchLogsPaginatedMergedInner()` and `fetchLogsPaginatedMergedFilteredInner()`
now return **`null`**, not `[]`, from every code path that doesn't
represent a scan that actually reached the current chain head: the
Blockscout-rate-limit branch, and the RPC-fallback path whenever it stops
before catching up (rate-limited retries exhausted, or the per-call chunk
cap reached). An array is only ever returned when the scan is genuinely
complete. `reconcileAndVerifyNotes()` now derives `depositedScanOk`
directly from `mergedLogs !== null` — not from "is this an array" — so a
skipped or partial pass can never again be read as "confirmed no deposit."
The spent-nullifier checks (which only ever ADD confidence, never delete
based on absence) keep defaulting to an empty array either way — that
direction was never dangerous.

### Recovery for notes already caught by this bug
Added `recoverWronglyDepositQuarantinedNotes()`: once a scan genuinely
completes, it re-checks the quarantine bucket for any deposit-origin note
whose commitment IS present in that scan's confirmed results, and restores
it. This runs automatically on every successful reconcile pass going
forward — no manual action needed; any note this bug quarantined gets
a chance to come back the next time the scan actually reaches head.
(The existing `recoverWronglyQuarantinedNotes()` only ever covered swap/
send/bridge/withdraw-change outputs, which have no Deposited event by
design — this is the deposit-specific counterpart it didn't have.)

### What wasn't touched
Every other fix from v21.0.0 through v21.2.8 stays as-is. This release
changes the return contract of two internal functions and their two call
sites, plus adds one new recovery function — no other behavior changes.

---

## v21.3.0 — v21.2.6→v21.2.9 audit, and why the gap likely persisted

The user asked for a full re-audit of v21.2.6 through v21.2.9 against every
log shared in this thread, specifically because the "8 USDC vs 9.97 USDC"
discrepancy first reported on v21.2.6 was still present on v21.2.9.

### Most likely explanation for the persistent gap
9.97 − 8 = **1.97**, a plausible single deposit amount. The v21.2.6→v21.2.9
audit trail already found and fixed the exact mechanism that could make a
real deposit disappear: a Blockscout rate-limit (or a partial RPC-fallback
pass) being misread as "confirmed no matching Deposited event," causing
`reconcileAndVerifyNotes()` to quarantine (delete) an otherwise-legitimate
note. v21.2.9 fixed the misread and added automatic recovery — but that
recovery only runs at the moment a scan *genuinely* reaches chain head
(`depositedScanOk === true`). Every log in this thread shows Blockscout
being rate-limited often enough that a fully clean pass is genuinely rare.
So the most likely reading is: v21.2.9's fix is correct, but the specific
condition it needs (one clean completed pass) may simply not have occurred
yet for this account by the time v21.2.9 was tested — not that the fix is
wrong.

That reading can't be fully confirmed without a fresh log from a v21.3.0
session, though — flagging that honestly rather than declaring this solved
on theory alone.

### What actually changes in this release: make a clean pass more likely
Every fix through v21.2.9 was about *reacting correctly* once something
goes wrong (don't double up on RPC, don't delete on an unconfirmed absence,
recover what was wrongly deleted). None of them made a rate-limit hit
itself less likely. This release does:

1. **`PRIVAR_MIN_GAP_MS`: 500ms → 1500ms.** The proactive spacing between
   any two throttled calls is enforced per browser tab — it has no way to
   know a second tab or a second device (this user routinely runs both
   TokenPocket and Rabby at once) is also polling the same address through
   the same Blockscout instance at the same time. Two sessions at 500ms
   each is already an effective ~250ms gap from Blockscout's point of view.
   Slowing each session down individually is the only lever available
   without server-side coordination infrastructure.
2. **`api/blockscout-proxy.js` cache: 5s → 12s.** This is the one place
   that already sees combined traffic regardless of tab/device count.
   Logs repeatedly show the exact same query (same address/topics/block
   range) 429'd 4-5 times within a few seconds from different scan streams
   — a longer edge cache means the 2nd+ of those is served instantly
   without reaching Blockscout (or this function) again at all.
3. **Proxy retries: 3 → 4 attempts, longer backoff (600ms → 1.2s → 2.4s).**
   More patience absorbing a 429 server-side, once per request, instead of
   the client seeing a failure and waiting for its own cooldown.

### What wasn't touched
Every correctness fix from v21.0.0 through v21.2.9 — the merged scans, the
one-time approve, the deployment-block lookup, the deadlock removal, the
checkpoint-preservation guard, and the null-vs-[] quarantine fix — stays
exactly as shipped. This release only changes pacing/caching constants; no
control flow changed.

---

## v21.3.1 — the ChatGPT brainstorm's most important point was real: recovered notes were missing `blinding`

The user shared a ChatGPT analysis of v21.2.9 + logs. Most of it re-covers
ground already fixed in this thread (CloudVault `latestVersion=0` is
expected — it's manual-only, NoteJournal is the automatic primary path by
design, not a bug; the `[]`-on-rate-limit vs `null` inconsistency it flags
for `fetchLogsPaginatedMerged` was already fixed in v21.2.9). One point was
**genuinely new and, once checked against the actual code, real**: a
concern that CloudVault doesn't save a note's full secret material, so a
recovered note's balance might show correctly while the note itself stays
unspendable.

### Verified directly against the code (not taken on faith)
`createOwnedNote()` in `noteCrypto.js`:
```
const secret = spendingKey;
...
const b = blinding ?? randomBlinding();
```
`secret` **is** just this wallet's `spendingKey` — deterministic, derivable
on any device from the same wallet signature already used for the backup
key. Not a real gap; nothing to transmit.

`blinding`, however, is a genuinely random value chosen once at note
creation, with **no way to re-derive it from anything else** — and every
journal/cloudvault payload in this codebase only ever encrypted
`{ commitment, amount, token }` for a note's ADD op. Confirmed by reading
every `ops`/`swapOps`/`selfOps`/`bridgeOps` construction site (Shield,
Swap, Send, Withdraw ×2 paths, Bridge) — none of them included `blinding`.
Confirmed by reading both reconstruction loops
(`_resyncFromCloudVaultImpl`, `_resyncFromShieldVaultJournalImpl`) — both
built the recovered note object as `{ commitment, amount, token, ts }`
only, no `secret`, no `blinding`, no `pubkeyOwner`.

**Consequence**: a note discovered on a device that didn't create it would
display correctly in the shielded balance, but attempting to actually
spend it (Swap/Send/Withdraw/Bridge) from that device would very likely
fail — it's missing exactly the two fields (`secret`, `blinding`) a spend
needs to construct. This had never come up in this thread because every
report so far was about the balance not showing at all, not about
spending a balance that *did* show.

### The fix
- **Every journal-entry-building call site** (Shield deposit, Swap
  out+change, Send change, Withdraw's single-note and multi-note paths,
  Bridge change) now includes `blinding` in the ADD op it encrypts —
  `noteBlinding`/`outNoteBlinding`/`changeNoteBlinding` were already being
  computed in every one of these flows for the LOCAL note object; they
  just weren't being carried into the encrypted payload too.
- **Both reconstruction loops** now carry `op.blinding` through into the
  rebuilt note, and call a new `enrichReconstructedNoteWithSpendMaterial()`
  that re-derives `secret`/`pubkeyOwner` fresh from this device's own
  `spendingKey` — never trusted from the payload, always recomputed
  locally, which also means no new signature prompt: `ensureSpendKeyReady()`
  reuses the exact same cached signature `ensureSelfBackupKeyReady()`
  already obtained earlier in the same resync pass.
- Old journal/cloudvault entries created before this fix still won't carry
  `blinding` — nothing to backfill it from after the fact. A note already
  recovered from one of those stays balance-visible but not self-spendable
  until it's re-shielded; not a regression, the same limitation as before,
  just no longer silent for every deposit/swap/send/withdraw/bridge from
  this release forward.

### What I evaluated from the ChatGPT analysis and did NOT change, with reasoning
- **"CloudVault should be the primary sync source, not NoteJournal"**: the
  opposite direction would be a regression. NoteJournal's entire advantage
  is embedding the entry in the SAME transaction as the operation — no
  second wallet-signed broadcast that can independently fail. Making
  CloudVault (a separate push requiring its own transaction) load-bearing
  again reintroduces exactly the reliability gap NoteJournal was built to
  close (documented in this codebase's own v3.4 comments). Not adopted.
- **"`fetchLogsPaginatedInner` should also return `null` instead of `[]`
  on an incomplete scan, for consistency with the merged variant"**:
  checked every one of its callers first. Unlike the merged-scan path
  (which feeds `reconcileAndVerifyNotes`'s destructive quarantine
  decision), CloudVault/Journal/stealth/note-relay are all additive-only —
  none of them delete a note because of what THIS function returns. Two of
  CloudVault's call sites (`ckLogs.length`, `deltaLogs.length`) read the
  result directly without an `Array.isArray` guard; switching to `null`
  there without adding that guard would introduce a NEW crash for no
  corresponding safety benefit. Left as `[]` — correct, considered
  decision, not an oversight.
- **"Need a single-flight lock shared across all scanners"**: already in
  place — `runPrivarThrottled`'s shared queue (one call at a time, proactive
  spacing, reactive cooldown) plus per-function per-address in-flight maps
  (`_resyncInFlight`, `_shieldVaultJournalInFlight`) already provide this.
  Nothing to add.

### What wasn't touched
Every other fix from v21.0.0 through v21.3.0 stays as-is. This release adds
`blinding` to 6 journal-entry construction sites and one new enrichment
step in the 2 reconstruction loops — no control flow, scheduling, or
rate-limit handling changed.

---

## v21.3.2 — yes: the scheduling INFRASTRUCTURE itself was the structural problem

The user asked directly: "isn't the problem in the structural logic or the
current infrastructure that performs the scans?" Re-read the newest log
with that framing specifically, instead of continuing to patch individual
symptoms — and the answer is yes, found it.

### The smoking gun in the log
```
[cloud vault resync] 0x1dc724…: on-chain latestVersion=0
[cloud vault resync] 0x1dc724…: on-chain latestVersion=0
[cloud vault resync] 0x1dc724…: on-chain latestVersion=0
[cloud vault resync] 0x1dc724…: on-chain latestVersion=0
[cloud vault resync] 0x1dc724…: on-chain latestVersion=0
[cloud vault resync] 0x1dc724…: on-chain latestVersion=0
```
Six near-identical lines, seconds apart — right alongside the
protocol-stats Multicall3 read itself getting rejected: `stats:
Multicall3 failed... Request exceeds defined limit` on a single, already
batched call. Something was calling all 4 background scanners far more
often than the documented "mount + every 3 minutes" schedule.

### The cause: a "fast catch-up burst" that made sense when it was written, and doesn't anymore
Traced it to a `setInterval(..., 12_000)` that fired ALL 4 scanners again
every 12 seconds for the first 2 minutes after connecting — a deliberate
"fast catch-up" mode, reasoning at the time: *"an 'already caught up, 0
results' check is basically free, so asking more often during catch-up
costs nothing once caught up."* That assumption is what v21.2.6–v21.3.0
proved wrong, with real logs: Blockscout has its own tight rate limit, and
the raw RPC's budget is tight enough to reject a single Multicall3-batched
call outright. A request costs real budget whether the answer is 0 results
or 100 — "cheap once caught up" was never actually true here. Worse, the
burst was firing a full 4-scanner round every 12 seconds while a single
round — now correctly paced at 1.5s between calls (v21.3.0) specifically
*because* the real budget is tight — can easily take longer than 12 seconds
on its own, meaning burst rounds were piling up behind each other,
guaranteeing contention through the very cold-start window it was supposed
to help.

The burst also solved a problem that's mostly gone now for other reasons:
dynamic per-contract deployment-block discovery (v21.2.0) instead of
scanning from block 0, the Blockscout CORS fix (v21.2.5) letting a
successful call cover an unlimited range in one shot instead of chunking,
and the checkpoint-preservation/recovery fixes (v21.2.4, v21.2.9). What
was once a genuinely slow cold start is now usually one or two calls.

### The fix
Removed the burst entirely. What's left: one immediate pass on connect,
then the existing 3-minute steady-state interval — both already routed
through the same throttled queue as everything else. This isn't a
reduction in capability, it's removing a mechanism that had turned into
the single biggest source of self-inflicted contention in every log this
thread has looked at.

### Also found and hardened while looking: two panel-scoped intervals bypassing the queue entirely
`AnalyticsPanel` (three separate 30s intervals: 24h stats, fee config,
staking tx count) and `StakingPanel` (15s interval: rewards/stake totals)
call `rpcCall(...)` directly — not `rpcCallWithBackoff`, not routed through
`runPrivarThrottled` at all. These only run while their panel is actually
open (not a constant background drain like the burst was), so they weren't
the cause of what's in this log — but they share the exact same scarce RPC
budget with no retry/backoff and no coordination with anything else.
Hardened the 10 call sites to `rpcCallWithBackoff` (drop-in signature,
adds retry-with-backoff instead of throwing immediately on a 429) rather
than leaving them silently unprotected. Not restructured further this
release — that's a real but lower-priority item, noted here rather than
changed under time pressure: `AnalyticsPanel`'s 24h-stats call in
particular does an unfiltered `eth_getLogs` straight to raw RPC (never
Blockscout) every 30 seconds while that panel is open, which would benefit
from a proper Blockscout-routed rewrite in a future pass.

### What wasn't touched
Every fix from v21.0.0 through v21.3.1 stays exactly as shipped — the
merged scans, the one-time approve, the deployment-block lookup, the
deadlock removal, the checkpoint-preservation guard, the blinding fix, the
pacing/caching tuning. This release removes one `setInterval` and swaps a
function name at 10 call sites; no other control flow changed.

---

## v21.3.3 — evaluated the "single Sync Engine" proposal; implemented the safe, high-value parts of it

This round's ChatGPT document didn't come with a raw log attached (unlike
every other round in this thread) — evaluated on its architectural
reasoning and general log excerpts quoted in the prose alone, cross-checked
against the actual code rather than taken at face value.

### Where the analysis is right, directionally
The core diagnosis — "too many independent read paths sharing one scarce
RPC/Blockscout budget" — is consistent with everything found in this
thread since v21.0.0. That part isn't new; it's the same finding that's
driven every fix from the merged scans (v21.0.0) through the burst removal
(v21.3.2).

### Where it's not accurate about this specific codebase
Several concrete claims don't hold up against what the code actually does:
- **"The Multicall3 fallback isn't a real fallback, it multiplies load"**:
  checked both fallback loops (`useProtocolStats`'s `runSequential`,
  `multicallRead`'s catch branch). Both already wait out the shared
  cooldown between calls when one is active, and the batched call itself
  already retries 2-3 times before falling back at all. The claim isn't
  entirely wrong, though — see the real gap below.
- **"`[]` is dangerously ambiguous between 'empty' and 'failed'"**: already
  fixed for the one place this was actually destructive
  (`fetchLogsPaginatedMerged`, v21.2.9) and deliberately left as `[]` for
  the additive-only scanners after checking each caller
  (`fetchLogsPaginatedInner`, decided against in v21.3.1, with reasoning).
  Not a gap ChatGPT could have known about without the code.

### The one real, concrete gap this surfaced
`multicallRead`'s sequential fallback had a shared-cooldown wait but **no
minimum delay between calls when the ORIGINAL failure wasn't a rate-limit**
(e.g. a revert) — it could blast through every descriptor back-to-back
with nothing pacing it. `useProtocolStats`' equivalent fallback had a flat
350ms pace, which is now inconsistent with the 1500ms standard v21.3.0
established once the real provider budget was measured. Fixed both: every
sequential fallback call is now paced at `PRIVAR_MIN_GAP_MS` regardless of
whether a cooldown is currently active.

### What I implemented from the "single read, many consumers" idea — the safe version
Adopting the proposal's full shape (one "Sync Engine" that reads once and
feeds a "State Reducer" that every module consumes) would mean rewriting
the core data-fetching layer this thread has spent 15+ releases hardening,
with no way to test it against a live chain from here. That's a real risk
of a large regression for a directional idea, not a fix for a specific
verified bug — not adopted wholesale.

The genuinely safe, high-value version of "one read serving many
consumers" that doesn't require restructuring anything: **`eth_blockNumber`**.
Verified 11 separate call sites across the scan functions each
independently calling it for what is, in practice, the same piece of
information whenever more than one scanner runs within the same few
seconds — which every log in this thread shows happening routinely. Added
`getCachedBlockNumber()`, a 4-second shared cache; none of these callers
need fresher-than-that precision (a scan's own chunking already tolerates
being a few blocks behind by the time it finishes). Every
`fetchLogsPaginated*`/scan-function call site that used to call
`eth_blockNumber` directly now goes through it — a direct, safe cut in
total RPC volume with zero behavior change.

### What wasn't touched
Every fix from v21.0.0 through v21.3.2 stays exactly as shipped — including
the shared throttle queue, the merged scans, the blinding fix, and the
burst removal. This release adds one small cache and paces two existing
fallback loops consistently; no scanner's actual fetching/decoding logic
changed, and nothing was rearchitected.
