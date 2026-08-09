# Privar OS

![version](https://img.shields.io/badge/version-v3.4.0-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v3.4.0-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-testnet-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas): shield, swap, send, withdraw, and bridge USDC/EURC/cirBTC privately, with protocol-wide note-journal persistence embedded directly in every shielding transaction (v3.4) — no separate broadcast that can silently fail.

---

## Deployed contracts — Arc Testnet (v3.4.0)

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`
Deployed: 2026-08-09T11:20:37Z — full protocol redeployment (not a migration; see [Note-journal persistence](#note-journal-persistence-v34) below).

| Contract | Address | Frontend key (`src/contracts.js`) |
|---|---|---|
| **PrivarShieldVault** ³ | `0xf80D237A730788B3673EA4660B67E87232905CB0` | `PrivarShieldVault` |
| PrivarMerkleTreeManager | `0xddDB0e99F1d1170A4aa4717a4DeD34120cC64f2e` | `PrivarMerkleTreeManager` |
| PrivarNullifierRegistry | `0xd16a588Ef75e991c1A4774f3863391051C44d9e0` | `PrivarNullifierRegistry` |
| PrivarDepositManager | `0xC0873536178607567c1172947ec477f4F0176C7F` | `PrivarDepositManager` |
| PrivarWithdrawManager | `0x76F8Ee057FBe72009B576e96889873b51591dfeD` | `WithdrawalManager` |
| PrivarStaking (public, no notes — see below) | `0x9288AcdeB38d0ebfE5b0A85857A5CF04f80B442e` | `PrivarStaking` |
| VerifierZK (Mock¹) | `0x9643E2494ca2d695376939e2416B04ea58A92863` | `MockVerifierZK` |
| **PrivarCloudVault** ² | `0x16505F02E7C759ddF921e75acEf9afFfd7d43Eb7` | `PrivarCloudVault` |
| ViewKeyRegistry (unchanged since v1.0.0) | `0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b` | `ViewKeyRegistry` |
| LiFiPrivacyAdapter (active swap router) | `0x731c81A345D1f0C47571bf3472d6Cb92b40E2Dac` | `LiFiPrivacyAdapter` |
| LiFiPrivacyBridge ³ | `0x171DA0e3Ae1234645f59cC9ACB532d23B52d30b6` | `LiFiPrivacyBridge` |
| LiFiDiamond | `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` | `LiFiDiamond` |
| TowerSwapAdapter (documented rollback target, not routed) | `0x3DAAcBc477CdeC3Ef66804C946254Af04cd30826` | `TowerSwapAdapter` |
| USDC (native gas token) | `0x3600000000000000000000000000000000000000` | `NATIVE_USDC` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `EURC` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | `cirBTC` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `CCTP_TokenMessenger` |

¹ Testnet only — `MockVerifierZK` accepts all well-formed proofs; not the production Groth16 verifier.
² Standalone, additive deployment — no constructor args, no dependency on ShieldVault or any other contract. Since v3.4, ShieldVault's own `NoteJournal` event is the *primary* persistence path for new activity — CloudVault stays deployed for backward compatibility with pre-v3.4 journal entries and as the manual "Sync Notes to Cloud" backfill in Settings. See [Note-journal persistence](#note-journal-persistence-v34) below.
³ Redeployed for v3.4 — gained a `NoteJournal` event and, on `withdraw()`, an explicit `noteOwner` parameter. See below.

All fallback addresses are hardcoded in `src/contracts.js` and can be overridden per-deployment with `VITE_*` env vars (Vercel) without touching code.

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

### v3.4.0 (current) — full protocol redeployment
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
