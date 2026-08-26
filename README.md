# Privar OS

![version](https://img.shields.io/badge/version-v19.2.2-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v5.2.0-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-testnet-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas): shield, swap, send, withdraw, and bridge USDC/EURC/cirBTC privately, with protocol-wide note-journal persistence embedded directly in every shielding transaction (v3.4) — no separate broadcast that can silently fail.

---

## Table of contents

- [Overview](#overview)
- [Deployed addresses](#deployed-addresses)
- [Architecture](#architecture)
- [Feature status](#feature-status)
- [Native-USDC swap fix](#native-usdc-swap-fix)
- [Multi-note withdrawal](#multi-note-withdrawal)
- [Note-journal persistence (v3.4)](#note-journal-persistence-v34)
- [Privacy model](#privacy-model)
- [Protocol fees](#protocol-fees)
- [Network](#network)
- [Installation](#installation)
- [Configuration](#configuration)
- [Build and test](#build-and-test)
- [Deployment](#deployment)
- [GitHub / Release procedure](#github--release-procedure)
- [Changelog](#changelog)
  - [v19.2.2](#v1922--sync-contract-addresses-v530-redeploy-2-2026-08-26)
  - [v19.2.1](#v1921--fix-shielded-balance-double-counting-ghost-note-resurrection-2026-08-26)
  - [v19.2.0](#v1920--note-engine-private-sendbridge-to-third-parties-address-free-note-relay-v530-redeploy-2026-08-25)
  - [v19.1.0](#v1910--sync-contract-addresses-v520-redeploy-2026-08-23)
  - [v18.11.1 / v18.11.0 / v18.0.4 / v18.0.1](#config-only-address-syncs)
  - [v18.0.5 — phantom change-note leak fix](#v1805--fix-phantom-change-note-leak-from-the-v1802-clamp)
  - [v18.0.3 — note-lifecycle quarantine fix](#v1803--note-lifecycle-stop-quarantining-swapsendbridgewithdraw-outputs)
  - [v18.0.2 — swap-in real-balance clamp](#v1802--swap-in-real-balance-clamp)
  - [v18.0.0 — robust note lifecycle + tx-history fix](#v1800--robust-note-lifecycle--tx-history-decimal-fix)
  - [v17.2.0 / v17.1.x — swap fixes, multi-note withdrawal](#v1720--native-usdc-swaps-fixed-for-real-multi-note-withdrawal)
  - [v3.4.x — swap accounting fixes](#v342--full-protocol-redeployment-swap-decimal-scale-fix)
  - [v15.6.0 / v12.0.0](#v1560)
- [License](#license)

---

## Overview

Privar OS is the frontend for the Privar protocol — see the [contracts repo](../privar-contracts/README.md) for the on-chain side (ZK shielding, nullifiers, adapters). This app is a single-page React DApp: connect a wallet, shield USDC/EURC/cirBTC into confidential notes, then swap/send/withdraw/bridge them while keeping funds shielded until the last possible step.

Two structural pieces make the client side robust, both explained in full below:
- a **persistent pending-ops ledger** so an in-flight swap/send/withdraw/bridge survives a closed tab or a flaky RPC without leaving notes in a broken state (see [Multi-note withdrawal](#multi-note-withdrawal) and the [Changelog](#changelog)'s v18.0.x entries for the incidents that motivated it),
- **note-journal persistence** (v3.4) — every shield/spend embeds an encrypted backup entry in the same on-chain transaction, so a wallet's shielded balance can always be reconstructed from chain state alone, on any device, with no server (see [Note-journal persistence](#note-journal-persistence-v34)).

## Deployed addresses

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`
Deployed: `2026-08-26T03:48:28.987Z` — full protocol redeployment (second run of the v5.3.0 suite). **Not a migration** — prior shielded balances stay in the previous `PrivarShieldVault` (`0xBcC87AE23759385ff232aE5f5a32B5BcCfa9e071`, deployed 2026-08-25) and must be withdrawn from there separately.

| Contract | Address | Frontend key (`src/contracts.js`) |
|---|---|---|
| **PrivarShieldVault** ⁷ ⁹ | `0xc05Ba9BF842635d7Bc55434529E0c0337cb72FCa` | `PrivarShieldVault` |
| PrivarMerkleTreeManager | `0xcEc7FE67734c35108152e82eA4b95b7618C089b2` | `PrivarMerkleTreeManager` |
| PrivarNullifierRegistry | `0xfbAdD03182934177f74539bFf2460f9da7Fd3CdE` | `PrivarNullifierRegistry` |
| PrivarVerifierZK (Mock¹) | `0x53279181E4430BC3D616C3E86F08ECC883F85Fb8` | *(called internally by the vault — no frontend key)* |
| PrivarDepositManager | `0x000Fe68A5F32ff01b5d49fA6F0adAabcb9fbD9BB` | `PrivarDepositManager` |
| PrivarWithdrawManager | `0x943E40370dFF915d267E02BA9174cDF182B0937e` | *(called internally by the vault — no frontend key)* |
| **XyloNetPrivacyAdapter** ⁵ ⁸ (direct adapter, primary — always deployed) | `0x149761444E70664d77d7DD036947A80C45E5e303` | `XyloNetPrivacyAdapter` |
| UniswapPrivacyAdapter (direct adapter, independent — not deployed, `UNISWAP_ROUTER_ADDRESS` unset) | *(null)* | `UniswapPrivacyAdapter` |
| LiFiPrivacyAdapter (reserve/aggregator, active, non-default) | `0x74cAB299D19d0dC23C3322448f88a84ae9C643E8` | `LiFiPrivacyAdapter` |
| LiFiPrivacyBridge ³ | `0xC8433982e6704152f9f2d41960f8c377214755c1` | `LiFiPrivacyBridge` |
| **LiFiBridgeAdapter** ⁹ (multi-adapter bridge, whitelisted) | `0x3C1CC99Ec096AC325e1deE573d29Eeaf55eb932e` | `LiFiBridgeAdapter` |
| LiFiDiamond (unchanged) | `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` | `LiFiDiamond` |
| XyloRouter (raw DEX router, quoting only — see below) | `0x73742278c31a76dBb0D2587d03ef92E6E2141023` | `XyloRouter` |
| CurvePrivacyAdapter (reserve, active, empty pool whitelist — see below) | `0x2D87c6029a401172Df615373E0B93d3D0D480bEc` | `CurvePrivacyAdapter` |
| PrivarStaking (public, no notes — see below) | `0xAD2F6cF775526F406e11FE3D02Cef5f1c7bafe7d` | `PrivarStaking` |
| **PrivarCloudVault** ² | `0x96d73D155288FdE17EaA164Baf7bf7686c8daa49` | `PrivarCloudVault` |
| ViewKeyRegistry (unchanged since v1.0.0) | `0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b` | `ViewKeyRegistry` |
| **PrivarSpendKeyRegistry** ⁹ (Note Engine spend-identity keys) | `0x7b0A32adb0093771B084C9712992F935356C39e8` | `PrivarSpendKeyRegistry` |
| **PrivarNoteRelay** ⁹ (address-free encrypted-note relay) | `0x5Dc9bb4FC1604f315d638EEb7447BF640CfdfCfF` | `PrivarNoteRelay` |
| USDC (native gas token) | `0x3600000000000000000000000000000000000000` | `NATIVE_USDC` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `EURC` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | `cirBTC` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `CCTP_TokenMessenger` |

¹ Testnet only — `PrivarVerifierZK` (Mock) accepts all well-formed proofs; not the production Groth16 verifier.
² Standalone, additive deployment — no constructor args, no dependency on ShieldVault or any other contract. ShieldVault's own `NoteJournal` event is the *primary* persistence path for new activity — CloudVault stays deployed for backward compatibility with pre-v3.4 journal entries and as the manual "Sync Notes to Cloud" backfill in Settings.
³ Repointed at the new ShieldVault via `setShieldVault()` — logic unchanged since v3.4.0.
⁵ New in contracts v5.0.0 — dedicated, independent adapter for XyloRouter (XyloNet's own Uniswap V2-compatible router). Fully separate contract/whitelist entry from `UniswapPrivacyAdapter` — see the contracts repo's `XyloNetPrivacyAdapter.sol` doc comment.
⁷ Redeployed 2026-08-23 as part of the full contracts v5.2.0 suite — `version()` is no longer a hardcoded `pure` literal, now storage-backed and admin-correctable via `setVersion()`. Same selector, no frontend ABI change needed. See the contracts repo's `PrivarShieldVault.sol` changelog.
⁸ Handles native-`tokenIn` swaps correctly since contracts v5.1.0 — see [Native-USDC swap fix](#native-usdc-swap-fix) below.
⁹ New in contracts v5.3.0 (2026-08-25) — Note Engine additions. `PrivarShieldVault` also gains `privateBridgeWithAdapter()`/`bridgeAdapterWhitelist` (same constructor args, no ABI break for existing callers). See [v19.2.0 changelog entry](#v1920--note-engine-private-sendbridge-to-third-parties-address-free-note-relay-v530-redeploy-2026-08-25) and `NOTE-ENGINE-PROGRESS.md`.

`TowerSwapAdapter` (the simulated/self-funded rollback target referenced in earlier versions) was removed in contracts v4.0.0 and is no longer part of the stack — a real direct adapter (`XyloNetPrivacyAdapter`) is guaranteed deployed instead, so there's no more single-point-of-failure risk on LI.FI.

`PrivarWithdrawManager` and `PrivarVerifierZK` addresses both changed in this redeploy (called internally by `PrivarShieldVault`, so neither has a direct `CONTRACTS` key in `src/contracts.js`) — listed here for completeness against `deployments/latest.json`.

`PROTOCOL_VERSION` in `src/contracts.js` is kept in sync by hand from `latest.json`'s `_version` field alongside this table — see that constant's own doc comment for why it isn't read on-chain even though `version()` is no longer a stale `pure` literal as of contracts v5.2.0.

All fallback addresses are hardcoded in `src/contracts.js` and can be overridden per-deployment with `VITE_*` env vars (Vercel) without touching code.

## Architecture

```
src/
  contracts.js   — addresses, ABI selectors, calldata builders
  DApp.jsx       — full DApp: panels, hooks, wallet integration, PrivarCloudVault sync
  App.jsx        — router (Landing ↔ DApp) + ErrorBoundary + legacy-notes migration
  Landing.jsx    — marketing landing page
  theme.jsx      — ThemeProvider, CSS custom-property tokens shared by Landing + DApp
```

### Key hooks / modules (in `DApp.jsx`)

| Name | Purpose |
|---|---|
| `useShieldedBalances(prices, address)` | Wallet-scoped notes + on-chain reconciliation |
| `useProtocolStats(onArc)` | Live TVL, commitments, vault status |
| `useTxSend(...)` | Sends tx, awaits receipt, persists txHistory |
| `lockNotesForOp()` / `markOpSubmitted()` / `finalizeOp()` / `watchPendingOps()` | Persistent pending-ops ledger — survives a closed tab or a dropped RPC call mid-operation; see [Multi-note withdrawal](#multi-note-withdrawal) and the v18.0.0 changelog entry |
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

## Feature status

| Feature | Status | Notes |
|---|---|---|
| Shield / Unshield | ✅ | Deposit/withdraw, live protocol fee |
| Confidential Send | ✅ | ECDH stealth note (real P-256 view keys via `ViewKeyRegistry`), auto-decrypted on connect |
| Public Send | ✅ | Direct USDC transfer (0x address only) |
| Confidential Swap | ✅ | Liquidity Engine: direct adapters (`XyloNetPrivacyAdapter`, `UniswapPrivacyAdapter`) tried first, `LiFiPrivacyAdapter`/`CurvePrivacyAdapter` as dynamic reserve — see [Native-USDC swap fix](#native-usdc-swap-fix) |
| Bridge | ✅ | LI.FI privacy bridge + CCTP v2 |
| Cross-device note sync | ✅ | `PrivarCloudVault` — see [Note-journal persistence](#note-journal-persistence-v34) |
| Portfolio | ✅ | Live balances + shielded notes |
| Staking | ✅ | On-chain lock tiers, APY read live from `PrivarStaking` |
| Analytics | ✅ | Live TVL + protocol fee stats |
| Governance | ✅ | Protocol params + contract directory (read-only; voting UI not yet implemented) |
| History | ✅ | Persistent per wallet (localStorage, this device only — not cloud-synced) |

## Native-USDC swap fix

Native-`tokenIn` swaps (USDC → EURC/cirBTC) previously reverted with `ERC20: transfer amount exceeds balance` inside `XyloRouter`. Root cause: `PrivarShieldVault` forwards a native `tokenIn` amount as `msg.value`, scaled 18-decimal (the vault's internal convention) — but Arc's native-USDC ERC-20 view (`0x3600...0000`, the SAME balance `XyloRouter` reads via `approve()`/`transferFrom()`) is scaled 6-decimal, like any other token. Passing the raw 18-decimal amount straight into the router asked it to pull ~10¹² times too much, which trivially exceeded the real (6-dec) balance.

Two earlier attempts didn't resolve it:
1. **v5.0.1 (contracts)** — assumed the router needed a dedicated payable `swapExactETHForTokens` entrypoint (standard on canonical Uniswap V2 Router02 forks). Shipped, but failed on a real transaction: the call reverted with empty data at ~400 gas, confirming that entrypoint doesn't exist on `XyloRouter`.
2. **Interim mitigation** — reverted native-`tokenIn` calls immediately instead of attempting a doomed swap, routing that case to `LiFiPrivacyAdapter` only. Not a real fix, just a safe stopgap.

**Real fix (contracts v5.1.0):** `XyloNetPrivacyAdapter`/`UniswapPrivacyAdapter` now scale a native `amountIn` down by `1e12` before `approve()`/`swapExactTokensForTokens()` — otherwise the exact same ERC-20 flow used for any other token. No wrapping, no minting, no special entrypoint.

**Frontend (v17.2.0):** the interim `tokenInIsNative` skip in `attemptXyloNet()`/`attemptUniswap()` (added when the interim mitigation shipped) was removed — both direct adapters are tried normally for native-`tokenIn` swaps again, now that they actually work. Confirmed on-chain in both directions: EURC → USDC and USDC → EURC.

## Multi-note withdrawal

The shielded balance shown to the user is the SUM of every unspent note for a token, but `PrivarShieldVault.withdraw()` can only spend ONE nullifier per call. A balance built up across multiple operations (e.g. shield 10 USDC, swap 5 → EURC, swap the EURC back → USDC) commonly ends up as 2+ separate notes — "Tap Max" previously could only withdraw whatever the single largest note covered, silently leaving the rest, and required several manual withdrawals to fully empty the wallet.

Contracts (v5.1.0) add `PrivarShieldVault.withdrawBatch(bytes32[] nullifiers, uint256[] amounts, bytes32 root, address token, address recipient, address relayer, uint256 relayerFee, address noteOwner, bytes encryptedEntry)`, spending N nullifiers and paying out their combined value in one transaction. `withdraw()` itself is untouched — `LiFiPrivacyBridge.privateBridge()` and every other single-note caller keeps using it directly.

Frontend note selection (`src/contracts.js` / `src/DApp.jsx`, since v17.2.0) picks the fewest notes (largest-first) needed to cover the requested amount, instead of requiring one note to cover it alone. A single sufficient note still goes through the exact same, unmodified `withdraw()` call — `withdrawBatch()` is only used when 2+ notes are genuinely needed. Selector: `SEL.withdrawBatch = "0x775968f5"`.

## Note-journal persistence (v3.4)

Shielded notes are normally only known to the browser that created them. As of contracts v3.4, **every function that creates or spends a note embeds an encrypted journal entry directly in the same transaction** as the operation itself — `deposit()`, `withdraw()`, `shieldedSend()`, `privateSwap()`, `privateSwapWithRoute()` all accept an optional trailing `bytes encryptedEntry`, emitted via `NoteJournal(address indexed owner, bytes encryptedEntry)` in that same call. There is no longer a separate follow-up transaction that can fail independently of the shield/spend itself.

- **Why this changed**: the pre-v3.4 design pushed journal entries to `PrivarCloudVault` as a *second*, independent transaction after the note-affecting one. If that second transaction failed for any reason (RPC rate limit, dropped signature, network drop), the spend/shield itself had already succeeded — but the journal entry was permanently lost, and any other device would show a stale or phantom balance forever with no way to self-correct. Bundling the entry into the same transaction makes that structurally impossible: either both happen, or neither does.
- **`withdraw()`'s `noteOwner` parameter**: since `withdraw()` can be called by an intermediary contract on the user's behalf (`LiFiPrivacyBridge.privateBridge()`), the journal entry is keyed by an explicit `noteOwner` address rather than `msg.sender`. Anyone could in principle pass an arbitrary address here, but the entry is opaque ciphertext only the real owner's derived key can decrypt — a spoofed entry simply fails to decrypt and is ignored.
- **Key derivation**: a single `personal_sign` of a fixed, address-normalized message → HKDF → AES-256-GCM. ECDSA `personal_sign` is deterministic and implemented near-identically across wallets, so every device controlling the private key derives the exact same key with one free, gasless signature.
- **Reading**: `resyncFromShieldVaultJournal` reads `NoteJournal` events directly from `PrivarShieldVault`, paginating `eth_getLogs` with a genesis-block floor (Arc Testnet is already tens of millions of blocks deep — scanning from block 0 reliably triggers RPC rate limits) and persisting scan progress locally so an interrupted pass resumes instead of restarting.
- **Merge safety**: a local note is only ever removed on positive evidence (an explicit "spent" op decrypted from the journal) — never merely because it's absent from one read pass, which avoids pruning a note that's just not indexed yet.

**`PrivarCloudVault`** (a standalone, events-only contract — `pushDelta`/`pushCheckpoint`) is still deployed and read (`resyncFromCloudVault`) for backward compatibility with journal entries pushed before the v3.4 upgrade, and as the manual "Sync Notes to Cloud" backfill path in Settings for any note that still predates it. New activity no longer pushes to it.

**`PrivarStaking` is untouched by any of this** — it's a fully public ERC-20 staking contract (positions indexed by `msg.sender`, readable directly via `getUserPositions()`), with no shielded notes involved at all. It was redeployed as part of the v3.4 suite for a clean, internally-consistent stack, but its logic and persistence model didn't change — it was already natively persistent on-chain.

This only concerns a wallet's own notes. Notes received from other wallets via confidential send still use the separate ECDH `ViewKeyRegistry` pipeline, untouched by any of the above.

## Privacy model

| Layer | Visible on-chain | Private |
|---|---|---|
| Deposit | Amount + ShieldVault address | Depositor ↔ withdrawal link |
| Shielded Send | Merkle root update | Sender, recipient, amount |
| Withdraw | Amount + recipient | Link to original deposit |
| Bridge | Amount + destination chain | Recipient address |
| Cloud sync | That an address pushed N encrypted bytes | Note contents (commitment, amount, token) |

## Protocol fees

- Deposit/withdraw fee in basis points, read live from `PrivarShieldVault.protocolFeeBps()` (`previewDepositFee` / `previewWithdrawFee` in `contracts.js`) — no fee value is hardcoded in the frontend.
- Live in the Analytics panel.

## Network

| Field | Value |
|---|---|
| Chain ID | `5042002` |
| Gas token | USDC (ERC-20, 6 decimals) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (1 USDC/day) |

## Installation

Requirements: [Node.js](https://nodejs.org/) ≥ 18 and npm.

```bash
git clone <repo-url>
cd privar-frontend
npm install
```

## Configuration

Fallback contract addresses are hardcoded in `src/contracts.js` — no `.env` is required to run the app against the addresses in [Deployed addresses](#deployed-addresses) above. Override any of them per-deployment with Vercel env vars instead of touching code:

| Variable | Overrides |
|---|---|
| `VITE_SHIELD_VAULT` | `PrivarShieldVault` |
| `VITE_CLOUD_VAULT` | `PrivarCloudVault` |
| `VITE_STAKING` | `PrivarStaking` |
| `VITE_LIFI_ADAPTER` / `VITE_LIFI_BRIDGE` / `VITE_LIFI_DIAMOND` | LI.FI contracts |
| `VITE_XYLONET_ADAPTER` / `VITE_UNISWAP_ADAPTER` / `VITE_CURVE_ADAPTER` | Direct/reserve swap adapters |
| `VITE_XYLO_ROUTER` / `VITE_UNISWAP_ROUTER` | Raw DEX routers (quoting only) |

See the top of `src/contracts.js` for the full list, including infra addresses (`Timelock`, `Governance`, `ViewKeyRegistry`, `PrivarMerkleTreeManager`, `PrivarNullifierRegistry`, `PrivarDepositManager`).

## Build and test

```bash
npm run dev      # local dev server
npm run build    # production build — no env vars required (fallback addresses built-in)
npm test         # scripts/test-tx-history-decimals.mjs — no dependencies, no network required
```

## Deployment

Deploy on **Vercel** — zero config. Fallback contract addresses are hardcoded in `src/contracts.js`; override any of them via the Vercel env vars listed in [Configuration](#configuration) above without a code change.

**Syncing a new contracts release:** after the contracts repo publishes a new `deployments/latest.json`, update the address block (and `PROTOCOL_VERSION`) at the top of `src/contracts.js` to match, bump the version badge above, and add a dated entry to the [Changelog](#changelog). This is a config-only change — no other frontend logic needs touching unless the contracts release notes call out a new/changed function signature (e.g. `withdrawBatch()` in v5.1.0).

## GitHub / Release procedure

```bash
git add src/contracts.js README.md
git status   # make sure no .env / dist/ / node_modules/ slipped in (already in .gitignore)

git commit -m "chore: sync contracts.js with vX.Y.Z deployment (latest.json <timestamp>)"
git tag vX.Y.Z
git push origin main --tags
```

Open a PR against `main`, and before merging a contract-address sync specifically: confirm the Shield panel's TVL/version stats reflect the new vault, and — since a full-suite redeploy is never a migration — communicate to users that any balance on the previous `PrivarShieldVault` address must be withdrawn from there before switching over.

## Changelog

### v19.2.2 — sync contract addresses (v5.3.0 redeploy #2, 2026-08-26)
- Second full-suite redeploy of the same v5.3.0 contract suite (no code/feature change since v19.2.1 on the contracts side) — sync against the new `deployments/latest.json` (deployed `2026-08-26T03:48:28.987Z`). Every address refreshed again: `PrivarShieldVault`, `PrivarMerkleTreeManager`, `PrivarNullifierRegistry`, `PrivarDepositManager`, `XyloNetPrivacyAdapter`, `LiFiPrivacyAdapter`/`LiFiPrivacyBridge`, `CurvePrivacyAdapter`, `PrivarSpendKeyRegistry`, `PrivarNoteRelay`, `LiFiBridgeAdapter`, `PrivarStaking`, `PrivarCloudVault`. `PROTOCOL_VERSION` stays `"5.3.0"` (unchanged — same contracts version, different deployment run).
- Not a migration — prior shielded balances (including anything shielded against the v19.2.0/2026-08-25 addresses) stay in that previous `PrivarShieldVault` and must be withdrawn from there separately.

### v19.2.1 — fix: shielded balance double-counting, ghost-note resurrection (2026-08-26)
- `useShieldedBalances`'s balance sum used to include notes with `status: "sent"` — the sender-side history copy of an output note, deliberately kept non-spendable — alongside the real change note, so a partial send's balance looked unchanged (e.g. sending 1 of 10 USDC still showed 10: 9 change + 1 wrongly-counted "sent" copy). Fixed to exclude `"sent"`/`"locked"` notes from the sum, and from all four spend-candidate selection sites (swap/send/withdraw/bridge), for consistency.
- `fetchLogsPaginated()`'s Blockscout-first path ignored its own persisted scan checkpoint and re-queried the full ~5,000,000-block window on every periodic poll — re-decrypting and re-adding already-spent stealth/relay notes as if newly arrived (a withdrawn note's balance would silently reappear, and a second withdraw attempt on it would then correctly-but-confusingly fail with a spent-nullifier error). Fixed to narrow the query using the checkpoint, same as the RPC fallback path already did.
- `reconcileAndVerifyNotes()`'s spent-note pruning checked a `nullifier` field no note object has ever actually carried (dead code since it was written — always false, never pruned anything). Fixed to recompute each note's deterministic nullifier (`Poseidon(secret, commitment)`) on the fly and check that against on-chain `Withdrawn` events — this also self-heals any already-resurrected ghost note automatically on the next periodic pass, no manual cleanup needed for accounts affected by the above.

### v19.2.0 — Note Engine: private send/bridge to third parties, address-free note relay (v5.3.0 redeploy, 2026-08-25)
- Full-suite redeploy sync against the new `deployments/latest.json` (deployed `2026-08-25T20:50:51.702Z`) — every Privar-deployed address refreshed: `PrivarShieldVault`, `PrivarMerkleTreeManager`, `PrivarNullifierRegistry`, `PrivarDepositManager`, `XyloNetPrivacyAdapter`, `LiFiPrivacyAdapter`/`LiFiPrivacyBridge`, `CurvePrivacyAdapter`, `PrivarStaking`, `PrivarCloudVault` — **plus three newly-deployed contracts**: `PrivarSpendKeyRegistry`, `PrivarNoteRelay`, `LiFiBridgeAdapter` (all previously `0x000…000`/not deployed, now live). `PROTOCOL_VERSION` bumped to `"5.3.0"`.
- **Note Engine (Analyse-Private-Send-Privar.md §7–9)** — deterministic Poseidon/Baby Jubjub commitment & nullifier derivation (`src/noteCrypto.js`, new) now used across `deposit()`, `sendShielded()`, `swap()`, `withdraw()` (single-note and batch), and `bridge()`, replacing the prior `randomBytes32()` commitments/nullifiers everywhere a wallet signature is available — falls back to the old random behavior only for legacy notes or an unavailable signature (never a hard failure).
- **Private send to a real third party**: `sendShielded()` can now derive a deterministic output commitment for a recipient who has registered a Baby Jubjub spend key on `PrivarSpendKeyRegistry` (previously deterministic derivation only worked for self-sends).
- **`deposit()` to a third party** (`ShieldPanel`, new optional "DEPOSIT TO" field): shields funds directly into someone else's balance. Hard-blocks (no fallback) if the recipient hasn't registered a spend key — unlike send, a random commitment here would create permanently unspendable funds.
- **Address-free note relay** (`PrivarNoteRelay`, new): `sendShielded()`/third-party `deposit()` now prefer relaying the encrypted note via `PrivarNoteRelay.relayNote()` — which carries no recipient address at all — over the legacy `ViewKeyRegistry.emitNote()` (recipient address in clear). Falls back to `ViewKeyRegistry` when the recipient hasn't registered a spend key or `PrivarNoteRelay` isn't reachable. `ViewKeyRegistry` itself is unchanged.
- **Private bridge, multi-adapter** (`PrivarShieldVault.privateBridgeWithAdapter()`, new): the `bridge()` UI flow now prefers this over the legacy standalone `LiFiPrivacyBridge` contract when `LiFiBridgeAdapter` is deployed — same LI.FI route, but through the vault's own whitelisted-adapter mechanism (`bridgeAdapterWhitelist`), same model already used for swap routers. Falls back to `LiFiPrivacyBridge` otherwise.
- See `NOTE-ENGINE-PROGRESS.md` for the full session-by-session implementation log and the design decisions behind each piece above.
- Not a migration — prior shielded balances remain in the previous `PrivarShieldVault` address; communicate to users that they need to withdraw from there before switching over.

### v19.1.0 — sync contract addresses (v5.2.0 redeploy, 2026-08-23)
- Config-only sync against the new `deployments/latest.json` (deployed `2026-08-23T09:14:51.263Z`) — full-suite redeploy, every Privar-deployed address refreshed: `PrivarShieldVault`, `PrivarMerkleTreeManager`, `PrivarNullifierRegistry`, `PrivarDepositManager`, `XyloNetPrivacyAdapter`, `LiFiPrivacyAdapter`/`LiFiPrivacyBridge`, `CurvePrivacyAdapter`, `PrivarStaking`, `PrivarCloudVault`.
- `PROTOCOL_VERSION` bumped to `"5.2.0"` — contracts v5.2.0 makes `PrivarShieldVault.version()` storage-backed and admin-correctable (`setVersion()`) instead of a hardcoded `pure` literal frozen at `"3.5.0"`; this frontend constant is still kept as the UI's source of truth rather than switching to an on-chain read, to avoid drifting from whatever `setVersion()` was last called with independently of this build — see the constant's own doc comment in `src/contracts.js`.
- `XyloRouter`, `LiFiDiamond`, `UniswapPrivacyAdapter` (still unset), `Timelock`, `Governance`, `ViewKeyRegistry`, `NATIVE_USDC`/`EURC`/`cirBTC` unchanged.
- Boot splash screen removed (`Boot` component + `booted` state gate in `AppCore`) — it only replayed a decorative fake connection script (~2.8s), no real RPC/provider work happened in it; the DApp now renders immediately after Landing.
- Desktop shell widened from a 960px mobile-width column to 1320px; sidebar expanded from a 52px icon-only rail to a 208px labeled sidebar; top bar height 40px → 52px. Mobile layout untouched (already used `100%` width).
- Landing page's protocol-status terminal (`TERMINAL_LINES`) now derives its `ShieldVault`/`MerkleTreeManager`/`NullifierRegistry`/`Timelock` addresses from `CONTRACTS` instead of a hardcoded placeholder frozen on the very first deploy.
- Not a migration — prior shielded balances remain in the previous `PrivarShieldVault` address (`0x326E29e5...ca7D5d` supersedes `0xc4c985Aaf3497173435c68E4FACfDfa66c7352A0`).

### Config-only address syncs

The following releases changed **only** the address block in `src/contracts.js` against a new contracts `deployments/latest.json` — no frontend logic touched, no new deployed addresses beyond what's listed. Grouped here since each entry follows the identical pattern; the [Deployed addresses](#deployed-addresses) table above always reflects the current one.

- **v18.11.1** (`2026-08-22T20:02:27.418Z`) — `0xc4c985Aaf3...` supersedes `0x380302C9E3...`
- **v18.11.0** (`2026-08-22T18:42:28.003Z`) — `0x380302C9E3...` supersedes `0x8662Fbf6a9...`
- **v18.0.4** (`2026-08-22T18:42:28.003Z`) — `0x8662Fbf6a9...` supersedes `0x8ec176Dbd4...`
- **v18.0.1** (`2026-08-22T11:42:08.320Z`) — config-only sync; same known finding flagged in v18.0.0 (event topics vs. deployed ABI) still applied and was unaffected by this sync

Each carried forward every fix from the release before it unaffected (v18.0.2/v18.0.3/v18.0.5's clamp, quarantine, and phantom-leak fixes below).

### v18.0.5 — fix phantom change-note leak from the v18.0.2 clamp
- **Regression introduced by v18.0.2**: the real-on-chain-balance clamp (`amountBig = realBal` when a local note is ahead of the vault's real balance) reduced the amount actually sent on-chain, but the change/"remaining" note computed right after it (`remaining = note.amount - amountBig`) kept using the un-clamped, possibly-inflated `note.amount` as its base. Every time the clamp fired, this fabricated a "change" note worth exactly the clamped-away gap — value that never existed on-chain. Repeated over several USDC↔EURC round-trips this compounds into a steadily-growing shielded-wallet balance that outpaces the real protocol TVL (confirmed: local $9.96 vs. real TVL $9.92 after a handful of round trips, with the app's own "local balance higher than TVL" banner correctly flagging it).
- **Fix**: `realBal` is now hoisted out of the clamp's `try` block so the change-note computation can see it. The change note's base is now `min(note.amount, realBal)` instead of `note.amount` alone — if the clamp fired, the true leftover is computed against the real on-chain balance, not the inflated local figure. No leak, no phantom value.
- Frontend-only, `swap()` only (the only function with the v18.0.2 clamp — `send()`/`withdraw()`/`bridge()` don't have this specific regression, though their `remaining` computation follows the same pattern and is worth the same scrutiny if similar drift is ever observed there).
- **Not retroactive**: any drift already sitting in a browser's localStorage from before this fix (e.g. the $0.04 in the example above) is not auto-corrected — no reconciliation-to-TVL tool exists yet, to avoid silently deleting value on a false positive (TVL can legitimately diverge from one user's local balance if there are other depositors, or purely from timing). Flagged for a possible future one-time reconciliation pass, similar in spirit to v18.0.3's quarantine recovery.

### v18.0.3 — note-lifecycle: stop quarantining swap/send/bridge/withdraw outputs
- **Root cause**: `reconcileAndVerifyNotes()` required every local note to have a matching `Deposited` event once past the 10-minute grace window. Notes created as the *output* of a swap, send, bridge, or partial withdraw (e.g. the leftover "change" note of a partial swap) are added purely from that operation's own embedded NoteJournal entry — they structurally never have, and never will have, a `Deposited` event of their own. Once past the grace window, every one of these perfectly legitimate notes got silently moved to the quarantine bucket ("no matching Deposited event on-chain") and dropped from the displayed shielded balance — even though the vault's real on-chain balance (and protocol TVL) still held the funds. With enough swap/send/bridge activity this can end up quarantining *every* local note, leaving the shielded wallet at $0.00 while TVL is still nonzero — confirmed via ArcScan + the app's own TVL dashboard vs. shielded-wallet panel.
- **Fix (forward-looking)**: `finalizeOp()` now tags every output note with `origin: op.kind` ("swap"/"send"/"bridge"/"withdraw"); legacy notes without an `origin` field are treated as `"deposit"` for backward compatibility. `reconcileAndVerifyNotes()` now only requires a matching `Deposited` event for `origin === "deposit"` notes — swap/send/bridge/withdraw-created notes are exempt, since checking them against an event type they can never emit was the bug.
- **Fix (retroactive recovery)**: new `recoverWronglyQuarantinedNotes()`, wired into `useShieldedBalances()`'s `compute()`, replays the local `pendingOps` ledger (untouched by this bug — it records each op's confirmed outcome directly) to identify quarantined notes that were legitimately created by a successful swap/send/bridge/withdraw and never later spent, and restores them to the active, spendable note set. Idempotent, runs on every balance computation, no manual action needed.
- Frontend-only — no contract changes, no new deployed addresses.

### v18.0.2 — swap-in real-balance clamp
- **Root cause**: a swap's output note is journaled locally (and in the encrypted cross-device entry) using the pre-trade router quote (`attemptXyloNet()`'s on-chain `getAmountsOut()` read, or its price-matrix fallback) — never the post-trade amount the vault actually measured and credited. On Arc Testnet this local figure ended up exactly 1 raw unit (0.000001 EURC) ahead of the vault's real on-chain EURC balance — confirmed via ArcScan's raw call trace (`ERC20: transfer amount exceeds balance` inside a plain `EURC.transfer(dexRouter, amountIn)`, no adapter ever reached) cross-checked against the vault's real `ERC-20 tokens` balance vs. the shielded-wallet panel's MAX-prefilled amount.
- **Fix**: `swap()` (`src/DApp.jsx`) now reads the vault's real `tokenIn.balanceOf(PrivarShieldVault)` right before building the transaction and clamps `amountIn` down to it if the locally-recorded note is even slightly ahead — mirroring the same defensive pattern the v3.4.2 MAX-button/note-selection fix already applies to the *local* note-vs-request mismatch, extended to the *local note-vs-real-chain-balance* mismatch. The clamp only ever makes the request smaller, never larger, so it introduces no new failure mode; if the RPC read itself fails, the swap proceeds with the local amount as before rather than blocking outright.
- Frontend-only — no contract changes, no new deployed addresses.
- **Superseded in part by v18.0.5 above** (a regression this fix introduced on the output side) — see that entry.

### v18.0.0 — robust note lifecycle + tx-history decimal fix
- **Robust note lifecycle** (`swap()`/`sendShielded()`/`withdraw()`/`bridge()`): new persistent pending-ops ledger (`lockNotesForOp()`/`markOpSubmitted()`/`finalizeOp()`/`watchPendingOps()` in `src/DApp.jsx`) replaces the old pattern of reading local notes once at the start of each function and writing a derived snapshot back at the end. Fixes notes becoming unusable (but still visibly shown) after a swap regardless of outcome, USDC disappearing without the corresponding EURC appearing, and the "local balance is Higher than TVL balance" desync. See `CHANGELOG-note-lifecycle-fix.md` for full root-cause analysis.
- **Tx-history decimal-scale fix**: `decimalsForToken()`/`symbolForToken()` (`src/DApp.jsx`) replace a hardcoded `/1e6` that inflated every native-USDC Shield/Withdraw history entry by exactly 1e12, and fix Withdraw/Bridge entries always labeling the amount "USDC"/"EURC" regardless of the real token. See `CHANGELOG-tx-history-decimals-fix.md`.
- New regression test: `scripts/test-tx-history-decimals.mjs` (`npm test`) — no dependencies, no network required.
- **Known finding, fixed later**: `EV.SwapExecuted`, `EV.BridgeInitiated`, `EV.ShieldedTransferProcessed`, and the `PrivarStaking` event topics in `src/DApp.jsx` did not match any event signature in the contracts source at the time — flagged for regeneration against the actual deployed ABI during a full redeploy rather than hand-computed topics.

### v17.2.0 — native-USDC swaps fixed for real, multi-note withdrawal
- **Native-USDC swap fix**: removed the interim `tokenInIsNative` skip in `attemptXyloNet()`/`attemptUniswap()` — both direct adapters handle native-`tokenIn` swaps correctly again now that the contracts-side decimal-scale bug (not a missing router feature) is actually fixed. See [Native-USDC swap fix](#native-usdc-swap-fix) above. Confirmed on-chain: EURC → USDC and USDC → EURC both succeed.
- **Multi-note withdrawal**: note selection now picks the fewest notes (largest-first) needed to cover a requested amount instead of requiring a single note to cover it alone; uses the new `PrivarShieldVault.withdrawBatch()` (`SEL.withdrawBatch = "0x775968f5"`) when 2+ notes are needed, falls back to the unmodified `withdraw()` for a single sufficient note. See [Multi-note withdrawal](#multi-note-withdrawal) above.
- Synced against contracts `v5.1.0` (`deployments/latest.json`) — full-suite redeploy, every address refreshed.
- Not a migration — prior shielded balances remain in the previous `PrivarShieldVault` address.

### v17.1.3 — real on-chain swap quoting for XyloNet/Uniswap
- Root cause of the `XyloRouter: INSUFFICIENT_OUTPUT` revert seen after the v5.0.2 contract fix: the Swap panel's `minAmountOut` was derived entirely from an off-chain price-matrix estimate (external EUR/USD feed × 0.9995, then 1% slippage tolerance) — never from the pool's actual reserves. On a thin/imbalanced testnet pool that estimate can diverge from the real rate by more than the tolerance, so the router correctly rejects the trade even though nothing else is broken.
- Added `buildGetAmountsOutCall()` / `decodeAmountsOutReturn()` (`src/contracts.js`) — standard Uniswap V2 `getAmountsOut(uint256,address[])`, works against both XyloRouter and any future Uniswap V2-shaped router.
- Added `CONTRACTS.XyloRouter` / `CONTRACTS.UniswapRouter` — raw router addresses, read-only quoting only, never a swap tx target (that stays the `*PrivacyAdapter` address).
- `attemptXyloNet()` / `attemptUniswap()` in `DApp.jsx` now call the router's real `getAmountsOut()` before submitting and compute `minAmountOut` from that (same 1% tolerance) — falls back to the previous price-matrix estimate only if the on-chain read fails (router unset/unreachable). The price-matrix estimate still powers the on-screen "you'll receive ~X" preview — only the actual `minAmountOut` sent on-chain changed.

### v17.1.2 — sync XyloNetPrivacyAdapter redeploy (v5.0.2 fix)
- `XyloNetPrivacyAdapter` address updated — the v5.0.1 redeploy (previous entry below) had routed native-tokenIn swaps through an unverified payable `swapExactETHForTokens`, which was never confirmed to exist on XyloRouter; v5.0.2 reverts to a single `approve()` + `swapExactTokensForTokens()` path for both native and ERC-20 tokenIn, scaling native USDC's 18-dec amount to XyloRouter's 6-dec ERC-20 view — see contracts repo's v5.0.1 → v5.0.2 changelog.
- No other address changed, no frontend logic touched — config-only sync.

### v17.1.1 — sync XyloNetPrivacyAdapter redeploy (v5.0.1 bug fix, since superseded)
- `XyloNetPrivacyAdapter` address updated after a contracts-side fix attempt for native-tokenIn swaps (`USDC → EURC` etc.) that previously reverted with `ERC20: transfer amount exceeds balance`; see contracts repo's v5.0.0 → v5.0.1 changelog.
- ⚠️ Superseded by v17.1.2 above — the underlying v5.0.1 contract fix itself turned out to rely on an unverified router function.

### v17.1.0 — Liquidity Engine: direct adapters primary, LI.FI/Curve reserve
- Swap routing reordered to match the `PrivateSwapRouter` architecture: **direct adapters** (`XyloNetPrivacyAdapter`, then `UniswapPrivacyAdapter`) are now tried first — on-chain, deterministic pricing, no off-chain quote round-trip — before falling back to the **reserve/aggregator** pair (`LiFiPrivacyAdapter`, then `CurvePrivacyAdapter`), which stay fully active and whitelisted but are only reached dynamically when no direct adapter covers the pair.
- `XyloNetPrivacyAdapter` added to `src/contracts.js` — new, independent contract from `UniswapPrivacyAdapter`.
- Synced against contracts `v5.0.0` — real deployed addresses for the full suite.
- Theme system (`src/theme.jsx`, `ThemeProvider`) and mobile-responsive layout (collapsible sidebar below 720px) — visual/UX only, no protocol logic touched.
- Not a migration — v4.0.0 shielded balances remain in the prior `PrivarShieldVault` address.

### v3.4.2 — full protocol redeployment, swap decimal-scale fix
- **Fixed a real accounting bug**: `_privateSwap()` credited `totalShieldedByToken[tokenOut]` and the re-shielded note with the raw 6-decimal ERC20-pseudo-view `amountOut` whenever `tokenOut == NATIVE_USDC`, instead of the native 18-decimal scale used everywhere else for that token — confirmed on-chain via `feesCollectedByToken(NATIVE_USDC) = 150104000000000000` (native 18-dec) vs `totalShieldedByToken(NATIVE_USDC) = 3085477` (raw 6-dec) for the same token. Every swap landing in native USDC credited ~10⁻¹² of what was actually received.
- Frontend: swap flow now mirrors the same `*1e12` scaling when journaling the new note locally (`noteAmountOut`), keeping client-side notes consistent with the on-chain ledger for native-USDC swap outputs.
- Frontend: MAX-amount buttons (swap/send/withdraw/bridge) now use the exact raw note balance instead of a 2-decimal-rounded display value, and the note-selection fallback now actually clamps the requested amount to the note's real balance instead of only promising to in a comment — both were causing spurious `ERC20: transfer amount exceeds balance` reverts independent of the decimal-scale bug above.
- Full-suite redeployment (every contract fresh) for stack consistency.
- Not a migration — v3.4.1 shielded balances remain in the old `PrivarShieldVault` address.

### v3.4.1 — full protocol redeployment, swap accounting fix
- **Fixed a real accounting bug**: `_privateSwap()`'s `!isNativeIn` branch (tokenIn = EURC/cirBTC) trusted the swap router's reported `amountOut` with no verification, unlike the `isNativeIn` branch which always measured a real balance delta — confirmed on-chain via `totalShieldedByToken(EURC) = 2,998,471` while `EURC.balanceOf(vault) = 0`. Both branches now measure the same real balance delta and clamp `amountOut` to it.
- Full-suite redeployment (every contract fresh) for a clean, internally-consistent v3.4.1 stack.
- Not a migration — v3.4.0 shielded balances remain in the old `PrivarShieldVault` address.

### v3.4.0 — full protocol redeployment
- **Protocol-wide note-journal persistence**: see [Note-journal persistence (v3.4)](#note-journal-persistence-v34) above for the full writeup.
- `withdraw()` gains an explicit `noteOwner` parameter so `LiFiPrivacyBridge.privateBridge()` (which calls `withdraw()` on the user's behalf) attributes the journal entry to the right wallet.
- Fixed a real pre-existing bug in the Confidential Send flow: the calldata builder was called with mismatched field names, leaving `nullifier`/`root` undefined.
- Full-suite redeployment, not a migration — v3.3 shielded balances remain in the old `PrivarShieldVault` address.

### v15.6.0
- **PrivarCloudVault**: new standalone contract for decentralized, events-only cross-device note sync (checkpoint + delta journal).
- Fixed cross-wallet key-derivation bug (EIP-712/personal_sign branching could silently derive two different keys on two different wallets).
- Fixed unnormalized address casing in the signed backup message (different wallets return different casing for the same address).
- Fixed a same-device regression where resync could prune a just-shielded note before its own event was indexed.
- Fixed RPC rate-limit death spiral in `eth_getLogs` pagination; added a genesis-block floor and persisted scan progress.
- Full rebrand PrivARC → Privar across frontend (contract addresses, storage keys, and 6 crypto/migration strings deliberately left untouched to avoid breaking existing users' data).

### v12.0.0
- ECDH Stealth Notes — real P-256 view keys via `ViewKeyRegistry`, auto-decrypted on connect.
- LI.FI swap + bridge integration (`LiFiPrivacyAdapter`, `LiFiPrivacyBridge`, `LiFiDiamond`).
- Circle CCTP v2 bridge.
- Governance panel: static protocol params + contract directory.
- Wallet-scoped localStorage isolation + on-chain deposit reconciliation at connect.

## License

MIT — see [LICENSE](LICENSE)
