# Privar OS

![version](https://img.shields.io/badge/version-v12.0.0-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v3.3-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-production--ready-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas).
Aligned with the [Arc Privacy Sector whitepaper](https://www.arc.io/privacy-whitepaper) — **Governed Visibility**, not anonymity.

---

## Deployed contracts — Arc Testnet (v3.3 · 2026-07-25)

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`

`ShieldVault` was redeployed on 2026-07-25 (WrongFee() swap fix + TVL native-scaling fix), alongside the LI.FI privacy adapters. Addresses below are synced with `privar-contracts-v2` `latest.json` v3.0.0.

| Contract | Address |
|---|---|
| **ShieldVault** | `0x4F8569CC8CaD8228fA4A3E493f9dcFebcDfeb43b` |
| Timelock | `0x8DF7C02012EBec968bdEc100F4fEAF772AcAab99` |
| Governance | `0x89F08E2BBc963e48986D8A0FfA23858bA643C78A` |
| Staking | `0xc43ffaC60e797DCb2C9eEcFba199696E75d90168` |
| NullifierRegistry | `0xabCC5DD1943A1C9F25FDD86AC422373F87A93ea5` |
| MerkleTreeManager | `0xe300f445DdE5387A1a1Fa606A0901114d15682f9` |
| DepositManager | `0x69Aa71BA7D1d65997715d0f287C6381490773d9a` |
| WithdrawalManager | `0x1a2d739287cEAa7d4136Ebc7C1aECEc00647a076` |
| ShieldedTransfer | `0xa880603916611a0e624f9A04c7f08b62f0532543` |
| PrivateSwap | `0xd16F252FFc0a406dFcF58eBAF7EA49f9e1DF78Eb` |
| PrivateBridge | `0x1C22eEb6c422BeF73B335e1E5668ec3109839B40` |
| EmergencyController | `0xa788E96DcF4dBf348995bc5b8D0C7BbaD8e5e88F` |
| VerifierZK (Mock¹) | `0x6dcC80c09f789cd2a3403834465B3d66372606D6` |
| ViewKeyRegistry² | `0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b` |
| LiFiPrivacyAdapter³ | `0x0703963ce37a485CFd6F9657dAA7361B07DCf39D` |
| LiFiPrivacyBridge | `0x58d00F418Fc05426ed8d09028E7A97c3d8Cf3E7b` |
| LiFiDiamond | `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` |
| TowerSwapAdapter⁴ | `0x762483223c10530E9C0e0c5719309228daB95116` |
| USDC (native) | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |

¹ Testnet only — `MockVerifierZK` accepts all well-formed proofs. Full Groth16 `VerifierZK.sol` is in `privar-contracts-v2/contracts/zk/` for mainnet.
² Deployed 2026-06-20. Real ECDH (P-256) view keys — gates confidential-send auto-discovery (stealth notes).
³ Active default swap router as of v3.2 — `ShieldVault.swapRouter()` points here, routed through the LI.FI Diamond.
⁴ Kept deployed only as a documented rollback target; no longer the default swap route.

---

## Network

| Field | Value |
|---|---|
| Chain ID | `5042002` |
| Gas token | USDC (ERC-20, 6 decimals, native on Arc) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (1 USDC/day) |

---

## Feature status

| Panel | Status | Notes |
|---|---|---|
| Shield | ✅ | USDC / EURC / cirBTC — 0.03 USDC protocol fee |
| Withdraw | ✅ | Unshield to any public address |
| Confidential Send | ✅ | Real ECDH (P-256) stealth notes via ViewKeyRegistry, auto-decrypted on connect |
| Public Send | ✅ | Direct USDC transfer (0x address only) |
| Confidential Swap | ✅ | Routed through LiFiPrivacyAdapter → LI.FI Diamond (TowerSwapAdapter kept as rollback) |
| Bridge | ✅ | LiFiPrivacyBridge + Circle CCTP v2 |
| Portfolio | ✅ | Live balances + shielded notes |
| Staking | ✅ | 7 / 30 / 90 / 180d lock — multipliers up to 3× — reward claim |
| Analytics | ✅ | Live TVL + protocol fees (30s refresh) |
| Governance | ✅ | Protocol params + contract directory (voting UI in development) |
| Tx History | ✅ | Persistent per wallet (localStorage) |
| Emergency Controller | ✅ | On-chain circuit breaker — armed |

---

## Architecture

```
src/
  contracts.js   — addresses, ABI selectors, calldata builders (v3.3 / config v12.1.0)
  DApp.jsx       — full DApp: panels, hooks, wallet integration
  App.jsx        — router (Landing ↔ DApp) + ErrorBoundary
  Landing.jsx    — marketing landing page
```

### Key hooks

| Hook | Purpose |
|---|---|
| `useShieldedBalances(prices, address)` | Wallet-scoped notes + on-chain reconciliation |
| `useProtocolStats(onArc)` | Live TVL, commitments, vault status (10s poll) |
| `useTxSend(...)` | Sends tx, awaits receipt, persists txHistory |

### localStorage isolation (per wallet)

| Key | Content |
|---|---|
| `privar_notes_{address}_{vaultAddress}` | Shielded notes (vault-scoped — survives a ShieldVault redeploy without mixing stale balances) |
| `privar_txhistory_{address}` | Transaction history |
| `privar_stakes_{address}` | Staking positions (cross-device fallback; on-chain data preferred) |
| `privar_stats_snapshots_{vaultAddress}` | 24h protocol-stats snapshots |
| `privar_onchain_activity_{vaultAddress}` | Cached on-chain activity feed |
| `privar_viewkeypair_{address}` | Local ECDH view-key pair |
| `privar_viewkey_attempted_{address}` | View-key registration attempt flag |
| `privar_protocol_fees` | Protocol-wide fee counters |

---

## Privacy model — Arc Privacy Sector

| Layer | Visible on-chain | Private |
|---|---|---|
| Deposit | Amount + ShieldVault address | Depositor ↔ withdrawal link |
| Shielded Send | Merkle root update | Sender, recipient, amount |
| Withdraw | Amount + recipient | Link to original deposit |
| Bridge | Amount + destination chain | Recipient address |

EIP-712 view keys planned for Q4 2026.

---

## Protocol fees (v3.3)

- **0.03 USDC** fixed fee per deposit (`MIN_DEPOSIT_FEE`, floored) — `ShieldVault.feesCollectedByToken`
- Fees are always denominated/collected in USDC: native-USDC ops pay a % skim, EURC/cirBTC ops pay a separate flat USDC side-payment (`flatFeeUsdc`) so the token amount itself is never skimmed
- Claimable via `ShieldVault.withdrawFees(token)` — deployer / treasury only
- Live in Analytics panel (30s refresh)
- Rate governed on-chain (max 1% cap)

---

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # production build — no env vars required (fallback addresses built-in)
```

Deploy on **Vercel** — zero config. Fallback contract addresses are hardcoded in `src/contracts.js`.
Override any address via Vercel env vars (`VITE_SHIELD_VAULT`, `VITE_TIMELOCK`, `VITE_LIFI_ADAPTER`, etc.).

---

## Changelog

### v12.1.0 (current — contracts v3.3)
- ShieldVault redeployed (2026-07-25): `WrongFee()` swap-fee fix + TVL native-scaling fix
- `totalShielded(token)`, `totalTxCount`, `totalVolumeByToken`, `feesCollectedByToken` restored on the vault (ported from the v2.8 reference implementation)
- `treasury()` real again, replacing the unverifiable `EmergencyController.pauseState()` fallback

### v12.0.0
- ECIES Stealth Notes — encrypted note in `shieldedSendWithNote` tx, auto-decrypted on connect via real ECDH (P-256) + `ViewKeyRegistry`
- LI.FI integration: `LiFiPrivacyAdapter` (default swap router, v3.2) + `LiFiPrivacyBridge` routed through the LI.FI Diamond; `TowerSwapAdapter` kept deployed only as a documented rollback target
- Circle App Kit + CCTP v2 bridge with docs links
- Protocol fees: 0.03 USDC/deposit, live read from `feesCollectedByToken`
- Governance panel: honest static protocol params + contract directory (no fake proposals)
- Removed: fake AI agent cluster, ZK Proof console simulator, fabricated usage metrics
- All contract addresses synced with `privar-contracts-v2` `latest.json` v3.0.0

### v11.1.0
- Protocol fees on-chain, analytics live breakdown USDC/EURC
- Swap: Arc StableFX route selector

### v11.0.0
- AnalyticsPanel full defensive rewrite — all NaN/undefined crashes eliminated
- BigInt float-string crash fixed in `useShieldedBalances`

### v10.14.0
- Arc Privacy Sector whitepaper alignment — Governed Visibility terminology

### v10.13.0
- Wallet-scoped localStorage isolation + on-chain deposit reconciliation at connect

---

## License

MIT — see [LICENSE](LICENSE)
