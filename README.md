# Privar OS

![version](https://img.shields.io/badge/version-v15.6.0-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v3.0.0-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-testnet-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas): shield, swap, send, withdraw, and bridge USDC/EURC/cirBTC privately, with cross-device shielded-note sync via a dedicated on-chain journal (**PrivarCloudVault**).

---

## Deployed contracts — Arc Testnet (v3.0.0)

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`

| Contract | Address | Frontend key (`src/contracts.js`) |
|---|---|---|
| **PrivarShieldVault** | `0x4F8569CC8CaD8228fA4A3E493f9dcFebcDfeb43b` | `PrivarShieldVault` |
| PrivarMerkleTreeManager | `0xe300f445DdE5387A1a1Fa606A0901114d15682f9` | `PrivarMerkleTreeManager` |
| PrivarNullifierRegistry | `0xabCC5DD1943A1C9F25FDD86AC422373F87A93ea5` | `PrivarNullifierRegistry` |
| PrivarDepositManager | `0x69Aa71BA7D1d65997715d0f287C6381490773d9a` | `PrivarDepositManager` |
| PrivarWithdrawManager | `0x1a2d739287cEAa7d4136Ebc7C1aECEc00647a076` | `WithdrawalManager` |
| PrivarStaking | `0xc43ffaC60e797DCb2C9eEcFba199696E75d90168` | `PrivarStaking` |
| VerifierZK (Mock¹) | `0x6dcC80c09f789cd2a3403834465B3d66372606D6` | `MockVerifierZK` |
| **PrivarCloudVault** ² | `0x348DF4D1b448dAB5DE63a16E7d9E64665c89664E` | `PrivarCloudVault` |
| ViewKeyRegistry | `0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b` | `ViewKeyRegistry` |
| LiFiPrivacyAdapter (active swap router) | `0x0703963ce37a485CFd6F9657dAA7361B07DCf39D` | `LiFiPrivacyAdapter` |
| LiFiPrivacyBridge | `0x58d00F418Fc05426ed8d09028E7A97c3d8Cf3E7b` | `LiFiPrivacyBridge` |
| LiFiDiamond | `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` | `LiFiDiamond` |
| TowerSwapAdapter (documented rollback target, not routed) | `0x6d0350b3B3Ea2f7f0eba72B5bD51BC3c6A905132` | `TowerSwapAdapter` |
| USDC (native gas token) | `0x3600000000000000000000000000000000000000` | `NATIVE_USDC` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `EURC` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | `cirBTC` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `CCTP_TokenMessenger` |

¹ Testnet only — `MockVerifierZK` accepts all well-formed proofs; not the production Groth16 verifier.
² Standalone, additive deployment — no constructor args, no dependency on ShieldVault or any other contract. See [Cross-device note sync](#cross-device-note-sync--privarcloudvault) below.

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
| `resyncFromCloudVault` / `relaySelfNote` / `relaySelfSpend` | Push/pull sync of this wallet's own note journal (`PrivarCloudVault`) |

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

## Cross-device note sync — PrivarCloudVault

Shielded notes are normally only known to the browser that created them. `PrivarCloudVault` is a standalone, events-only contract that lets a device back up its own note journal on-chain, encrypted, so any other device controlling the same wallet can reconstruct the same shielded balance automatically — no manual export/import.

- **Transport**: `pushDelta(bytes)` for one incremental change (a new note, or a spent one), `pushCheckpoint(bytes32,bytes)` for a periodic full snapshot. Both emit events only — the contract never stores the payload, only a version counter and a checkpoint pointer, keeping writes cheap.
- **Key derivation**: a single `personal_sign` of a fixed, address-normalized message → HKDF → AES-256-GCM. ECDSA `personal_sign` is deterministic and implemented near-identically across wallets, so every device controlling the private key derives the exact same key with one free, gasless signature — no EIP-712 branching (that turned out to be the actual source of a cross-wallet bug: two different signing paths can silently produce two different keys).
- **Reading**: `resyncFromCloudVault` reads the on-chain version pointer, paginates `eth_getLogs` from a fixed `CLOUD_VAULT_GENESIS_BLOCK` floor (Arc Testnet is already tens of millions of blocks deep — scanning from block 0 reliably triggers RPC rate limits), decrypts, and replays ops. Scan progress persists locally so an interrupted pass resumes instead of restarting.
- **Merge safety**: a local note is only ever removed on positive evidence (an explicit "spent" op decrypted from the journal) — never merely because it's absent from one read pass, which avoids pruning a note that's just not indexed yet.

This module only concerns a wallet's own notes. Notes received from other wallets via confidential send still use the separate ECDH `ViewKeyRegistry` pipeline, untouched by any of the above.

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

### v15.6.0 (current)
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
