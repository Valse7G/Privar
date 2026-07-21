# PrivARC OS

![version](https://img.shields.io/badge/version-v12.0.0-00FFB0?style=flat-square&labelColor=0a1628)
![react](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&labelColor=0a1628)
![vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&labelColor=0a1628)
![network](https://img.shields.io/badge/Arc_Testnet-chainId_5042002-00FFB0?style=flat-square&labelColor=0a1628)
![contracts](https://img.shields.io/badge/Contracts-v2.3.1-4ade80?style=flat-square&labelColor=0a1628)
![status](https://img.shields.io/badge/status-production--ready-4ade80?style=flat-square&labelColor=0a1628)

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas).  
Aligned with the [Arc Privacy Sector whitepaper](https://www.arc.io/privacy-whitepaper) — **Governed Visibility**, not anonymity.

---

## Deployed contracts — Arc Testnet (v2.3.1 · 2026-06-15)

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`

| Contract | Address |
|---|---|
| **ShieldVault** | `0xDC920361131AddeC15A04070052169E941ae8D02` |
| Timelock | `0x8DF7C02012EBec968bdEc100F4fEAF772AcAab99` |
| Governance | `0x89F08E2BBc963e48986D8A0FfA23858bA643C78A` |
| Staking | `0x80C8247e602D78da93f318862B3d14026Be03505` |
| NullifierRegistry | `0xAbaADa4ac464f4D9f9195a874c9121FC0A53b212` |
| MerkleTreeManager | `0x175C61212679376F0c210C1a5c4aC3A5E87fB372` |
| DepositManager | `0xdd31d70c2Ce1B5b33Fe016569FEF99CeC8cAE34D` |
| WithdrawalManager | `0x1b81a4d05851C423B81344Abe5693428e3914250` |
| ShieldedTransfer | `0xa880603916611a0e624f9A04c7f08b62f0532543` |
| PrivateSwap | `0xd16F252FFc0a406dFcF58eBAF7EA49f9e1DF78Eb` |
| PrivateBridge | `0x1C22eEb6c422BeF73B335e1E5668ec3109839B40` |
| EmergencyController | `0xa788E96DcF4dBf348995bc5b8D0C7BbaD8e5e88F` |
| VerifierZK (Mock¹) | `0x83a34C5997c58c36A60855879ae24CC440430181` |
| USDC (native) | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |

¹ Testnet only — `MockVerifierZK` accepts all well-formed proofs. Full Groth16 `VerifierZK.sol` is in `privarc-contracts-v2/contracts/zk/` for mainnet.

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
| Shield | ✅ | USDC / EURC / cirBTC — 0.03 USDC protocol fee |
| Withdraw | ✅ | Unshield to any public address |
| Confidential Send | ✅ | ECIES stealth note, shielded ZK transfer |
| Public Send | ✅ | Direct USDC transfer (0x address only) |
| Confidential Swap | ✅ | Arc StableFX + Uniswap V3 placeholder (pending Arc) |
| Bridge | ✅ | Circle App Kit + CCTP v2 |
| Portfolio | ✅ | Live balances + shielded notes |
| Staking | ✅ | 7 / 30 / 90 / 180d lock — reward claim |
| Analytics | ✅ | Live TVL + protocol fees (30s refresh) |
| Governance | ✅ | Protocol params + contract directory (voting UI in development) |
| Tx History | ✅ | Persistent per wallet (localStorage) |
| Emergency Controller | ✅ | On-chain circuit breaker — armed |

---

## Architecture

```
src/
  contracts.js   — addresses, ABI selectors, calldata builders (v2.3.1)
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
| `privarc_notes_{address}` | Shielded notes |
| `privarc_txhistory_{address}` | Transaction history |
| `privarc_stakes_{address}` | Staking positions |
| `privarc_protocol_fees` | Protocol-wide fee counters |

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

## Protocol fees (v2.3.1)

- **0.03 USDC** fixed fee per deposit — `ShieldVault.feesCollectedByToken`
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
Override any address via Vercel env vars (`VITE_SHIELD_VAULT`, `VITE_TIMELOCK`, etc.).

---

## Changelog

### v12.0.0 (current)
- ECIES Stealth Notes — encrypted note in `shieldedSendWithNote` tx, auto-decrypted on connect
- Arc StableFX swap route + Uniswap V3 placeholder (pending Arc deployment)
- Circle App Kit + CCTP v2 bridge with docs links
- Protocol fees: 0.03 USDC/deposit, live read from `feesCollectedByToken`
- Governance panel: honest static protocol params + contract directory (no fake proposals)
- Removed: fake AI agent cluster, ZK Proof console simulator, fabricated usage metrics
- All 13 contract addresses synced with `privarc-contracts-v2` `latest.json` v2.3.1

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
