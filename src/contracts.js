// ════════════════════════════════════════════════════════════════════════════
//  Privar OS — Contract Config v5.2.0
//
//  Addresses synced with latest.json v5.2.0 — Arc Testnet — deployed 2026-08-23T09:14:51.263Z
//  Full suite redeploy — every Privar-deployed address below was refreshed
//  in this run (superseding the prior 2026-08-22T20:02:27.418Z deploy — not
//  a migration, prior shielded balances stay in the old ShieldVault address).
//  latest.json's _priorShieldVault is null for this deploy (not recorded by
//  the deploy script this time) — the prior address is carried over below
//  from what this file had before this sync.
//  Two contracts present in latest.json — PrivarWithdrawManager
//  (0x994aA5543940744f0Ee957dFC0331615A1CAb75D) and PrivarVerifierZK
//  (0xE47573aE3ccEfAD263008ec95B2cC2Ac6Cb0Ba44) — are NOT wired into
//  _c/CONTRACTS below; this file never referenced them before this deploy
//  either, so they're left out pending an explicit integration pass rather
//  than guessed at. XyloRouter and LiFiDiamond are unchanged from v5.0.x
//  (same addresses in the new latest.json).
//  ARCHITECTURE — PrivateSwapRouter / Liquidity Engine, best-execution routing:
//    - DIRECT ADAPTERS (primary, tried first): XyloNetPrivacyAdapter
//      (XyloRouter) and UniswapPrivacyAdapter (a real, independently-verified
//      Uniswap V2 router). The two are fully independent contracts — separate
//      bytecode, storage, admin role, and whitelist entry on the vault — see
//      both contracts' doc comments. Renaming/merging them was considered and
//      rejected specifically to keep them independent.
//    - RESERVE / AGGREGATOR (kept active, chosen dynamically, non-default):
//      LiFiPrivacyAdapter and CurvePrivacyAdapter. Neither is removed from
//      swap() — both stay whitelisted and reachable so the Liquidity Engine
//      can route through them when a direct adapter doesn't cover the pair
//      or genuinely offers better execution — but neither is the default
//      path; in principle they're only picked when actually needed.
//  TowerSwapAdapter (simulated/self-funded swap engine, no real DEX call)
//  remains removed, as in v4.0.0. Real StableFX and Arc App Kit Swap
//  integrations remain evaluated and rejected — StableFX requires Circle
//  KYB/AML + off-chain-authorized settlement with no permissionless
//  on-chain interface; Arc App Kit Swap is server-side-only today.
//  See contracts repo's PrivarShieldVault.sol / README.md changelog for the
//  full writeup.
//
//  NOT a migration — this is a fresh vault; any prior shielded balances
//  remain in the old ShieldVault address and must be withdrawn from there.
//  Deployer: 0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894
//
//  ADDRESSES: sourced from VITE_ env vars (Vercel) or hardcoded fallbacks
// ════════════════════════════════════════════════════════════════════════════

export const ARC_CHAIN_ID = 5042002;

// Deployed protocol/suite version — sourced from latest.json's top-level
// "_version" field, kept in sync BY HAND every time the address block below
// is updated from a new latest.json (same manual workflow already used for
// the addresses themselves). NOT read from the ShieldVault contract's own
// version() getter: that function is declared `pure` in PrivarShieldVault.sol
// and returns the hardcoded literal "3.5.0" — it was never bumped across the
// v4.0.0 / v5.0.0 / v5.1.0 redeploys, so an on-chain eth_call to it is
// reliably stale forever until the Solidity source itself is fixed and
// redeployed. This constant is the accurate one to display in the UI.
export const PROTOCOL_VERSION = "5.2.0"; // latest.json _version — synced 2026-08-23

// ── Contract addresses ────────────────────────────────────────────────────────
const _c = {
  PrivarShieldVault:         import.meta.env.VITE_SHIELD_VAULT         ?? "0x326E29e573d6d3DFB26a1fB3bFe6Ea9EF1ca7D5d",
  Timelock:            import.meta.env.VITE_TIMELOCK              ?? "0x8DF7C02012EBec968bdEc100F4fEAF772AcAab99",
  Governance:          import.meta.env.VITE_GOVERNANCE            ?? "0x89F08E2BBc963e48986D8A0FfA23858bA643C78A",
  PrivarStaking:             import.meta.env.VITE_STAKING               ?? "0xbd182b15140451CD6e9165d344E93264871efCB0",
  PrivarNullifierRegistry:   import.meta.env.VITE_NULLIFIER_REGISTRY    ?? "0x23358454772CffBe07E52F55f078C039A10B06A4",
  PrivarMerkleTreeManager:   import.meta.env.VITE_MERKLE_TREE_MANAGER   ?? "0xcdF943a15116A8E7bdfD4d4d850E06a2c887453c",
  PrivarDepositManager:      import.meta.env.VITE_DEPOSIT_MANAGER       ?? "0x08Aebd48454808251fB7c27799629F313E873d7d",
  // ViewKeyRegistry v1.0.0 — deployed 2026-06-20. Confidential-send auto-discovery
  // (real ECDH stealth notes) is feature-gated on this being non-null — see
  // DApp.jsx ensureViewKeyRegistered()/scanStealthNotes(). NOT part of the
  // ShieldVault-suite redeploys — unchanged, still the original address.
  ViewKeyRegistry:     import.meta.env.VITE_VIEW_KEY_REGISTRY     ?? "0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b",
  // PrivarCloudVault — standalone, additive (no constructor args, no link to
  // ShieldVault). Decentralized events-only backup registry for the shielded
  // note journal. Since v3.4, ShieldVault's own NoteJournal event is the
  // PRIMARY persistence path for new activity (see resyncFromShieldVaultJournal
  // in DApp.jsx) — this stays deployed for backward compatibility with
  // journal entries pushed before the v3.4 upgrade, and as the manual
  // "Sync Notes to Cloud" backfill path in Settings.
  PrivarCloudVault:    import.meta.env.VITE_CLOUD_VAULT           ?? "0x63ceECBd58b36AC094B58018b8433440278e4C2b",
  // LI.FI privacy adapters — redeployed 2026-08-23 as part of the full v5.2.0 suite.
  LiFiPrivacyAdapter:  import.meta.env.VITE_LIFI_ADAPTER          ?? "0xAF30d301F0D4a633bbFc1c18712aFdd016889AB4",
  LiFiPrivacyBridge:   import.meta.env.VITE_LIFI_BRIDGE           ?? "0x4B7699b88dE3Dc1b57f7a486C3a89bf0DF1Dd900",
  LiFiDiamond:         import.meta.env.VITE_LIFI_DIAMOND          ?? "0xFf70F4A1d11995621854F3692acF286d8aCd04b2",
  // v5.0.0 — "0x000...0" (zero address) means "not deployed / not verified
  // yet" and the frontend MUST treat that as "skip this router" — never
  // attempt to call the zero address.
  // XyloNetPrivacyAdapter — DIRECT adapter, primary, dedicated to XyloRouter.
  // Fully independent from UniswapPrivacyAdapter below (own contract, own
  // whitelist entry — see contracts repo's XyloNetPrivacyAdapter.sol doc
  // comment). Deployed via scripts/deploy-xylonet-adapter.js.
  XyloNetPrivacyAdapter: import.meta.env.VITE_XYLONET_ADAPTER ?? "0x97010582f41D157f11E5c8268325316d6bB4A473",
  // UniswapPrivacyAdapter — DIRECT adapter, independent, reserved for a
  // real Uniswap deployment. null in latest.json: no UNISWAP_ROUTER_ADDRESS
  // was supplied at deploy time (see contracts repo's deploy-v5.0.0-full.js
  // CONFIG comment and UniswapPrivacyAdapter.sol's doc comment for why this
  // wasn't pre-filled with a guessed address) — swap() simply skips it
  // until a verified address is deployed and set here.
  UniswapPrivacyAdapter: import.meta.env.VITE_UNISWAP_ADAPTER ?? "0x0000000000000000000000000000000000000000",
  // LiFiPrivacyAdapter (above) + CurvePrivacyAdapter — RESERVE/aggregator,
  // active but non-default. CurvePrivacyAdapter IS deployed, but with an
  // EMPTY pool whitelist (no CURVE_POOL_ADDRESS supplied) — it exists
  // on-chain and could be whitelisted on the vault, but the frontend
  // doesn't route through it yet (see DApp.jsx swap()'s comment on why
  // attemptCurve() isn't wired up: needs a per-pair (pool, i, j) config
  // this repo doesn't have yet).
  CurvePrivacyAdapter:   import.meta.env.VITE_CURVE_ADAPTER   ?? "0x47B2143e947B6E9F370e834dADDf6587809d3DCf",
  // Raw DEX router addresses (NOT the Privar adapter addresses above) — used
  // only for read-only getAmountsOut() eth_call quoting before a XyloNet/
  // Uniswap swap is submitted, so minAmountOut reflects the pool's real
  // on-chain state instead of an off-chain price-feed estimate. See v17.1.3
  // changelog. null/zero = not deployed, quoting falls back to the naive
  // price-matrix estimate for that router.
  XyloRouter:    import.meta.env.VITE_XYLO_ROUTER    ?? "0x73742278c31a76dBb0D2587d03ef92E6E2141023",
  UniswapRouter: import.meta.env.VITE_UNISWAP_ROUTER  ?? "0x0000000000000000000000000000000000000000",
};

