// ════════════════════════════════════════════════════════════════════════════
//  PrivARC OS — Contract Config v12.1.0
//
//  Addresses synced with latest.json v3.0.0 + LI.FI adapters — Arc Testnet — 2026-07-20
//  Deployer: 0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894
//
//  ADDRESSES: sourced from VITE_ env vars (Vercel) or hardcoded fallbacks
// ════════════════════════════════════════════════════════════════════════════

export const ARC_CHAIN_ID = 5042002;

// ── Contract addresses ────────────────────────────────────────────────────────
const _c = {
  PrivARCShieldVault:         import.meta.env.VITE_SHIELD_VAULT         ?? "0x8e6933Da376D53CE8A5fD61f6b5f67B9B64DC89E",
  Timelock:            import.meta.env.VITE_TIMELOCK              ?? "0x8DF7C02012EBec968bdEc100F4fEAF772AcAab99",
  Governance:          import.meta.env.VITE_GOVERNANCE            ?? "0x89F08E2BBc963e48986D8A0FfA23858bA643C78A",
  PrivARCStaking:             import.meta.env.VITE_STAKING               ?? "0xFf59d163f836844eA05186616Dd93E0d4BBdEE69",
  PrivARCNullifierRegistry:   import.meta.env.VITE_NULLIFIER_REGISTRY    ?? "0x18Bff21dFB1f28F7E146d575D29a1D1F3c12a16e",
  PrivARCMerkleTreeManager:   import.meta.env.VITE_MERKLE_TREE_MANAGER   ?? "0xeF118A6FEdd6C20AD3203B33455323e2C919C7d5",
  PrivARCDepositManager:      import.meta.env.VITE_DEPOSIT_MANAGER       ?? "0xF1164b3340780614e6dd9E15b9895Cb8eb2168d6",
  WithdrawalManager:   import.meta.env.VITE_WITHDRAWAL_MANAGER    ?? "0xEa50F28A1b7a80bF8784E9917C56fBD33751290D",
  ShieldedTransfer:    import.meta.env.VITE_SHIELDED_TRANSFER     ?? "0xa880603916611a0e624f9A04c7f08b62f0532543",
  PrivateSwap:         import.meta.env.VITE_PRIVATE_SWAP          ?? "0xd16F252FFc0a406dFcF58eBAF7EA49f9e1DF78Eb",
  PrivateBridge:       import.meta.env.VITE_PRIVATE_BRIDGE        ?? "0x1C22eEb6c422BeF73B335e1E5668ec3109839B40",
  EmergencyController: import.meta.env.VITE_EMERGENCY_CONTROLLER  ?? "0xa788E96DcF4dBf348995bc5b8D0C7BbaD8e5e88F",
  MockVerifierZK:      import.meta.env.VITE_VERIFIER_ZK           ?? "0x472335061E184d43D0f56C4a9A576195eA045Ec5",
  // ViewKeyRegistry v1.0.0 — deployed 2026-06-20. Confidential-send auto-discovery
  // (real ECDH stealth notes) is feature-gated on this being non-null — see
  // DApp.jsx ensureViewKeyRegistered()/scanStealthNotes().
  ViewKeyRegistry:     import.meta.env.VITE_VIEW_KEY_REGISTRY     ?? "0x590D1FDC3FbD4CAb151cb7E1557D9C4ecEa2C24b",
  // LI.FI privacy adapters v3.2 — deployed 2026-07-20, see /areas/privarc.md
  LiFiPrivacyAdapter:  import.meta.env.VITE_LIFI_ADAPTER          ?? "0xBEA02a6599cC0d90DefE7563DEc6Ed7eBdb54675",
  LiFiPrivacyBridge:   import.meta.env.VITE_LIFI_BRIDGE           ?? "0x974366d465bc137d34E2a26acC945E2d43B2A1dD",
  LiFiDiamond:         import.meta.env.VITE_LIFI_DIAMOND          ?? "0xFf70F4A1d11995621854F3692acF286d8aCd04b2",
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
  // Deployed by PrivARC
  PrivARCShieldVault:         _c.PrivARCShieldVault,
  Timelock:            _c.Timelock,
  Governance:          _c.Governance,
  PrivARCStaking:             _c.PrivARCStaking,
  PrivARCNullifierRegistry:   _c.PrivARCNullifierRegistry,
  PrivARCMerkleTreeManager:   _c.PrivARCMerkleTreeManager,
  PrivARCDepositManager:      _c.PrivARCDepositManager,
  WithdrawalManager:   _c.WithdrawalManager,
  ShieldedTransfer:    _c.ShieldedTransfer,
  PrivateSwap:         _c.PrivateSwap,
  // PrivateSwapAdapter — production router whitelisted in PrivateSwap.
  // Arc Testnet: simulation mode (no Uniswap V3). Mainnet: Uniswap V3.
  // Deploy: npx hardhat run scripts/deploy-private-swap-adapter.js --network arc_testnet
  // TowerSwapAdapter — Tower Exchange (StableFX) router for confidential swaps
  // Deployed by: npx hardhat run scripts/deploy.js --network arc_testnet
  // NOTE: as of the v3.2 LI.FI deployment, ShieldVault.swapRouter() points to
  // LiFiPrivacyAdapter, NOT this address — TowerSwapAdapter is kept deployed
  // only as a documented rollback target (see scripts/deploy-lifi.js).
  TowerSwapAdapter:    import.meta.env.VITE_TOWER_SWAP_ADAPTER ?? "0xcb7BeafC503f57F72FaB15A37968ACb54223Bd2D",
  PrivateBridge:       _c.PrivateBridge,
  EmergencyController: _c.EmergencyController,
  MockVerifierZK:      _c.MockVerifierZK,
  ViewKeyRegistry:     _c.ViewKeyRegistry,
  // LI.FI privacy adapters — active default swap router + confidential bridge.
  // See contracts/adapters/LiFiPrivacyAdapter.sol / LiFiPrivacyBridge.sol.
  LiFiPrivacyAdapter:  _c.LiFiPrivacyAdapter,
  LiFiPrivacyBridge:   _c.LiFiPrivacyBridge,
  LiFiDiamond:         _c.LiFiDiamond,
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
// IPrivARCVerifierZK.Proof = (uint256[2],uint256[2][2],uint256[2])
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

  // PrivARCShieldVault v2.2 — computed from IModules.sol struct ABI signatures
  // NOTE: These selectors are computed from the EXACT function signatures.
  // If deployment reverts with "function not found", verify with:
  //   cast sig "deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))"
  // PrivARCShieldVault v3.0.0 — simplified ABI, NO ZK proof structs anymore.
  // Selectors verified against contracts/core/PrivARCShieldVault.sol (v3.0.0).
  // Sanity-checked keccak256 impl against known selectors (balanceOf, transfer, approve).
  deposit:            "0x26b3293f",  // deposit(address,uint256,bytes32)
  withdraw:            "0x842dcc9e",  // withdraw(bytes32,bytes32,address,address,uint256,address,uint256)
  shieldedSend:        "0xfc70b4ba",  // shieldedSend(bytes32,bytes32,bytes32,bytes) — encryptedNote now inline, not payable
  privateSwap:         "0x4ac0a154",  // privateSwap(bytes32,bytes32,address,address,uint256,uint256,bytes32,uint256) — not payable
  // v3.2 — forwards an off-chain-quoted routeData (e.g. LI.FI) through to swapRouter.
  // Selector computed against PrivARCShieldVault.sol's exact new signature — see
  // scripts/deploy-lifi.js / contracts/core/PrivARCShieldVault.sol.
  privateSwapWithRoute:"0x9fcea826",  // privateSwapWithRoute(bytes32,bytes32,address,address,uint256,uint256,bytes32,uint256,bytes)

  // ── DEPRECATED (v2.x struct-based ABI, does NOT exist on v3.0.0 vault) ──────
  // Kept only so old references don't hard-crash; DO NOT call these against the
  // currently deployed ShieldVault — every call will revert with empty data (0x),
  // exactly like the "failed to call deposit" tx on ArcScan.
  shieldedSendWithNote:"0xd3c9406f",  // OBSOLETE — folded into shieldedSend() in v3.0.0
  privateSwapExec:     "0x49fa2a6e",  // OBSOLETE — replaced by privateSwap() in v3.0.0
  privateBridgeExec:  "0x8fa6444e",  // OBSOLETE — public CCTP path on the orphaned PrivateBridge contract, replaced by LiFiPrivacyBridge below
  // LiFiPrivacyBridge.privateBridge(bytes32,bytes32,address,uint256,address,uint256,bytes) — atomic unshield+LI.FI-bridge
  lifiPrivateBridge:  "0x74c37dfc",

  // PrivARCShieldVault views
  totalShielded:      "0x6d7f2685",  // totalShielded(address)
  totalShieldedUSDC:  "0x37b12e9e",  // totalShieldedUSDC()

  // PrivARCMerkleTreeManager
  nextLeafIndex:      "0x0be4f422",  // nextLeafIndex()
  getLastRoot:        "0xba70f757",  // getLastRoot()
  isKnownRoot:        "0x6d9833e3",  // isKnownRoot(bytes32)

  // EmergencyController
  pauseState:         "0xd7118351",  // pauseState()
  depositsAllowed:    "0x8f76137f",  // depositsAllowed()
  withdrawalsAllowed: "0x4843b358",  // withdrawalsAllowed()
  transfersAllowed:   "0xb0660c3d",  // transfersAllowed()
  adminReset:         "0x8c5b9b00",  // adminReset()

  // PrivARCDepositManager
  isTokenSupported:   "0x75151b63",  // isTokenSupported(address)
  getSupportedTokens: "0xd3c7c2c7",  // getSupportedTokens()
  minDeposit:         "0x3c29f839",  // minDeposit(address)

  // PrivARCStaking
  stake:              "0x7b0472f0",  // stake(uint256,uint256)
  unstake:            "0x2e17de78",  // unstake(uint256)
  claimRewards:       "0x372500ab",  // claimRewards()
  previewRewards:     "0xf166e920",  // previewRewards(address)
  getUserStakes:      "0x5e0e5b3e",  // getUserStakes(address) → StakePosition[]

  // Protocol fees (PrivARCShieldVault v2.4.0)
  feesCollectedByToken: "0xa2c169a7",  // feesCollectedByToken(address)
  withdrawFees:         "0x164e68de",  // withdrawFees(address)
  protocolFeeBps:       "0x35659fb8",  // protocolFeeBps() — deposit/withdraw
  swapFeeBps:           "0x2ffdaf89",  // swapFeeBps()
  bridgeFeeBps:         "0x4f6aa42b",  // bridgeFeeBps()
  flatFeeUsdc:          "0xb892df0e",  // flatFeeUsdc() — 6-dec USDC units (renamed from sendFlatFee in v2.8 — now used by deposit/withdraw/swap/bridge for EURC/cirBTC too, not just send)
  treasury:             "0x61d027b3",  // treasury()

  // Protocol fees (PrivARCStaking v1.1.0)
  performanceFeeBps:    "0xb9d4e879",  // performanceFeeBps() — PrivARCStaking contract

  // Live protocol stats (PrivARCShieldVault v2.5.0) — item 4: real-time dashboard
  VERSION:              "0xffa1ad74",  // VERSION() returns (string)
  totalTxCount:         "0x9b4f50e7",  // totalTxCount() returns (uint256)
  totalVolumeByToken:   "0x38caed9f",  // totalVolumeByToken(address) returns (uint256)

  // ViewKeyRegistry v1.0.0 — real ECDH P-256 view keys for confidential-send auto-discovery
  registerViewKey:    "0x4f9d2844",  // registerViewKey(bytes)
  removeViewKey:      "0xe1e0e535",  // removeViewKey()
  hasViewKey:         "0x9e0607f1",  // hasViewKey(address)
  getViewKey:         "0xc1f5c989",  // getViewKey(address)
  emitNote:           "0xdefb8b15",  // emitNote(address,bytes,bytes)
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
// PrivARCShieldVault.deposit(address token, uint256 amount, bytes32 commitment) payable
//
// ABI: deposit(address,uint256,bytes32) — v3.0.0, no struct, no ZK proof.
// Layout: [sel][token][amount][commitment] — 3 static words, no offsets needed.

export function buildDepositCalldata(commitment, tokenAddress, amount, flatFeeUsdc = 0n) {
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
    + comm32;                              // commitment

  const value = isNativeUsdc
    ? "0x" + amountForCalldata.toString(16)                              // must equal calldata amount exactly
    : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── WITHDRAW ────────────────────────────────────────────────────────────────
// PrivARCShieldVault.withdraw(
//   bytes32 nullifier, bytes32 root, address token, address recipient,
//   uint256 amount,    address relayer, uint256 relayerFee
// ) payable — v3.0.0, no struct, no ZK proof.
// NOTE the arg order: relayer comes BEFORE relayerFee on-chain (v2.x struct had it reversed).

export function buildWithdrawCalldata({ nullifier, root, token, recipient, amount, relayerFee = 0n, relayer = "0x0000000000000000000000000000000000000000", flatFeeUsdc = 0n }) {
  const data = SEL.withdraw
    + encodeBytes32(nullifier)
    + encodeBytes32(root)
    + encodeAddress(token)
    + encodeAddress(recipient)
    + encodeUint256(amount)
    + encodeAddress(relayer)
    + encodeUint256(relayerFee);

  // Native USDC withdraw: no msg.value — % fee is skimmed from withdrawAmt on-chain.
  // EURC/cirBTC withdraw: msg.value carries the FLAT protocol fee in USDC, if set.
  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value = isNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── SHIELDED SEND ────────────────────────────────────────────────────────────
// PrivARCShieldVault.shieldedSend(bytes32 nullifier, bytes32 root, bytes32 commitmentOut, bytes encryptedNote)
// v3.0.0: NOT payable, no ZK proof, encryptedNote is now a REQUIRED inline argument
// (the old two-step shieldedSend + separate ViewKeyRegistry.emitNote is merged into one call).
//
// ABI: shieldedSend(bytes32,bytes32,bytes32,bytes)
// 4 args, 1 dynamic (encryptedNote). Head = 4 words (0x80):
//   [0x00] nullifier      (static)
//   [0x20] root           (static)
//   [0x40] commitmentOut  (static)
//   [0x60] offset to encryptedNote (= 0x80, right after head)
//   [0x80] encryptedNote length + padded data

export function buildShieldedSendCalldata({ nullifier, root, commitmentOut, encryptedNote = "0x" }) {
  const offEncNote = encodeUint256(0x80n);

  const data = SEL.shieldedSend
    + encodeBytes32(nullifier)
    + encodeBytes32(root)
    + encodeBytes32(commitmentOut)
    + offEncNote
    + encodeBytes(encryptedNote);

  // Not payable on v3.0.0 — do not attach msg.value or the tx will revert.
  return { data, value: "0x0" };
}

// Old field name `nullifierIn`/`merkleRoot` kept as an alias so existing call sites
// (e.g. DApp.jsx built against the v2.x builder) don't need renaming immediately.
export function buildShieldedSendCalldataLegacyArgs({ nullifierIn, merkleRoot, commitmentOut, encryptedNote }) {
  return buildShieldedSendCalldata({ nullifier: nullifierIn, root: merkleRoot, commitmentOut, encryptedNote });
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

// PrivARCShieldVault.privateSwapExec(SwapParams params)
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

// ── PrivARCShieldVault.privateSwap() — atomic confidential swap (v3.0.0) ──
// This IS the v3.0.0 vault's actual swap function. NOT payable — no flatFeeUsdc/value.
// Selector verified: keccak256("privateSwap(bytes32,bytes32,address,address,uint256,uint256,bytes32,uint256)")
export function buildAtomicSwapCalldata({
  nullifier, root, tokenIn, tokenOut,
  amountIn, minAmountOut, commitmentOut,
  deadline = BigInt(Math.floor(Date.now()/1000) + 600),
}) {
  const data = SEL.privateSwap
    + nullifier.slice(2).padStart(64,"0")
    + root.slice(2).padStart(64,"0")
    + tokenIn.slice(2).padStart(64,"0")
    + tokenOut.slice(2).padStart(64,"0")
    + BigInt(amountIn).toString(16).padStart(64,"0")
    + BigInt(minAmountOut).toString(16).padStart(64,"0")
    + commitmentOut.slice(2).padStart(64,"0")
    + BigInt(deadline).toString(16).padStart(64,"0");

  // Not payable on v3.0.0 — do not attach msg.value or the tx will revert.
  return { data, value: "0x0" };
}

// ── PrivARCShieldVault.privateSwapWithRoute() — v3.2, forwards routeData ──
// Same as buildAtomicSwapCalldata but appends a dynamic `routeData` blob that
// swapRouter.executeSwap() actually receives. Required whenever swapRouter is
// LiFiPrivacyAdapter — it reverts on an empty routeData (TowerSwapAdapter, by
// contrast, ignores it). `routeData` here should already be the encoded
// (target, calldata) tuple — see encodeLiFiRouteData() below.
export function buildSwapWithRouteCalldata({
  nullifier, root, tokenIn, tokenOut,
  amountIn, minAmountOut, commitmentOut,
  deadline = BigInt(Math.floor(Date.now()/1000) + 600),
  routeData = "0x",
}) {
  const offRoute = encodeUint256(0x120n); // 9 head words × 32 = 0x120
  const data = SEL.privateSwapWithRoute
    + nullifier.slice(2).padStart(64,"0")
    + root.slice(2).padStart(64,"0")
    + tokenIn.slice(2).padStart(64,"0")
    + tokenOut.slice(2).padStart(64,"0")
    + BigInt(amountIn).toString(16).padStart(64,"0")
    + BigInt(minAmountOut).toString(16).padStart(64,"0")
    + commitmentOut.slice(2).padStart(64,"0")
    + BigInt(deadline).toString(16).padStart(64,"0")
    + offRoute
    + encodeBytes(routeData);

  return { data, value: "0x0" };
}

// ── LI.FI routeData encoder ───────────────────────────────────────────────
// Matches LiFiPrivacyAdapter.executeSwap() / LiFiPrivacyBridge.privateBridge()'s
// `abi.decode(routeData, (address target, bytes calldata_))`. `target` MUST be
// the allowlisted LI.FI Diamond (CONTRACTS.LiFiDiamond) or the adapter reverts
// with RouteTargetMismatch — this is what stops a route from redirecting funds
// through an arbitrary contract.
export function encodeLiFiRouteData(diamondAddress, txCalldataHex) {
  const addr   = encodeAddress(diamondAddress);
  const offset = encodeUint256(0x40n);
  return "0x" + addr + offset + encodeBytes(txCalldataHex);
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
  // USDC; grossOut is credited in full — see PrivARCShieldVault.sol's v2.8 changelog.
  // Fee depends on tokenOUT (what the user receives), not tokenIn.
  const tokenOutIsNativeUsdc = tokenOut.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value = tokenOutIsNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── PRIVATE BRIDGE ───────────────────────────────────────────────────────────
// PrivARCShieldVault.privateBridgeExec(BridgeParams params)
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
  // amount is bridged via CCTP — see PrivARCShieldVault.sol's v2.8 changelog.
  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value = isNativeUsdc ? "0x0" : "0x" + (BigInt(flatFeeUsdc) * NATIVE_TO_ERC20).toString(16);

  return { data, value };
}

// ─── LI.FI PRIVACY BRIDGE (v3.2) ──────────────────────────────────────────────
// LiFiPrivacyBridge.privateBridge(bytes32 nullifier, bytes32 root, address token,
//   uint256 amount, address relayer, uint256 relayerFee, bytes routeData) payable
//
// Replaces buildPrivateBridgeCalldata()'s CCTP path: unshields the note and
// executes the LI.FI route in ONE transaction, targeting LiFiPrivacyBridge
// (NOT PrivARCShieldVault) directly. For EURC/cirBTC, `flatFeeUsdc` is still
// forwarded as msg.value exactly like a plain withdraw() — see
// LiFiPrivacyBridge.sol's `vaultFee` handling.
export function buildLiFiBridgeCalldata({
  nullifier, root, token, amount,
  relayer = "0x0000000000000000000000000000000000000000", relayerFee = 0n,
  routeData, flatFeeUsdc = 0n,
}) {
  const offRoute = encodeUint256(0xE0n); // 7 head words × 32 = 0xE0
  const data = SEL.lifiPrivateBridge
    + encodeBytes32(nullifier)
    + encodeBytes32(root)
    + encodeAddress(token)
    + encodeUint256(amount)
    + encodeAddress(relayer)
    + encodeUint256(relayerFee)
    + offRoute
    + encodeBytes(routeData);

  const isNativeUsdc = token.toLowerCase() === NATIVE_USDC.toLowerCase();
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
// PrivARCStaking.sol stake(uint256 amount, uint256 lockDuration) expects lockDuration in SECONDS
// Valid values: 604800 (7d), 2592000 (30d), 7776000 (90d), 15552000 (180d)
export function buildStakeCalldata(amount, lockSeconds) {
  return SEL.stake + encodeUint256(amount) + encodeUint256(BigInt(lockSeconds));
}

// ─── MERKLE ROOT GETTER ───────────────────────────────────────────────────────
// For withdraw/send/swap: we need to read the current Merkle root
export function buildGetLastRootCall() {
  return SEL.getLastRoot;  // eth_call to PrivARCMerkleTreeManager
}

// ─── RANDOM CRYPTO HELPERS ───────────────────────────────────────────────────
// Generate a cryptographically random bytes32 value
export function randomBytes32() {
  return "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── PROTOCOL FEE PREVIEWS ────────────────────────────────────────────────────
// Mirrors PrivARCShieldVault v2.4's on-chain fee math exactly, so the UI can show an
// accurate "you'll pay X in fees" BEFORE the user signs anything. All four rates
// default to 0 until governance opts in (see PrivARCShieldVault.sol v2.4 changelog).
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
// shieldedSend/shieldedSendWithNote — see PrivARCShieldVault.sol v2.4 changelog for why a
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

// ─── VIEW KEY REGISTRY ────────────────────────────────────────────────────────
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

// ─── CCTP DESTINATION DOMAINS ────────────────────────────────────────────────
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
