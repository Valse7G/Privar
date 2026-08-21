# Privar OS

![version](https://img.shields.io/badge/version-v17.1.3-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v5.0.0-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-testnet-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas): shield, swap, send, withdraw, and bridge USDC/EURC/cirBTC privately, with protocol-wide note-journal persistence embedded directly in every shielding transaction (v3.4) — no separate broadcast that can silently fail.

---

## Deployed contracts — Arc Testnet (v5.0.0)

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`
Deployed: 2026-08-20T22:23:28Z — full protocol redeployment. **Not a migration** — prior shielded balances stay in the previous `PrivarShieldVault` address and must be withdrawn from there separately.

| Contract | Address | Frontend key (`src/contracts.js`) |
|---|---|---|
| **PrivarShieldVault** | `0x67a3c2aEE021ED109c0F84B5190F7e8DD84c415B` | `PrivarShieldVault` |
| PrivarMerkleTreeManager | `0x88d80fe571668C569066186DEA23727a36dEc8e3` | `PrivarMerkleTreeManager` |
| PrivarNullifierRegistry | `0xf0DaCEa8B651BE697DEb9aB83db6F28fAcA8A320` | `PrivarNullifierRegistry` |
| PrivarVerifierZK (Mock¹) | `0x03B8e2cECf8a5CBf3057BAe83581AcbA7ED38c1C` | *(called internally by the vault — no frontend key)* |
| PrivarDepositManager | `0x89Ef0d180e33a322e005980f6C41d52ae5e4D6e1` | `PrivarDepositManager` |
| PrivarWithdrawManager | `0x31E52C3e3c6A4d94efdb787aA6B608cbac125161` | *(called internally by the vault — no frontend key)* |
| **XyloNetPrivacyAdapter** ⁵ ⁶ (direct adapter, primary — always deployed) | `0xFa2B659C16F6a1C71161c1aECA4141425B624DD0` | `XyloNetPrivacyAdapter` |
| UniswapPrivacyAdapter (direct adapter, independent — not deployed, `UNISWAP_ROUTER_ADDRESS` unset) | *(null)* | `UniswapPrivacyAdapter` |
| LiFiPrivacyAdapter (reserve/aggregator, active, non-default) | `0x1A9278097F58f79aa02b8684207FAd29460F13A9` | `LiFiPrivacyAdapter` |
| LiFiPrivacyBridge ³ | `0x13C01FbefDb92B19403E431Da5670D266550cDf6` | `LiFiPrivacyBridge` |
| LiFiDiamond | `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` | `LiFiDiamond` |
| CurvePrivacyAdapter (reserve, active, empty pool whitelist — see below) | `0x0cd0f3E552081D8d0696062A2bD88b6Bb0f0e001` | `CurvePrivacyAdapter` |
| PrivarStaking (public, no notes — see below) | `0x08133df916E68b4ac4e9138378D118717Aa85f28` | `PrivarStaking` |
| **PrivarCloudVault** ² | `0xb3cac16d0388D45ed4b614a162A5890c6658e35F` | `PrivarCloudVault` |
| ViewKeyRegistry (unchanged since v1.0.0) | `0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b` | `ViewKeyRegistry` |
| USDC (native gas token) | `0x3600000000000000000000000000000000000000` | `NATIVE_USDC` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `EURC` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | `cirBTC` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `CCTP_TokenMessenger` |

¹ Testnet only — `PrivarVerifierZK` (Mock) accepts all well-formed proofs; not the production Groth16 verifier.
² Standalone, additive deployment — no constructor args, no dependency on ShieldVault or any other contract. ShieldVault's own `NoteJournal` event is the *primary* persistence path for new activity — CloudVault stays deployed for backward compatibility with pre-v3.4 journal entries and as the manual "Sync Notes to Cloud" backfill in Settings.
³ Repointed at the new ShieldVault via `setShieldVault()` — logic unchanged since v3.4.0.
⁵ New in v5.0.0 — dedicated, independent adapter for XyloRouter (XyloNet's own Uniswap V2-compatible router). Fully separate contract/whitelist entry from `UniswapPrivacyAdapter` — see the contracts repo's `XyloNetPrivacyAdapter.sol` doc comment and its [v4.0.0 → v5.0.0 changes](../privar-contracts-v3.4/README.md#v400--v500-changes) section.
⁶ Redeployed 2026-08-21 (v5.0.1 bug fix — native-tokenIn swaps, e.g. USDC → EURC, previously reverted with `ERC20: transfer amount exceeds balance`; fixed to use the payable `swapExactETHForTokens` variant instead of approve+`swapExactTokensForTokens` when the vault forwards `tokenIn` as raw `msg.value`). Targeted redeploy only — every other v5.0.0 address is unchanged. See the contracts repo's [v5.0.0 → v5.0.1 changes](../privar-contracts-v3.4/README.md#v500--v501-changes).

`TowerSwapAdapter` (the simulated/self-funded rollback target referenced in earlier versions) was removed in v4.0.0 and is no longer part of the stack — a real direct adapter (`XyloNetPrivacyAdapter`) is guaranteed deployed instead, so there's no more single-point-of-failure risk on LI.FI.

All fallback addresses are hardcoded in `src/contracts.js` and can be overridden per-deployment with `VITE_*` env vars (Vercel) without touching code.

---

## Swap decimal-scale fix (v3.4.2)

`PrivarShieldVault._privateSwap()` measures a swap's real `amountOut` via `IERC20(tokenOut).balanceOf()` before/after the router call (this delta-measurement itself was the v3.4.1 fix — see below). For a regular ERC-20 `tokenOut` (EURC, cirBTC) that `balanceOf()` reading is already in the token's own native decimals, so no further conversion is needed.

`NATIVE_USDC` is different: it has a dual representation on Arc — genuine native transfers (`deposit()`'s `msg.value`, `withdraw()`'s `call{value:...}`) use 18-decimal wei, while its ERC-20 pseudo-view (`balanceOf()`, used for the delta measurement above) reports 6-decimal amounts. `totalShieldedByToken` and the re-shielded note must be in the native 18-decimal convention — the code already scaled `feesCollectedByToken[NATIVE_USDC] += fee * 1e12` correctly a few lines above, but the `totalShieldedByToken[tokenOut] += amountOut` line right after it, and the `processDeposit(tokenOut, amountOut, commitmentOut)` call, both used the raw, un-scaled 6-decimal `amountOut` directly.

This was confirmed as a real accounting gap on Arc Testnet: after a successful EURC→USDC swap, `feesCollectedByToken(NATIVE_USDC)` read `150104000000000000` (native 18-dec scale) while `totalShieldedByToken(NATIVE_USDC)` read `3085477` (raw 6-dec scale) for the *same token* — a ~10¹² discrepancy. Every swap landing in native USDC credited the vault's ledger, and the user's own re-shielded note, with roughly one-trillionth of what was actually received, making that output effectively unspendable — surfacing as a local wallet balance higher than protocol TVL, partial withdrawals, and `ERC20: transfer amount exceeds balance` reverts on any further attempt to move the affected note.

Fix: `_privateSwap()` now scales `amountOut` by `1e12` before crediting `totalShieldedByToken`/the note whenever `tokenOut == NATIVE_USDC` (`shieldedAmountOut` in the contract). The frontend's swap flow mirrors the same scaling when journaling the new note locally (`noteAmountOut` in `DApp.jsx`), so the client-side note stays consistent with the on-chain ledger. `minAmountOut` in the calldata is intentionally left unscaled — the contract's own `amountOut < minAmountOut` check still runs on the raw 6-dec value, *before* this new native-scale credit.

This is again a full-suite redeploy for a clean, internally-consistent stack, even though only `PrivarShieldVault`'s logic changed.

---

## Swap accounting fix (v3.4.1)

`PrivarShieldVault._privateSwap()` had an asymmetry between its two branches:

- **`isNativeIn` (USDC → X)**: always measured `tokenOut`'s balance before/after the router call and clamped the credited `amountOut` to that real delta — never trusted the router's self-reported value blindly.
- **`!isNativeIn` (EURC/cirBTC → X)**: used the router's reported `amountOut` **directly**, with no verification.

This was confirmed as a real, exploitable accounting gap on Arc Testnet: `totalShieldedByToken(EURC)` read `2,998,471` while `EURC.balanceOf(vault)` was `0` — the vault's internal ledger believed it held ~3 EURC in reserve for user notes that it did not physically have, which surfaced as `"ERC20: transfer amount exceeds balance"` reverts on unrelated later withdrawals and swaps. Both branches now measure the same real balance delta (via the same ERC-20 `balanceOf()` view, including for native USDC) and clamp `amountOut` to it — the router's report is only ever used as a tie-breaker when it doesn't exceed what was actually verified.

This is a full-suite redeploy (every contract fresh) for a clean, internally-consistent v3.4.1 stack, even though only `PrivarShieldVault`'s logic changed. `TowerSwapAdapter`, `LiFiPrivacyAdapter`, and `LiFiPrivacyBridge` all expose a `setShieldVault()` admin function and enforce `onlyShieldVault` access control by stored address — a lighter, ShieldVault-only patch (repointing these three instead of redeploying them) is also possible; see `scripts/deploy-v3.4.1.js` in the contracts repo for that alternative.

---

## Network

| Field | Value |
|---|---|
| Chain ID | `5042002` |
| Gas token | USDC (ERC-20, 6 decimals) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (1 USDC/day) |

---

## Feature status

| Panel | Status | Notes |
|---|---|---|
| Shield | ✅ | USDC / EURC / cirBTC — protocol fee read live from `PrivarShieldVault.protocolFeeBps()` |
| Withdraw | ✅ | Unshield to any public address |
| Confidential Send | ✅ | ECDH stealth note (real P-256 view keys via `ViewKeyRegistry`), auto-decrypted on connect |
| Public Send | ✅ | Direct USDC transfer (0x address only) |
| Confidential Swap | ✅ | `PrivarShieldVault` + LI.FI (`LiFiPrivacyAdapter`) |
| Bridge | ✅ | LI.FI privacy bridge + CCTP v2 |
| Cross-device note sync | ✅ | `PrivarCloudVault` — see below |
| Portfolio | ✅ | Live balances + shielded notes |
| Staking | ✅ | On-chain lock tiers, APY read live from `PrivarStaking` |
| Analytics | ✅ | Live TVL + protocol fee stats |
| Governance | ✅ | Protocol params + contract directory (read-only; voting UI not yet implemented) |
| History | ✅ | Persistent per wallet (localStorage, this device only — not cloud-synced) |

---

## Architecture

```
src/
  contracts.js   — addresses, ABI selectors, calldata builders
  DApp.jsx       — full DApp: panels, hooks, wallet integration, PrivarCloudVault sync
  App.jsx        — router (Landing ↔ DApp) + ErrorBoundary + legacy-notes migration
  Landing.jsx    — marketing landing page
```

### Key hooks / modules (in `DApp.jsx`)

| Name | Purpose |
|---|---|
| `useShieldedBalances(prices, address)` | Wallet-scoped notes + on-chain reconciliation |
| `useProtocolStats(onArc)` | Live TVL, commitments, vault status |
| `useTxSend(...)` | Sends tx, awaits receipt, persists txHistory |
| `scanStealthNotes` / `ensureViewKeyRegistered` | ECDH stealth-note discovery for notes received from other wallets (`ViewKeyRegistry`) |
| `resyncFromShieldVaultJournal` / `resyncFromCloudVault` | Reads note-journal entries — primary path is ShieldVault's own `NoteJournal` events (v3.4); `PrivarCloudVault` kept for backward compatibility |

### localStorage (per wallet, unless noted)

| Key | Content |
|---|---|
| `privar_notes_{address}` | Shielded notes |
| `privar_txhistory_{address}` | Transaction history |
| `privar_txhistory_global` | Pre-connect transaction log |
| `privar_stakes_{address}` | Staking positions |
| `privar_protocol_fees` | Protocol-wide fee counters |
| `privar_portfolio_{address}` | Portfolio snapshot cache |
| `privar_stats_snapshots_{address}` | Analytics history cache |
| `privar_onchain_activity_{address}` | On-chain activity feed cache |
| `privar_viewkeypair_{address}` | This device's ECDH P-256 view keypair (receiving from others) |
| `privar_viewkey_attempted_{address}` | Registration retry guard for the above |
| `privar_cloudvault_backupsig_v2_{address}` | Cached deterministic signature → CloudVault backup key |
| `privar_cloudvault_scanprogress_{topic}_{address}` | Last block scanned per CloudVault event stream (resume point) |
| `privar_cloudsync_v3_migrated_{address}` | One-time migration guard for the CloudVault key-derivation scheme |

None of these are ever sent anywhere except the encrypted blobs explicitly pushed to `PrivarCloudVault`/`ViewKeyRegistry` on-chain.

---

## Note-journal persistence (v3.4)

Shielded notes are normally only known to the browser that created them. As of v3.4, **every function that creates or spends a note embeds an encrypted journal entry directly in the same transaction** as the operation itself — `deposit()`, `withdraw()`, `shieldedSend()`, `privateSwap()`, `privateSwapWithRoute()` all accept an optional trailing `bytes encryptedEntry`, emitted via `NoteJournal(address indexed owner, bytes encryptedEntry)` in that same call. There is no longer a separate follow-up transaction that can fail independently of the shield/spend itself.

- **Why this changed**: the pre-v3.4 design pushed journal entries to `PrivarCloudVault` as a *second*, independent transaction after the note-affecting one. If that second transaction failed for any reason (RPC rate limit, dropped signature, network drop), the spend/shield itself had already succeeded — but the journal entry was permanently lost, and any other device would show a stale or phantom balance forever with no way to self-correct. Bundling the entry into the same transaction makes that structurally impossible: either both happen, or neither does.
- **`withdraw()`'s `noteOwner` parameter**: since `withdraw()` can be called by an intermediary contract on the user's behalf (`LiFiPrivacyBridge.privateBridge()`), the journal entry is keyed by an explicit `noteOwner` address rather than `msg.sender`. Anyone could in principle pass an arbitrary address here, but the entry is opaque ciphertext only the real owner's derived key can decrypt — a spoofed entry simply fails to decrypt and is ignored.
- **Key derivation**: a single `personal_sign` of a fixed, address-normalized message → HKDF → AES-256-GCM. ECDSA `personal_sign` is deterministic and implemented near-identically across wallets, so every device controlling the private key derives the exact same key with one free, gasless signature.
- **Reading**: `resyncFromShieldVaultJournal` reads `NoteJournal` events directly from `PrivarShieldVault`, paginating `eth_getLogs` with a genesis-block floor (Arc Testnet is already tens of millions of blocks deep — scanning from block 0 reliably triggers RPC rate limits) and persisting scan progress locally so an interrupted pass resumes instead of restarting.
- **Merge safety**: a local note is only ever removed on positive evidence (an explicit "spent" op decrypted from the journal) — never merely because it's absent from one read pass, which avoids pruning a note that's just not indexed yet.

**`PrivarCloudVault`** (a standalone, events-only contract — `pushDelta`/`pushCheckpoint`) is still deployed and read (`resyncFromCloudVault`) for backward compatibility with journal entries pushed before the v3.4 upgrade, and as the manual "Sync Notes to Cloud" backfill path in Settings for any note that still predates it. New activity no longer pushes to it.

**`PrivarStaking` is untouched by any of this** — it's a fully public ERC-20 staking contract (positions indexed by `msg.sender`, readable directly via `getUserPositions()`), with no shielded notes involved at all. It was redeployed as part of the v3.4 suite for a clean, internally-consistent stack, but its logic and persistence model didn't change — it was already natively persistent on-chain.

This only concerns a wallet's own notes. Notes received from other wallets via confidential send still use the separate ECDH `ViewKeyRegistry` pipeline, untouched by any of the above.

---

## Privacy model

| Layer | Visible on-chain | Private |
|---|---|---|
| Deposit | Amount + ShieldVault address | Depositor ↔ withdrawal link |
| Shielded Send | Merkle root update | Sender, recipient, amount |
| Withdraw | Amount + recipient | Link to original deposit |
| Bridge | Amount + destination chain | Recipient address |
| Cloud sync | That an address pushed N encrypted bytes | Note contents (commitment, amount, token) |

---

## Protocol fees

- Deposit/withdraw fee in basis points, read live from `PrivarShieldVault.protocolFeeBps()` (`previewDepositFee` / `previewWithdrawFee` in `contracts.js`) — no fee value is hardcoded in the frontend.
- Live in the Analytics panel.

---

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # production build — no env vars required (fallback addresses built-in)
```

Deploy on **Vercel** — zero config. Fallback contract addresses are hardcoded in `src/contracts.js`.
Override any address via Vercel env vars (`VITE_SHIELD_VAULT`, `VITE_CLOUD_VAULT`, `VITE_WITHDRAWAL_MANAGER`, etc. — see the top of `src/contracts.js` for the full list).

---

## Changelog

### v17.1.3 (current) — real on-chain swap quoting for XyloNet/Uniswap
- Root cause of the `XyloRouter: INSUFFICIENT_OUTPUT` revert seen after the v5.0.2 contract fix: the Swap panel's `minAmountOut` was derived entirely from an off-chain price-matrix estimate (external EUR/USD feed × 0.9995, then 1% slippage tolerance) — never from the pool's actual reserves. On a thin/imbalanced testnet pool that estimate can diverge from the real rate by more than the tolerance, so the router correctly rejects the trade even though nothing else is broken.
- Added `buildGetAmountsOutCall()` / `decodeAmountsOutReturn()` (`src/contracts.js`) — standard Uniswap V2 `getAmountsOut(uint256,address[])`, works against both XyloRouter and any future Uniswap V2-shaped router.
- Added `CONTRACTS.XyloRouter` / `CONTRACTS.UniswapRouter` — raw router addresses, read-only quoting only, never a swap tx target (that stays the `*PrivacyAdapter` address).
- `attemptXyloNet()` / `attemptUniswap()` in `DApp.jsx` now call the router's real `getAmountsOut()` before submitting and compute `minAmountOut` from that (same 1% tolerance) — falls back to the previous price-matrix estimate only if the on-chain read fails (router unset/unreachable). The price-matrix estimate still powers the on-screen "you'll receive ~X" preview — only the actual `minAmountOut` sent on-chain changed.

### v17.1.2 — sync XyloNetPrivacyAdapter redeploy (v5.0.2 fix)
- `XyloNetPrivacyAdapter` address updated to `0xFa2B659C16F6a1C71161c1aECA4141425B624DD0` — the v5.0.1 redeploy (previous entry below) had routed native-tokenIn swaps through an unverified payable `swapExactETHForTokens`, which was never confirmed to exist on XyloRouter; v5.0.2 reverts to a single `approve()` + `swapExactTokensForTokens()` path for both native and ERC-20 tokenIn, scaling native USDC's 18-dec amount to XyloRouter's 6-dec ERC-20 view — see contracts repo's v5.0.1 → v5.0.2 changelog
- No other address changed — `PrivarShieldVault` and everything else stayed at their v5.0.0 values
- No frontend logic touched — this is a config-only sync

### v17.1.1 — sync XyloNetPrivacyAdapter redeploy (v5.0.1 bug fix, since superseded)
- `XyloNetPrivacyAdapter` address updated to `0x4b829CC39a62d07892cC8cdE8914aF0deDedB300` — targeted redeploy after a contracts-side fix for native-tokenIn swaps (`USDC → EURC` etc.) that previously reverted with `ERC20: transfer amount exceeds balance`; see contracts repo's v5.0.0 → v5.0.1 changelog
- No other address changed — `PrivarShieldVault` and everything else stayed at their v5.0.0 values
- No frontend logic touched — this is a config-only sync
- ⚠️ Superseded by v17.1.2 above — the underlying v5.0.1 contract fix itself turned out to rely on an unverified router function

### v17.1.0 — Liquidity Engine: direct adapters primary, LI.FI/Curve reserve
- Swap routing reordered to match the `PrivateSwapRouter` architecture: **direct adapters** (`XyloNetPrivacyAdapter`, then `UniswapPrivacyAdapter`) are now tried first — on-chain, deterministic pricing, no off-chain quote round-trip — before falling back to the **reserve/aggregator** pair (`LiFiPrivacyAdapter`, then `CurvePrivacyAdapter`), which stay fully active and whitelisted but are only reached dynamically when no direct adapter covers the pair
- `XyloNetPrivacyAdapter` added to `src/contracts.js` — new, independent contract from `UniswapPrivacyAdapter` (see contracts repo)
- Synced against contracts `v5.0.0` (`deployments/latest.json`) — real deployed addresses for `PrivarShieldVault`, `XyloNetPrivacyAdapter`, `LiFiPrivacyAdapter`/`Bridge`, `CurvePrivacyAdapter`, `PrivarStaking`, `PrivarCloudVault`, infra managers
- Theme system (`src/theme.js`, `ThemeProvider`) and mobile-responsive layout (collapsible sidebar below 720px) — visual/UX only, no protocol logic touched
- Not a migration — v4.0.0 shielded balances remain in the prior `PrivarShieldVault` address

### v3.4.2 — full protocol redeployment, swap decimal-scale fix
- **Fixed a real accounting bug**: `_privateSwap()` credited `totalShieldedByToken[tokenOut]` and the re-shielded note with the raw 6-decimal ERC20-pseudo-view `amountOut` whenever `tokenOut == NATIVE_USDC`, instead of the native 18-decimal scale used everywhere else for that token — confirmed on-chain via `feesCollectedByToken(NATIVE_USDC) = 150104000000000000` (native 18-dec) vs `totalShieldedByToken(NATIVE_USDC) = 3085477` (raw 6-dec) for the same token. Every swap landing in native USDC credited ~10⁻¹² of what was actually received. See [Swap decimal-scale fix](#swap-decimal-scale-fix-v342) above.
- Frontend: swap flow now mirrors the same `*1e12` scaling when journaling the new note locally (`noteAmountOut`), keeping client-side notes consistent with the on-chain ledger for native-USDC swap outputs
- Frontend: MAX-amount buttons (swap/send/withdraw/bridge) now use the exact raw note balance instead of a 2-decimal-rounded display value, and the note-selection fallback now actually clamps the requested amount to the note's real balance instead of only promising to in a comment — both were causing spurious `ERC20: transfer amount exceeds balance` reverts independent of the decimal-scale bug above
- Full-suite redeployment (every contract fresh) for stack consistency
- Not a migration — v3.4.1 shielded balances remain in the old `PrivarShieldVault` address (`0xfC622C2DbF6458a7D1Bb6a7637299EbC098dD202`)

### v3.4.1 — full protocol redeployment, swap accounting fix
- **Fixed a real accounting bug**: `_privateSwap()`'s `!isNativeIn` branch (tokenIn = EURC/cirBTC) trusted the swap router's reported `amountOut` with no verification, unlike the `isNativeIn` branch which always measured a real balance delta — confirmed on-chain via `totalShieldedByToken(EURC) = 2,998,471` while `EURC.balanceOf(vault) = 0`. Both branches now measure the same delta and clamp `amountOut` to it. See [Swap accounting fix](#swap-accounting-fix-v341) above.
- Full-suite redeployment (every contract fresh) for stack consistency — `TowerSwapAdapter`/`LiFiPrivacyAdapter`/`LiFiPrivacyBridge` repointed via their existing `setShieldVault()`, no logic changes there
- Not a migration — v3.4.0 shielded balances remain in the old `PrivarShieldVault` address

### v3.4.0 — full protocol redeployment
- **Protocol-wide note-journal persistence**: `deposit()`/`withdraw()`/`shieldedSend()`/`privateSwap()`/`privateSwapWithRoute()` now embed an encrypted journal entry directly in the same transaction (`NoteJournal` event) instead of a separate follow-up broadcast to PrivarCloudVault — closes the reliability gap where that second transaction could fail after the spend/shield had already succeeded, permanently orphaning the note's journal entry on other devices
- `withdraw()` gains an explicit `noteOwner` parameter so `LiFiPrivacyBridge.privateBridge()` (which calls `withdraw()` on the user's behalf) attributes the journal entry to the right wallet
- Fixed a real pre-existing bug in the Confidential Send flow: the calldata builder was called with mismatched field names, leaving `nullifier`/`root` undefined
- `PrivarCloudVault` retained for backward compatibility with pre-v3.4 journal entries and manual backfill; no longer the primary path for new activity
- `PrivarStaking` redeployed for a clean, internally-consistent v3.4 stack — logic unchanged (fully public, no shielded notes)
- Full-suite redeployment, not a migration — v3.3 shielded balances remain in the old `PrivarShieldVault` address

### v15.6.0
- **PrivarCloudVault**: new standalone contract for decentralized, events-only cross-device note sync (checkpoint + delta journal)
- Fixed cross-wallet key-derivation bug (EIP-712/personal_sign branching could silently derive two different keys on two different wallets)
- Fixed unnormalized address casing in the signed backup message (different wallets return different casing for the same address)
- Fixed a same-device regression where resync could prune a just-shielded note before its own event was indexed
- Fixed RPC rate-limit death spiral in `eth_getLogs` pagination; added a genesis-block floor and persisted scan progress
- Full rebrand PrivARC → Privar across frontend (contract addresses, storage keys, and 6 crypto/migration strings deliberately left untouched to avoid breaking existing users' data)

### v12.0.0
- ECDH Stealth Notes — real P-256 view keys via `ViewKeyRegistry`, auto-decrypted on connect
- LI.FI swap + bridge integration (`LiFiPrivacyAdapter`, `LiFiPrivacyBridge`, `LiFiDiamond`)
- Circle CCTP v2 bridge
- Governance panel: static protocol params + contract directory
- Wallet-scoped localStorage isolation + on-chain deposit reconciliation at connect

---

## License

MIT — see [LICENSE](LICENSE)