export const CONTRACTS = {
  // Arc / Circle infrastructure — static
  USDC:                "0x3600000000000000000000000000000000000000",
  // EURC: official Arc Testnet address not yet published by Circle.
  // Set VITE_EURC_ADDRESS in Vercel env vars once Circle deploys on Arc.
  // Until then bridge panel will show a clear error (cannot approve native USDC).
  // EURC + cirBTC — real addresses from latest.json v3.0.0 (Arc Testnet, 2026-07-20)
  EURC:                import.meta.env.VITE_EURC_ADDRESS   ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cirBTC:              import.meta.env.VITE_CIRBTC_ADDRESS ?? "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  CCTP_TokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  // Deployed by Privar
  PrivarShieldVault:         _c.PrivarShieldVault,
  Timelock:            _c.Timelock,
  Governance:          _c.Governance,
  PrivarStaking:             _c.PrivarStaking,
  PrivarNullifierRegistry:   _c.PrivarNullifierRegistry,
  PrivarMerkleTreeManager:   _c.PrivarMerkleTreeManager,
  PrivarDepositManager:      _c.PrivarDepositManager,
  // TowerSwapAdapter removed in v4.0.0/v5.0.0 — see file header.
  ViewKeyRegistry:     _c.ViewKeyRegistry,
  PrivarCloudVault:    _c.PrivarCloudVault,
  // Direct adapters — primary path, tried first by swap()'s Liquidity
  // Engine. XyloNetPrivacyAdapter and UniswapPrivacyAdapter are fully
  // independent (see _c's comments above) — zero address = not
  // deployed/verified, skip.
  XyloNetPrivacyAdapter: _c.XyloNetPrivacyAdapter,
  UniswapPrivacyAdapter: _c.UniswapPrivacyAdapter,
  // Reserve / aggregator — active, used dynamically, never the default path.
  // See contracts/adapters/LiFiPrivacyAdapter.sol / LiFiPrivacyBridge.sol.
  LiFiPrivacyAdapter:  _c.LiFiPrivacyAdapter,
  LiFiPrivacyBridge:   _c.LiFiPrivacyBridge,
  LiFiDiamond:         _c.LiFiDiamond,
  CurvePrivacyAdapter:   _c.CurvePrivacyAdapter,
  // Raw router addresses — read-only getAmountsOut() quoting only, never
  // the target of a swap tx (that's always the *PrivacyAdapter above).
  XyloRouter:    _c.XyloRouter,
  UniswapRouter: _c.UniswapRouter,
};

// ── Token config ──────────────────────────────────────────────────────────────
export const TOKENS = {
  USDC: {
    address:    CONTRACTS.USDC,
    symbol:     "USDC",
    name:       "USD Coin",
    decimals:   6,
    minDeposit: 1_000_000n,   // 1 USDC
    minDisplay: "1 USDC",
    color:      "#2775CA",
    logo:       "💵",
    isNative:   true,         // ← native gas token on Arc Testnet
  },
  EURC: {
    address:    CONTRACTS.EURC,
    symbol:     "EURC",
    name:       "Euro Coin",
    decimals:   6,
    minDeposit: 1_000_000n,
    minDisplay: "1 EURC",
    color:      "#003087",
    logo:       "💶",
    isNative:   false,
    deployed:   true,  // confirmed: 0x89B508... (latest.json v2.3.0)
  },
  cirBTC: {
    address:    CONTRACTS.cirBTC,
    symbol:     "cirBTC",
    name:       "Canonical BTC",
    decimals:   8,
    minDeposit: 10_000n,
    minDisplay: "0.0001 cirBTC",
    color:      "#F7931A",
    logo:       "₿",
    isNative:   false,
    deployed:   true,  // confirmed: 0xf0C4a4... (latest.json v2.3.0)
  },
};

export const TOKEN_LIST = Object.values(TOKENS);

// ── Native USDC constants ─────────────────────────────────────────────────────
// Arc Testnet: USDC is the native gas token.
// eth_getBalance returns wei (18 dec). ERC-20 interface uses 6 dec.
// Conversion: display_usdc = native_wei / 1e12
export const NATIVE_USDC        = "0x3600000000000000000000000000000000000000";
export const NATIVE_TO_ERC20    = BigInt("1000000000000"); // 10^12

// ── Function selectors ────────────────────────────────────────────────────────
// Computed with: keccak256(functionSignature).slice(0,4)
// Struct types are inlined per ABI spec (IModules.sol)
//
// IPrivarVerifierZK.Proof = (uint256[2],uint256[2][2],uint256[2])
//
// DepositParams    = (bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[])
// deposit(DepositParams) →
//   deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))
//
// WithdrawalParams = ((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,address,uint256,uint256,address,uint256[])
// withdraw(WithdrawalParams) →
//   withdraw(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,address,uint256,uint256,address,uint256[]))
//
// TransferParams   = (bytes32[],(uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32[],uint256[])
// shieldedSend(TransferParams) →
//   shieldedSend((bytes32[],(uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32[],uint256[]))
//
// SwapParams       = ((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,bytes32,address,address,uint256,uint256,uint256,address,bytes,uint256[])
// privateSwapExec(SwapParams) →
//   privateSwapExec(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,bytes32,address,address,uint256,uint256,uint256,address,bytes,uint256[]))
//
// BridgeParams     = ((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,uint32,address,uint256,bytes32,uint256,uint256[])
// privateBridgeExec(BridgeParams) →
//   privateBridgeExec(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,uint32,address,uint256,bytes32,uint256,uint256[]))

// ── Circle App Kit key (free from console.circle.com) ───────────────────────
// Used by SwapPanel (kit.swap) and BridgePanel (kit.bridge).
// Set VITE_KIT_KEY in .env — never commit the actual key.
export const KIT_KEY = import.meta.env.VITE_KIT_KEY ?? "";

