# Privar OS

![version](https://img.shields.io/badge/version-v3.4.1-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v3.4.1-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-testnet-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas): shield, swap, send, withdraw, and bridge USDC/EURC/cirBTC privately, with protocol-wide note-journal persistence embedded directly in every shielding transaction (v3.4) — no separate broadcast that can silently fail.

---

## Deployed contracts — Arc Testnet (v3.4.1)

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`
Deployed: 2026-08-11T01:58:43Z — full protocol redeployment (not a migration; see [Swap accounting fix](#swap-accounting-fix-v341) below).

| Contract | Address | Frontend key (`src/contracts.js`) |
|---|---|---|
| **PrivarShieldVault** ⁴ | `0xfC622C2DbF6458a7D1Bb6a7637299EbC098dD202` | `PrivarShieldVault` |
| PrivarMerkleTreeManager | `0xf7e4015EA54bD1DADF2ADEe2dFaB39b7cE09bD5D` | `PrivarMerkleTreeManager` |
| PrivarNullifierRegistry | `0xbFa2587FDBd61BA55670F5642e0EaF0B5b64553f` | `PrivarNullifierRegistry` |
| PrivarDepositManager | `0x6F10eCD7de99988A28AAfF4d045f32664F81Ad4A` | `PrivarDepositManager` |
| PrivarWithdrawManager | `0x168DdE786F669914C4Da0C5879d0fCD114336d93` | `WithdrawalManager` |
| PrivarStaking (public, no notes — see below) | `0x1d794E327A949c27386293aA743D9CCbb6DF2D0C` | `PrivarStaking` |
| VerifierZK (Mock¹) | `0xD25C3527281b7004B82f69892e57Fdc677D21740` | `MockVerifierZK` |
| **PrivarCloudVault** ² | `0x07C82F9A3bcd2c20daD0510D7b2A4E51ceaD9735` | `PrivarCloudVault` |
| ViewKeyRegistry (unchanged since v1.0.0) | `0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b` | `ViewKeyRegistry` |
| LiFiPrivacyAdapter (active swap router) | `0x4B1E04899d29D30937eA13969711F84f46662E62` | `LiFiPrivacyAdapter` |
| LiFiPrivacyBridge ³ | `0xE2d8541a4a88134279769Ef9fFb41D21B82C3108` | `LiFiPrivacyBridge` |
| LiFiDiamond | `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` | `LiFiDiamond` |
| TowerSwapAdapter (documented rollback target, not routed) | `0x3C7f295387049c827077092f1cA5e5592Da46De9` | `TowerSwapAdapter` |
| USDC (native gas token) | `0x3600000000000000000000000000000000000000` | `NATIVE_USDC` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `EURC` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | `cirBTC` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `CCTP_TokenMessenger` |

¹ Testnet only — `MockVerifierZK` accepts all well-formed proofs; not the production Groth16 verifier.
² Standalone, additive deployment — no constructor args, no dependency on ShieldVault or any other contract. ShieldVault's own `NoteJournal` event is the *primary* persistence path for new activity — CloudVault stays deployed for backward compatibility with pre-v3.4 journal entries and as the manual "Sync Notes to Cloud" backfill in Settings.
³ Repointed at the new ShieldVault via `setShieldVault()` — logic unchanged since v3.4.0.
⁴ Redeployed for v3.4.1 — fixes a real swap accounting bug. See [Swap accounting fix](#swap-accounting-fix-v341) below.

All fallback addresses are hardcoded in `src/contracts.js` and can be overridden per-deployment with `VITE_*` env vars (Vercel) without touching code.

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

### v3.4.1 (current) — full protocol redeployment, swap accounting fix
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