export const SEL = {
  // ERC-20
  balanceOf:          "0x70a08231",  // balanceOf(address)
  approve:            "0x095ea7b3",  // approve(address,uint256)
  allowance:          "0xdd62ed3e",  // allowance(address,address)
  transfer:           "0xa9059cbb",  // transfer(address,uint256)

  // PrivarShieldVault v2.2 — computed from IModules.sol struct ABI signatures
  // NOTE: These selectors are computed from the EXACT function signatures.
  // If deployment reverts with "function not found", verify with:
  //   cast sig "deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))"
  // PrivarShieldVault v3.0.0 — simplified ABI, NO ZK proof structs anymore.
  // Selectors verified against contracts/core/PrivarShieldVault.sol (v3.0.0).
  // Sanity-checked keccak256 impl against known selectors (balanceOf, transfer, approve).
  deposit:            "0x17c224e8",  // v3.4: deposit(address,uint256,bytes32,bytes)
  withdraw:            "0x5b5bbcf8",  // v3.4: withdraw(bytes32,bytes32,address,address,uint256,address,uint256,address,bytes)
  // v3.5.0 — spends MULTIPLE nullifiers (same token) in one tx, one payout.
  // Selector verified locally (pure-Python keccak256, cross-checked against
  // this file's own transfer/balanceOf/approve/allowance selectors before
  // trusting it) against the EXACT signature below — re-verify with
  // `cast sig` against the deployed ABI if withdrawBatch() ever reverts
  // with "function not found".
  withdrawBatch:       "0x775968f5",  // v3.5.0: withdrawBatch(bytes32[],uint256[],bytes32,address,address,address,uint256,address,bytes)
  shieldedSend:        "0x883be0f1",  // v3.4: shieldedSend(bytes32,bytes32,bytes32,bytes,bytes) — encryptedNote + encryptedSelfEntry, not payable
  privateSwap:         "0x1f12e042",  // v3.4: privateSwap(bytes32,bytes32,address,address,uint256,uint256,bytes32,uint256,bytes) — not payable
  // v3.2 — forwards an off-chain-quoted routeData (e.g. LI.FI) through to swapRouter.
  // Selector computed against PrivarShieldVault.sol's exact new signature — see
  // scripts/deploy-lifi.js / contracts/core/PrivarShieldVault.sol.
  privateSwapWithRoute:"0x05e550e9",  // v3.4: privateSwapWithRoute(bytes32,bytes32,address,address,uint256,uint256,bytes32,uint256,bytes,bytes)
  // v4.0.0 — multi-router: caller picks which whitelisted adapter executes
  // the swap (LI.FI / Uniswap / Curve), instead of always using the
  // single admin-configured default. Selector cross-validated by
  // recomputing privateSwapWithRoute's own known-good selector with the
  // same keccak256 implementation before trusting this one — see the git
  // history for scripts/compute-selectors if this ever needs re-deriving.
  privateSwapWithRouter:  "0xb4e23fb3", // privateSwapWithRouter(bytes32,bytes32,address,address,uint256,uint256,bytes32,uint256,address,bytes,bytes)
  setSwapRouterWhitelist: "0x25012238", // setSwapRouterWhitelist(address,bool)
  getWhitelistedSwapRouters: "0x7b79c1bb", // getWhitelistedSwapRouters()
  swapRouterWhitelist:    "0x6332c0fb", // swapRouterWhitelist(address) view

  // ── DEPRECATED (v2.x struct-based ABI, does NOT exist on v3.0.0 vault) ──────
  // Kept only so old references don't hard-crash; DO NOT call these against the
  // currently deployed ShieldVault — every call will revert with empty data (0x),
  // exactly like the "failed to call deposit" tx on ArcScan.
  shieldedSendWithNote:"0xd3c9406f",  // OBSOLETE — folded into shieldedSend() in v3.0.0
  privateSwapExec:     "0x49fa2a6e",  // OBSOLETE — replaced by privateSwap() in v3.0.0
  privateBridgeExec:  "0x8fa6444e",  // OBSOLETE — public CCTP path on the orphaned PrivateBridge contract, replaced by LiFiPrivacyBridge below
  // v3.4: LiFiPrivacyBridge.privateBridge(bytes32,bytes32,address,uint256,address,uint256,bytes,bytes) — atomic unshield+LI.FI-bridge
  lifiPrivateBridge:  "0x51957a1c",

  // PrivarShieldVault views
  totalShielded:      "0x6d7f2685",  // totalShielded(address)
  totalShieldedUSDC:  "0x37b12e9e",  // totalShieldedUSDC()

  // PrivarMerkleTreeManager
  nextIndex:          "0xfc7e9c6f",  // nextIndex() — was wrongly called nextLeafIndex() (0x0be4f422), a function that doesn't exist on PrivarMerkleTreeManager
  getLastRoot:        "0xba70f757",  // getLastRoot()
  isKnownRoot:        "0x6d9833e3",  // isKnownRoot(bytes32)

  // PrivarDepositManager
  isTokenSupported:   "0x75151b63",  // isTokenSupported(address)
  getSupportedTokens: "0xd3c7c2c7",  // getSupportedTokens()
  minDeposit:         "0x3c29f839",  // minDeposit(address)

  // PrivarStaking
  stake:              "0x7b0472f0",  // stake(uint256,uint256)
  unstake:            "0x2e17de78",  // unstake(uint256)
  claimRewards:       "0x372500ab",  // claimRewards()
  previewRewards:     "0xf166e920",  // previewRewards(address)
  getUserStakes:      "0x5e0e5b3e",  // getUserStakes(address) → StakePosition[]

  // Protocol fees (PrivarShieldVault v2.4.0)
  feesCollectedByToken: "0xa2c169a7",  // feesCollectedByToken(address)
  withdrawFees:         "0x164e68de",  // withdrawFees(address)
  protocolFeeBps:       "0x35659fb8",  // protocolFeeBps() — deposit/withdraw
  swapFeeBps:           "0x2ffdaf89",  // swapFeeBps()
  bridgeFeeBps:         "0x4f6aa42b",  // bridgeFeeBps()
  flatFeeUsdc:          "0xb892df0e",  // flatFeeUsdc() — 6-dec USDC units (renamed from sendFlatFee in v2.8 — now used by deposit/withdraw/swap/bridge for EURC/cirBTC too, not just send)
  treasury:             "0x61d027b3",  // treasury() — v3.3: real again (restored, see /areas/privar.md)
  feeRecipient:         "0x46904840",  // feeRecipient() — legacy fee-rate-setter recipient; treasury() is where withdrawFees() actually pays out

  // Protocol fees (PrivarStaking v1.1.0)
  performanceFeeBps:    "0xb9d4e879",  // performanceFeeBps() — PrivarStaking contract

  // Live protocol stats (PrivarShieldVault v2.5.0) — item 4: real-time dashboard
  VERSION:              "0x54fd4d50",  // version() returns (string) — was wrongly calling VERSION() (0xffa1ad74, uppercase), which doesn't exist; PrivarShieldVault only has lowercase version()
  paused:               "0x5c975abb",  // paused() — real public bool on PrivarShieldVault (single source of truth for vault pause state; the old EmergencyController-based selectors were removed, see v3.4.1 header comment)
  supportedTokens:      "0x68c4ac26",  // supportedTokens(address) — real public mapping on PrivarShieldVault; PrivarDepositManager.isTokenSupported(address) does NOT exist (only a tokens(address) struct getter)
  totalTxCount:         "0x9b4f50e7",  // totalTxCount() returns (uint256)
  totalVolumeByToken:   "0x38caed9f",  // totalVolumeByToken(address) returns (uint256)

  // ViewKeyRegistry v1.0.0 — real ECDH P-256 view keys for confidential-send auto-discovery
  registerViewKey:    "0x4f9d2844",  // registerViewKey(bytes)
  removeViewKey:      "0xe1e0e535",  // removeViewKey()
  hasViewKey:         "0x9e0607f1",  // hasViewKey(address)
  getViewKey:         "0xc1f5c989",  // getViewKey(address)
  emitNote:           "0xdefb8b15",  // emitNote(address,bytes,bytes)

  // PrivarCloudVault — decentralized events-only note-journal backup registry.
  // Selectors computed from contracts/core/PrivarCloudVault.sol's exact
  // signatures (pure keccak256, no external deps — see keccak.py used to
  // derive these once; sanity-checked against known selectors elsewhere
  // in this file, e.g. balanceOf/transfer/approve above).
  pushDelta:            "0xbc4cc79b",  // pushDelta(bytes)
  pushCheckpoint:        "0x4e71faa8",  // pushCheckpoint(bytes32,bytes)
  cvLatestVersion:        "0x8e480b20",  // latestVersion(address)
  cvLastCheckpointBlock:  "0x17b1ea38",  // lastCheckpointBlock(address)
  cvLastCheckpointVersion:"0x47872aa5",  // lastCheckpointVersion(address)

  // Uniswap V2 Router02 — canonical, standard selector (shared by
  // XyloRouter and any real UniswapPrivacyAdapter target, both V2-shaped —
  // see contracts/adapters/XyloNetPrivacyAdapter.sol's doc comment).
  getAmountsOut: "0xd06ca61f",  // getAmountsOut(uint256,address[])
};

// ── ABI encoding primitives ───────────────────────────────────────────────────
export const encodeAddress = (addr) =>
  "000000000000000000000000" + addr.toLowerCase().replace("0x", "");

export const encodeUint256 = (n) =>
  BigInt(n).toString(16).padStart(64, "0");

export const encodeUint32 = (n) =>
  Number(n).toString(16).padStart(64, "0");

export const encodeBytes32 = (hex) =>
  hex.replace("0x", "").padEnd(64, "0");

// Generic dynamic `bytes` encoder: returns { lenWord, dataWords, words }
// suitable for inlining at a tail offset (length word + data padded to 32-byte boundary).
// `hexOrBytes` may be a "0x..."-prefixed hex string or a Uint8Array.
export const encodeBytes = (hexOrBytes) => {
  const hex = hexOrBytes instanceof Uint8Array
    ? Array.from(hexOrBytes).map(b => b.toString(16).padStart(2, "0")).join("")
    : hexOrBytes.replace("0x", "");
  const byteLen = hex.length / 2;
  const lenWord = encodeUint256(BigInt(byteLen));
  const dataWords = hex.padEnd(Math.ceil(byteLen / 32) * 64, "0");
  return lenWord + dataWords; // length word followed by padded data — NOT including its own offset word
};
// Byte-length (not word count) of an encoded `bytes` blob as produced by encodeBytes(): 32 (length word) + padded data.
export const encodedBytesSize = (hexOrBytes) => {
  const hex = hexOrBytes instanceof Uint8Array
    ? Array.from(hexOrBytes).map(b => b.toString(16).padStart(2, "0")).join("")
    : hexOrBytes.replace("0x", "");
  const byteLen = hex.length / 2;
  return 32 + Math.ceil(byteLen / 32) * 32;
};

// Dynamic array of a STATIC element type (bytes32[] or uint256[] — both single
// 32-byte words per element). Returns { size, words } where `words` is the
// length word + N element words (ready to inline at a tail offset, same
// convention as encodeBytes: NOT including its own offset word), and `size`
// is its byte length (32 + 32*N) for computing the NEXT tail offset.
const encodeStaticArray = (arr, encodeElem) => {
  const words = encodeUint256(BigInt(arr.length)) + arr.map(encodeElem).join("");
  return { size: 32 + 32 * arr.length, words };
};
export const encodeBytes32Array  = (arr) => encodeStaticArray(arr, (h) => encodeBytes32(h));
export const encodeUint256Array  = (arr) => encodeStaticArray(arr, (n) => encodeUint256(n));

export const decodeUint256 = (hex) =>
  hex && hex !== "0x" && hex.length > 2 ? BigInt(hex) : 0n;

export const decodeUint8 = (hex) =>
  hex && hex !== "0x" && hex.length > 2 ? parseInt(hex.slice(-64), 16) : 0;

export const formatToken = (amount, decimals, precision = 4) => {
  if (amount === null || amount === undefined) return "—";
  const n = Number(BigInt(amount)) / Math.pow(10, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: precision });
};

// ── ZK proof stub (MockVerifierZK: accepts any proof) ────────────────────────
// MockVerifierZK.verifyProof() accepts any (a,b,c,publicInputs).
// We pass minimal valid BN254 generator points to satisfy ABI decoding.
// In production: replace with real Groth16 prover output.
const PROOF_A_X = "0000000000000000000000000000000000000000000000000000000000000001";
const PROOF_A_Y = "0000000000000000000000000000000000000000000000000000000000000002";
// BN254 G2 generator
const PROOF_B_X0 = "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2";
const PROOF_B_X1 = "1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed";
const PROOF_B_Y0 = "090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b";
const PROOF_B_Y1 = "12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa";
const PROOF_C_X = "0000000000000000000000000000000000000000000000000000000000000001";
const PROOF_C_Y = "0000000000000000000000000000000000000000000000000000000000000002";

// ── Calldata builders ─────────────────────────────────────────────────────────
// All builders return { data: "0x...", value: "0x..." }

// ─── DEPOSIT ─────────────────────────────────────────────────────────────────
// PrivarShieldVault.deposit(address token, uint256 amount, bytes32 commitment, bytes encryptedEntry) payable
//
// ABI: deposit(address,uint256,bytes32,bytes) — v3.4.0, adds a trailing
// optional encryptedEntry (protocol-wide note-journal persistence — see
// PrivarShieldVault.sol's NoteJournal event doc comment). Pass "0x" to skip.
// Layout: [token][amount][commitment][offset=0x80] then at 0x80: [len][data].

export function buildDepositCalldata(commitment, tokenAddress, amount, flatFeeUsdc = 0n, encryptedEntry = "0x") {
  const comm32 = commitment.replace("0x", "").padStart(64, "0");

  // Native USDC: the vault does `if (msg.value != amount) revert WrongFee()` — an EXACT
  // equality check in wei. So for native USDC the `amount` param itself must be passed
  // in native wei (18-dec), matching msg.value bit-for-bit — NOT the 6-dec display amount.
  // For ERC-20 tokens (EURC/cirBTC), `amount` stays in the token's own decimals (6-dec here)
  // since it's used directly in safeTransferFrom.
  const isNativeUsdc = tokenAddress.toLowerCase() === NATIVE_USDC.toLowerCase();
  const amountForCalldata = isNativeUsdc ? BigInt(amount) * NATIVE_TO_ERC20 : BigInt(amount);

  const data = SEL.deposit
    + encodeAddress(tokenAddress)          // token
    + encodeUint256(amountForCalldata)     // amount — wei for native USDC, else raw units
    + comm32                               // commitment
    + encodeUint256(0x80n)                 // offset to encryptedEntry
    + encodeBytes(encryptedEntry);         // encryptedEntry (v3.4)

  const value = isNativeUsdc
    ? "0x" + amountForCalldata.toString(16)                              // must equal calldata amount exactly
    : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── WITHDRAW ────────────────────────────────────────────────────────────────
// PrivarShieldVault.withdraw(
//   bytes32 nullifier, bytes32 root, address token, address recipient,
//   uint256 amount,    address relayer, uint256 relayerFee,
//   address noteOwner, bytes encryptedEntry
// ) payable — v3.4.0, adds explicit noteOwner + optional encryptedEntry
// (protocol-wide note-journal persistence — see PrivarShieldVault.sol's
// NoteJournal event doc comment). noteOwner lets an intermediary contract
// (e.g. LiFiPrivacyBridge) call withdraw() on the real owner's behalf while
// still attributing the journal entry correctly.
// NOTE the arg order: relayer comes BEFORE relayerFee on-chain (v2.x struct had it reversed).

// ABI: withdraw(bytes32,bytes32,address,address,uint256,address,uint256,address,bytes) — v3.4.0
// 9 args, 1 dynamic (encryptedEntry). Head = 9 words (0x120):
//   [0x00] nullifier   [0x20] root       [0x40] token      [0x60] recipient
//   [0x80] amount      [0xa0] relayer    [0xc0] relayerFee [0xe0] noteOwner
//   [0x100] offset to encryptedEntry (= 0x120)
//   [0x120] encryptedEntry length + padded data

export function buildWithdrawCalldata({ nullifier, root, token, recipient, amount, relayerFee = 0n, relayer = "0x0000000000000000000000000000000000000000", flatFeeUsdc = 0n, noteOwner = null, encryptedEntry = "0x" }) {
  // withdraw()'s native branch does `payable(recipient).call{value: amount - relayerFee}`
  // — `amount` IS the native wei sent out, so for native USDC it must be in
  // 18-dec wei (matching deposit's convention), not the 6-dec display unit.
  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
  const amountForCalldata = isNativeUsdc ? BigInt(amount) * NATIVE_TO_ERC20 : BigInt(amount);
  const relayerFeeForCalldata = isNativeUsdc ? BigInt(relayerFee) * NATIVE_TO_ERC20 : BigInt(relayerFee);

  const data = SEL.withdraw
    + encodeBytes32(nullifier)
    + encodeBytes32(root)
    + encodeAddress(token)
    + encodeAddress(recipient)
    + encodeUint256(amountForCalldata)
    + encodeAddress(relayer)
    + encodeUint256(relayerFeeForCalldata)
    + encodeAddress(noteOwner || recipient) // v3.4 — who the journal entry belongs to (defaults to recipient, the common direct-withdraw case)
    + encodeUint256(0x120n)                 // offset to encryptedEntry
    + encodeBytes(encryptedEntry);          // v3.4 — protocol-wide note-journal persistence

  // Native USDC withdraw: no msg.value — % fee is skimmed from withdrawAmt on-chain.
  // EURC/cirBTC withdraw: msg.value carries the FLAT protocol fee in USDC, if set.
  const value = isNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── WITHDRAW BATCH (v3.5.0) ──────────────────────────────────────────────────
// PrivarShieldVault.withdrawBatch(
//   bytes32[] nullifiers, uint256[] amounts, bytes32 root,
//   address token,        address recipient,
//   address relayer,      uint256 relayerFee,
//   address noteOwner,    bytes encryptedEntry
// ) payable — spends MULTIPLE notes for the SAME token in one tx, one payout.
// See PrivarShieldVault.sol's withdrawBatch() doc comment for the
// fragmentation bug this fixes; only structural difference from
// buildWithdrawCalldata is nullifiers/amounts being arrays.
//
// ABI: withdrawBatch(bytes32[],uint256[],bytes32,address,address,address,uint256,address,bytes)
// 9 args, 3 dynamic (nullifiers, amounts, encryptedEntry). Head = 9 words (0x120):
//   [0x00] offset→nullifiers  [0x20] offset→amounts   [0x40] root
//   [0x60] token              [0x80] recipient        [0xa0] relayer
//   [0xc0] relayerFee         [0xe0] noteOwner         [0x100] offset→encryptedEntry
//   [0x120] tail: nullifiers block, then amounts block, then encryptedEntry block.
//
// `notes` = [{ nullifier, amount }], amount already in the SAME raw unit
// buildWithdrawCalldata expects (native USDC: 18-dec wei; else token's own
// decimals) — scaling below mirrors buildWithdrawCalldata exactly.
export function buildWithdrawBatchCalldata({ notes, root, token, recipient, relayerFee = 0n, relayer = "0x0000000000000000000000000000000000000000", flatFeeUsdc = 0n, noteOwner = null, encryptedEntry = "0x" }) {
  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
  const nullifiers = notes.map(n => n.nullifier);
  const amounts    = notes.map(n => isNativeUsdc ? BigInt(n.amount) * NATIVE_TO_ERC20 : BigInt(n.amount));
  const relayerFeeForCalldata = isNativeUsdc ? BigInt(relayerFee) * NATIVE_TO_ERC20 : BigInt(relayerFee);

  const nullArr = encodeBytes32Array(nullifiers);
  const amtArr  = encodeUint256Array(amounts);

  const offNullifiers = 0x120n;
  const offAmounts     = offNullifiers + BigInt(nullArr.size);
  const offEntry        = offAmounts + BigInt(amtArr.size);

  const data = SEL.withdrawBatch
    + encodeUint256(offNullifiers)
    + encodeUint256(offAmounts)
    + encodeBytes32(root)
    + encodeAddress(token)
    + encodeAddress(recipient)
    + encodeAddress(relayer)
    + encodeUint256(relayerFeeForCalldata)
    + encodeAddress(noteOwner || recipient)
    + encodeUint256(offEntry)
    + nullArr.words
    + amtArr.words
    + encodeBytes(encryptedEntry);

  const value = isNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── SHIELDED SEND ────────────────────────────────────────────────────────────
// PrivarShieldVault.shieldedSend(bytes32 nullifier, bytes32 root, bytes32 commitmentOut, bytes encryptedNote, bytes encryptedSelfEntry)
// v3.4.0: NOT payable, no ZK proof. encryptedNote (ECIES payload for the
// RECIPIENT) stays required; encryptedSelfEntry is NEW — an optional
// journal entry for the SENDER's own records (protocol-wide note-journal
// persistence — see PrivarShieldVault.sol's NoteJournal event doc comment).
// Kept as a SEPARATE param from encryptedNote since one is encrypted to the
// recipient's view key and the other to the sender's own backup key.
//
// ABI: shieldedSend(bytes32,bytes32,bytes32,bytes,bytes)
// 5 args, 2 dynamic. Head = 5 words (0xa0):
//   [0x00] nullifier      (static)
//   [0x20] root           (static)
//   [0x40] commitmentOut  (static)
//   [0x60] offset to encryptedNote     (= 0xa0, right after head)
//   [0x80] offset to encryptedSelfEntry (= 0xa0 + encodedBytesSize(encryptedNote))
//   [0xa0] encryptedNote block, then encryptedSelfEntry block

export function buildShieldedSendCalldata({ nullifier, root, commitmentOut, encryptedNote = "0x", encryptedSelfEntry = "0x" }) {
  const offEncNote = 0xa0n;
  const offSelfEntry = offEncNote + BigInt(encodedBytesSize(encryptedNote));

  const data = SEL.shieldedSend
    + encodeBytes32(nullifier)
    + encodeBytes32(root)
    + encodeBytes32(commitmentOut)
    + encodeUint256(offEncNote)
    + encodeUint256(offSelfEntry)
    + encodeBytes(encryptedNote)
    + encodeBytes(encryptedSelfEntry);

  // Not payable — do not attach msg.value or the tx will revert.
  return { data, value: "0x0" };
}

// Old field name `nullifierIn`/`merkleRoot` kept as an alias so existing call sites
// (e.g. DApp.jsx built against the v2.x builder) don't need renaming immediately.
export function buildShieldedSendCalldataLegacyArgs({ nullifierIn, merkleRoot, commitmentOut, encryptedNote, encryptedSelfEntry }) {
  return buildShieldedSendCalldata({ nullifier: nullifierIn, root: merkleRoot, commitmentOut, encryptedNote, encryptedSelfEntry });
}

// ─── PRIVATE SWAP ─────────────────────────────────────────────────────────────
// ── PrivateSwapAdapter routeData encoder ──────────────────────────────────
// routeData passed to PrivateSwapAdapter.fallback():
//   abi.encode(tokenIn[32], tokenOut[32], amountIn[32], minAmountOut[32], feeTier[32])
//   feeTier: Uniswap V3 fee (500=0.05%, 3000=0.3%, 10000=1%)
//   On Arc Testnet simulation mode, feeTier is ignored.
export function buildSwapAdapterRouteData({ tokenIn, tokenOut, amountIn, minAmountOut, feeTier = 500 }) {
  return "0x"
    + tokenIn.slice(2).padStart(64, "0")
    + tokenOut.slice(2).padStart(64, "0")
    + BigInt(amountIn).toString(16).padStart(64, "0")
    + BigInt(minAmountOut).toString(16).padStart(64, "0")
    + BigInt(feeTier).toString(16).padStart(64, "0");
}

// PrivarShieldVault.privateSwapExec(SwapParams params)
//
// SwapParams (IModules.sol) — all fields in order:
//   proof           (uint256[2],uint256[2][2],uint256[2])  → 8 words (static)
//   nullifier       bytes32
//   merkleRoot      bytes32
//   outputCommitment bytes32
//   tokenIn         address
//   tokenOut        address
//   amountIn        uint256
//   minAmountOut    uint256
//   deadline        uint256
//   dexRouter       address
//   routeData       bytes    ← dynamic
//   publicInputs    uint256[]← dynamic
//
// Static head: 8(proof) + 3(bytes32) + 2(address) + 3(uint256) + 1(address) + 2(offsets for dynamic) = 19+2 = 21 words... 
// Actually: static fields inline, dynamic fields as offsets.
// Static: proof(8) + nullifier(1) + merkleRoot(1) + outputCommitment(1) + tokenIn(1) + tokenOut(1) + amountIn(1) + minAmountOut(1) + deadline(1) + dexRouter(1) = 17 words
// Dynamic: routeData(offset) + publicInputs(offset) = 2 offsets in head
// Total head = 19 words = 0x260
// Tail: routeData at 0x260, publicInputs follows

// ── PrivarShieldVault.privateSwap() — atomic confidential swap (v3.4.0) ──
// This IS the v3.x vault's actual swap function. NOT payable — no flatFeeUsdc/value.
// v3.4.0 adds a trailing optional `encryptedEntry` (protocol-wide note-
// journal persistence — see PrivarShieldVault.sol's NoteJournal event doc
// comment).
export function buildAtomicSwapCalldata({
  nullifier, root, tokenIn, tokenOut,
  amountIn, minAmountOut, commitmentOut,
  deadline = BigInt(Math.floor(Date.now()/1000) + 600),
  flatFeeUsdc = 0n,
  encryptedEntry = "0x",
}) {
  // amountIn is forwarded VERBATIM as SwapParams.amountIn — same convention
  // as buildDepositCalldata: for native USDC, in native 18-dec wei, not the
  // 6-dec ERC-20 display unit. It is NEVER sent as msg.value though: for a
  // native tokenIn, that amount is drawn from the vault's OWN existing
  // balance (funded by the original deposit) — the caller's EOA never holds
  // it. msg.value only ever needs to cover the flat USDC fee, and only when
  // tokenOut isn't native (v3.3 fee model — see ShieldVault.sol).
  const tokenInIsNative      = tokenIn.toLowerCase()  === NATIVE_USDC.toLowerCase();
  const tokenOutIsNative     = tokenOut.toLowerCase() === NATIVE_USDC.toLowerCase();
  const amountInForCalldata  = tokenInIsNative ? BigInt(amountIn) * NATIVE_TO_ERC20 : BigInt(amountIn);
  // NOTE: minAmountOut is intentionally NOT scaled for a native tokenOut.
  // Unlike amountIn (real msg.value / native wei), the contract's own
  // amountOut/minAmountOut comparison operates on the "6-dec ERC20 view"
  // (IERC20(NATIVE_USDC).balanceOf() on the native-USDC pseudo-token) — see
  // PrivarShieldVault.sol's fee-scaling comment ("amountOut here is in the
  // 6-dec ERC20 view"). A prior attempt to scale this by NATIVE_TO_ERC20
  // would have made minAmountOut ~1e12x too large, reverting every swap
  // landing in native USDC with SwapFailed(). Left unscaled, matching what
  // the contract actually compares against.
  const minAmountOutForCalldata = BigInt(minAmountOut);
  const value = (!tokenOutIsNative && flatFeeUsdc > 0n)
    ? "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16)
    : "0x0";

  // 9 args, 1 dynamic (encryptedEntry) → head = 9 words = 0x120
  const data = SEL.privateSwap
    + nullifier.slice(2).padStart(64,"0")
    + root.slice(2).padStart(64,"0")
    + tokenIn.slice(2).padStart(64,"0")
    + tokenOut.slice(2).padStart(64,"0")
    + amountInForCalldata.toString(16).padStart(64,"0")
    + minAmountOutForCalldata.toString(16).padStart(64,"0")
    + commitmentOut.slice(2).padStart(64,"0")
    + BigInt(deadline).toString(16).padStart(64,"0")
    + encodeUint256(0x120n)
    + encodeBytes(encryptedEntry);

  return { data, value };
}

// ── PrivarShieldVault.privateSwapWithRoute() — v3.4, forwards routeData ──
// Same as buildAtomicSwapCalldata but appends a dynamic `routeData` blob that
// swapRouter.executeSwap() actually receives. Required whenever swapRouter is
// LiFiPrivacyAdapter — it reverts on an empty routeData. `routeData` here
// should already be the encoded (target, calldata) tuple — see
// encodeLiFiRouteData() below.
// v3.4.0 adds a SECOND trailing optional `encryptedEntry` (protocol-wide
// note-journal persistence — see PrivarShieldVault.sol's NoteJournal event
// doc comment).
export function buildSwapWithRouteCalldata({
  nullifier, root, tokenIn, tokenOut,
  amountIn, minAmountOut, commitmentOut,
  deadline = BigInt(Math.floor(Date.now()/1000) + 600),
  routeData = "0x",
  flatFeeUsdc = 0n,
  encryptedEntry = "0x",
}) {
  // Same reasoning as buildAtomicSwapCalldata above: amountIn is scaled for
  // the calldata field but NEVER sent as msg.value for a native tokenIn
  // (drawn from the vault's own balance). msg.value only covers the flat
  // USDC fee when landing in a non-native tokenOut.
  const tokenInIsNative     = tokenIn.toLowerCase()  === NATIVE_USDC.toLowerCase();
  const tokenOutIsNative    = tokenOut.toLowerCase() === NATIVE_USDC.toLowerCase();
  const amountInForCalldata = tokenInIsNative ? BigInt(amountIn) * NATIVE_TO_ERC20 : BigInt(amountIn);
  // NOTE: minAmountOut is intentionally NOT scaled for a native tokenOut —
  // see the identical note in buildAtomicSwapCalldata above. The contract's
  // own amountOut/minAmountOut comparison operates on the 6-dec ERC20
  // balanceOf() view of native USDC, not native wei; scaling here would
  // revert every swap landing in native USDC with SwapFailed().
  const minAmountOutForCalldata = BigInt(minAmountOut);
  const value = (!tokenOutIsNative && flatFeeUsdc > 0n)
    ? "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16)
    : "0x0";

  // 10 args, 2 dynamic (routeData, encryptedEntry) → head = 10 words = 0x140
  const offRoute = 0x140n;
  const offEntry = offRoute + BigInt(encodedBytesSize(routeData));
  const data = SEL.privateSwapWithRoute
    + nullifier.slice(2).padStart(64,"0")
    + root.slice(2).padStart(64,"0")
    + tokenIn.slice(2).padStart(64,"0")
    + tokenOut.slice(2).padStart(64,"0")
    + amountInForCalldata.toString(16).padStart(64,"0")
    + minAmountOutForCalldata.toString(16).padStart(64,"0")
    + commitmentOut.slice(2).padStart(64,"0")
    + BigInt(deadline).toString(16).padStart(64,"0")
    + encodeUint256(offRoute)
    + encodeUint256(offEntry)
    + encodeBytes(routeData)
    + encodeBytes(encryptedEntry);

  return { data, value };
}

// ── PrivarShieldVault.privateSwapWithRouter() — multi-router ────────────────
// Same as buildSwapWithRouteCalldata but with an explicit `dexRouter`
// address in the head (must be whitelisted on-chain via
// setSwapRouterWhitelist — see PrivarShieldVault.sol). This is what lets
// the frontend choose LI.FI / UniswapPrivacyAdapter / CurvePrivacyAdapter
// per-call instead of being locked into the single admin-configured
// default `swapRouter`.
export function buildSwapWithRouterCalldata({
  nullifier, root, tokenIn, tokenOut,
  amountIn, minAmountOut, commitmentOut,
  deadline = BigInt(Math.floor(Date.now()/1000) + 600),
  dexRouter,
  routeData = "0x",
  flatFeeUsdc = 0n,
  encryptedEntry = "0x",
}) {
  const tokenInIsNative     = tokenIn.toLowerCase()  === NATIVE_USDC.toLowerCase();
  const tokenOutIsNative    = tokenOut.toLowerCase() === NATIVE_USDC.toLowerCase();
  const amountInForCalldata = tokenInIsNative ? BigInt(amountIn) * NATIVE_TO_ERC20 : BigInt(amountIn);
  // Same convention as buildSwapWithRouteCalldata: minAmountOut is NEVER
  // scaled, regardless of tokenOut — the contract always compares against
  // the 6-dec ERC20 balanceOf() view.
  const minAmountOutForCalldata = BigInt(minAmountOut);
  const value = (!tokenOutIsNative && flatFeeUsdc > 0n)
    ? "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16)
    : "0x0";

  // 11 args, 2 dynamic (routeData, encryptedEntry) → head = 11 words = 0x160
  const offRoute = 0x160n;
  const offEntry = offRoute + BigInt(encodedBytesSize(routeData));
  const data = SEL.privateSwapWithRouter
    + nullifier.slice(2).padStart(64,"0")
    + root.slice(2).padStart(64,"0")
    + tokenIn.slice(2).padStart(64,"0")
    + tokenOut.slice(2).padStart(64,"0")
    + amountInForCalldata.toString(16).padStart(64,"0")
    + minAmountOutForCalldata.toString(16).padStart(64,"0")
    + commitmentOut.slice(2).padStart(64,"0")
    + BigInt(deadline).toString(16).padStart(64,"0")
    + dexRouter.slice(2).padStart(64,"0")
    + encodeUint256(offRoute)
    + encodeUint256(offEntry)
    + encodeBytes(routeData)
    + encodeBytes(encryptedEntry);

  return { data, value };
}

// ── LI.FI routeData encoder ───────────────────────────────────────────────
// Matches LiFiPrivacyAdapter.executeSwap() / LiFiPrivacyBridge.privateBridge()'s
// `abi.decode(routeData, (address target, uint256 callValue, bytes calldata_))`.
// `target` MUST be the allowlisted LI.FI Diamond (CONTRACTS.LiFiDiamond) or the
// adapter reverts with RouteTargetMismatch. `callValue` MUST be LI.FI's own
// `quote.transactionRequest.value` — NOT assumed to equal fromAmount, since
// some routes pull tokenIn via allowance even when tokenIn is Arc's native
// USDC (LI.FI doesn't always know a chain's "native" token is gas-native).
export function encodeLiFiRouteData(diamondAddress, callValue, txCalldataHex) {
  const addr    = encodeAddress(diamondAddress);
  const value   = encodeUint256(BigInt(callValue || 0));
  const offset  = encodeUint256(0x60n); // 3 head words (addr, value, offset) × 32
  return "0x" + addr + value + offset + encodeBytes(txCalldataHex);
}

// ── Curve routeData encoder ──────────────────────────────────────────────
// CurvePrivacyAdapter.executeSwap() decodes routeData as
// abi.encode(address pool, int128 i, int128 j) — see the contract's doc
// comment. int128 values here are always small non-negative pool token
// indices (0, 1, 2…) in practice, so a plain unsigned 32-byte encoding is
// safe (no two's-complement negative-number handling needed).
export function encodeCurveRouteData(pool, i, j) {
  return "0x" + encodeAddress(pool) + encodeUint256(BigInt(i)) + encodeUint256(BigInt(j));
}

// ── LI.FI supported destinations (from Arc Testnet) ───────────────────────
// LI.FI's testnet routing only supports a curated subset of chains as a
// `toChain` — passing an arbitrary chain ID (even a real, well-known one
// like Ethereum Sepolia) can fail with a schema-validation 400. Rather than
// hardcode a guessed list, ask LI.FI which chains are actually reachable
// from Arc Testnet right now.
export async function fetchLiFiDestinations(fromChain = ARC_CHAIN_ID) {
  const res = await fetch(`https://li.quest/v1/connections?fromChain=${fromChain}`);
  if (!res.ok) throw new Error(`LI.FI connections failed (${res.status})`);
  const body = await res.json();
  const ids = new Set((body?.connections || []).map(c => c.toChainId).filter(Boolean));
  return ids; // Set<number> of reachable destination chain IDs
}

// ── LI.FI quote fetch (li.quest public API — no key required for quotes) ──
// fromAddress/toAddress should be the ADAPTER/BRIDGE CONTRACT, never the
// user's own EOA — the whole point of routing through LiFiPrivacyAdapter /
// LiFiPrivacyBridge is that LI.FI (and anyone watching the resulting public
// tx) sees the contract as counterparty, not the user. For a same-chain swap,
// toAddress should equal fromAddress (funds return to the contract to be
// re-shielded). For a bridge, toAddress is the destination recipient.
export async function fetchLiFiQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage = 0.01 }) {
  const params = new URLSearchParams({
    fromChain:  String(fromChain),
    toChain:    String(toChain),
    fromToken,
    toToken,
    fromAmount: String(fromAmount),
    fromAddress,
    toAddress:  toAddress || fromAddress,
    slippage:   String(slippage),
    // CRITICAL: without this, LI.FI simulates the route against fromAddress
    // BEFORE returning it — but fromAddress here is LiFiPrivacyAdapter,
    // which never holds tokenIn ahead of time (funds only ever arrive
    // atomically, within the same on-chain tx as the ShieldVault call —
    // that's the whole point of the privacy design, see comment above).
    // Simulating against an account with a real balance of zero at quote
    // time produces a degraded/failed route — this is very likely why every
    // quote was coming back "no available quotes / price impact 99.99999%"
    // regardless of whether real liquidity actually existed for the pair.
    // NOTE: a "stablecoin" preset was tried alongside this and reverted —
    // it 400'd with "Failed to apply ... preset 'stablecoin'" (code 1011),
    // most likely because EURC isn't registered under LI.FI's stablecoin
    // tag on this testnet, or the preset conflicts with the manual
    // `slippage` param above. Not worth the added failure surface.
    skipSimulation: "true",
  });
  const res = await fetch(`https://li.quest/v1/quote?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LI.FI quote failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const quote = await res.json();
  if (!quote?.transactionRequest?.to || !quote?.transactionRequest?.data) {
    throw new Error("LI.FI quote missing transactionRequest — no route found for this pair/amount.");
  }
  return quote;
}
// v3.0.0 vault. Calling this against the currently deployed contract will revert
// with empty data (0x), same failure mode as the "failed to call deposit" tx.
// Use buildAtomicSwapCalldata() instead — it targets the real v3.0.0 privateSwap().
export function buildPrivateSwapCalldata({ nullifier, merkleRoot, commitmentOut, tokenIn, tokenOut, amountIn, minAmountOut, deadline, dexRouter = "0x0000000000000000000000000000000000000000", routeData = "0x", flatFeeUsdc = 0n }) {
  const outerOff = encodeUint256(0x20n);

  // routeData as bytes: length-prefixed, padded to 32-byte boundary
  const rdBytes  = routeData.replace("0x", "");
  const rdLen    = rdBytes.length / 2;  // byte count
  const rdPadded = rdBytes.padEnd(Math.ceil(rdLen / 32) * 64, "0");

  // offsets from struct start (19 static words * 32 = 0x260):
  const offRoute  = encodeUint256(0x260n);  // head ends at 19×32 = 0x260 → routeData tail starts here
  const rdWords   = Math.ceil(rdLen / 32);
  // publicInputs starts after routeData tail: 0x260 + length_word(32) + data_words(rdWords×32)
  const offPubIn  = encodeUint256(BigInt(0x260 + 32 + rdWords * 32));  // ← was +32+32 (extra word → revert)

  const deadlineHex = encodeUint256(BigInt(deadline || Math.floor(Date.now() / 1000) + 1200));

  const data = SEL.privateSwapExec
    + outerOff
    // proof (8 words)
    + PROOF_A_X + PROOF_A_Y
    + PROOF_B_X0 + PROOF_B_X1 + PROOF_B_Y0 + PROOF_B_Y1
    + PROOF_C_X + PROOF_C_Y
    // static fields
    + encodeBytes32(nullifier)
    + encodeBytes32(merkleRoot)
    + encodeBytes32(commitmentOut)
    + encodeAddress(tokenIn)
    + encodeAddress(tokenOut)
    + encodeUint256(amountIn)
    + encodeUint256(minAmountOut)
    + deadlineHex
    + encodeAddress(dexRouter)
    // dynamic offsets
    + offRoute
    + offPubIn
    // tail: routeData
    + encodeUint256(BigInt(rdLen))
    + rdPadded
    // tail: publicInputs
    + encodeUint256(0n);   // empty publicInputs array (MockVerifierZK ignores them)

  // Swap landing in native USDC: no msg.value — % fee skimmed from grossOut on-chain.
  // Swap landing in EURC/cirBTC (v2.8): msg.value carries the FLAT protocol fee in
  // USDC; grossOut is credited in full — see PrivarShieldVault.sol's v2.8 changelog.
  // Fee depends on tokenOUT (what the user receives), not tokenIn.
  const tokenOutIsNativeUsdc = tokenOut.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value = tokenOutIsNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── PRIVATE BRIDGE ───────────────────────────────────────────────────────────
// PrivarShieldVault.privateBridgeExec(BridgeParams params)
//
// BridgeParams (IModules.sol):
//   proof               (uint256[2],uint256[2][2],uint256[2])  → 8 words
//   nullifier           bytes32
//   merkleRoot          bytes32
//   destinationDomain   uint32
//   token               address
//   amount              uint256
//   mintRecipient       bytes32
//   maxBridgeFee        uint256
//   publicInputs        uint256[]  ← dynamic
//
// Static: 8(proof) + 1 + 1 + 1 + 1 + 1 + 1 + 1 = 15 words → head size = (15+1) words = 0x200
// Actually: 15 static + 1 offset for publicInputs = 16 words = 0x200? No.
// Head = all words: 15 static inlined + 1 offset = 16 * 32 = 0x200
// publicInputs tail starts at 0x200

export function buildPrivateBridgeCalldata({ nullifier, merkleRoot, destinationDomain, token, amount, mintRecipient, maxBridgeFee = 0n, flatFeeUsdc = 0n }) {
  const outerOff = encodeUint256(0x20n);
  const offPubIn = encodeUint256(0x200n);  // 16 words * 32 = 0x200

  const data = SEL.privateBridgeExec
    + outerOff
    // proof (8 words)
    + PROOF_A_X + PROOF_A_Y
    + PROOF_B_X0 + PROOF_B_X1 + PROOF_B_Y0 + PROOF_B_Y1
    + PROOF_C_X + PROOF_C_Y
    // static fields
    + encodeBytes32(nullifier)
    + encodeBytes32(merkleRoot)
    + encodeUint32(destinationDomain)
    + encodeAddress(token)
    + encodeUint256(amount)
    + encodeBytes32(mintRecipient)
    + encodeUint256(maxBridgeFee)
    // dynamic offset
    + offPubIn
    // tail: publicInputs (empty)
    + encodeUint256(0n);

  // Bridging native USDC: no msg.value — % fee skimmed from the bridged amount
  // on-chain. Bridging EURC/cirBTC (v2.8 — today's actual use case, bridge currently
  // only routes EURC): msg.value carries the FLAT protocol fee in USDC; the full
  // amount is bridged via CCTP — see PrivarShieldVault.sol's v2.8 changelog.
  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value = isNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── LI.FI PRIVACY BRIDGE (v3.2) ──────────────────────────────────────────────
// LiFiPrivacyBridge.privateBridge(bytes32 nullifier, bytes32 root, address token,
//   uint256 amount, address relayer, uint256 relayerFee, bytes routeData, bytes encryptedEntry) payable
//
// Replaces buildPrivateBridgeCalldata()'s CCTP path: unshields the note and
// executes the LI.FI route in ONE transaction, targeting LiFiPrivacyBridge
// (NOT PrivarShieldVault) directly. For EURC/cirBTC, `flatFeeUsdc` is still
// forwarded as msg.value exactly like a plain withdraw() — see
// LiFiPrivacyBridge.sol's `vaultFee` handling.
// v3.4.0 adds a trailing optional `encryptedEntry`, forwarded to
// ShieldVault.withdraw() and emitted there via NoteJournal(msg.sender, ...)
// in the SAME transaction as the bridge itself (protocol-wide note-journal
// persistence — see PrivarShieldVault.sol's NoteJournal event doc comment).
export function buildLiFiBridgeCalldata({
  nullifier, root, token, amount,
  relayer = "0x0000000000000000000000000000000000000000", relayerFee = 0n,
  routeData, flatFeeUsdc = 0n, encryptedEntry = "0x",
}) {
  // Same conversion as buildWithdrawCalldata — LiFiPrivacyBridge.privateBridge()
  // forwards `amount`/`relayerFee` verbatim into ShieldVault.withdraw(), whose
  // native branch treats them as native wei (18-dec), not 6-dec USDC display units.
  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
  const amountForCalldata     = isNativeUsdc ? BigInt(amount) * NATIVE_TO_ERC20     : BigInt(amount);
  const relayerFeeForCalldata = isNativeUsdc ? BigInt(relayerFee) * NATIVE_TO_ERC20 : BigInt(relayerFee);

  // 8 args, 2 dynamic (routeData, encryptedEntry) → head = 8 words = 0x100
  const offRoute = 0x100n;
  const offEntry = offRoute + BigInt(encodedBytesSize(routeData));
  const data = SEL.lifiPrivateBridge
    + encodeBytes32(nullifier)
    + encodeBytes32(root)
    + encodeAddress(token)
    + encodeUint256(amountForCalldata)
    + encodeAddress(relayer)
    + encodeUint256(relayerFeeForCalldata)
    + encodeUint256(offRoute)
    + encodeUint256(offEntry)
    + encodeBytes(routeData)
    + encodeBytes(encryptedEntry);

  const value = isNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}
export function buildApproveCalldata(spender, amount) {
  return SEL.approve + encodeAddress(spender) + encodeUint256(amount);
}

// ─── NATIVE USDC GATE ────────────────────────────────────────────────────────
// Native USDC uses msg.value — no ERC-20 approve needed before deposit
export function needsApproveBeforeDeposit(tokenAddress) {
  return tokenAddress.toLowerCase() !== NATIVE_USDC.toLowerCase();
}

// ─── STAKING ─────────────────────────────────────────────────────────────────
// PrivarStaking.sol stake(uint256 amount, uint256 lockDuration) expects lockDuration in SECONDS
// Valid values: 604800 (7d), 2592000 (30d), 7776000 (90d), 15552000 (180d)
export function buildStakeCalldata(amount, lockSeconds) {
  return SEL.stake + encodeUint256(amount) + encodeUint256(BigInt(lockSeconds));
}

// ─── MERKLE ROOT GETTER ───────────────────────────────────────────────────────
// For withdraw/send/swap: we need to read the current Merkle root
export function buildGetLastRootCall() {
  return SEL.getLastRoot;  // eth_call to PrivarMerkleTreeManager
}

// ─── RANDOM CRYPTO HELPERS ───────────────────────────────────────────────────
// Generate a cryptographically random bytes32 value
export function randomBytes32() {
  return "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── PROTOCOL FEE PREVIEWS ────────────────────────────────────────────────────
// Mirrors PrivarShieldVault v2.4's on-chain fee math exactly, so the UI can show an
// accurate "you'll pay X in fees" BEFORE the user signs anything. All four rates
// default to 0 until governance opts in (see PrivarShieldVault.sol v2.4 changelog).
export const MIN_DEPOSIT_FEE = 30_000n; // 0.03 USDC (6-dec) — matches the on-chain constant

// fee = max(amount * bps / 10000, MIN_DEPOSIT_FEE), only if it doesn't consume the whole amount
// ── v2.8: fees are ALWAYS denominated/collected in USDC, never in EURC/cirBTC ──
// Native USDC operations keep the % skim (already naturally USDC-denominated).
// EURC/cirBTC operations instead pay flatFeeUsdc as a SEPARATE USDC payment via
// msg.value — the token amount itself is never skimmed. Every preview function
// below now takes isNativeUsdc to branch identically to the on-chain logic.

// Deposit: % skim (USDC, floored at MIN_DEPOSIT_FEE) or flat USDC side-payment (EURC/cirBTC)
export function previewDepositFee(amountUnits, protocolFeeBps, isNativeUsdc, flatFeeUsdc) {
  const amount = BigInt(amountUnits);
  if (!isNativeUsdc) {
    // No skim from the deposited token at all — fee is a separate USDC payment
    return { fee: 0n, net: amount, flatFeeUsdc: BigInt(flatFeeUsdc || 0) };
  }
  const bps = BigInt(protocolFeeBps || 0);
  let fee = 0n;
  if (bps > 0n) {
    const bpsFee = (amount * bps) / 10_000n;
    fee = bpsFee > MIN_DEPOSIT_FEE ? bpsFee : MIN_DEPOSIT_FEE;
    if (fee >= amount) fee = 0n;
  }
  return { fee, net: amount - fee, flatFeeUsdc: 0n };
}

// Withdraw: % skim from withdrawAmt (USDC) or flat USDC side-payment (EURC/cirBTC)
export function previewWithdrawFee(amountUnits, protocolFeeBps, isNativeUsdc, flatFeeUsdc) {
  const amount = BigInt(amountUnits);
  if (!isNativeUsdc) {
    return { fee: 0n, net: amount, flatFeeUsdc: BigInt(flatFeeUsdc || 0) };
  }
  const fee = (amount * BigInt(protocolFeeBps || 0)) / 10_000n;
  return { fee, net: amount - fee, flatFeeUsdc: 0n };
}

// Swap: % skim from grossOut if landing in USDC, else flat USDC side-payment (full grossOut credited)
export function previewSwapFee(grossOutUnits, swapFeeBps, tokenOutIsNativeUsdc, flatFeeUsdc) {
  const gross = BigInt(grossOutUnits);
  if (!tokenOutIsNativeUsdc) {
    return { fee: 0n, net: gross, flatFeeUsdc: BigInt(flatFeeUsdc || 0) };
  }
  const fee = (gross * BigInt(swapFeeBps || 0)) / 10_000n;
  return { fee, net: gross - fee, flatFeeUsdc: 0n };
}

// Bridge: % skim from amount if bridging USDC, else flat USDC side-payment (full amount bridged)
export function previewBridgeFee(amountUnits, bridgeFeeBps, isNativeUsdc, flatFeeUsdc) {
  const amount = BigInt(amountUnits);
  if (!isNativeUsdc) {
    return { fee: 0n, net: amount, flatFeeUsdc: BigInt(flatFeeUsdc || 0) };
  }
  const fee = (amount * BigInt(bridgeFeeBps || 0)) / 10_000n;
  return { fee, net: amount - fee, flatFeeUsdc: 0n };
}

// Confidential send: flat fee only (no %), paid as native-USDC msg.value alongside
// shieldedSend/shieldedSendWithNote — see PrivarShieldVault.sol v2.4 changelog for why a
// percentage fee isn't possible here without revealing the shielded amount.
// Also reused as the generic "encode a flat USDC amount as native wei" helper for
// deposit/withdraw/swap/bridge's EURC/cirBTC side-payment (v2.8).
export function sendFeeValueHex(flatFeeUnits) {
  const wei = BigInt(flatFeeUnits || 0) * 1_000_000_000_000n; // 6-dec → 18-dec wei
  return "0x" + wei.toString(16);
}

// Decode a `string` eth_call return value (offset + length + UTF-8 data).
// Returns "" for an empty/unreadable result.
export function decodeStringReturn(hex) {
  const bytesHex = decodeBytesReturn(hex);
  if (!bytesHex) return "";
  const clean = bytesHex.replace("0x", "");
  let str = "";
  for (let i = 0; i < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i+2), 16);
    if (code > 0) str += String.fromCharCode(code);
  }
  return str;
}

// totalVolumeByToken(address) — for eth_call
export function buildTotalVolumeByTokenCall(token) {
  return SEL.totalVolumeByToken + encodeAddress(token);
}

// ─── ON-CHAIN SWAP QUOTING (XyloRouter / any Uniswap V2-shaped router) ────────
// getAmountsOut(uint256 amountIn, address[] path) — used to fetch the REAL
// pool-derived output before submitting a XyloNet/Uniswap swap, instead of
// relying solely on the off-chain price-matrix estimate (see v17.1.3
// changelog: that estimate can drift from a thin/imbalanced testnet pool's
// actual rate by more than the slippage tolerance, causing a guaranteed
// "XyloRouter: INSUFFICIENT_OUTPUT" revert even though nothing is broken).
// Head layout: [amountIn (static)][offset to path (0x40)], then path's own
// [length][addr0][addr1]... — standard dynamic-array ABI encoding.
export function buildGetAmountsOutCall(amountIn, path) {
  const offset   = encodeUint256(0x40n);
  const lenWord  = encodeUint256(BigInt(path.length));
  const pathWords = path.map(encodeAddress).join("");
  return SEL.getAmountsOut
    + encodeUint256(amountIn)
    + offset
    + lenWord
    + pathWords;
}

// Decodes getAmountsOut's `uint256[] amounts` return value and returns the
// LAST element — i.e. the actual output amount for path[path.length-1],
// which is what matters for minAmountOut. Returns null on any decode
// failure or empty/reverted result, so callers can fall back to the naive
// estimate rather than crash.
export function decodeAmountsOutReturn(hex) {
  if (!hex || hex === "0x" || hex.length < 2 + 64) return null;
  try {
    const clean = hex.replace("0x", "");
    const len = Number(BigInt("0x" + clean.slice(64, 128)));
    if (!len) return null;
    const lastWordStart = 128 + (len - 1) * 64;
    return BigInt("0x" + clean.slice(lastWordStart, lastWordStart + 64));
  } catch {
    return null;
  }
}


// ViewKeyRegistry.sol — real ECDH P-256 view keys for confidential-send auto-discovery.
// See contracts/ViewKeyRegistry.sol for full design notes. All four functions below
// are simple single-arg calls — no nested structs, so encoding is straightforward.

// registerViewKey(bytes publicKey) — publicKey is the raw 65-byte uncompressed P-256 point
export function buildRegisterViewKeyCalldata(publicKeyHex) {
  const offset = encodeUint256(0x20n);
  return { data: SEL.registerViewKey + offset + encodeBytes(publicKeyHex), value: "0x0" };
}

// removeViewKey() — no args
export function buildRemoveViewKeyCalldata() {
  return { data: SEL.removeViewKey, value: "0x0" };
}

// hasViewKey(address owner) view returns (bool) — for eth_call
export function buildHasViewKeyCall(owner) {
  return SEL.hasViewKey + encodeAddress(owner);
}

// getViewKey(address owner) view returns (bytes) — for eth_call
export function buildGetViewKeyCall(owner) {
  return SEL.getViewKey + encodeAddress(owner);
}

// emitNote(address recipient, bytes encryptedNote, bytes ephemeralPubKey)
// 3 args: recipient (static), encryptedNote (dynamic), ephemeralPubKey (dynamic)
// Head = 3 words (0x60): [recipient][offsetEncNote][offsetEphPub]
export function buildEmitNoteCalldata({ recipient, encryptedNote, ephemeralPubKey }) {
  const offEncNote = encodeUint256(0x60n);
  const offEphPub  = encodeUint256(BigInt(0x60 + encodedBytesSize(encryptedNote)));
  const data = SEL.emitNote
    + encodeAddress(recipient)
    + offEncNote
    + offEphPub
    + encodeBytes(encryptedNote)
    + encodeBytes(ephemeralPubKey);
  return { data, value: "0x0" };
}

// Decode a `bytes` eth_call return value (offset + length + data) into a "0x..." hex string.
// Returns null for an empty/unregistered result.
export function decodeBytesReturn(hex) {
  if (!hex || hex === "0x" || hex.length < 2 + 64) return null;
  const clean = hex.replace("0x", "");
  // Standard ABI: [offset(32)][length(32)][data...]
  const len = parseInt(clean.slice(64, 128), 16);
  if (!len) return null;
  return "0x" + clean.slice(128, 128 + len * 2);
}

// ─── PRIVAR CLOUD VAULT ───────────────────────────────────────────────────────
// PrivarCloudVault.sol — decentralized, events-only backup registry for the
// shielded note journal. See contracts/core/PrivarCloudVault.sol for full
// design notes. No struct args — encoding follows the same hand-rolled ABI
// pattern as the rest of this file (this project intentionally has zero
// ethers/viem dependency).

// pushDelta(bytes encryptedDelta) — single dynamic arg
export function buildPushDeltaCalldata(encryptedDeltaHex) {
  const offset = encodeUint256(0x20n);
  return { data: SEL.pushDelta + offset + encodeBytes(encryptedDeltaHex), value: "0x0" };
}

// pushCheckpoint(bytes32 stateFingerprint, bytes encryptedSnapshot)
// Head = 2 words: [fingerprint (static)][offset to encryptedSnapshot]
export function buildPushCheckpointCalldata(fingerprintHex, encryptedSnapshotHex) {
  const offset = encodeUint256(0x40n);
  const data = SEL.pushCheckpoint
    + encodeBytes32(fingerprintHex)
    + offset
    + encodeBytes(encryptedSnapshotHex);
  return { data, value: "0x0" };
}

// latestVersion(address owner) view returns (uint64) — for eth_call
export function buildCvLatestVersionCall(owner) {
  return SEL.cvLatestVersion + encodeAddress(owner);
}

// lastCheckpointBlock(address owner) view returns (uint64) — for eth_call
export function buildCvLastCheckpointBlockCall(owner) {
  return SEL.cvLastCheckpointBlock + encodeAddress(owner);
}

// lastCheckpointVersion(address owner) view returns (uint64) — for eth_call
export function buildCvLastCheckpointVersionCall(owner) {
  return SEL.cvLastCheckpointVersion + encodeAddress(owner);
}

// Decode a `uint64`/`uint256` eth_call return value into a plain JS number.
// CloudVault's counters are uint64, always small enough for Number() safely.
export function decodeUint64Return(hex) {
  if (!hex || hex === "0x") return 0;
  try { return Number(BigInt(hex)); } catch { return 0; }
}


// Circle CCTP v2 domain IDs (matches PrivateBridge.sol constructor)
export const CCTP_DOMAINS = {
  // kitChain: App Kit chain identifier for kit.bridge() / kit.swap()
  // chainId: real EVM chain ID, used for LI.FI quotes (fromChain/toChain) —
  // distinct from CCTP's own domainId numbering.
  ethereum: { domainId: 0,  chainId: 11155111, name: "Ethereum Sepolia",  icon: "Ξ",  note: "LI.FI", kitChain: "Ethereum_Sepolia"       },
  avalanche:{ domainId: 1,  chainId: 43113,    name: "Avalanche Fuji",    icon: "🔺", note: "LI.FI", kitChain: "Avalanche_Fuji"         },
  optimism: { domainId: 2,  chainId: 11155420, name: "Optimism Sepolia",  icon: "🔴", note: "LI.FI", kitChain: "Optimism_Sepolia"       },
  arbitrum: { domainId: 3,  chainId: 421614,   name: "Arbitrum Sepolia",  icon: "🔵", note: "LI.FI", kitChain: "Arbitrum_Sepolia"       },
  base:     { domainId: 6,  chainId: 84532,    name: "Base Sepolia",      icon: "🔷", note: "LI.FI", kitChain: "Base_Sepolia"           },
  polygon:  { domainId: 7,  chainId: 80002,    name: "Polygon Amoy",      icon: "⬟", note: "LI.FI", kitChain: "Polygon_Amoy_Testnet"  },
};
