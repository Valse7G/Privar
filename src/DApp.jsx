import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";
import { useTheme, cssVars, THEMES } from "./theme.jsx";
import {
  CONTRACTS, TOKENS, TOKEN_LIST, SEL, CCTP_DOMAINS,
  NATIVE_USDC, NATIVE_TO_ERC20, ARC_CHAIN_ID, PROTOCOL_VERSION,
  encodeAddress, encodeUint256, encodeBytes32,
  decodeUint256, decodeUint8, formatToken,
  buildDepositCalldata, buildWithdrawCalldata, buildWithdrawBatchCalldata,
  buildShieldedSendCalldata, buildPrivateSwapCalldata, buildPrivateBridgeCalldata,
  buildSwapAdapterRouteData,
  buildSwapWithRouterCalldata, buildLiFiBridgeCalldata,
  encodeLiFiRouteData, encodeCurveRouteData, fetchLiFiQuote, fetchLiFiDestinations,
  buildApproveCalldata, buildStakeCalldata, needsApproveBeforeDeposit,
  randomBytes32, buildGetLastRootCall,
  buildRegisterViewKeyCalldata, buildHasViewKeyCall, buildGetViewKeyCall,
  buildEmitNoteCalldata, decodeBytesReturn, decodeStringReturn,
  buildTotalVolumeByTokenCall,
  buildPushDeltaCalldata, buildPushCheckpointCalldata,
  buildCvLatestVersionCall, buildCvLastCheckpointBlockCall, buildCvLastCheckpointVersionCall,
  decodeUint64Return,
  previewDepositFee, previewWithdrawFee, previewSwapFee, previewBridgeFee, sendFeeValueHex,
  buildGetAmountsOutCall, decodeAmountsOutReturn,
} from "./contracts.js";

/* ═══════════════════════════════════════════════════════════════
   ARC NETWORK — OFFICIAL CHAIN CONFIGS (docs.arc.io)
   Testnet : chainId 5042002 | LIVE
   Mainnet : chainId TBD     | LOCKED — not yet available
═══════════════════════════════════════════════════════════════ */
const ARC_TESTNET = {
  id:        5042002,
  hexId:     "0x4cef52",       // 5042002 in hex — VERIFIED: hex(5042002) = 0x4cef52
  name:      "Arc Testnet",
  shortName: "ARC-TEST",
  rpcUrl:    "https://rpc.testnet.arc.network",
  wsUrl:     "wss://rpc.testnet.arc.network",
  explorer:  "https://testnet.arcscan.app",
  faucet:    "https://faucet.circle.com",
  currency:  { name: "USDC", symbol: "USDC", decimals: 18 }, // native gas token
  testnet:   true,
  available: true,
};

const ARC_MAINNET = {
  id:        null,             // Not yet published
  hexId:     null,
  name:      "Arc Mainnet",
  shortName: "ARC",
  rpcUrl:    null,
  explorer:  "https://arcscan.app",
  currency:  { name: "USDC", symbol: "USDC", decimals: 18 },
  testnet:   false,
  available: false,            // LOCKED — flip to true when mainnet launches
};

/*
  USDC on Arc Testnet:
  - Native gas token  → 18 decimals (used internally)
  - ERC-20 interface  → 6 decimals  (USE THIS for balances & transfers)
  Source: docs.arc.io/arc/references/contract-addresses
  "For applications integrating USDC, rely solely on the standard ERC-20
   interface for reading balances and sending transfers."
*/
const USDC_DECIMALS_ERC20 = 6;   // ERC-20 interface — balances, transfers
const USDC_DECIMALS_NATIVE = 18; // Native gas — internal only

// Arc Testnet: USDC is the native gas token.
// eth_getBalance returns wei (18 dec). Displayed as USDC using /1e12 shift.
// This is NOT ETH — the currency label must always say "USDC".
const NATIVE_TO_ERC20_SHIFT = NATIVE_TO_ERC20; // 10^12 (imported from contracts.js)

// USDC ERC-20 minimal ABI
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// USDC on Arc Testnet: native gas token (18 dec internally).
// ERC-20 interface reports 6 dec. We read eth_getBalance (wei18) and shift by 1e12
// to get the 6-dec equivalent displayed to the user.
// NATIVE_TO_ERC20_SHIFT is imported from contracts.js (= 10^12). No redeclaration.

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const hx = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const sl = (ms) => new Promise(r => setTimeout(r, ms));

// Format USDC with 6 decimals (ERC-20 interface)
const fmtUsdc = (wei6) => (Number(BigInt(wei6)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Format from native 18-decimal to display (shift by 1e12)
// Format native balance (18-dec wei) → USDC 6-dec display (divide by 1e12)
const fmtNative = (wei18) => (Number(BigInt(wei18)) / 1e12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sh = (a) => a ? a.slice(0, 8) + "···" + a.slice(-6) : "---";
const tc = () => { const n = new Date(); return [n.getHours(), n.getMinutes(), n.getSeconds()].map(x => String(x).padStart(2, "0")).join(":"); };
const toHex = (n) => "0x" + n.toString(16);

// Responsive: below this width the icon sidebar collapses into a
// hamburger + full-screen menu (see MobileNavMenu).
const MOBILE_BREAKPOINT = 720;
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const h = () => setIsMobile(mq.matches);
    h();
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h); };
  }, []);
  return isMobile;
}

/* ═══════════════════════════════════════════════════════════════
   EIP-1193 HELPERS  (real on-chain calls via window.ethereum)
═══════════════════════════════════════════════════════════════ */
async function rpcCall(method, params = []) {
  if (!window.ethereum) throw new Error("No wallet provider");
  return window.ethereum.request({ method, params });
}

// For read-only checks that GATE whether a transaction can proceed (Merkle
// root, current fee rates) — a single transient RPC/wallet-provider blip on
// a shaky mobile connection shouldn't abort the whole action. Retries a few
// times with a short delay before giving up for real.
async function rpcCallWithRetry(method, params = [], attempts = 3, delayMs = 900) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await rpcCall(method, params);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// Read native USDC balance (gas token, 18 dec)
async function getNativeBalance(address) {
  const raw = await rpcCall("eth_getBalance", [address, "latest"]);
  return BigInt(raw);
}

// Convert native balance (18 dec) → display as USDC 6-dec equivalent
function nativeToUsdc6(wei18) {
  return wei18 / NATIVE_TO_ERC20_SHIFT;
}

// Get current chain ID
async function getChainId() {
  const raw = await rpcCall("eth_chainId");
  return parseInt(raw, 16);
}

// Build the addEthereumChain payload — strictly EIP-3085 compliant
// chainId MUST be lowercase hex string matching exactly the integer
// Some wallets (TokenPocket, Trust) validate chainId integer vs hex strictly
const ARC_TESTNET_CHAIN_PARAMS = {
  chainId:          "0x4cef52",          // hex(5042002) — verified
  chainName:        "Arc Testnet",
  nativeCurrency:   { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls:          ["https://rpc.testnet.arc.network"],
  blockExplorerUrls:["https://testnet.arcscan.app"],
};

// Switch or add Arc Testnet — robust for all wallet types
async function switchToArcTestnet() {
  const HEX = "0x4cef52"; // hex(5042002)

  // Step 1: try switch first
  try {
    await rpcCall("wallet_switchEthereumChain", [{ chainId: HEX }]);
    return; // success
  } catch (switchErr) {
    // code 4902 = chain not added yet
    // code -32603 = internal error (some wallets use this instead of 4902)
    // code -32000 = some mobile wallets
    const needsAdd = switchErr.code === 4902
      || switchErr.code === -32603
      || switchErr.code === -32000
      || (switchErr.message||"").toLowerCase().includes("unrecognized")
      || (switchErr.message||"").toLowerCase().includes("unknown")
      || (switchErr.message||"").toLowerCase().includes("not exist");

    if (!needsAdd) {
      // User rejected (code 4001) or other real error → rethrow
      throw switchErr;
    }
  }

  // Step 2: add chain then switch
  try {
    await rpcCall("wallet_addEthereumChain", [ARC_TESTNET_CHAIN_PARAMS]);
    // After add, some wallets auto-switch, some don't — try switch again
    try {
      await rpcCall("wallet_switchEthereumChain", [{ chainId: HEX }]);
    } catch (_) {
      // Ignore — wallet may have already switched on addEthereumChain
    }
  } catch (addErr) {
    if (addErr.code === 4001) throw new Error("User rejected network addition");
    throw addErr;
  }
}

// Personal sign (EIP-191)
async function personalSign(address, message) {
  return rpcCall("personal_sign", [
    "0x" + Array.from(new TextEncoder().encode(message)).map(b => b.toString(16).padStart(2, "0")).join(""),
    address,
  ]);
}

// Send ETH/USDC transaction with gas estimation (FIX F-08)
async function sendTransaction(from, to, valueHex, data = "0x") {
  let gasLimit;
  try {
    const estimated = await rpcCall("eth_estimateGas", [{ from, to, value: valueHex, data, chainId: toHex(ARC_TESTNET.id) }]);
    // Add 30% buffer to avoid out-of-gas on borderline txs
    gasLimit = "0x" + Math.ceil(parseInt(estimated, 16) * 1.3).toString(16);
  } catch {
    // Fallback: 500k gas — sufficient for PrivarShieldVault operations
    gasLimit = "0x7A120";
  }
  return rpcCall("eth_sendTransaction", [{ from, to, value: valueHex, data, gas: gasLimit, chainId: toHex(ARC_TESTNET.id) }]);
}

// Wait for tx receipt (polling)
async function waitForReceipt(txHash) {
  // Arc Network advertises sub-second finality (<350ms per Arc's own docs
  // and third-party dApps built on it) — the previous fixed 2s-per-attempt
  // poll meant even a genuinely fast confirmation never showed up before
  // 2s had already elapsed, and the worst case (30 attempts x 2s) was a
  // full 60s of "Processing..." regardless of how fast the chain actually
  // confirmed. Poll aggressively at first (where the receipt is most
  // likely to already exist by the time we check), backing off for the
  // rare genuinely-slow case. Same ~60s total ceiling as before.
  const INTERVALS = [300, 300, 500, 500, 800, 1000, 1500, 2000];
  const CEILING_MS = 60_000;
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < CEILING_MS) {
    await sl(INTERVALS[Math.min(i, INTERVALS.length - 1)]);
    i++;
    try {
      const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
      if (receipt) return receipt;
    } catch {}
  }
  throw new Error("Transaction timeout — check explorer");
}

/* ═══════════════════════════════════════════════════════════════
   LIVE PRICE FEED — Real market prices via CoinGecko public API
   No API key required. Updates every 30s.
   Fallback: last known price + tiny noise (USDC stays pegged)
═══════════════════════════════════════════════════════════════ */
const PRICE_FALLBACK = { USDC: 1.0001, WETH: 2597.42, WBTC: 64521.80 };

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=usd-coin%2Cethereum%2Cwrapped-bitcoin" +
  "&vs_currencies=usd&include_24hr_change=true&precision=6";

async function fetchCGPrices() {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return {
    USDC: d["usd-coin"]?.usd         ?? PRICE_FALLBACK.USDC,
    WETH: d["ethereum"]?.usd         ?? PRICE_FALLBACK.WETH,
    WBTC: d["wrapped-bitcoin"]?.usd  ?? PRICE_FALLBACK.WBTC,
    USDC_24h: d["usd-coin"]?.usd_24h_change        ?? 0,
    WETH_24h: d["ethereum"]?.usd_24h_change        ?? 0,
    WBTC_24h: d["wrapped-bitcoin"]?.usd_24h_change ?? 0,
  };
}

function usePriceFeed() {
  const [prices,      setPrices]      = useState(PRICE_FALLBACK);
  const [changes,     setChanges]     = useState({ USDC:0, WETH:0, WBTC:0 });
  const [change24h,   setChange24h]   = useState({ USDC:0, WETH:0, WBTC:0 });
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [priceError,  setPriceError]  = useState(false);
  const prev = useRef({ ...PRICE_FALLBACK });

  const fetchAndSet = useCallback(async () => {
    try {
      const data = await fetchCGPrices();
      const next = { USDC: data.USDC, WETH: data.WETH, WBTC: data.WBTC };
      const chgs = {
        USDC: next.USDC - prev.current.USDC,
        WETH: next.WETH - prev.current.WETH,
        WBTC: next.WBTC - prev.current.WBTC,
      };
      prev.current = next;
      setPrices(next);
      setChanges(chgs);
      setChange24h({ USDC: data.USDC_24h, WETH: data.WETH_24h, WBTC: data.WBTC_24h });
      setLastUpdate(new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" }));
      setPriceError(false);
    } catch {
      setPriceError(true);
      // Animate with tiny noise so ticker doesn't look frozen
      setPrices(p => {
        const n = { ...p };
        ["WETH","WBTC"].forEach(k => { n[k] = p[k] * (1 + (Math.random()-.5)*0.0003); });
        setChanges({ USDC:0, WETH:n.WETH-p.WETH, WBTC:n.WBTC-p.WBTC });
        return n;
      });
    }
  }, []);

  useEffect(() => {
    fetchAndSet();                         // Immediate on mount
    const id = setInterval(fetchAndSet, 30000); // Every 30s
    return () => clearInterval(id);
  }, [fetchAndSet]);

  return { prices, changes, change24h, lastUpdate, priceError };
}

/* ═══════════════════════════════════════════════════════════════
   WEB3 CONTEXT  — real EIP-1193
═══════════════════════════════════════════════════════════════ */
const W3 = createContext(null);

function Web3Provider({ children }) {
  const [account,    setAccount]    = useState(null);  // { address, chainId, walletName }
  const [balance,    setBalance]    = useState(null);  // BigInt — native wei18
  const [onArc,      setOnArc]      = useState(false); // true if chainId === 5042002
  const [switching,  setSwitching]  = useState(false);
  const [loadingBal, setLoadingBal] = useState(false);

  // Refresh balance from chain
  const refreshBalance = useCallback(async (addr) => {
    if (!addr || !window.ethereum) return;
    try {
      setLoadingBal(true);
      const bal = await getNativeBalance(addr);
      setBalance(bal);
    } catch (e) {
      console.warn("balance fetch failed:", e.message);
    } finally {
      setLoadingBal(false);
    }
  }, []);

  // Handle account / chain changes from wallet
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = async (accs) => {
      if (!accs?.length) { setAccount(null); setBalance(null); setOnArc(false); return; }
      const cid = await getChainId().catch(() => 0);
      const addr = accs[0];
      setAccount(a => a ? { ...a, address: addr, chainId: cid } : null);
      setOnArc(cid === ARC_TESTNET.id);
      refreshBalance(addr);
    };
    const handleChainChanged = async (chainHex) => {
      const cid = parseInt(chainHex, 16);
      setOnArc(cid === ARC_TESTNET.id);
      setAccount(a => a ? { ...a, chainId: cid } : null);
      if (account?.address) refreshBalance(account.address);
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [account, refreshBalance]);

  const connect = useCallback(async (address, walletName) => {
    const cid = await getChainId().catch(() => 0);
    setAccount({ address, chainId: cid, walletName });
    setOnArc(cid === ARC_TESTNET.id);
    await refreshBalance(address);
  }, [refreshBalance]);

  const switchARC = useCallback(async () => {
    setSwitching(true);
    try {
      await switchToArcTestnet();
      const cid = await getChainId();
      setOnArc(cid === ARC_TESTNET.id);
      setAccount(a => a ? { ...a, chainId: cid } : null);
      if (account?.address) await refreshBalance(account.address);
    } finally {
      setSwitching(false);
    }
  }, [account, refreshBalance]);

  const disconnect = useCallback(() => {
    setAccount(null); setBalance(null); setOnArc(false);
  }, []);

  return (
    <W3.Provider value={{ account, balance, onArc, switching, loadingBal, connect, switchARC, disconnect, refreshBalance }}>
      {children}
    </W3.Provider>
  );
}
const useW3 = () => useContext(W3);

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CONTEXT
═══════════════════════════════════════════════════════════════ */
const NCtx = createContext(null);
function NotifProvider({ children }) {
  const [notifs, setNotifs] = useState([]);
  const push = useCallback((msg, type = "info", link = null) => {
    const id = Date.now() + Math.random();
    setNotifs(p => [...p.slice(-8), { id, msg, type, link, ts: tc(), read: false }]);
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), 9000);
  }, []);
  const markRead = useCallback(id => setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n)), []);
  const clearAll = useCallback(() => setNotifs([]), []);
  return <NCtx.Provider value={{ notifs, push, markRead, clearAll }}>{children}</NCtx.Provider>;
}
const useNotif = () => useContext(NCtx);

/* ═══════════════════════════════════════════════════════════════
   WALLET PROVIDERS
═══════════════════════════════════════════════════════════════ */
const WALLETS = [
  { id:"metamask",    name:"MetaMask",         popular:true,  color:"#E2761B", glow:"rgba(226,118,27,.3)", installed:()=>!!window.ethereum?.isMetaMask,        icon:<svg viewBox="0 0 40 40" width="30" height="30"><path d="M36.4 3L22.3 13.3l2.6-6.1z" fill="#E17726"/><path d="M3.6 3l14 10.4-2.5-6.2z" fill="#E27625"/><path d="M31.1 27.5l-3.8 5.8 8.1 2.2 2.3-7.9z" fill="#E27625"/><path d="M2.3 27.6l2.3 7.9 8.1-2.2-3.8-5.8z" fill="#E27625"/><path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5z" fill="#E27625"/><path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4z" fill="#E27625"/><path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1z" fill="#F5841F"/></svg> },
  { id:"rabby",       name:"Rabby Wallet",     popular:true,  color:"#7B68EE", glow:"rgba(123,104,238,.3)", installed:()=>!!window.ethereum?.isRabby,          icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#7B68EE"/><ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity=".95"/><circle cx="15" cy="17" r="2.5" fill="#7B68EE"/><circle cx="25" cy="17" r="2.5" fill="#7B68EE"/><circle cx="15.8" cy="16.2" r="1" fill="white"/><circle cx="25.8" cy="16.2" r="1" fill="white"/><path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg> },
  { id:"wc",          name:"WalletConnect",    popular:true,  color:"#3B99FC", glow:"rgba(59,153,252,.3)",  installed:()=>true,                                 icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#3B99FC"/><path d="M11 16c5-5 13-5 18 0l.6.6c.2.2.2.5 0 .7L28 19c-.1.1-.3.1-.4 0l-.8-.8C24 15 16 15 13 18.2l-.8.8c-.1.1-.3.1-.4 0L10 17.3c-.2-.2-.2-.5 0-.7z" fill="white"/><path d="M30 18l1.6 1.6c.2.2.2.5 0 .7L24 28c-.2.2-.5.2-.7 0l-5.3-5.3c-.1-.1-.2-.1-.3 0L12.4 28c-.2.2-.5.2-.7 0L4 20.3c-.2-.2-.2-.5 0-.7L5.6 18c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0l5.3-5.3c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0L29.3 18c.2-.2.5-.2.7 0z" fill="white"/></svg> },
  { id:"coinbase",    name:"Coinbase Wallet",  popular:true,  color:"#0052FF", glow:"rgba(0,82,255,.3)",    installed:()=>!!window.ethereum?.isCoinbaseWallet,  icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#0052FF"/><circle cx="20" cy="20" r="11" fill="white"/><rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/></svg> },
  { id:"trust",       name:"Trust Wallet",     popular:false, color:"#3375BB", glow:"rgba(51,117,187,.3)",  installed:()=>!!window.ethereum?.isTrust,           icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#3375BB"/><path d="M20 8L30 12v9c0 5.5-4.5 10-10 11C9.5 31 5 26.5 5 21v-9z" fill="white" opacity=".9"/><path d="M16 20l3 3 5-6" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id:"okx",         name:"OKX Wallet",       popular:false, color:"#111",    glow:"rgba(255,255,255,.1)", installed:()=>!!window.okxwallet,                   icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#111"/><rect x="8" y="8" width="10" height="10" rx="2" fill="white"/><rect x="22" y="8" width="10" height="10" rx="2" fill="white"/><rect x="8" y="22" width="10" height="10" rx="2" fill="white"/><rect x="22" y="22" width="10" height="10" rx="2" fill="white"/></svg> },
  { id:"tp",          name:"TokenPocket",      popular:false, color:"#2980FE", glow:"rgba(41,128,254,.3)",  installed:()=>!!window.ethereum?.isTokenPocket,     icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#2980FE"/><rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity=".9"/><rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity=".6"/></svg> },
  { id:"brave",       name:"Brave Wallet",     popular:false, color:"#FF5000", glow:"rgba(255,80,0,.3)",    installed:()=>!!window.ethereum?.isBraveWallet,     icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#FF5000"/><path d="M20 7L28 11 31 20 26 29 20 33 14 29 9 20 12 11z" fill="white" opacity=".9"/><circle cx="20" cy="20" r="3" fill="#FF5000"/></svg> },
];

/* ═══════════════════════════════════════════════════════════════
   HEX GRID BACKGROUND
═══════════════════════════════════════════════════════════════ */
function HexGrid({ theme }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d"); let raf, t = 0;
    const rz = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    rz(); window.addEventListener("resize", rz);
    const accentRgb = theme?.accentRgb || "0,255,176";
    const gradA = theme?.bgGradA || "rgba(0,18,10,1)";
    const gradB = theme?.bgGradB || "rgba(0,6,4,1)";
    const scanAlpha = theme?.id === "light" ? ".02" : ".05";
    const draw = () => {
      t += 0.007; ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createRadialGradient(c.width*.5, c.height*.4, 0, c.width*.5, c.height*.4, c.width*.7);
      g.addColorStop(0, gradA); g.addColorStop(1, gradB);
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      const R = 36, cols = Math.ceil(c.width / (R * 1.73)) + 2, rows = Math.ceil(c.height / (R * 1.5)) + 2;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * R * 1.73 + (row % 2 === 0 ? 0 : R * .865), y = row * R * 1.5;
          const d = Math.sqrt((x - c.width*.5)**2 + (y - c.height*.4)**2);
          const wave = Math.sin(d * .011 - t * 1.6) * .5 + .5;
          const pulse = Math.sin(t * .6 + col * .3 + row * .5) * .3 + .3;
          const alpha = wave * pulse * .35;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ag = (Math.PI / 3) * i - Math.PI / 6;
            i === 0 ? ctx.moveTo(x + R*.95*Math.cos(ag), y + R*.95*Math.sin(ag))
                    : ctx.lineTo(x + R*.95*Math.cos(ag), y + R*.95*Math.sin(ag));
          }
          ctx.closePath();
          if (alpha > .16) { ctx.fillStyle = `rgba(${accentRgb},${alpha*.05})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(${accentRgb},${alpha})`; ctx.lineWidth = .5; ctx.stroke();
        }
      }
      for (let y = 0; y < c.height; y += 3) { ctx.fillStyle = `rgba(0,0,0,${scanAlpha})`; ctx.fillRect(0, y, c.width, 1); }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, [theme?.id]);
  return <canvas ref={ref} style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   CHAIN BANNER — wrong network warning
═══════════════════════════════════════════════════════════════ */
function ChainBanner() {
  const { onArc, switchARC, switching, account } = useW3();
  if (!account || onArc) return null;
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:150, background:"rgba(245,158,11,.12)", borderBottom:"1px solid rgba(245,158,11,.38)", padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:"monospace", backdropFilter:"blur(8px)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color:"#F59E0B" }}>⚠</span>
        <span style={{ fontSize:11, color:"#FCD34D", letterSpacing:".06em" }}>
          Wrong network — Privar requires <strong>Arc Testnet (chainId: 5042002)</strong>
        </span>
      </div>
      <button onClick={switchARC} disabled={switching} style={{ background:"rgba(245,158,11,.15)", border:"1px solid rgba(245,158,11,.45)", borderRadius:3, color:"#F59E0B", fontSize:10, padding:"5px 14px", cursor:"pointer", fontFamily:"monospace", letterSpacing:".12em", display:"flex", alignItems:"center", gap:7, transition:"all .2s" }}>
        {switching ? <><Sp c="#F59E0B" sz={10} /> Switching...</> : "⟶ SWITCH TO ARC TESTNET"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRICE TICKER
═══════════════════════════════════════════════════════════════ */
function PriceTicker({ prices, changes, change24h, lastUpdate, priceError }) {
  const TOKENS = ["USDC", "WETH", "WBTC"];
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let pos = 0;
    const id = setInterval(() => { pos -= 0.6; if (pos < -el.scrollWidth / 2) pos = 0; el.style.transform = `translateX(${pos}px)`; }, 16);
    return () => clearInterval(id);
  }, []);
  const items = [...TOKENS, ...TOKENS];
  return (
    <div style={{ overflow:"hidden", background:"rgba(0,0,0,.5)", borderBottom:"1px solid rgba(0,255,176,.08)", height:24, display:"flex", alignItems:"center" }}>
      {/* Testnet badge */}
      <div style={{ flexShrink:0, padding:"0 12px", fontSize:9, color:"#00FFB0", fontFamily:"monospace", letterSpacing:".12em", borderRight:"1px solid rgba(0,255,176,.12)", height:"100%", display:"flex", alignItems:"center", gap:5 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 5px #00FFB0", animation:"pulse 2s infinite", display:"inline-block" }} />
        ARC TESTNET
      </div>
      {/* Live prices */}
      <div ref={ref} style={{ display:"flex", whiteSpace:"nowrap", willChange:"transform" }}>
        {items.map((t, i) => {
          const p = prices[t] || 0;
          const tick = changes[t] || 0;  // tick-to-tick delta (for up/down arrow)
          const d24  = change24h?.[t] ?? 0; // 24h % change from CoinGecko
          const up   = t === "USDC" ? true : tick >= 0;
          const d24color = d24 >= 0 ? "#00FFB0" : "#f87171";
          return (
            <span key={i} style={{ fontSize:10, fontFamily:"monospace", padding:"0 16px", color:"#ffffff", borderRight:"1px solid rgba(0,255,176,.06)", display:"inline-flex", alignItems:"center", gap:5 }}>
              <span style={{ color:"#64748b" }}>{t}</span>
              <span style={{ color: t === "USDC" ? "#ffffff" : (up ? "#00FFB0" : "#f87171"), fontWeight:600 }}>
                ${p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toFixed(0)}
              </span>
              {t !== "USDC" && (
                <span style={{ fontSize:8, color: d24 >= 0 ? "#00FFB0" : "#f87171" }}>
                  {d24 >= 0 ? "▲" : "▼"}{Math.abs(d24).toFixed(2)}%
                </span>
              )}
            </span>
          );
        })}
      </div>
      {/* Source + update time */}
      <div style={{ marginLeft:"auto", flexShrink:0, padding:"0 10px", borderLeft:"1px solid rgba(0,255,176,.08)", height:"100%", display:"flex", alignItems:"center", gap:8 }}>
        {priceError
          ? <span style={{ fontSize:7, color:"#f87171", fontFamily:"monospace" }}>⚠ STALE</span>
          : <span style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace" }}>
              CoinGecko {lastUpdate ? `· ${lastUpdate}` : "· loading..."}
            </span>
        }
        <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", letterSpacing:".1em", textDecoration:"none", transition:"color .2s" }}
          onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#64748b"}>
          💧 USDC →
        </a>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MICRO COMPONENTS
═══════════════════════════════════════════════════════════════ */
const Sp = ({ sz=12, c="#00FFB0" }) => (
  <span style={{ width:sz, height:sz, border:`1.5px solid rgba(0,255,176,.2)`, borderTop:`1.5px solid ${c}`, borderRadius:"50%", animation:"spin .7s linear infinite", display:"inline-block", flexShrink:0 }} />
);

function Glitch({ text, style }) {
  return (
    <span style={{ position:"relative", display:"inline-block", ...style }}>
      <span style={{ position:"relative", zIndex:1 }}>{text}</span>
      <span style={{ position:"absolute", top:0, left:0, color:"#00FFB0", opacity:0, animation:"g1 4s infinite", clipPath:"polygon(0 30%,100% 30%,100% 50%,0 50%)", transform:"translateX(-2px)" }}>{text}</span>
      <span style={{ position:"absolute", top:0, left:0, color:"#0EA5E9", opacity:0, animation:"g2 4s infinite", clipPath:"polygon(0 60%,100% 60%,100% 80%,0 80%)", transform:"translateX(2px)" }}>{text}</span>
    </span>
  );
}

function ArcBtn({ label, onClick, loading, disabled, color="#00FFB0", small=false }) {
  return (
    <button onClick={onClick} disabled={loading||disabled}
      style={{ width:"100%", padding:small?"8px 0":"12px 0", background:"transparent", border:`1px solid ${disabled||loading?"rgba(0,255,176,.2)":color}`, borderRadius:3, color:disabled||loading?"#4a7c5f":color, fontSize:small?9:11, fontWeight:700, cursor:disabled||loading?"not-allowed":"pointer", fontFamily:"monospace", letterSpacing:".16em", boxShadow:disabled||loading?"none":`0 0 16px ${color}20`, display:"flex", alignItems:"center", justifyContent:"center", gap:9, transition:"all .2s", textTransform:"uppercase" }}
      onMouseEnter={e => !disabled&&!loading&&(e.currentTarget.style.background=`${color}12`)}
      onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
      {loading ? <><Sp /> Processing...</> : label}
    </button>
  );
}

// ── Transaction confirmation modal ────────────────────────────────────────────
// Shown BEFORE eth_sendTransaction — user sees the real amount even when
// wallet displays "value: 0 USDC" for ERC-20 / ZK shielded transactions.
function TxConfirmModal({ open, onConfirm, onCancel, tx }) {
  if (!open || !tx) return null;
  const { label, token, amount, to, note } = tx;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:9999, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:"0 0 24px" }}
      onClick={e => e.target===e.currentTarget && onCancel()}>
      <div style={{ background:"#0a1628", border:"1px solid rgba(0,255,176,.25)", borderRadius:8, padding:"18px 18px 12px", width:"100%", maxWidth:420, margin:"0 12px" }}>
        <div style={{ fontFamily:"monospace", fontSize:10, color:"#64748b", letterSpacing:".16em", marginBottom:10 }}>CONFIRM TRANSACTION</div>
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.12)", borderRadius:5, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>ACTION</span>
            <span style={{ fontSize:10, color:"#00FFB0", fontFamily:"monospace", fontWeight:700 }}>{label}</span>
          </div>
          {amount != null && (
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>AMOUNT</span>
              <span style={{ fontSize:14, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{amount} <span style={{ color:"#00FFB0" }}>{token}</span></span>
            </div>
          )}
          {to && (
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>TO</span>
              <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>{to.slice(0,10)}…{to.slice(-8)}</span>
            </div>
          )}
          {note && (
            <div style={{ marginTop:8, fontSize:8, color:"#4a7c5f", fontFamily:"monospace", lineHeight:1.5, borderTop:"1px solid rgba(0,255,176,.06)", paddingTop:8 }}>{note}</div>
          )}
        </div>
        <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace", marginBottom:12, lineHeight:1.5 }}>
          ℹ Your wallet may show <b style={{ color:"#64748b" }}>value: 0</b> for token and privacy transactions — this is expected. The amount shown above is the actual transfer amount.
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:"10px 0", background:"transparent", border:"1px solid rgba(100,116,139,.3)", borderRadius:3, color:"#64748b", fontSize:10, fontFamily:"monospace", cursor:"pointer" }}>CANCEL</button>
          <button onClick={onConfirm} style={{ flex:2, padding:"10px 0", background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.4)", borderRadius:3, color:"#00FFB0", fontSize:10, fontFamily:"monospace", cursor:"pointer", fontWeight:700, letterSpacing:".1em" }}>⟶ CONFIRM IN WALLET</button>
        </div>
      </div>
    </div>
  );
}

function OsField({ label, type="text", value, onChange, placeholder, icon, error, readOnly, suffix, hint }) {
  const [foc, setFoc] = useState(false);
  const [sp, setSp]   = useState(false);
  const isP = type === "password";
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <label style={{ fontSize:9, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:foc?"#00FFB0":"#64748b", fontFamily:"monospace", transition:"color .2s" }}>
          {icon && <span style={{ marginRight:4 }}>{icon}</span>}{label}
        </label>
        {error && <span style={{ fontSize:9, color:"#f87171" }}>⚠ {error}</span>}
      </div>
      <div style={{ position:"relative" }}>
        {["tl","tr","bl","br"].map(p => (
          <span key={p} style={{ position:"absolute", zIndex:2, width:6, height:6, borderColor:foc?"#00FFB0":error?"#f87171":"#1e3a2a", borderStyle:"solid", borderWidth:0, transition:"border-color .2s", ...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}) }} />
        ))}
        <input type={isP&&!sp?"password":"text"} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          style={{ width:"100%", boxSizing:"border-box", padding:`10px ${suffix?"60px":"14px"} 10px 14px`, background:foc?"rgba(0,255,176,.04)":readOnly?"rgba(0,255,176,.01)":"rgba(0,0,0,.45)", border:`1px solid ${error?"#f87171":foc?"rgba(0,255,176,.5)":"rgba(0,255,176,.15)"}`, borderRadius:3, color:"#ffffff", fontSize:12, fontFamily:"monospace", outline:"none", letterSpacing:".04em", transition:"all .2s", cursor:readOnly?"default":"text" }} />
        {suffix && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:10, color:"#64748b", fontFamily:"monospace", pointerEvents:"none" }}>{suffix}</span>}
        {isP && <button onClick={() => setSp(!sp)} style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:sp?"#00FFB0":"#64748b", fontSize:13, padding:0 }}>{sp?"◉":"◎"}</button>}
      </div>
      {hint && !error && <div style={{ marginTop:3, fontSize:9, color:"#4a7c5f", fontFamily:"monospace" }}>{hint}</div>}
    </div>
  );
}

const PH = ({ icon, title, sub }) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:2 }}>▸ {icon} {title}</div>
    <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{sub}</div>
    <div style={{ width:"100%", height:1, background:"rgba(0,255,176,.1)", marginTop:7 }} />
  </div>
);

const IG = ({ items }) => (
  <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(items.length,4)},1fr)`, gap:5, marginBottom:12 }}>
    {items.map(([k,v,s], i) => (
      <div key={i} style={{ background:"rgba(0,0,0,.4)", borderRadius:3, padding:"7px 9px", border:"1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontSize:7, color:"#64748b", fontFamily:"monospace", marginBottom:3 }}>{k}</div>
        <div style={{ fontSize:10, color:"#4ade80", fontFamily:"monospace", fontWeight:600 }}>{v}</div>
        {s && <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>{s}</div>}
      </div>
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   TX TOAST
═══════════════════════════════════════════════════════════════ */
function TxToast({ tx, onClose }) {
  useEffect(() => { if (tx?.status==="success"||tx?.status==="error") { const id=setTimeout(onClose,8000); return()=>clearTimeout(id); } }, [tx]);
  if (!tx) return null;
  const C = { pending:"var(--warn)", success:"var(--accent)", error:"var(--danger)" };
  const I = { pending:"⏳", success:"✓", error:"✕" };
  return (
    <div style={{ position:"fixed", bottom:20, right:20, zIndex:500, background:"rgba(var(--panel-rgb),.97)", border:`1px solid ${C[tx.status]}33`, borderRadius:5, padding:"12px 16px", minWidth:300, maxWidth:360, fontFamily:"monospace", animation:"fu .3s ease", backdropFilter:"blur(12px)", boxShadow:`0 0 24px ${C[tx.status]}15` }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <span style={{ fontSize:14, color:C[tx.status], flexShrink:0 }}>{I[tx.status]}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:C[tx.status], fontWeight:700, letterSpacing:".08em", marginBottom:3 }}>{tx.label}</div>
          <div style={{ fontSize:9, color:"var(--text-dim)", lineHeight:1.5 }}>{tx.message}</div>
          {tx.hash && (
            <a href={`${ARC_TESTNET.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer"
              style={{ fontSize:8, color:"var(--accent)", textDecoration:"none", display:"block", marginTop:3 }}>
              {tx.hash.slice(0,20)}···  ↗ ARCScan
            </a>
          )}
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-dim2)", cursor:"pointer", fontSize:11, padding:0 }}>✕</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CENTER
═══════════════════════════════════════════════════════════════ */
function NotifCenter({ onClose }) {
  const { notifs, markRead, clearAll } = useNotif();
  const C = { info:"var(--blue)", success:"var(--accent)", warn:"var(--warn)", error:"var(--danger)" };
  return (
    <div style={{ position:"absolute", top:44, right:12, width:310, background:"rgba(var(--panel-rgb),.98)", border:"1px solid rgba(var(--accent-rgb),.2)", borderRadius:5, zIndex:200, boxShadow:"0 20px 60px rgba(0,0,0,.9)", animation:"fu .2s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px 8px", borderBottom:"1px solid rgba(var(--accent-rgb),.08)" }}>
        <span style={{ fontSize:9, color:"var(--text)", fontFamily:"monospace", letterSpacing:".15em", fontWeight:700 }}>NOTIFICATIONS</span>
        <button onClick={clearAll} style={{ fontSize:8, color:"var(--text-dim2)", background:"none", border:"none", cursor:"pointer", fontFamily:"monospace", transition:"color .2s" }} onMouseEnter={e=>e.target.style.color="var(--danger)"} onMouseLeave={e=>e.target.style.color="var(--text-dim2)"}>CLEAR ALL</button>
      </div>
      <div style={{ maxHeight:280, overflow:"auto" }}>
        {notifs.length === 0
          ? <div style={{ padding:"18px 14px", textAlign:"center", fontSize:9, color:"var(--text-faint2)", fontFamily:"monospace" }}>No notifications</div>
          : [...notifs].reverse().map(n => (
            <div key={n.id} onClick={() => markRead(n.id)} style={{ padding:"9px 14px", borderBottom:"1px solid rgba(var(--accent-rgb),.04)", cursor:"pointer", background:n.read?"transparent":"rgba(var(--accent-rgb),.02)", transition:"background .2s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(var(--accent-rgb),.05)"}
              onMouseLeave={e=>e.currentTarget.style.background=n.read?"transparent":"rgba(var(--accent-rgb),.02)"}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:C[n.type]||"var(--accent)", flexShrink:0, marginTop:3 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:"#e2e8f0", fontFamily:"monospace", lineHeight:1.4 }}>{n.msg}</div>
                  {n.link && <a href={n.link} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"var(--accent)", fontFamily:"monospace", textDecoration:"none" }}>ARCScan ↗</a>}
                  <div style={{ fontSize:8, color:"var(--text-faint)", fontFamily:"monospace", marginTop:2 }}>{n.ts}</div>
                </div>
              </div>
            </div>
          ))}
      </div>
      <div style={{ padding:"8px 14px", borderTop:"1px solid rgba(var(--accent-rgb),.06)" }}>
        <button onClick={onClose} style={{ width:"100%", padding:"6px 0", background:"transparent", border:"1px solid rgba(var(--accent-rgb),.12)", borderRadius:3, color:"var(--text-dim2)", fontSize:8, cursor:"pointer", fontFamily:"monospace", transition:"all .2s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(var(--accent-rgb),.3)";e.currentTarget.style.color="var(--text)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(var(--accent-rgb),.12)";e.currentTarget.style.color="var(--text-dim2)";}}>CLOSE</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL SEARCH
═══════════════════════════════════════════════════════════════ */
const SIDX = [
  { label:"Overview",          panel:"overview",   icon:"◈",  desc:"Dashboard home" },
  { label:"Shield Assets",     panel:"shield",     icon:"🛡", desc:"Deposit USDC into PrivarShieldVault" },
  { label:"Confidential Swap", panel:"swap",       icon:"⇄",  desc:"Shielded token exchange" },
  { label:"Confidential Send", panel:"send",       icon:"↗",  desc:"Shielded transfer" },
  { label:"Withdraw",          panel:"withdraw",   icon:"↙",  desc:"Exit to public address" },
  { label:"Bridge",            panel:"bridge",     icon:"⟺", desc:"Cross-chain transfer" },
  { label:"Analytics",         panel:"analytics",  icon:"📈", desc:"TVL, charts, heatmaps" },
  { label:"Governance",        panel:"governance", icon:"🗳", desc:"Protocol parameters & on-chain voting" },
  { label:"PrivarStaking & Rewards", panel:"staking",    icon:"💎", desc:"Stake USDC, earn yield" },
  { label:"Portfolio",         panel:"portfolio",  icon:"📊", desc:"Asset allocation" },
  { label:"History",           panel:"history",    icon:"📋", desc:"Transaction log" },
  { label:"Settings",          panel:"settings",   icon:"⚙",  desc:"Network configuration" },
];

function GlobalSearch({ onSelect, onClose }) {
  const [q, setQ] = useState(""); const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const results = q.trim() ? SIDX.filter(i => i.label.toLowerCase().includes(q.toLowerCase())||i.desc.toLowerCase().includes(q.toLowerCase())) : SIDX;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, zIndex:400, background:"rgba(0,0,0,.75)", backdropFilter:"blur(8px)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:80 }}>
      <div style={{ width:"100%", maxWidth:500, background:"rgba(var(--panel-rgb),.98)", border:"1px solid rgba(var(--accent-rgb),.25)", borderRadius:6, overflow:"hidden", boxShadow:"0 30px 80px rgba(0,0,0,.9)", animation:"fu .2s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom:"1px solid rgba(var(--accent-rgb),.08)" }}>
          <span style={{ color:"var(--text-dim2)", fontSize:16 }}>⌕</span>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search panels, features..."
            style={{ flex:1, background:"none", border:"none", outline:"none", color:"var(--text)", fontSize:13, fontFamily:"monospace" }}
            onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Enter"&&results[0])onSelect(results[0].panel);}} />
          <button onClick={onClose} style={{ color:"var(--text-dim2)", background:"none", border:"none", cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>ESC</button>
        </div>
        <div style={{ maxHeight:380, overflow:"auto" }}>
          {results.map((r,i) => (
            <div key={i} onClick={()=>onSelect(r.panel)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", cursor:"pointer", borderBottom:"1px solid rgba(var(--accent-rgb),.04)", transition:"background .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(var(--accent-rgb),.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{ fontSize:18, flexShrink:0 }}>{r.icon}</span>
              <div><div style={{ fontSize:11, color:"var(--text)", fontFamily:"monospace", fontWeight:700 }}>{r.label}</div><div style={{ fontSize:9, color:"var(--text-dim2)", fontFamily:"monospace", marginTop:1 }}>{r.desc}</div></div>
              <span style={{ marginLeft:"auto", fontSize:10, color:"var(--text-faint2)", fontFamily:"monospace" }}>→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MOBILE NAV MENU — full-screen panel picker for narrow screens.
   Renders the SAME `NAV` array as the desktop icon sidebar, so it is
   always in lockstep with the real set of panels in the app.
═══════════════════════════════════════════════════════════════ */
function MobileNavMenu({ nav, panel, setPanel, onClose, onArc, account }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:400, background:"var(--bg)", overflowY:"auto", animation:"fu .2s ease" }}>
      <div style={{ height:52, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", borderBottom:"1px solid rgba(var(--accent-rgb),.1)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:26, height:26, border:"1.5px solid var(--accent)", borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"var(--accent)" }}>◈</div>
          <Glitch text="privar" style={{ fontSize:14, fontWeight:800, color:"var(--accent)", fontFamily:"'Syne',sans-serif" }}/>
        </div>
        <button onClick={onClose} aria-label="Close menu" style={{ width:32, height:32, background:"rgba(var(--accent-rgb),.06)", border:"1px solid rgba(var(--accent-rgb),.25)", borderRadius:4, color:"var(--accent)", fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
      </div>

      <div style={{ padding:"14px 16px 40px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:onArc?"var(--accent)":"var(--danger)", boxShadow:onArc?"0 0 6px var(--accent)":"0 0 6px var(--danger)" }}/>
          <span style={{ fontSize:9, color:"var(--text-dim2)", fontFamily:"monospace", letterSpacing:".1em" }}>{onArc?"ARC TESTNET":"WRONG NETWORK"}</span>
          {account?.address && <span style={{ fontSize:9, color:"var(--text-faint)", fontFamily:"monospace", marginLeft:"auto" }}>{sh(account.address)}</span>}
        </div>

        {nav.map((n, i) => n === null
          ? <div key={i} style={{ height:1, background:"rgba(var(--accent-rgb),.08)", margin:"10px 0" }} />
          : (
            <button key={n.id} onClick={() => { setPanel(n.id); onClose(); }} style={{
              width:"100%", display:"flex", alignItems:"center", gap:14,
              background: panel===n.id ? "rgba(var(--accent-rgb),.08)" : "none",
              border: panel===n.id ? "1px solid rgba(var(--accent-rgb),.25)" : "1px solid transparent",
              borderRadius:6, padding:"13px 12px", marginBottom:4, cursor:"pointer", textAlign:"left",
            }}>
              <span style={{ fontSize:17, flexShrink:0 }}>{n.icon}</span>
              <span style={{ fontSize:14, color: panel===n.id ? "var(--accent)" : "var(--text)", fontFamily:"'Syne',sans-serif", fontWeight:700 }}>{n.label}</span>
              {panel===n.id && <span style={{ marginLeft:"auto", fontSize:9, color:"var(--accent)", fontFamily:"monospace" }}>● ACTIVE</span>}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DISCONNECT CONFIRM MODAL
═══════════════════════════════════════════════════════════════ */
function DisconnectModal({ onConfirm, onCancel, walletName, address }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onCancel()} style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,.8)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fi .2s ease" }}>
      <div style={{ width:"100%", maxWidth:360, background:"rgba(var(--panel-rgb),.97)", border:"1px solid rgba(239,68,68,.25)", borderRadius:6, padding:"24px 24px 20px", boxShadow:"0 0 40px rgba(239,68,68,.1)", animation:"fu .25s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚠</div>
          <div>
            <div style={{ fontSize:14, color:"var(--text)", fontFamily:"monospace", fontWeight:700 }}>Disconnect Wallet</div>
            <div style={{ fontSize:9, color:"var(--text-dim2)", fontFamily:"monospace", marginTop:1 }}>{walletName} · {sh(address)}</div>
          </div>
        </div>
        <p style={{ fontSize:11, color:"var(--text-dim)", fontFamily:"monospace", lineHeight:1.6, marginBottom:20 }}>You will be logged out of Privar OS. Your on-chain assets on Arc Testnet remain safe.</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <button onClick={onCancel} style={{ padding:"10px 0", background:"transparent", border:"1px solid rgba(var(--accent-rgb),.15)", borderRadius:3, color:"var(--text-dim)", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(var(--accent-rgb),.4)";e.currentTarget.style.color="var(--text)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(var(--accent-rgb),.15)";e.currentTarget.style.color="var(--text-dim)";}}>CANCEL</button>
          <button onClick={onConfirm} style={{ padding:"10px 0", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.4)", borderRadius:3, color:"#f87171", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.2)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(239,68,68,.1)"}>⟶ DISCONNECT</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL  — real EIP-1193 connection
═══════════════════════════════════════════════════════════════ */
function WCModal({ onClose, onConnect }) {
  const [step, setStep] = useState("list");
  const [sel, setSel]   = useState(null);
  const [addr, setAddr] = useState("");
  const [err, setErr]   = useState("");

  const go = async (w) => {
    setSel(w); setStep("conn"); setErr("");
    try {
      // 1. Request accounts
      const accounts = await rpcCall("eth_requestAccounts");
      if (!accounts?.[0]) throw new Error("No accounts returned");
      const walletAddr = accounts[0];

      // 2. Switch / add Arc Testnet
      try {
        await switchToArcTestnet();
      } catch (switchErr) {
        if (switchErr.code === 4001) throw new Error("User rejected network switch");
        // If add succeeded but switch failed with other error, continue
      }

      setAddr(walletAddr);
      setStep("sign");
    } catch (e) {
      setErr(e.message || "Connection failed");
      setStep("error");
    }
  };

  const sign = async () => {
    setStep("conn"); setErr("");
    try {
      const nonce = hx(8);
      const message = [
        "Sign in to Privar OS",
        "",
        "Domain: privar.io",
        `Address: ${addr}`,
        `Chain ID: ${ARC_TESTNET.id} (Arc Testnet)`,
        `Nonce: ${nonce}`,
        `Issued: ${new Date().toISOString()}`,
        "",
        "This request will not trigger a blockchain transaction or cost any fees.",
      ].join("\n");

      const sig = await personalSign(addr, message);
      setStep("ok");
      setTimeout(() => onConnect({ address: addr, wallet: sel, signature: sig }), 900);
    } catch (e) {
      if (e.code === 4001) { setErr("Signature rejected by user"); }
      else { setErr(e.message || "Sign failed"); }
      setStep("error");
    }
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, zIndex:250, background:"rgba(0,0,0,.88)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fi .2s ease" }}>
      <div style={{ width:"100%", maxWidth:420, background:"rgba(0,8,5,.97)", border:"1px solid rgba(0,255,176,.2)", borderRadius:6, overflow:"hidden", animation:"fu .25s ease", boxShadow:"0 40px 80px rgba(0,0,0,.9)" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 20px 13px", borderBottom:"1px solid rgba(0,255,176,.08)" }}>
          <div>
            <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:2 }}>WALLET CONNECTION — ARC TESTNET</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#00FFB0", fontFamily:"monospace" }}>
              {step==="list"?"Select Wallet Provider":step==="conn"?`Connecting ${sel?.name||""}...`:step==="sign"?"Sign Authentication Request":step==="ok"?"Wallet Connected ✓":"Connection Error"}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, color:"#64748b", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace", fontSize:14, transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.35)";e.currentTarget.style.color="#00FFB0";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.12)";e.currentTarget.style.color="#64748b";}}>✕</button>
        </div>

        <div style={{ padding:"18px 20px 20px" }}>
          {/* WALLET LIST */}
          {step==="list" && (
            <div style={{ animation:"fi .3s ease" }}>
              <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:8 }}>▸ POPULAR</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:14 }}>
                {WALLETS.filter(w=>w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>go(w)}/>)}
              </div>
              <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:8 }}>▸ MORE WALLETS</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                {WALLETS.filter(w=>!w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>go(w)}/>)}
              </div>
              <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid rgba(0,255,176,.06)", fontSize:8, color:"#334155", fontFamily:"monospace", textAlign:"center" }}>
                EIP-4361 · Sign-In With Ethereum · Arc Testnet (chainId: 5042002)
              </div>
            </div>
          )}

          {/* CONNECTING */}
          {step==="conn" && sel && (
            <div style={{ textAlign:"center", padding:"20px 0", animation:"fi .3s ease" }}>
              <div style={{ position:"relative", width:72, height:72, margin:"0 auto 18px" }}>
                <div style={{ width:72, height:72, borderRadius:"50%", border:`2px solid ${sel.color}22`, display:"flex", alignItems:"center", justifyContent:"center" }}>{sel.icon}</div>
                <svg style={{ position:"absolute", inset:0, animation:"spin 1.2s linear infinite" }} width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="33" fill="none" stroke={sel.color} strokeWidth="1.5" strokeDasharray="55 160" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ fontSize:12, color:"#ffffff", fontFamily:"monospace", marginBottom:4 }}>Connecting to {sel.name}...</div>
              <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace" }}>Confirm in your wallet — switching to Arc Testnet</div>
            </div>
          )}

          {/* SIGN REQUEST */}
          {step==="sign" && sel && (
            <div style={{ animation:"fi .3s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <div style={{ width:42, height:42, borderRadius:9, background:`${sel.color}18`, border:`1px solid ${sel.color}40`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{sel.icon}</div>
                <div>
                  <div style={{ fontSize:12, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{sel.name}</div>
                  <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace", marginTop:2 }}>{sh(addr)}</div>
                </div>
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 6px #00FFB0" }} />
                  <span style={{ fontSize:9, color:"#00FFB0", fontFamily:"monospace" }}>CONNECTED</span>
                </div>
              </div>
              <div style={{ background:"rgba(0,0,0,.45)", border:"1px solid rgba(0,255,176,.12)", borderRadius:4, padding:"13px 15px", marginBottom:16, fontFamily:"monospace" }}>
                <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".15em", marginBottom:8 }}>SIGNATURE REQUEST — EIP-191</div>
                {[["Domain","privar.io"],["Address",sh(addr)],["Network","Arc Testnet (5042002)"],["Nonce",hx(8)],["Issued",new Date().toISOString().split("T")[0]]].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", gap:10, marginBottom:4 }}>
                    <span style={{ fontSize:9, color:"#64748b", minWidth:56 }}>{k}:</span>
                    <span style={{ fontSize:9, color:"#4ade80" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid rgba(0,255,176,.07)", fontSize:9, color:"#4a7c5f" }}>No blockchain transaction. No gas fee.</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <button onClick={onClose} style={{ padding:"11px 0", background:"transparent", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, color:"#64748b", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
                  onMouseEnter={e=>{e.currentTarget.style.color="#ffffff";e.currentTarget.style.borderColor="rgba(0,255,176,.3)";}}
                  onMouseLeave={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(0,255,176,.12)";}}>CANCEL</button>
                <button onClick={sign} style={{ padding:"11px 0", background:"transparent", border:"1px solid #00FFB0", borderRadius:3, color:"#00FFB0", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", boxShadow:"0 0 16px rgba(0,255,176,.12)", transition:"all .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.1)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ SIGN & ENTER</button>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {step==="ok" && sel && (
            <div style={{ textAlign:"center", padding:"16px 0", animation:"fi .4s ease" }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(0,255,176,.08)", border:"2px solid #00FFB0", boxShadow:"0 0 30px rgba(0,255,176,.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:26, color:"#00FFB0" }}>✓</div>
              <div style={{ fontSize:13, color:"#ffffff", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>Authenticated on Arc Testnet</div>
              <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace" }}>{sel.name} · {sh(addr)}</div>
            </div>
          )}

          {/* ERROR */}
          {step==="error" && (
            <div style={{ animation:"fi .3s ease" }}>
              <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.25)", borderRadius:4, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#f87171", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>Connection Failed</div>
                <div style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5 }}>{err}</div>
              </div>
              <ArcBtn label="⟶ TRY AGAIN" onClick={()=>setStep("list")} color="#f87171"/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WBtn({ w, onClick }) {
  const [h, setH] = useState(false); const inst = w.installed();
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:h?`${w.color}12`:"rgba(0,0,0,.4)", border:`1px solid ${h?w.color+"55":"rgba(0,255,176,.1)"}`, borderRadius:6, padding:"11px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:9, transition:"all .2s", boxShadow:h?`0 0 18px ${w.glow}`:"none" }}>
      <div style={{ width:34, height:34, borderRadius:7, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:h?`${w.color}18`:"rgba(255,255,255,.05)", border:`1px solid ${h?w.color+"40":"rgba(255,255,255,.08)"}`, transition:"all .2s" }}>{w.icon}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:11, color:h?"#ffffff":"#e2e8f0", fontFamily:"monospace", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", transition:"color .2s" }}>{w.name}</div>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
          {inst && <span style={{ color:"#00FFB0", fontSize:7 }}>●</span>}{inst?"Detected":"Available"}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AUTH SCREEN — wallet only, no email
═══════════════════════════════════════════════════════════════ */
function AuthScreen({ onAuth }) {
  const { connect } = useW3();
  const { push } = useNotif();
  const [showWC, setShowWC] = useState(false);
  const [loading, setLoading] = useState(null);

  const handleWC = async ({ address, wallet: w, signature }) => {
    setShowWC(false);
    setLoading("finalizing");
    try {
      await connect(address, w.name);
      push(`Connected: ${w.name} · ${sh(address)}`, "success");
      onAuth({ walletName: w.name, address, signature });
    } catch (e) {
      push("Connection error: " + e.message, "error");
    } finally {
      setLoading(null);
    }
  };

  const handleQuick = (w) => { setLoading(w.id); setShowWC(true); setTimeout(()=>setLoading(null), 800); };

  return (
    <>
      {showWC && <WCModal onClose={()=>setShowWC(false)} onConnect={handleWC} />}
      <div style={{ width:"100%", maxWidth:440, background:"rgba(0,8,5,.94)", backdropFilter:"blur(20px)", border:"1px solid rgba(0,255,176,.15)", borderRadius:6, boxShadow:"0 0 60px rgba(0,255,176,.05),0 40px 80px rgba(0,0,0,.85)", padding:"32px 30px 28px", position:"relative", animation:"fu .6s ease forwards" }}>
        {["tl","tr","bl","br"].map(p=><span key={p} style={{ position:"absolute", zIndex:2, width:12, height:12, borderColor:"rgba(0,255,176,.3)", borderStyle:"solid", borderWidth:0, ...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}) }}/>)}

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ width:36, height:36, border:"1.5px solid #00FFB0", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#00FFB0", boxShadow:"0 0 16px rgba(0,255,176,.25)" }}>◈</div>
            <Glitch text="privar" style={{ fontSize:26, fontWeight:800, color:"#00FFB0", fontFamily:"'Syne',sans-serif", letterSpacing:"-.01em" }} />
            <span style={{ fontSize:9, color:"#4a7c5f", fontFamily:"monospace", letterSpacing:".12em", alignSelf:"flex-end", paddingBottom:2 }}>OS</span>
          </div>
          <p style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace", letterSpacing:".04em", lineHeight:1.6 }}>
            Confidential capital OS · Private on-chain capital<br/>Arc Testnet (Circle L1)
          </p>
        </div>

        {/* Network selector */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:20 }}>
          {/* Testnet — ACTIVE */}
          <div style={{ background:"rgba(0,255,176,.06)", border:"1.5px solid #00FFB0", borderRadius:5, padding:"10px 12px", cursor:"default" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 5px #00FFB0", animation:"pulse 2s infinite" }} />
              <span style={{ fontSize:10, color:"#00FFB0", fontFamily:"monospace", fontWeight:700 }}>Arc Testnet</span>
            </div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>chainId: 5042002</div>
            <div style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>Gas: USDC · LIVE</div>
          </div>
          {/* Mainnet — LOCKED */}
          <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.08)", borderRadius:5, padding:"10px 12px", cursor:"not-allowed", opacity:.5, position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#475569" }} />
              <span style={{ fontSize:10, color:"#475569", fontFamily:"monospace", fontWeight:700 }}>Arc Mainnet</span>
            </div>
            <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>chainId: TBD</div>
            <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:2 }}>🔒 Not yet available</div>
          </div>
        </div>

        {/* Wallets grid */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:10, textAlign:"center" }}>▸ CONNECT YOUR WALLET TO AUTHENTICATE</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            {WALLETS.filter(w=>w.popular).map(w=>(
              <button key={w.id} onClick={()=>handleQuick(w)} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"rgba(0,0,0,.4)", border:`1px solid ${loading===w.id?w.color+"60":"rgba(0,255,176,.12)"}`, borderRadius:5, cursor:"pointer", transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=`${w.color}60`;e.currentTarget.style.background=`${w.color}0D`;e.currentTarget.style.boxShadow=`0 0 18px ${w.glow}`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.12)";e.currentTarget.style.background="rgba(0,0,0,.4)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{ width:32, height:32, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", background:`${w.color}18`, border:`1px solid ${w.color}30`, flexShrink:0 }}>{w.icon}</div>
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{w.name}</div>
                  {w.installed() && <div style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", display:"flex", alignItems:"center", gap:3 }}><span style={{ fontSize:7 }}>●</span> Detected</div>}
                </div>
                {loading===w.id && <Sp sz={14} c={w.color}/>}
              </button>
            ))}
          </div>
          <button onClick={()=>setShowWC(true)} style={{ width:"100%", padding:"11px 0", background:"transparent", border:"1px solid rgba(0,255,176,.18)", borderRadius:4, color:"#94a3b8", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:".12em", transition:"all .2s", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.4)";e.currentTarget.style.color="#ffffff";e.currentTarget.style.background="rgba(0,255,176,.04)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.18)";e.currentTarget.style.color="#94a3b8";e.currentTarget.style.background="transparent";}}>
            <span>⬡</span> All wallets ({WALLETS.length} supported)
          </button>
        </div>

        {/* Info box */}
        <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.1)", borderRadius:4, padding:"11px 13px", marginBottom:18 }}>
          <div style={{ fontSize:8, color:"#00FFB0", letterSpacing:".15em", fontFamily:"monospace", marginBottom:6 }}>HOW IT WORKS</div>
          {[["1.","Connect wallet → auto-switch to Arc Testnet"],["2.","Sign EIP-191 message (no gas, no transaction)"],["3.","Interact with Arc Testnet using real USDC balances"]].map(([n,t]) => (
            <div key={n} style={{ display:"flex", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:9, color:"#4a7c5f", fontFamily:"monospace", flexShrink:0 }}>{n}</span>
              <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5 }}>{t}</span>
            </div>
          ))}
        </div>

        {/* Faucet reminder */}
        <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.15)", borderRadius:4, padding:"9px 13px", marginBottom:18 }}>
          <div style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", marginBottom:4, fontWeight:700 }}>💧 NEED TESTNET USDC?</div>
          <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5, textDecoration:"none", display:"block" }}>
            Get free USDC at <span style={{ color:"#0EA5E9" }}>faucet.circle.com</span> → select Arc Testnet → paste address → request (1 USDC/day) ↗
          </a>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>🔒 Non-custodial · EIP-191</span>
          <span style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>Gas: USDC · Arc Testnet</span>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING TOUR
═══════════════════════════════════════════════════════════════ */
const TOUR = [
  { icon:"◈",  title:"Welcome to Privar OS",         body:"Running live on Arc Testnet (chainId: 5042002). Your real USDC balance from the Arc Testnet is shown. Use faucet.circle.com to get testnet USDC." },
  { icon:"🛡", title:"Shield — Real USDC Deposit",     body:"Send real testnet USDC to the PrivarShieldVault. Your wallet will prompt for signature and approval. Funds become untraceable once shielded." },
  { icon:"⇄",  title:"Private Swap — ZK Routed",       body:"Swap tokens on-chain without exposing amounts. Real transactions signed by your wallet on Arc Testnet." },
  { icon:"📈", title:"Analytics — Live Protocol Data",  body:"Charts and metrics pulled from Arc Testnet. TVL, transaction volume and ZK proof stats." },
  { icon:"🗳", title:"Governance — On-Chain Voting",    body:"Vote on PIP proposals with your veARC balance. Each vote is a real transaction signed by your wallet." },
  { icon:"💎", title:"PrivarStaking — Real USDC Yield",       body:"Stake testnet USDC with lock periods for yield. Real transactions with lock multipliers up to 3×." },
  { icon:"⚙",  title:"Settings — Network Config",       body:"Switch between Testnet and Mainnet (locked until launch). Current network: Arc Testnet · chainId 5042002." },
];

function OnboardingTour({ onFinish }) {
  const [step, setStep] = useState(0); const s = TOUR[step];
  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(0,0,0,.8)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ width:"100%", maxWidth:420, background:"rgba(0,8,5,.97)", border:"1px solid rgba(0,255,176,.28)", borderRadius:7, padding:"28px 28px 24px", boxShadow:"0 0 60px rgba(0,255,176,.08)", animation:"fu .3s ease" }}>
        <div style={{ display:"flex", gap:4, marginBottom:22 }}>
          {TOUR.map((_,i)=><div key={i} style={{ flex:1, height:2, borderRadius:1, background:i<=step?"#00FFB0":"rgba(0,255,176,.12)", transition:"background .3s", boxShadow:i===step?"0 0 6px #00FFB0":"none" }}/>)}
        </div>
        <div style={{ width:54, height:54, borderRadius:12, background:"rgba(0,255,176,.08)", border:"1.5px solid rgba(0,255,176,.35)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, marginBottom:16 }}>{s.icon}</div>
        <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:6 }}>STEP {step+1} / {TOUR.length}</div>
        <div style={{ fontSize:18, fontWeight:700, color:"#ffffff", fontFamily:"'Syne',sans-serif", marginBottom:12, lineHeight:1.3 }}>{s.title}</div>
        <p style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.7, marginBottom:22 }}>{s.body}</p>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onFinish} style={{ flex:1, padding:"10px 0", background:"transparent", border:"1px solid rgba(0,255,176,.15)", borderRadius:3, color:"#64748b", fontSize:9, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.color="#ffffff";e.currentTarget.style.borderColor="rgba(0,255,176,.4)";}}
            onMouseLeave={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(0,255,176,.15)";}}>SKIP</button>
          <button onClick={()=>{if(step<TOUR.length-1)setStep(s=>s+1);else onFinish();}}
            style={{ flex:2, padding:"10px 0", background:"transparent", border:"1px solid #00FFB0", borderRadius:3, color:"#00FFB0", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:".12em", boxShadow:"0 0 18px rgba(0,255,176,.12)", transition:"all .2s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            {step<TOUR.length-1?"NEXT →":"⟶ LAUNCH OS"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ user, prices, changes, change24h, lastUpdate, priceError }) {
  const { account, balance, onArc, loadingBal, disconnect, refreshBalance } = useW3();
  const { push } = useNotif();
  const { notifs } = useNotif();
  const [panel, setPanel]           = useState("overview");
  const [txHistory, setTxHistory]   = useState(() => {
    // Loaded per wallet after connect — starts empty, populated in notify()
    return [];
  });
  const [tx, setTx]                 = useState(null);
  const [blockNum, setBlockNum]     = useState(null);
  const [showNotif, setShowNotif]   = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDisc, setShowDisc]     = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useIsMobile();
  const unread = notifs.filter(n=>!n.read).length;

  // Fetch real block number from Arc Testnet
  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const raw = await rpcCall("eth_blockNumber");
        setBlockNum(parseInt(raw, 16));
      } catch {}
    };
    if (onArc) { fetchBlock(); const id = setInterval(fetchBlock, 6000); return ()=>clearInterval(id); }
  }, [onArc]);

  // Keyboard shortcut
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey||e.ctrlKey) && e.key==="k") { e.preventDefault(); setShowSearch(true); }
      if (e.key==="Escape") { setShowSearch(false); setShowNotif(false); }
    };
    window.addEventListener("keydown", h); return ()=>window.removeEventListener("keydown", h);
  }, []);

  const notify = useCallback((label, message, status, hash, amount) => {
    setTx({ label, message, status, hash });
    if (status==="success"&&hash) {
      const entry = { hash, label, ts:tc(), tsRaw: Date.now(), status:"success", amount: amount || "—" };
      setTxHistory(p => {
        // Deduplicate by hash — if chain-rebuild already added this tx, don't double it
        if (p.some(e => e.hash === hash)) return p;
        const updated = [entry, ...p.slice(0, 199)];
        if (account?.address) {
          const key = txHistoryKey(account.address);
          try { localStorage.setItem(key, JSON.stringify(updated)); } catch {}
        }
        return updated;
      });
      push(`${label}: ${message}`, "success", `${ARC_TESTNET.explorer}/tx/${hash}`);
    } else if (status==="error") {
      push(`${label} failed: ${message}`, "error");
    } else {
      push(message, "info");
    }
  }, [push, account?.address]);

  // Balance displayed as USDC 6-dec equivalent from native 18-dec
  const usdcBalance = balance ? nativeToUsdc6(balance) : null;

  const NAV = [
    { id:"overview",   icon:"◈",  label:"Overview" },
    { id:"shield",     icon:"🛡", label:"Shield" },
    { id:"swap",       icon:"⇄",  label:"Swap" },
    { id:"send",       icon:"↗",  label:"Send" },
    { id:"withdraw",   icon:"↙",  label:"Withdraw" },
    { id:"bridge",     icon:"⟺", label:"Bridge" },
    null,
    { id:"analytics",  icon:"📈", label:"Analytics" },
    { id:"governance", icon:"🗳", label:"Governance" },
    { id:"staking",    icon:"💎", label:"PrivarStaking" },
    null,
    { id:"portfolio",  icon:"📊", label:"Portfolio" },
    { id:"history",    icon:"📋", label:"History" },
    { id:"settings",   icon:"⚙",  label:"Settings" },
  ];

  const protocolStats = useProtocolStats(onArc);
  const onChainActivity = useOnChainActivity(onArc);

  // Load wallet-scoped tx history when account connects — cross-device: rebuild from chain
  useEffect(() => {
    if (!account?.address) { setTxHistory([]); return; }
    const key = txHistoryKey(account.address);
    // 1. Immediately show cached localStorage entries so UI isn't blank
    let cached = [];
    try { cached = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
    setTxHistory(cached);
    // 2. Rebuild from on-chain events (cross-device, cross-browser)
    buildTxHistoryFromChain(account.address).then(onchain => {
      if (!onchain || onchain.length === 0) return;
      // Merge: on-chain entries take priority; cached entries that have no on-chain
      // counterpart are only kept if RECENT (genuinely "not yet indexed" — see
      // TX_HISTORY_LOCAL_GRACE_MS) — older ones with no on-chain match are stale
      // (e.g. survivors from a retired vault whose hash will never appear in the
      // current vault's logs) and are dropped instead of being re-persisted forever.
      const seen = new Set(onchain.map(e => e.hash));
      const now = Date.now();
      const localOnly = cached.filter(e =>
        e.hash && !seen.has(e.hash) && (now - (e.tsRaw || 0)) < TX_HISTORY_LOCAL_GRACE_MS
      );
      const merged = [...onchain, ...localOnly].slice(0, 200);
      setTxHistory(merged);
      try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
    }).catch(() => {});
  }, [account?.address]);

  // Migrate legacy notes (from global "privarc_notes" key → wallet-scoped) on first connect
  useEffect(() => {
    if (!account?.address) return;
    const legacyKey = "privarc_notes";
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        if (Array.isArray(old) && old.length > 0) {
          const current = getNotes(account.address);
          const existingSet = new Set(current.map(n => n.commitment));
          const merged = [...current, ...old.filter(n => !existingSet.has(n.commitment))];
          saveNotes(account.address, merged);
          localStorage.removeItem(legacyKey);
        }
      } catch {}
    }
  }, [account?.address]);

  const { bals: shieldedBals, recompute: recomputeShielded, lastVerified: shieldedLastVerified } = useShieldedBalances(prices, account?.address);
  const { sendRealTx: sendViewKeyTx } = useTxSend({ account, onArc, notify, refreshBalance });

  // Scan chain for ECDH stealth notes addressed to this wallet on every connect,
  // and opportunistically register a view key (real ECDH P-256) if missing —
  // see ensureViewKeyRegistered() for the once-per-address retry guard.
  // ensureSelfBackupKeyReady() is awaited FIRST (gasless signature, prompts once
  // per device) so the very first resync on a brand-new device can already
  // decrypt this wallet's own PrivarCloudVault note journal instead of waiting
  // for the next poll.
  useEffect(() => {
    if (!account?.address || !onArc) return;
    let cancelled = false;
    (async () => {
      migrateCloudSyncKeyScheme(account.address);
      await ensureSelfBackupKeyReady(account.address).catch(() => {});
      if (cancelled) return;
      scanStealthNotes(account.address, recomputeShielded).catch(() => {});
      resyncFromCloudVault(account.address, recomputeShielded).catch(() => {});
      resyncFromShieldVaultJournal(account.address, recomputeShielded).catch(() => {});
      // Retry any SPEND broadcasts that failed on a previous session (see
      // "Pending SPEND broadcast queue") — a no-op wallet-side if the queue
      // is empty, so safe to run on every connect without extra prompts.
      retryPendingSpends(account, sendViewKeyTx).then(({ synced }) => {
        if (synced > 0) recomputeShielded?.();
      }).catch(() => {});
    })();
    ensureViewKeyRegistered(account.address, sendViewKeyTx, notify).catch(() => {});
    // Rescan every 2 minutes in case new stealth notes / cloud journal entries arrive
    const id = setInterval(() => {
      scanStealthNotes(account.address, recomputeShielded).catch(() => {});
      resyncFromCloudVault(account.address, recomputeShielded).catch(() => {});
      resyncFromShieldVaultJournal(account.address, recomputeShielded).catch(() => {});
    }, 120_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [account?.address, onArc, recomputeShielded, sendViewKeyTx, notify]);

  const panelProps = { account, balance, usdcBalance, onArc, notify, refreshBalance, txHistory, loadingBal, prices, changes, change24h, lastUpdate, priceError, setPanel, protocolStats, onChainActivity, shieldedBals, recomputeShielded, sendRealTx: sendViewKeyTx };
  useEffect(() => { window._privarShieldedLastVerified = shieldedLastVerified; }, [shieldedLastVerified]);
  // Expose address + recompute for ShieldedWallet stale-notes purge button
  useEffect(() => { window._privarAccount = account?.address || ""; }, [account?.address]);
  useEffect(() => { window._privarRecomputeShielded = recomputeShielded; }, [recomputeShielded]);

  return (
    <div style={{ display:"flex", height:"100vh", width:"100%", maxWidth: isMobile ? "100%" : 960, margin:"0 auto", position:"relative", zIndex:2 }}>
      {showSearch   && <GlobalSearch onSelect={p=>{setPanel(p);setShowSearch(false);}} onClose={()=>setShowSearch(false)}/>}
      {showDisc     && <DisconnectModal walletName={account?.walletName} address={account?.address} onConfirm={disconnect} onCancel={()=>setShowDisc(false)}/>}
      {mobileNavOpen && <MobileNavMenu nav={NAV} panel={panel} setPanel={setPanel} onClose={()=>setMobileNavOpen(false)} onArc={onArc} account={account}/>}

      {/* Sidebar — desktop/tablet only; collapses to a hamburger + MobileNavMenu below MOBILE_BREAKPOINT */}
      {!isMobile && (
        <div style={{ width:52, flexShrink:0, background:"rgba(var(--panel-rgb),.96)", borderRight:"1px solid rgba(var(--accent-rgb),.08)", display:"flex", flexDirection:"column", alignItems:"center", paddingTop:12, paddingBottom:12, gap:1 }}>
          <div style={{ width:30, height:30, border:"1.5px solid var(--accent)", borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"var(--accent)", boxShadow:"0 0 10px rgba(var(--accent-rgb),.2)", marginBottom:9 }}>◈</div>
          <div style={{ width:26, height:1, background:"rgba(var(--accent-rgb),.1)", marginBottom:5 }}/>
          {NAV.map((n, i) => n===null
            ? <div key={i} style={{ width:24, height:1, background:"rgba(var(--accent-rgb),.06)", margin:"3px 0" }}/>
            : <button key={n.id} onClick={()=>setPanel(n.id)} title={n.label}
                style={{ width:36, height:33, background:panel===n.id?"rgba(var(--accent-rgb),.12)":"transparent", border:`1px solid ${panel===n.id?"rgba(var(--accent-rgb),.3)":"transparent"}`, borderRadius:4, cursor:"pointer", color:panel===n.id?"var(--accent)":"var(--text-faint)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", flexShrink:0 }}
                onMouseEnter={e=>{if(panel!==n.id){e.currentTarget.style.background="rgba(var(--accent-rgb),.06)";e.currentTarget.style.color="var(--text-dim)";}}}
                onMouseLeave={e=>{if(panel!==n.id){e.currentTarget.style.background="transparent";e.currentTarget.style.color="var(--text-faint)";}}}>
                {n.icon}
              </button>
          )}
          <div style={{ flex:1 }}/>
          {/* Network indicator */}
          <div style={{ width:7, height:7, borderRadius:"50%", background:onArc?"var(--accent)":"var(--danger)", boxShadow:onArc?"0 0 6px var(--accent)":"0 0 6px var(--danger)", animation:"pulse 2s infinite", marginBottom:3 }}/>
          <div style={{ fontSize:7, color:onArc?"var(--text-faint)":"var(--text-dim2)", fontFamily:"monospace", letterSpacing:".04em" }}>{onArc?"TEST":"WRONG"}</div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {/* Price ticker */}
        <PriceTicker prices={prices} changes={changes} change24h={change24h} lastUpdate={lastUpdate} priceError={priceError}/>

        {/* Top bar */}
        <div style={{ height:40, flexShrink:0, background:"rgba(var(--panel-rgb),.96)", borderBottom:"1px solid rgba(var(--accent-rgb),.08)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {isMobile && (
              <button onClick={()=>setMobileNavOpen(true)} aria-label="Open menu" style={{ width:26, height:26, background:"rgba(var(--accent-rgb),.08)", border:"1px solid rgba(var(--accent-rgb),.2)", borderRadius:3, color:"var(--accent)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", marginRight:2, flexShrink:0 }}>
                ☰
              </button>
            )}
            <Glitch text="privar" style={{ fontSize:14, fontWeight:800, color:"var(--accent)", fontFamily:"'Syne',sans-serif" }}/>
            {!isMobile && <span style={{ fontSize:7, color:"var(--text-faint)", fontFamily:"monospace", letterSpacing:".1em" }}>OS v12.0</span>}
            <span style={{ fontSize:7, background:"rgba(var(--accent-rgb),.08)", border:"1px solid rgba(var(--accent-rgb),.18)", borderRadius:2, padding:"1px 5px", color:"var(--accent)", fontFamily:"monospace" }}>
              {isMobile ? (onArc?"ARC":"WRONG") : (onArc?"ARC TESTNET":"WRONG NETWORK")}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:isMobile?6:8 }}>
            {/* Search */}
            {!isMobile && (
              <button onClick={()=>setShowSearch(true)} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(0,0,0,.4)", border:"1px solid rgba(var(--accent-rgb),.12)", borderRadius:3, padding:"3px 10px", cursor:"pointer", color:"var(--text-dim2)", fontSize:9, fontFamily:"monospace", transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(var(--accent-rgb),.35)";e.currentTarget.style.color="var(--text)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(var(--accent-rgb),.12)";e.currentTarget.style.color="var(--text-dim2)";}}>
                <span>⌕</span><span style={{ fontSize:8 }}>Search</span>
                <span style={{ fontSize:7, background:"rgba(var(--accent-rgb),.08)", border:"1px solid rgba(var(--accent-rgb),.18)", borderRadius:2, padding:"0 4px", marginLeft:3, color:"var(--text-faint)" }}>⌘K</span>
              </button>
            )}
            {!isMobile && blockNum && <span style={{ fontSize:8, color:"var(--text-faint)", fontFamily:"monospace" }}>#{blockNum.toLocaleString()}</span>}
            {!isMobile && <div style={{ height:12, width:1, background:"rgba(var(--accent-rgb),.1)" }}/>}
            {/* Notifications */}
            <div style={{ position:"relative" }}>
              <button onClick={()=>setShowNotif(!showNotif)} style={{ background:"none", border:"none", cursor:"pointer", color:unread>0?"var(--accent)":"var(--text-faint)", fontSize:14, position:"relative", transition:"color .2s" }}>
                🔔{unread>0&&<span style={{ position:"absolute", top:-3, right:-3, width:14, height:14, background:"var(--danger)", borderRadius:"50%", fontSize:8, color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace", fontWeight:700 }}>{Math.min(unread,9)}</span>}
              </button>
              {showNotif && <NotifCenter onClose={()=>setShowNotif(false)}/>}
            </div>
            <div style={{ height:12, width:1, background:"rgba(var(--accent-rgb),.1)" }}/>
            {/* Wallet info */}
            {!isMobile && <span style={{ fontSize:8, color:"var(--text-dim)", fontFamily:"monospace" }}>{account?.walletName}</span>}
            <span style={{ fontSize:8, color:"var(--text-dim2)", fontFamily:"monospace" }}>{sh(account?.address)}</span>
            {/* Disconnect */}
            <button onClick={()=>setShowDisc(true)} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.2)", borderRadius:3, padding:"3px 9px", cursor:"pointer", color:"var(--text-dim2)", fontSize:8, fontFamily:"monospace", letterSpacing:".08em", transition:"all .2s" }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,.14)";e.currentTarget.style.borderColor="rgba(239,68,68,.45)";e.currentTarget.style.color="#f87171";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,.06)";e.currentTarget.style.borderColor="rgba(239,68,68,.2)";e.currentTarget.style.color="var(--text-dim2)";}}>
              {isMobile ? "⏻" : "⏻ DISCONNECT"}
            </button>
          </div>
        </div>

        {/* Panel */}
        <div style={{ flex:1, padding:"14px", overflow:"auto" }}>
          {panel==="overview"   && <OverviewPanel   {...panelProps}/>}
          {panel==="shield"     && <ShieldPanel     {...panelProps}/>}
          {panel==="swap"       && <SwapPanel       {...panelProps}/>}
          {panel==="send"       && <SendPanel       {...panelProps}/>}
          {panel==="withdraw"   && <WithdrawPanel   {...panelProps}/>}
          {panel==="bridge"     && <BridgePanel     {...panelProps}/>}
          {panel==="analytics"  && <AnalyticsPanel  {...panelProps}/>}
          {panel==="governance" && <GovPanel        {...panelProps}/>}
          {panel==="staking"    && <StakingPanel    {...panelProps}/>}
          {panel==="portfolio"  && <PortfolioPanel  {...panelProps}/>}
          {panel==="history"    && <HistoryPanel    {...panelProps}/>}
          {panel==="settings"   && <SettingsPanel   {...panelProps}/>}
        </div>
      </div>
      <TxToast tx={tx} onClose={()=>setTx(null)}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PANELS
═══════════════════════════════════════════════════════════════ */
function NotOnArcWarning() {
  const { onArc, switchARC, switching } = useW3();
  if (onArc) return null;
  return (
    <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.3)", borderRadius:5, padding:"12px 14px", marginBottom:14 }}>
      <div style={{ fontSize:10, color:"#FCD34D", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>⚠ Not connected to Arc Testnet</div>
      <p style={{ margin:0, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5, marginBottom:8 }}>
        Transactions require Arc Testnet (chainId: 5042002). Switch network to continue.
      </p>
      <button onClick={switchARC} disabled={switching} style={{ padding:"7px 14px", background:"rgba(245,158,11,.12)", border:"1px solid rgba(245,158,11,.4)", borderRadius:3, color:"#F59E0B", fontSize:9, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", display:"flex", alignItems:"center", gap:7 }}>
        {switching?<><Sp c="#F59E0B" sz={10}/>Switching...</>:"⟶ SWITCH TO ARC TESTNET"}
      </button>
    </div>
  );
}

function OverviewPanel({ account, usdcBalance, loadingBal, onArc, setPanel, prices, changes, change24h, lastUpdate, priceError, refreshBalance }) {
  return (
    <div style={{ animation:"fi .3s ease" }}>
      <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:14 }}>◈ SYSTEM OVERVIEW — ARC TESTNET</div>
      <NotOnArcWarning/>

      {/* Real balance cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:7, marginBottom:14 }}>
        {[
          { l:"USDC BALANCE", v:loadingBal?"···":(usdcBalance!==null?fmtUsdc(usdcBalance):"—"), u:"USDC", glow:true,  note:"Arc Testnet" },
          { l:"NETWORK",      v:onArc?"CONNECTED":"WRONG NET",  u:"Arc Testnet", glow:false, note:"chainId 5042002" },
          { l:"WALLET",       v:account?.walletName||"—",       u:sh(account?.address), glow:false, note:"EIP-191 auth" },
        ].map(b=>(
          <div key={b.l} style={{ background:"rgba(0,0,0,.4)", border:`1px solid rgba(0,255,176,${b.glow?.22:.1})`, borderRadius:5, padding:"11px 13px", transition:"all .2s" }}>
            <div style={{ fontSize:7, color:"#64748b", letterSpacing:".18em", fontFamily:"monospace", marginBottom:5 }}>{b.l}</div>
            <div style={{ fontSize:b.v.length>10?13:18, fontWeight:700, color:b.glow?"#00FFB0":"#ffffff", fontFamily:"monospace", lineHeight:1 }}>{b.v}</div>
            <div style={{ fontSize:8, color:b.glow?"#4a7c5f":"#64748b", fontFamily:"monospace", marginTop:3 }}>{b.u}</div>
            <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:1 }}>{b.note}</div>
          </div>
        ))}
      </div>

      {/* Refresh balance button */}
      <div style={{ marginBottom:14 }}>
        <button onClick={()=>refreshBalance(account?.address)} style={{ padding:"6px 14px", background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.15)", borderRadius:3, color:"#00FFB0", fontSize:9, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", display:"flex", alignItems:"center", gap:7, transition:"all .2s" }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.1)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(0,255,176,.04)"}>
          ↻ REFRESH BALANCE
        </button>
      </div>

      {/* Live prices — real CoinGecko */}
      <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"10px 13px", marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ fontSize:8, color:"#64748b", letterSpacing:".18em", fontFamily:"monospace" }}>LIVE PRICES</div>
          <div style={{ fontSize:7, color:priceError?"#f87171":"#4a7c5f", fontFamily:"monospace" }}>
            {priceError ? "⚠ API unavailable · last known" : `CoinGecko · ${lastUpdate || "loading..."}`}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
          {["USDC","WETH","WBTC"].map(t => {
            const p = prices[t] || 0;
            const d24 = change24h?.[t] ?? 0;
            const up  = d24 >= 0;
            return (
              <div key={t} style={{ background:"rgba(0,0,0,.3)", borderRadius:4, padding:"8px 10px" }}>
                <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:2 }}>{t}</div>
                <div style={{ fontSize:14, color:"#ffffff", fontFamily:"monospace", fontWeight:700, lineHeight:1 }}>
                  ${p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toLocaleString("en-US",{maximumFractionDigits:0})}
                </div>
                {t !== "USDC"
                  ? <div style={{ fontSize:8, color:up?"#00FFB0":"#f87171", fontFamily:"monospace", marginTop:3 }}>
                      {up?"▲":"▼"} {Math.abs(d24).toFixed(2)}% 24h
                    </div>
                  : <div style={{ fontSize:8, color:"#4a7c5f", fontFamily:"monospace", marginTop:3 }}>stable · pegged</div>
                }
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:14 }}>
        {[["shield","🛡","Shield"],["swap","⇄","Swap"],["send","↗","Send"],["withdraw","↙","Withdraw"],["bridge","⟺","Bridge"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setPanel(id)} style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"9px 4px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.4)";e.currentTarget.style.background="rgba(0,255,176,.07)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.1)";e.currentTarget.style.background="rgba(0,0,0,.35)";}}>
            <div style={{ fontSize:16, marginBottom:3 }}>{icon}</div>
            <div style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", letterSpacing:".06em" }}>{label}</div>
          </button>
        ))}
      </div>

      {/* Faucet reminder */}
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:4, padding:"10px 13px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", fontWeight:700, marginBottom:2 }}>💧 NEED TESTNET USDC?</div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>1 USDC/day — required for gas and transactions</div>
          </div>
          <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", textDecoration:"none", padding:"5px 10px", border:"1px solid rgba(14,165,233,.3)", borderRadius:3, transition:"all .2s", flexShrink:0 }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(14,165,233,.1)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            GET USDC ↗
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── TX helper shared by all panels ─────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   PROTOCOL STATS — Live on-chain reads, polled every 10s.
   VERSION is read on-chain (not hardcoded) so this never drifts out of sync
   after a PrivarShieldVault redeploy — see PrivarShieldVault.sol VERSION constant.
═══════════════════════════════════════════════════════════════ */
// ── Local snapshot-based 24h deltas ─────────────────────────────────────────
// FIX: "Last 24h" stats used to come from a single eth_getLogs call spanning
// ~172,800 blocks (24h at Arc Testnet's ~0.5s block time) in ONE request. Most
// RPC providers cap eth_getLogs block ranges (commonly 2,000–10,000 blocks) —
// a request this wide is very likely rejected, and the catch block swallowed
// the failure with zero logging, silently showing 0/0.00/0.0000 forever.
//
// Instead of chunking/retrying a fragile log scan, this reuses the reliable
// on-chain STATE COUNTERS already being polled every 10s (totalTxCount,
// totalVolumeByToken, feesCollectedByToken — added in PrivarShieldVault v2.5/v2.6)
// and snapshots them locally over time. A "24h delta" is just
// current_value − value_from_a_snapshot_~24h_ago. No eth_getLogs, no block-
// range limits, no indexing lag — just arithmetic on numbers already in hand.
//
// Tradeoff: needs ~24h of snapshot history to give a TRUE 24h window. Before
// that (e.g. right after this ships, or right after a PrivarShieldVault redeploy
// resets the counters to 0), it reports the delta since the OLDEST available
// snapshot instead, with snapshotCoverage telling the UI how much history
// that actually represents — so the displayed number is always honest about
// what window it covers, never silently wrong.
const STATS_SNAPSHOT_KEY = (vaultAddr) => `privar_stats_snapshots_${vaultAddr.toLowerCase()}`;
const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;  // don't snapshot more than once per 5 min
const SNAPSHOT_MAX_AGE_MS      = 48 * 60 * 60 * 1000; // prune anything older than 48h

function takeStatsSnapshot(vaultAddr, current) {
  try {
    const key = STATS_SNAPSHOT_KEY(vaultAddr);
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const now = Date.now();
    const last = list[list.length - 1];
    if (last && now - last.ts < SNAPSHOT_MIN_INTERVAL_MS) return list; // throttled
    const pruned = list.filter(s => now - s.ts < SNAPSHOT_MAX_AGE_MS);
    pruned.push({ ts: now, ...current });
    localStorage.setItem(key, JSON.stringify(pruned));
    return pruned;
  } catch { return []; }
}

function get24hDelta(vaultAddr, current) {
  try {
    const key = STATS_SNAPSHOT_KEY(vaultAddr);
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    if (list.length === 0) return null;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    // Closest snapshot AT OR BEFORE 24h ago; if none qualifies yet, fall back
    // to the oldest snapshot we have (best-effort, coverage reported honestly).
    let ref = list.find(s => s.ts <= dayAgo);
    if (!ref) ref = list[0];
    if (!ref || ref.ts >= now) return null;
    const d = (a, b) => (a == null || b == null) ? null : Math.max(0, a - b);
    return {
      tx24h:         d(current.totalTxCount, ref.totalTxCount),
      volumeUsdc24h: d(current.volumeUsdc,    ref.volumeUsdc),
      volumeEurc24h: d(current.volumeEurc,    ref.volumeEurc),
      volumeBtc24h:  d(current.volumeBtc,     ref.volumeBtc),
      feesUsdc24h:   d(current.feesUsdc,      ref.feesUsdc),
      feesEurc24h:   d(current.feesEurc,      ref.feesEurc),
      feesBtc24h:    d(current.feesBtc,       ref.feesBtc),
      snapshotCoverage: now - ref.ts,
    };
  } catch { return null; }
}

function useProtocolStats(onArc) {
  const [stats, setStats] = useState({
    shieldedUsdc:null, shieldedEurc:null, shieldedBtc:null, leafCount:null,
    depositsAllowed:null, vaultPaused:null, tokenSupport:{},
    version:null, totalTxCount:null,
    volumeUsdc:null, volumeEurc:null, volumeBtc:null,
    feesUsdc:null, feesEurc:null, feesBtc:null,
    // Live fee rates (v2.7+) — exposed here so any panel already consuming
    // protocolStats gets them for free, instead of each panel re-fetching
    // separately (see AnalyticsPanel's older standalone feeConfig fetch).
    protocolFeeBps:null, swapFeeBps:null, bridgeFeeBps:null, flatFeeUsdc:null, treasury:null,
    // 24h deltas — computed from local snapshots of the state counters above,
    // NOT from eth_getLogs (see takeStatsSnapshot/get24hDelta below for why).
    tx24h:null, volumeUsdc24h:null, volumeEurc24h:null, volumeBtc24h:null,
    feesUsdc24h:null, feesEurc24h:null, feesBtc24h:null,
    snapshotCoverage: null, // ms of history actually available (< 24h until the window fills up)
  });
  const fetch = useCallback(async () => {
    if (!onArc) return;
    try {
        // Light retry (not the full 3x/900ms used for tx-gating reads, which
        // would make each 30s poll take too long across 23 calls) — still
        // meaningfully raises the per-poll success rate. Individual calls
        // failing outright (rather than retrying) is why a cold load could
        // take several full poll cycles (minutes) before every field had a
        // chance to succeed at least once.
        const call = (to, data) => rpcCallWithRetry("eth_call", [{ to, data }, "latest"], 2, 500);
        // FIX: Promise.all rejects entirely if ANY single call fails — with 17 calls in
        // flight, one bad RPC response (or a v2.5-only function read against a stale
        // contract) used to blank out EVERYTHING, including pauseState, which then
        // displayed as "🔴 PAUSED" even though the vault was never actually paused.
        // Promise.allSettled isolates each call so a single failure only loses that
        // one stat, not the whole panel.
        //
        // This whole block is ALSO wrapped in try/catch (not just allSettled) because
        // a SYNCHRONOUS throw while constructing the calls array — e.g. a missing
        // import making one of these builder functions undefined — happens before
        // any promise exists and bypasses allSettled entirely. That exact bug shipped
        // once already (buildTotalVolumeByTokenCall/decodeStringReturn were used here
        // but never imported) and silently zeroed out the whole panel every poll with
        // no visible error short of an uncaught rejection in devtools. Never again.
        const calls = [
          // v3.3 — totalShielded(token) is real again (restored on the vault) and
          // is MORE accurate than balanceOf(vault): it reflects net shielded
          // principal only, excluding any fee residue sitting in the contract
          // that hasn't been claimed via withdrawFees() yet.
          () => call(CONTRACTS.PrivarShieldVault, SEL.totalShielded + encodeAddress(CONTRACTS.USDC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.totalShielded + encodeAddress(CONTRACTS.EURC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.totalShielded + encodeAddress(CONTRACTS.cirBTC)),
          () => call(CONTRACTS.PrivarMerkleTreeManager,   SEL.nextIndex),
          // v3.4.1 — the legacy EmergencyController contract (v2.x era) is
          // gone from every recent redeploy and was never re-pointed at a
          // real address afterward; these two calls always failed silently
          // (allSettled swallowed the rejection) and fed a "pauseState"
          // field that vaultState below never actually trusted anyway (it
          // already prioritized vaultPaused, the real paused() bool on
          // ShieldVault itself — the SAME call still made two lines below).
          // Removed to stop wasting 2 of ~23 RPC calls every 30s poll.
          () => call(CONTRACTS.PrivarShieldVault, SEL.paused),
          () => call(CONTRACTS.PrivarShieldVault, SEL.supportedTokens + encodeAddress(CONTRACTS.USDC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.supportedTokens + encodeAddress(CONTRACTS.EURC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.supportedTokens + encodeAddress(CONTRACTS.cirBTC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.VERSION),
          () => call(CONTRACTS.PrivarShieldVault, SEL.protocolFeeBps),
          () => call(CONTRACTS.PrivarShieldVault, SEL.flatFeeUsdc),
          // v3.3 — restored: these functions now genuinely exist on the vault
          // (ported from the v2.8 reference implementation).
          () => call(CONTRACTS.PrivarShieldVault, SEL.totalTxCount),
          () => call(CONTRACTS.PrivarShieldVault, buildTotalVolumeByTokenCall(CONTRACTS.USDC)),
          () => call(CONTRACTS.PrivarShieldVault, buildTotalVolumeByTokenCall(CONTRACTS.EURC)),
          () => call(CONTRACTS.PrivarShieldVault, buildTotalVolumeByTokenCall(CONTRACTS.cirBTC)),
          // Fees always land in feesCollectedByToken[NATIVE_USDC] only (see
          // ShieldVault's v3.3 fee model) — EURC/cirBTC entries will always
          // read 0, kept only for interface completeness.
          () => call(CONTRACTS.PrivarShieldVault, SEL.feesCollectedByToken + encodeAddress(CONTRACTS.USDC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.feesCollectedByToken + encodeAddress(CONTRACTS.EURC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.feesCollectedByToken + encodeAddress(CONTRACTS.cirBTC)),
          () => call(CONTRACTS.PrivarShieldVault, SEL.swapFeeBps),
          () => call(CONTRACTS.PrivarShieldVault, SEL.bridgeFeeBps),
          () => call(CONTRACTS.PrivarShieldVault, SEL.treasury),
        ];
        // Each entry wrapped individually too: a synchronous throw from any ONE
        // builder function (e.g. an undefined import) now only nulls that ONE call
        // instead of aborting calls.map() entirely and skipping every call after it.
        const results = await Promise.allSettled(
          calls.map(fn => { try { return fn(); } catch (e) { return Promise.reject(e); } })
        );
      const v = (i) => results[i].status === "fulfilled" ? results[i].value : null;
      const [
        su, se, sb, leaf, vaultPaused, tUsdc, tEurc, tBtc,
        ver, protoFeeBpsRes, flatFeeUsdcRes,
        txCount, volU, volE, volB, feeU, feeE, feeB,
        swapFeeBpsRes, bridgeFeeBpsRes, treasuryRes,
      ] = results.map((_, i) => v(i));

      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) console.warn(`stats fetch: ${failed.length}/${results.length} calls failed`, failed[0].reason);

      setStats(prev => {
        const next = {
          shieldedUsdc:    su   != null ? Number(nativeToUsdc6(decodeUint256(su))) : prev.shieldedUsdc,
          shieldedEurc:    se   != null ? Number(decodeUint256(se))   : prev.shieldedEurc,
          shieldedBtc:     sb   != null ? Number(decodeUint256(sb))   : prev.shieldedBtc,
          leafCount:       leaf != null ? Number(decodeUint256(leaf)) : prev.leafCount,
          // vaultPaused is the ONLY trustworthy pause signal — the real
          // paused() bool on ShieldVault itself. depositsAllowed is derived
          // from it (the old EmergencyController-backed depositsAllowed()
          // read was removed — see the calls array above).
          // Keep previous value rather than null on a transient RPC failure —
          // null was being interpreted as "paused" by the UI (null !== 0).
          vaultPaused:     vaultPaused != null ? decodeUint8(vaultPaused) !== 0 : prev.vaultPaused,
          depositsAllowed: vaultPaused != null ? decodeUint8(vaultPaused) === 0 : prev.depositsAllowed,
          tokenSupport: {
            [CONTRACTS.USDC]:   tUsdc != null && tUsdc !== "0x" ? BigInt(tUsdc) === 1n : prev.tokenSupport[CONTRACTS.USDC],
            [CONTRACTS.EURC]:   tEurc != null && tEurc !== "0x" ? BigInt(tEurc) === 1n : prev.tokenSupport[CONTRACTS.EURC],
            [CONTRACTS.cirBTC]: tBtc  != null && tBtc  !== "0x" ? BigInt(tBtc)  === 1n : prev.tokenSupport[CONTRACTS.cirBTC],
          },
          version:      ver != null ? (decodeStringReturn(ver) || prev.version) : prev.version,
          // v3.3 — restored: these are real functions on the vault again
          // (ported from the v2.8 reference). Fees always land in
          // feesCollectedByToken[NATIVE_USDC] only (see ShieldVault's fee
          // model) — feesEurc/feesBtc will always read 0, which is correct,
          // not a bug. totalVolumeByToken/feesCollectedByToken for
          // NATIVE_USDC are stored in native 18-dec units (consistent with
          // how amount/fee flow through deposit()/withdraw()/swap()) — scale
          // down to 6-dec for display with nativeToUsdc6().
          totalTxCount: txCount != null ? Number(decodeUint256(txCount)) : prev.totalTxCount,
          volumeUsdc: volU != null ? Number(nativeToUsdc6(decodeUint256(volU))) : prev.volumeUsdc,
          volumeEurc: volE != null ? Number(decodeUint256(volE)) : prev.volumeEurc,
          volumeBtc:  volB != null ? Number(decodeUint256(volB)) : prev.volumeBtc,
          feesUsdc:   feeU != null ? Number(nativeToUsdc6(decodeUint256(feeU))) : prev.feesUsdc,
          feesEurc:   feeE != null ? Number(decodeUint256(feeE)) : prev.feesEurc,
          feesBtc:    feeB != null ? Number(decodeUint256(feeB)) : prev.feesBtc,
          // Fee rates — plain uint256, bps.
          protocolFeeBps: protoFeeBpsRes   != null ? Number(decodeUint256(protoFeeBpsRes))   : prev.protocolFeeBps,
          swapFeeBps:     swapFeeBpsRes    != null ? Number(decodeUint256(swapFeeBpsRes))    : prev.swapFeeBps,
          bridgeFeeBps:   bridgeFeeBpsRes  != null ? Number(decodeUint256(bridgeFeeBpsRes))  : prev.bridgeFeeBps,
          flatFeeUsdc:    flatFeeUsdcRes   != null ? Number(decodeUint256(flatFeeUsdcRes))    : prev.flatFeeUsdc,
          treasury:       treasuryRes      != null && treasuryRes !== "0x" ? "0x" + treasuryRes.slice(-40) : prev.treasury,
        };

        // Record + compute 24h deltas from local snapshots (see takeStatsSnapshot/
        // get24hDelta above) — only once we actually have fresh totalTxCount data,
        // since that's the anchor metric everything else deltas against.
        if (next.totalTxCount != null && CONTRACTS.PrivarShieldVault) {
          const numeric = {
            totalTxCount: Number(next.totalTxCount),
            volumeUsdc: Number(next.volumeUsdc || 0n), volumeEurc: Number(next.volumeEurc || 0n), volumeBtc: Number(next.volumeBtc || 0n),
            feesUsdc:   Number(next.feesUsdc   || 0n), feesEurc:   Number(next.feesEurc   || 0n), feesBtc:   Number(next.feesBtc   || 0n),
          };
          takeStatsSnapshot(CONTRACTS.PrivarShieldVault, numeric);
          const delta = get24hDelta(CONTRACTS.PrivarShieldVault, numeric);
          if (delta) {
            next.tx24h = delta.tx24h;
            next.volumeUsdc24h = delta.volumeUsdc24h; next.volumeEurc24h = delta.volumeEurc24h; next.volumeBtc24h = delta.volumeBtc24h;
            next.feesUsdc24h   = delta.feesUsdc24h;   next.feesEurc24h   = delta.feesEurc24h;   next.feesBtc24h   = delta.feesBtc24h;
            next.snapshotCoverage = delta.snapshotCoverage;
          }
        }

        return next;
      });
      } catch (e) {
        // Catches synchronous throws too (missing imports, undefined refs, etc.) —
        // not just promise rejections. Previous values are kept as-is (setStats
        // simply isn't called), so a crash here never blanks the panel.
        console.warn("stats fetch crashed:", e);
      }
  }, [onArc]);

  useEffect(() => {
    if (!onArc) return;
    fetch();
    // Was 10s — 23 eth_call requests every 10s is heavy sustained load on a
    // public testnet RPC, likely the cause of the intermittent stat
    // failures/staleness reported (values working one moment, stuck
    // "loading…" the next). 30s cuts steady-state request volume by 3x.
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, [onArc, fetch]);
  return { ...stats, refresh: fetch };
}

// ── On-chain activity reconstruction (tx count / volume / fees) ────────────
// PrivarShieldVault v3.0.0 has no totalTxCount()/totalVolumeByToken()/
// feesCollectedByToken() and no FeeCollected event — see useProtocolStats
// above. But it DOES emit Deposited/Withdrawn/PrivateSwap/FeeUpdated, which
// is everything needed to reconstruct these numbers exactly:
//   - Deposited(commitment, token, amount=NET, leafIndex, root)
//   - Withdrawn(nullifier, token, recipient, amount=GROSS)
//   - PrivateSwap(nullifierIn, commitmentOut, tokenIn, tokenOut, amountIn, amountOut)
//   - FeeUpdated(feeBps, flatFee, recipient) — bps-over-time history
// Fee model (confirmed against PrivarShieldVault.sol source):
//   - NATIVE_USDC deposit only: net = amount - amount*bps/10000. The event
//     records NET, so gross = net*10000/(10000-bps), fee = gross-net —
//     using whichever bps was active at that block (from FeeUpdated history).
//   - ERC-20 ops (deposit AND withdraw): flatFeeUsdc paid as msg.value on
//     that same tx — fetched via eth_getTransactionByHash(log.transactionHash).
//   - Native withdraw: NO fee at all (confirmed in source).
//   - Swap: NO fee charged at all currently (confirmed in source).
// All fee/volume figures for native USDC come out in 18-dec native-wei —
// convert with nativeToUsdc6() before display.
const EV2 = {
  Deposited:   "0xe758dd586554a30e85101e8e9ab611091d9230b7233f0f6a9736488e55d9d9e7",
  Withdrawn:   "0xa6786aab7dbbc48b4b0387488b407bd81448030ab207b50bea7dbb5fbc1cd9eb",
  PrivateSwap: "0x74f456940527970034820942ae07de9832d81b3e080c4ae3883cc944038d179a",
  FeeUpdated:  "0x8d6ad40ad37637106f0ca2d682205c774e73f8cf7789162ce1c0b6ac0791a484",
};

async function fetchLogsRange(address, topics, fromBlock, toBlock, depth = 0) {
  if (fromBlock > toBlock) return [];
  try {
    const res = await rpcCall("eth_getLogs", [{
      address, topics,
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock:   "0x" + toBlock.toString(16),
    }]);
    return res || [];
  } catch (e) {
    // Provider rejected this range (too wide, or too many results) — split in
    // half and retry both halves in parallel. Depth-capped so a genuinely
    // broken RPC fails fast instead of hammering it with 2^n requests.
    if (depth >= 10 || fromBlock === toBlock) return [];
    const mid = fromBlock + Math.floor((toBlock - fromBlock) / 2);
    const [a, b] = await Promise.all([
      fetchLogsRange(address, topics, fromBlock, mid, depth + 1),
      fetchLogsRange(address, topics, mid + 1, toBlock, depth + 1),
    ]);
    return a.concat(b);
  }
}

// blocksBack default covers a very wide window (Arc Testnet produces blocks
// roughly every ~1s, so this is generous) — the recursive splitter above
// means this is cheap when the RPC's real range limit is small, since only
// the windows that actually contain matching logs cost more than 1 request.
async function fetchLogsChunked(address, topics, blocksBack = 2_000_000) {
  const latest = parseInt(await rpcCall("eth_blockNumber", []), 16);
  const from = Math.max(0, latest - blocksBack);
  return fetchLogsRange(address, topics, from, latest);
}

const topicToAddress = (t) => "0x" + t.slice(-40);
const dataWord = (data, i) => "0x" + data.slice(2 + i * 64, 2 + i * 64 + 64);

// ── Ground-truth note reconciliation ────────────────────────────────────
// Deposited(bytes32 indexed commitment, address indexed token, uint256
// amount, uint256 leafIndex, bytes32 root) is emitted by EVERY op that
// creates a note — plain deposit() AND the re-shield step at the end of
// _privateSwap()/_privateSend()/privateBridge() — always with the REAL,
// post-fee, correctly-scaled amount the contract actually credited to
// totalShieldedByToken. Any pre-tx client estimate (a swap quote, a
// mirrored fee calc) is a best-effort prediction for gas/UX only; THIS is
// the only number that should ever be persisted as a note's amount. Used
// by sendRealTx's onReceipt hook (see useTxSend) to correct an op's
// predicted output(s) right before finalizeOp() writes them to storage —
// makes local note tracking immune to any future fee-model or
// decimal-scaling change, instead of needing a fresh client-side mirror
// fix every time the contract's accounting changes (see swapFeeBps: the
// v18.0.6 client mirrored flatFeeUsdc but not swapFeeBps, silently
// overcrediting every swap that landed in native USDC — this makes that
// whole class of bug structurally impossible instead of patching this one
// instance of it).
function decodeDepositedAmountForCommitment(receipt, commitment) {
  if (!receipt?.logs || !commitment) return null;
  const commTopic = "0x" + commitment.replace("0x", "").padStart(64, "0").toLowerCase();
  const vault = (CONTRACTS.PrivarShieldVault || "").toLowerCase();
  for (const log of receipt.logs) {
    if (log.address?.toLowerCase() !== vault) continue;
    if (log.topics?.[0]?.toLowerCase() !== EV2.Deposited) continue;
    if (log.topics?.[1]?.toLowerCase() !== commTopic) continue;
    try { return BigInt(dataWord(log.data, 0)); } catch { return null; }
  }
  return null; // no matching log — caller keeps its pre-tx estimate, unchanged behavior
}

function useOnChainActivity(onArc) {
  const cacheKey = `privar_onchain_activity_${(CONTRACTS.PrivarShieldVault||"").toLowerCase()}`;
  const loadCache = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const [activity, setActivity] = useState(() => {
    const c = loadCache();
    return c
      ? { loading:false, ready:true, totalTxCount:c.totalTxCount, volumeUsdc:c.volumeUsdc, volumeEurc:c.volumeEurc, volumeBtc:c.volumeBtc, feesUsdc:c.feesUsdc }
      : { loading:false, ready:false, totalTxCount:null, volumeUsdc:null, volumeEurc:null, volumeBtc:null, feesUsdc:null };
  });

  const run = useCallback(async () => {
    if (!onArc || !CONTRACTS.PrivarShieldVault) return;
    setActivity(prev => ({ ...prev, loading: true }));
    try {
      const vault = CONTRACTS.PrivarShieldVault;
      const cache = loadCache();
      // Incremental scan: only look at blocks since the last successful run
      // for THIS vault address. Cache resets automatically on redeploy since
      // the key includes the vault address.
      const latest = parseInt(await rpcCall("eth_blockNumber", []), 16);
      const fromBlock = cache ? cache.lastBlock + 1 : null;

      const scanFrom = async (topics) => fromBlock != null
        ? fetchLogsRange(vault, topics, fromBlock, latest)
        : fetchLogsChunked(vault, topics);

      const [depLogs, wdLogs, swapLogs, feeLogs] = await Promise.all([
        scanFrom([EV2.Deposited]),
        scanFrom([EV2.Withdrawn]),
        scanFrom([EV2.PrivateSwap]),
        // Fee history always needs full context to know the bps active at
        // each NEW deposit — but it's a small, infrequent event (admin-only
        // rate changes), so re-scanning it in full each time is cheap.
        fetchLogsChunked(vault, [EV2.FeeUpdated]),
      ]);

      const bpsHistory = feeLogs
        .map(l => ({ block: parseInt(l.blockNumber, 16), bps: Number(BigInt(dataWord(l.data, 0))) }))
        .sort((a, b) => a.block - b.block);
      const bpsAt = (block) => {
        let bps = 0;
        for (const h of bpsHistory) { if (h.block <= block) bps = h.bps; else break; }
        return bps;
      };

      const tokenLower = {
        usdc: NATIVE_USDC.toLowerCase(),
        eurc: (CONTRACTS.EURC || "").toLowerCase(),
        btc:  (CONTRACTS.cirBTC || "").toLowerCase(),
      };

      let volUsdcNet = 0n, volEurc = 0n, volBtc = 0n;
      let feesNative = 0n;

      // Flat-fee tx lookups run in PARALLEL (was one-by-one in a for-loop,
      // a major source of the reported slowness) — collect the ones needed
      // first, then fire them all at once.
      const flatFeeTxHashes = [];
      for (const log of depLogs) {
        if (topicToAddress(log.topics[2]).toLowerCase() !== tokenLower.usdc) flatFeeTxHashes.push(log.transactionHash);
      }
      for (const log of wdLogs) {
        if (topicToAddress(log.topics[2]).toLowerCase() !== tokenLower.usdc) flatFeeTxHashes.push(log.transactionHash);
      }
      const txValues = {};
      await Promise.all(flatFeeTxHashes.map(async (h) => {
        try {
          const tx = await rpcCall("eth_getTransactionByHash", [h]);
          if (tx?.value && tx.value !== "0x0") txValues[h] = BigInt(tx.value);
        } catch {}
      }));

      for (const log of depLogs) {
        const token = topicToAddress(log.topics[2]).toLowerCase();
        const net   = BigInt(dataWord(log.data, 0));
        const block = parseInt(log.blockNumber, 16);
        if (token === tokenLower.usdc) {
          volUsdcNet += net;
          const bps = bpsAt(block);
          if (bps > 0) feesNative += (net * 10000n / BigInt(10000 - bps)) - net;
        } else {
          if (token === tokenLower.eurc) volEurc += net;
          if (token === tokenLower.btc)  volBtc  += net;
          if (txValues[log.transactionHash]) feesNative += txValues[log.transactionHash];
        }
      }

      for (const log of wdLogs) {
        const token = topicToAddress(log.topics[2]).toLowerCase();
        const amount = BigInt(dataWord(log.data, 0));
        if (token === tokenLower.usdc) {
          volUsdcNet += amount; // native withdraw: no fee at all
        } else {
          if (token === tokenLower.eurc) volEurc += amount;
          if (token === tokenLower.btc)  volBtc  += amount;
          if (txValues[log.transactionHash]) feesNative += txValues[log.transactionHash];
        }
      }

      for (const log of swapLogs) {
        const tokenIn  = topicToAddress("0x" + dataWord(log.data, 0).slice(-40)).toLowerCase();
        const tokenOut = topicToAddress("0x" + dataWord(log.data, 1).slice(-40)).toLowerCase();
        const amountIn  = BigInt(dataWord(log.data, 2));
        const amountOut = BigInt(dataWord(log.data, 3));
        if (tokenIn  === tokenLower.usdc) volUsdcNet += amountIn;
        if (tokenIn  === tokenLower.eurc) volEurc    += amountIn;
        if (tokenIn  === tokenLower.btc)  volBtc     += amountIn;
        if (tokenOut === tokenLower.usdc) volUsdcNet += amountOut;
        if (tokenOut === tokenLower.eurc) volEurc    += amountOut;
        if (tokenOut === tokenLower.btc)  volBtc     += amountOut;
      }

      // Merge with cached totals (BigInt-safe via strings) for the incremental case.
      const prevTotals = cache ? {
        txCount: cache.totalTxCount,
        volUsdc: BigInt(cache._volUsdcNativeRaw || "0"),
        volEurc: BigInt(cache._volEurcRaw || "0"),
        volBtc:  BigInt(cache._volBtcRaw  || "0"),
        fees:    BigInt(cache._feesNativeRaw || "0"),
      } : { txCount: 0, volUsdc: 0n, volEurc: 0n, volBtc: 0n, fees: 0n };

      const totalVolUsdcNative = prevTotals.volUsdc + volUsdcNet;
      const totalVolEurc       = prevTotals.volEurc + volEurc;
      const totalVolBtc        = prevTotals.volBtc  + volBtc;
      const totalFeesNative    = prevTotals.fees    + feesNative;
      const totalTxCount       = prevTotals.txCount + depLogs.length + wdLogs.length + swapLogs.length;

      const result = {
        loading: false, ready: true,
        totalTxCount,
        volumeUsdc: Number(nativeToUsdc6(totalVolUsdcNative)),
        volumeEurc: Number(totalVolEurc),
        volumeBtc:  Number(totalVolBtc),
        feesUsdc:   Number(nativeToUsdc6(totalFeesNative)),
      };
      setActivity(result);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          lastBlock: latest,
          totalTxCount,
          volumeUsdc: result.volumeUsdc, volumeEurc: result.volumeEurc, volumeBtc: result.volumeBtc,
          feesUsdc: result.feesUsdc,
          _volUsdcNativeRaw: totalVolUsdcNative.toString(),
          _volEurcRaw: totalVolEurc.toString(),
          _volBtcRaw: totalVolBtc.toString(),
          _feesNativeRaw: totalFeesNative.toString(),
        }));
      } catch {}
    } catch (e) {
      console.warn("on-chain activity reconstruction failed:", e);
      setActivity(prev => ({ ...prev, loading: false }));
    }
  }, [onArc]);

  useEffect(() => { run(); }, [run]);
  return { ...activity, refresh: run };
}

// ── Shielded balances hook ────────────────────────────────────────────────────
// Aggregates localStorage notes per token, returns per-token balances + USD total.
// Updates whenever notes change (storage event) or component re-renders.
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  CONFIDENTIAL SEND — STEALTH NOTES via real ECDH (P-256) + ViewKeyRegistry
//
//  Fixes a critical bug in the original implementation: sender and recipient
//  derived their "shared secret" from two DIFFERENT inputs
//  (SHA256(addr || ephemeralPRIVATEscalar) vs SHA256(addr || ephemeralPUBLICkey)),
//  so decryption could never succeed — it was not ECDH at all.
//
//  This version performs REAL ECDH using the Web Crypto API (no external libs,
//  consistent with this project's zero-dependency frontend):
//
//   1. Every wallet gets its own P-256 "view keypair" — separate from the EVM
//      spending key — generated client-side via crypto.subtle.generateKey().
//      The private half never leaves localStorage; the public half (65-byte
//      raw uncompressed point) is registered on-chain in ViewKeyRegistry.sol.
//
//   2. Sender looks up the recipient's view public key on-chain, generates a
//      fresh ephemeral P-256 keypair (new key per send → forward secrecy, no
//      way to link multiple sends to the same recipient on-chain), and runs
//      crypto.subtle.deriveBits({name:"ECDH", public: recipientPubKey}, ephemeralPrivateKey)
//      — a genuine elliptic-curve Diffie-Hellman shared secret.
//
//   3. Recipient runs the mirror operation:
//      crypto.subtle.deriveBits({name:"ECDH", public: ephemeralPubKey}, myViewPrivateKey)
//      By the ECDH commutativity property this is GUARANTEED to equal the
//      sender's shared secret — no hash-mismatch bug possible.
//
//   4. Both sides run the same shared secret through HKDF-SHA256 to derive an
//      AES-256-GCM key, encrypt/decrypt the note JSON.
//
//  Notes are relayed via ViewKeyRegistry.emitNote() (NOT PrivarShieldVault) so this
//  works against the currently-deployed PrivarShieldVault v2.2 without requiring a
//  vault redeploy. See contracts/ViewKeyRegistry.sol for full rationale.
// ═══════════════════════════════════════════════════════════════

// Keccak256 via SubtleCrypto (SHA-256 fallback for key derivation)
async function subtleSHA256(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(hash);
}

// HKDF-SHA256 for shared secret derivation
async function hkdf(ikm, salt, info, length = 32) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name:"HKDF", hash:"SHA-256", salt: salt || new Uint8Array(32), info: new TextEncoder().encode(info || "") },
    key, length * 8
  );
  return new Uint8Array(bits);
}

// AES-256-GCM encrypt
async function aesEncrypt(keyBytes, plaintext) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name:"AES-GCM" }, false, ["encrypt"]);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const result = new Uint8Array(iv.byteLength + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), iv.byteLength);
  return result;
}

// AES-256-GCM decrypt
async function aesDecrypt(keyBytes, combined) {
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name:"AES-GCM" }, false, ["decrypt"]);
  const pt  = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// Hex helpers
function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return bytes;
}
function bytesToHex(bytes) { return "0x" + Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join(''); }

// ── View keypair storage (per-wallet, localStorage-scoped) ────────────────
const viewKeyStorageKey = (addr) => `privar_viewkeypair_${addr.toLowerCase()}`;

// Load an EXISTING local view keypair, or null if none was ever generated on
// this device. Deliberately does NOT auto-generate — used by the decrypt path,
// where silently generating a fresh (non-matching) key would mask real failures.
async function loadViewKeyPair(address) {
  try {
    const raw = localStorage.getItem(viewKeyStorageKey(address));
    if (!raw) return null;
    const { privateKeyJwk, publicKeyHex } = JSON.parse(raw);
    const privateKey = await crypto.subtle.importKey(
      "jwk", privateKeyJwk, { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]
    );
    return { privateKey, publicKeyHex };
  } catch { return null; }
}

// Load the local view keypair, generating + persisting a new one if absent.
// Used by the connect-time registration flow (sender side doesn't need this —
// it only ever reads OTHER people's public keys from chain).
async function getOrCreateViewKeyPair(address) {
  const existing = await loadViewKeyPair(address);
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]
  );
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKeyRaw  = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)); // 65 bytes, 0x04 prefix
  const publicKeyHex  = bytesToHex(publicKeyRaw);

  localStorage.setItem(viewKeyStorageKey(address), JSON.stringify({ privateKeyJwk, publicKeyHex }));
  return { privateKey: pair.privateKey, publicKeyHex };
}

// ── View key backup / restore (item 2A: cross-device persistence) ─────────
// Web Crypto's P-256 ECDH has no way to deterministically derive a keypair from
// a seed (no exposed scalar→point multiplication), so two devices can never
// independently re-generate the SAME keypair. The only way to use confidential
// receiving on a second device is to literally transport the private key material
// once. This is the same tradeoff every browser-only crypto wallet without a
// hardware/seed-phrase root makes — export here is the seed-phrase equivalent.
function exportViewKeyBackup(address) {
  return localStorage.getItem(viewKeyStorageKey(address)); // raw JSON {privateKeyJwk, publicKeyHex}
}

async function importViewKeyBackup(address, blob) {
  const parsed = JSON.parse(blob);
  if (!parsed?.privateKeyJwk || !parsed?.publicKeyHex) throw new Error("Invalid backup format");
  // Validate it's actually a usable P-256 ECDH key before trusting/storing it
  await crypto.subtle.importKey("jwk", parsed.privateKeyJwk, { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
  localStorage.setItem(viewKeyStorageKey(address), JSON.stringify(parsed));
}

// ── On-chain view key registration (connect-time, once per address) ───────
// Generates the local keypair (free), checks ViewKeyRegistry.hasViewKey() (free,
// eth_call), and registers on-chain only if missing. Guarded by a localStorage
// flag so a rejected signature doesn't re-prompt on every connect.
const viewKeyAttemptedFlag = (addr) => `privar_viewkey_attempted_${addr.toLowerCase()}`;

async function ensureViewKeyRegistered(address, sendRealTx, notify) {
  if (!CONTRACTS.ViewKeyRegistry) return; // feature not deployed yet — no-op
  if (!address) return;

  const { publicKeyHex } = await getOrCreateViewKeyPair(address);

  let alreadyRegistered = false;
  try {
    const res = await rpcCall("eth_call", [{ to: CONTRACTS.ViewKeyRegistry, data: buildHasViewKeyCall(address) }, "latest"]);
    alreadyRegistered = decodeUint8(res) === 1 || /0{63}1$/.test((res||"").replace("0x",""));
  } catch { /* assume not registered, will retry next connect */ return; }

  if (alreadyRegistered) return;
  if (localStorage.getItem(viewKeyAttemptedFlag(address))) return; // already asked once, don't nag

  localStorage.setItem(viewKeyAttemptedFlag(address), "1");
  const { data } = buildRegisterViewKeyCalldata(publicKeyHex);
  await sendRealTx({
    label: "Enable Confidential Receiving",
    description: "Registering your view key — lets senders auto-deliver encrypted notes to you.",
    buildTx: () => ({ to: CONTRACTS.ViewKeyRegistry, value: "0x0", data }),
  });
}

// ── ECIES Encrypt (sender side) — real ECDH against recipient's registered key ──
// Returns null if ViewKeyRegistry isn't deployed or recipient hasn't registered
// a view key — caller should fall back to a non-stealth confidential send.
async function eciesEncryptNoteForRecipient(recipientAddress, noteJson) {
  if (!CONTRACTS.ViewKeyRegistry) return null;

  let recipientPubKeyHex;
  try {
    const res = await rpcCall("eth_call", [{ to: CONTRACTS.ViewKeyRegistry, data: buildGetViewKeyCall(recipientAddress) }, "latest"]);
    recipientPubKeyHex = decodeBytesReturn(res);
  } catch { return null; }

  if (!recipientPubKeyHex || hexToBytes(recipientPubKeyHex).length !== 65) return null; // recipient has no view key

  const recipientPubKey = await crypto.subtle.importKey(
    "raw", hexToBytes(recipientPubKeyHex), { name:"ECDH", namedCurve:"P-256" }, false, []
  );

  // Fresh ephemeral keypair — never reused, gives forward secrecy + unlinkability
  const ephemeral = await crypto.subtle.generateKey(
    { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]
  );
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)); // 65 bytes

  // Real ECDH shared secret (32 bytes — P-256 field size)
  const sharedBits = await crypto.subtle.deriveBits(
    { name:"ECDH", public: recipientPubKey }, ephemeral.privateKey, 256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  const addrBytes = hexToBytes(recipientAddress);
  const aesKey = await hkdf(sharedSecret, addrBytes, "privarc-stealth-note-v2");
  const ciphertext = await aesEncrypt(aesKey, noteJson);

  return {
    encryptedNote:   bytesToHex(ciphertext),
    ephemeralPubKey: bytesToHex(ephPubRaw), // full 65-byte raw point
  };
}

// ── ECIES Decrypt (recipient side, on wallet connect) — mirrors the sender's ECDH ──
async function eciesDecryptNoteWithViewKey(recipientAddress, encryptedNoteHex, ephemeralPubKeyHex) {
  try {
    const local = await loadViewKeyPair(recipientAddress);
    if (!local) return null; // no local view key on this device — cannot decrypt

    const ephPubKey = await crypto.subtle.importKey(
      "raw", hexToBytes(ephemeralPubKeyHex), { name:"ECDH", namedCurve:"P-256" }, false, []
    );

    // Same shared secret as the sender computed, by ECDH commutativity:
    // ECDH(ephemeralPriv, recipientPub) === ECDH(recipientPriv, ephemeralPub)
    const sharedBits = await crypto.subtle.deriveBits(
      { name:"ECDH", public: ephPubKey }, local.privateKey, 256
    );
    const sharedSecret = new Uint8Array(sharedBits);

    const addrBytes = hexToBytes(recipientAddress);
    const aesKey = await hkdf(sharedSecret, addrBytes, "privarc-stealth-note-v2");
    const ciphertext = hexToBytes(encryptedNoteHex);
    const plaintext = await aesDecrypt(aesKey, ciphertext);
    return JSON.parse(plaintext);
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
//  PRIVAR CLOUD VAULT — decentralized note-journal sync (contracts/core/
//  PrivarCloudVault.sol). Implements the checkpoint+delta architecture from
//  the brainstorm doc ("meilleure implementation décentralisée"): every
//  shield/spend pushes a tiny encrypted delta as an EVENT (not storage —
//  ~5-10x cheaper for blobs this size); every 20 deltas, a full encrypted
//  snapshot is pushed as a checkpoint so a brand-new device never has to
//  replay more than ~20 events. Nothing is stored server-side, no IPFS/
//  Arweave pinning — only PrivarCloudVault's event log, readable from any
//  RPC node via eth_getLogs.
//
//  Encryption key: derived from an EIP-712 signature (domain-separated by
//  chainId + CloudVault address, per the brainstorm's replay-safety
//  rationale), falling back to a fixed personal_sign message on wallets
//  without full EIP-712 support. ECDSA signatures are deterministic
//  (RFC 6979), so every device controlling this wallet derives the exact
//  same AES-256-GCM key — no export/import step, ever.
//
//  Journal payload format here is plain compact JSON (not CBOR+Brotli as
//  sketched in the brainstorm) — this frontend is intentionally zero-
//  dependency (see the ECDH comments above), and note-sized deltas
//  (a few hundred bytes) don't earn back a compression library's cost.
//  Swapping in real CBOR/Brotli later is a pure optimization, not required
//  for correctness — the on-chain format (opaque `bytes`) never changes.
//
//  This module ONLY concerns the wallet's OWN note journal (self shield/
//  spend). The ECDH ViewKeyRegistry pipeline above, for receiving notes
//  FROM OTHER wallets via confidential send, is completely untouched.
// ═══════════════════════════════════════════════════════════════

// Floor block for eth_getLogs scans, set well before PrivarCloudVault's
// actual deployment (2026-08-06T12:16:30Z) — confirmed via a pushDelta tx
// at block 55,729,500 (Aug 07 2026 06:49:30, ~18.5h after deployment, ~1433
// confirmations in 13 min ⇒ roughly 1.8 blocks/sec on this chain). That puts
// deployment at roughly block 55.6M; this floor is set ~530k blocks earlier
// (~3 days of margin at the observed block rate) so it can never skip a
// delta that predates it, while still cutting the scan range from 55M+
// blocks down to a few hundred thousand — the actual fix for the RPC
// rate-limit death spiral (see cloudVaultGetLogs).
const CLOUD_VAULT_GENESIS_BLOCK = 55200000;

// Floor block for scanning PrivarShieldVault's own NoteJournal events (v3.4).
// SEPARATE from CLOUD_VAULT_GENESIS_BLOCK above — that one was calibrated for
// the v3.3-era PrivarCloudVault deployment and has no relation to this
// contract's own deployment block. TODO: set this to ShieldVault v3.4's
// actual deployment block once known (same reasoning as CLOUD_VAULT_GENESIS_
// BLOCK — Arc Testnet is 50M+ blocks deep, scanning from 0 triggers the RPC
// rate-limit death spiral even for a contract with zero history before it).
// 0 is a safe (if slow) default until then — a brand-new contract simply has
// no events before its own deployment block regardless of where the scan starts.
const SHIELD_VAULT_JOURNAL_GENESIS_BLOCK = 0;

// IMPORTANT: the address is normalized to lowercase here. Different wallets
// return the connected account in different casing from eth_requestAccounts/
// eth_accounts — e.g. Rabby returns it all-lowercase, TokenPocket returns it
// EIP-55 checksummed. personal_sign signs the literal message BYTES, so if
// this message embedded `address` as-is, two wallets controlling the exact
// same private key would sign two DIFFERENT byte strings — deriving two
// different AES keys with no error anywhere. That was the actual root cause
// of TokenPocket ↔ Rabby sync never working even after the v2 key-derivation
// fix (personal_sign alone doesn't help if the signed text itself differs).
const BACKUP_SIG_MESSAGE = (address) => [
  "Privar Cloud Vault — derive shielded-notes backup key",
  "",
  "This signature never touches the blockchain and costs no gas.",
  "It deterministically unlocks the SAME encryption key on every device",
  "that controls this wallet, so your shielded notes stay in sync.",
  "",
  `Address: ${address.toLowerCase()}`,
  `App: privar.io v1`,
].join("\n");

// Scheme version bumped (_v2 suffix) to force every device to re-sign under
// the case-normalized message above — any signature cached under the old,
// casing-dependent message must not be reused, or this fix wouldn't do
// anything for a device that already has a stale cached signature.
const backupSigStorageKey = (addr) => `privar_cloudvault_backupsig_v2_${addr.toLowerCase()}`;

// In-memory cache so we don't re-derive the CryptoKey on every call within a
// session; the localStorage signature cache below is what actually avoids
// re-prompting the wallet across page reloads.
const _backupKeyCache = new Map();

function getCachedBackupSignature(address) {
  try { return localStorage.getItem(backupSigStorageKey(address)); } catch { return null; }
}

// Ensures a deterministic backup signature exists locally for this address,
// prompting a (gasless) signature the FIRST time only, on any given device.
//
// IMPORTANT: uses ONLY personal_sign, never eth_signTypedData_v4/EIP-712.
// An earlier version tried EIP-712 first and silently fell back to
// personal_sign on wallets that didn't support it — which meant TWO
// DIFFERENT wallet apps could end up signing two COMPLETELY DIFFERENT
// messages for the "same" backup key, deriving two different AES keys with
// no error anywhere: pushDelta() would still succeed on-chain (the contract
// doesn't care what's inside the blob), but the other device could never
// decrypt it. That's the root cause of "shield on device A → still 0 on
// device B" even after this whole CloudVault pipeline shipped.
// personal_sign is implemented near-identically by every injected wallet
// (it's the oldest, simplest signing RPC — sign keccak256("\x19Ethereum
// Signed Message:\n" + len(message) + message)), so it's the one signing
// method we can trust to behave the same on TokenPocket, Rabby, MetaMask,
// or anything else — a single deterministic codepath, no branching, no
// possibility of two devices silently taking different paths.
async function ensureSelfBackupKeyReady(address) {
  if (!address || !CONTRACTS.PrivarCloudVault) return null; // feature not deployed on this network — no-op
  const cached = getCachedBackupSignature(address);
  if (cached) return cached;
  try {
    const sig = await personalSign(address, BACKUP_SIG_MESSAGE(address));
    try { localStorage.setItem(backupSigStorageKey(address), sig); } catch {}
    return sig;
  } catch (e) {
    console.warn("[cloud vault] backup key signature not available yet:", e.message);
    return null;
  }
}

// Derives the AES-256-GCM key from the cached deterministic signature.
// Returns null if no signature has been captured yet on this device.
async function deriveSelfBackupKey(address) {
  if (!address) return null;
  const lower = address.toLowerCase();
  if (_backupKeyCache.has(lower)) return _backupKeyCache.get(lower);
  const sig = getCachedBackupSignature(address);
  if (!sig) return null;
  // Use only r‖s (the first 64 bytes) — drop the trailing v/recovery-id byte.
  // Different wallets encode v differently (27/28 vs 0/1) for an otherwise
  // IDENTICAL signature; keeping it in the HKDF input would make the derived
  // key depend on which convention the signing wallet happens to use.
  const sigBytes = hexToBytes(sig).slice(0, 64);
  const key = await hkdf(sigBytes, hexToBytes(address.toLowerCase()), "privar-cloudvault-v3");
  const aesKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  _backupKeyCache.set(lower, aesKey);
  return aesKey;
}

// Generic encrypt/decrypt for a journal blob (a delta entry OR a checkpoint
// snapshot — both are just JSON objects). Format: [1 byte flags][12 byte
// IV][ciphertext + 16 byte GCM tag]. flags is reserved (always 0x01 today,
// format version) — room to add compression later without breaking old blobs.
async function encryptJournalBlob(address, obj) {
  const key = await deriveSelfBackupKey(address);
  if (!key) return null;
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const combined = new Uint8Array(1 + iv.byteLength + ct.byteLength);
  combined[0] = 0x01;
  combined.set(iv, 1);
  combined.set(new Uint8Array(ct), 1 + iv.byteLength);
  return bytesToHex(combined);
}
async function decryptJournalBlob(address, hex) {
  try {
    const key = await deriveSelfBackupKey(address);
    if (!key) return null;
    const bytes = hexToBytes(hex);
    if (bytes.length < 13) return null;
    const iv = bytes.slice(1, 13);
    const ct = bytes.slice(13);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { return null; }
}

// ── Push side: pushDelta() for one op, pushCheckpoint() every N deltas ────
const CLOUDVAULT_CHECKPOINT_EVERY = 20; // bounds replay length for a new device

async function pushCloudVaultDelta({ account, sendRealTx, op, label, description }) {
  if (!CONTRACTS.PrivarCloudVault) return false;
  const address = account?.address;
  await ensureSelfBackupKeyReady(address);
  const encrypted = await encryptJournalBlob(address, { ts: Date.now(), ops: [op] });
  if (!encrypted) return false; // no backup key yet — user hasn't granted the signature on this device
  const { data } = buildPushDeltaCalldata(encrypted);
  const ok = await sendRealTx({
    label: label || "Cloud Sync",
    description: description || "Backing up an encrypted note-journal entry on-chain.",
    buildTx: () => ({ to: CONTRACTS.PrivarCloudVault, value: "0x0", data }),
  });
  if (ok) maybePushCloudVaultCheckpoint(account, sendRealTx).catch(() => {});
  return ok;
}

// Condenses the journal into a full snapshot every CLOUDVAULT_CHECKPOINT_EVERY
// deltas, keyed off the ON-CHAIN version counter (not a local counter) so the
// trigger is identical no matter which device happens to push the Nth delta.
async function maybePushCloudVaultCheckpoint(account, sendRealTx) {
  const address = account?.address;
  if (!address || !CONTRACTS.PrivarCloudVault) return;
  const verHex = await rpcCallWithBackoff("eth_call", [{ to: CONTRACTS.PrivarCloudVault, data: buildCvLatestVersionCall(address) }, "latest"]);
  const version = decodeUint64Return(verHex);
  if (version === 0 || version % CLOUDVAULT_CHECKPOINT_EVERY !== 0) return;

  // The current local note list already excludes spent notes (every removal
  // site filters them out) — so it IS the active-note snapshot directly.
  const notes = getNotes(address);
  const encrypted = await encryptJournalBlob(address, { builtAt: Date.now(), notes });
  if (!encrypted) return;

  // Client-side integrity fingerprint only (never validated on-chain) — SHA-256
  // of the sorted active commitments, so a client can sanity-check a decrypted
  // snapshot against what it expects without trusting anything else.
  const sortedCommitments = notes.map(n => n.commitment).filter(Boolean).sort().join(",");
  const fpBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sortedCommitments));
  const fingerprint = bytesToHex(new Uint8Array(fpBuf));

  const { data } = buildPushCheckpointCalldata(fingerprint, encrypted);
  await sendRealTx({
    label: "Cloud Sync — checkpoint",
    description: "Condensing your shielded-notes journal into one snapshot so new devices sync faster.",
    buildTx: () => ({ to: CONTRACTS.PrivarCloudVault, value: "0x0", data }),
  });
}

// ── Item 2B: self note-journal relay (cross-device reconstruction) ────────
// Used by every handler that creates a new spendable commitment (deposit,
// swap output, confidential-send change, bridge leftover). Any device that
// controls this wallet derives the identical backup key on connect — no
// export/import step, no per-device mismatch — so resyncFromCloudVault()
// picks these up automatically on a brand-new device.
// Returns true if the on-chain backup succeeded, false otherwise (the
// deposit/swap/send/bridge itself already succeeded regardless — this only
// affects whether THIS note is cross-device recoverable).
async function relaySelfNote({ account, sendRealTx, commitment, amount, token, label, description }) {
  try {
    const op = { t: 0, commitment, amount: amount.toString(), token }; // t:0 = ADD
    const ok = await pushCloudVaultDelta({
      account, sendRealTx, op,
      label: label || "Cross-Device Backup",
      description: description || "Saving an encrypted copy of this note on-chain.",
    });
    if (ok) markNoteCloudSynced(account?.address, commitment);
    return ok;
  } catch (e) { console.warn("[cloud vault relay]", e.message); return false; }
}

// Counterpart to relaySelfNote — called wherever a note is CONSUMED (withdraw,
// used as a swap/send/bridge input) so other devices don't keep showing a
// spent note as spendable balance. Union-of-ops replay in resyncFromCloudVault
// makes this idempotent: replaying the same SPEND twice is a no-op.
// ── Pending SPEND broadcast queue ──────────────────────────────────────────
// relaySelfSpend() is fire-and-forget (.catch(()=>{})) at every call site —
// correctly so, since a local spend (swap/send/withdraw) must never be
// blocked by a background broadcast. But that means a failed broadcast
// (rate limit, dropped signature, network drop — anything we've spent this
// whole debugging session fixing symptoms of) was previously just LOST:
// the note was already removed from THIS device's local storage (correct),
// but no other device would ever learn it was spent, since there's no
// retry. That other device's CloudVault resync keeps the note active
// forever — a permanent phantom balance with no self-correction. This
// queue makes SPEND broadcasts as durable as ADD broadcasts already were
// (see cloudSynced / resyncLocalNotesToCloud).
const pendingSpendsKey = (addr) => `privar_cloudvault_pendingspends_${addr.toLowerCase()}`;
function getPendingSpends(address) {
  try { return JSON.parse(localStorage.getItem(pendingSpendsKey(address)) || "[]"); } catch { return []; }
}
function addPendingSpend(address, commitment) {
  if (!address || !commitment) return;
  const list = getPendingSpends(address);
  if (!list.includes(commitment)) { list.push(commitment); try { localStorage.setItem(pendingSpendsKey(address), JSON.stringify(list)); } catch {} }
}
function removePendingSpend(address, commitment) {
  if (!address || !commitment) return;
  const list = getPendingSpends(address).filter(c => c !== commitment);
  try { localStorage.setItem(pendingSpendsKey(address), JSON.stringify(list)); } catch {}
}

async function relaySelfSpend({ account, sendRealTx, commitment }) {
  const address = account?.address;
  addPendingSpend(address, commitment); // recorded BEFORE the attempt — survives a failed/interrupted broadcast
  try {
    const op = { t: 1, commitment }; // t:1 = SPEND
    const ok = await pushCloudVaultDelta({
      account, sendRealTx, op,
      label: "Cloud Sync — spend",
      description: "Marking a shielded note as spent in the encrypted cloud journal.",
    });
    if (ok) removePendingSpend(address, commitment);
    return ok;
  } catch (e) { console.warn("[cloud vault spend relay]", e.message); return false; }
}

// Retries any SPEND broadcasts that didn't make it through last time —
// called alongside resyncLocalNotesToCloud() so both directions (new notes
// AND spent notes) get a chance to catch up together.
async function retryPendingSpends(account, sendRealTx) {
  const address = account?.address;
  if (!address) return { synced: 0, failed: 0, total: 0 };
  const pending = getPendingSpends(address);
  let synced = 0, failed = 0;
  for (const commitment of pending) {
    const ok = await relaySelfSpend({ account, sendRealTx, commitment }).catch(() => false);
    if (ok) synced++; else failed++;
  }
  return { synced, failed, total: pending.length };
}

// Flags a local note as already backed up, so resyncLocalNotesToCloud() and
// future connects don't redundantly re-relay (and re-charge gas for) it.
function markNoteCloudSynced(address, commitment) {
  if (!address || !commitment) return;
  const notes = getNotes(address);
  const n = notes.find(n => n.commitment === commitment);
  if (n && !n.cloudSynced) { n.cloudSynced = true; saveNotes(address, notes); }
}

// ── Pull side: rebuild this wallet's note journal from PrivarCloudVault ───
// One-time migration for the key-derivation scheme fix. v2 = personal_sign-
// only, r‖s-truncated. v3 = same, PLUS the signed message now lowercases the
// embedded address (different wallets return the connected account in
// different casing — Rabby all-lowercase, TokenPocket EIP-55 checksummed —
// so the un-normalized message text differed byte-for-byte between wallets,
// which is what actually broke cross-device sync even after v2 shipped).
// Any note flagged cloudSynced under an OLDER scheme was encrypted with a
// key this build can no longer reproduce, so it needs to be re-pushed once.
// Runs at most once per address (tracked in localStorage) and only clears
// the flag — it never touches the note's commitment/amount/token, so there's
// no way this can affect spendability, only whether it still needs a backup push.
function migrateCloudSyncKeyScheme(address) {
  if (!address) return;
  const flag = `privar_cloudsync_v3_migrated_${address.toLowerCase()}`;
  try {
    if (localStorage.getItem(flag)) return;
    const notes = getNotes(address);
    let touched = false;
    for (const n of notes) if (n.cloudSynced) { n.cloudSynced = false; touched = true; }
    if (touched) saveNotes(address, notes);
    localStorage.setItem(flag, "1");
  } catch {}
}

// Reads the on-chain pointers (latestVersion / lastCheckpointBlock), fetches
// the latest NoteCheckpoint (if any) plus every NoteDelta since, decrypts,
// and replays the ops (ADD/SPEND — a commutative, idempotent set union, per
// the brainstorm's "CRDT naturel" point) to reconstruct the active note set.
// Merge policy is conservative: notes never locally confirmed as cloud-synced
// are never removed by this pass, even if the cloud journal doesn't mention
// them — avoids ever hiding funds due to a merge edge case.
const NOTE_DELTA_TOPIC      = "0x875fadea50135432be31cdb501197caf5476cd403cfb3c2b50ae092dc4b681f1";
const NOTE_CHECKPOINT_TOPIC = "0xdc96dad4cfdf4cedc40abb8b98a9cea098ab1193ab24e5a547f70553b7687307";

function decodeCheckpointLogSnapshot(log) {
  const data = (log.data || "").replace("0x", "");
  if (data.length < 128) return null;
  const offset = parseInt(data.slice(64, 128), 16);
  const len    = parseInt(data.slice(offset * 2, offset * 2 + 64), 16);
  if (!len) return null;
  return "0x" + data.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
}

// Fetches ALL logs matching `topics` from `fromBlock` to the chain head,
// paginating in fixed-size windows. Some RPC providers cap how many blocks
// a single eth_getLogs call may span (commonly 2k-10k) and just error out
// on a wide fromBlock=0→latest query — which resyncFromCloudVault used to
// issue directly. That error was caught by the outer try/catch and only
// ever logged to the console, so a device could silently see ZERO delta
// events and show a 0 balance with no visible error anywhere. This chunks
// proactively so we never depend on a provider's specific limit, and each
// chunk's failure is retried at half the window instead of aborting the
// whole resync.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Generic rate-limit-resilient wrapper for single-shot RPC calls (eth_call,
// eth_blockNumber). cloudVaultGetLogs already retries eth_getLogs on rate
// limits, but the eth_call reads that run BEFORE it (latestVersion,
// lastCheckpointBlock) had no protection at all — one rate-limited eth_call
// aborted the entire resync pass before it ever reached the (already
// resilient) log-scanning phase. A real console log confirmed this exact
// failure: "[cloud vault resync] ... eth_call ... rate limit exceeded" on
// the very first attempt, with the pass only succeeding on a later retry.
async function rpcCallWithBackoff(method, params, maxRetries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rpcCall(method, params);
    } catch (e) {
      const msg = (e.message || "").toLowerCase();
      const isRateLimit = msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("request limit");
      if (!isRateLimit || attempt >= maxRetries) throw e;
      await sleep(600 * (attempt + 1));
    }
  }
}

// Persists how far we've successfully scanned per (progress-key-prefix,
// topic-set, address), so a scan that gets cut short (rate limit, page
// unload, etc.) picks up where it left off next time instead of re-scanning
// the same huge range from scratch on every single call — which is what
// made progress effectively impossible against a chain already 50M+ blocks
// deep. `keyPrefix` differs per caller (CloudVault / stealth-scan /
// reconcile) so their progress is tracked independently.
function scanProgressKey(keyPrefix, topics, address) { return `${keyPrefix}_${topics[0]?.slice(2,10)}_${address.toLowerCase()}`; }
function getScanProgress(keyPrefix, topics, address, fallback) {
  try { const v = localStorage.getItem(scanProgressKey(keyPrefix, topics, address)); return v ? Number(v) : fallback; } catch { return fallback; }
}
function saveScanProgress(keyPrefix, topics, address, block) {
  try { localStorage.setItem(scanProgressKey(keyPrefix, topics, address), String(block)); } catch {}
}

// ── Blockscout indexed-log API (primary path) ──────────────────────────────
// testnet.arcscan.app is a Blockscout instance (confirmed: contract_platform
// "blockscout", contract_chain "arc-testnet") exposing an Etherscan-compatible
// REST API — a completely SEPARATE service from the rate-limited JSON-RPC
// node, pre-indexed server-side. It can answer "all logs for this
// contract+topic since block X" in ONE request, with no manual chunking and
// its own independent rate-limit budget that isn't shared with the wallet's
// RPC calls at all. This is a much better fit for "give me everything since
// block X" than hand-rolled eth_getLogs pagination against a node that
// clearly can't sustain much load (see console logs from prior debugging).
//
// Response fields are normalized defensively (camelCase/snake_case, hex/
// decimal) since the exact shape couldn't be live-verified from this
// environment (sandboxed, no outbound RPC/API access) — if a field name
// assumption is wrong, this fails fast and the caller falls back to the
// already-working paginated RPC path below, so it can only ever help, never
// regress. First real test run will confirm the response shape; adjust here
// if console logs show a mismatch.
const BLOCKSCOUT_API_BASE = `${ARC_TESTNET.explorer}/api`;

function normalizeBlockscoutLog(l) {
  const toHex = (v) => {
    if (v == null) return v;
    if (typeof v === "string" && v.startsWith("0x")) return v;
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    return Number.isFinite(n) ? "0x" + n.toString(16) : v;
  };
  return {
    ...l,
    data:   l.data && l.data.startsWith("0x") ? l.data : "0x" + (l.data || ""),
    topics: Array.isArray(l.topics) ? l.topics.map(t => (t && t.startsWith("0x")) ? t : "0x" + t) : l.topics,
    blockNumber:     toHex(l.blockNumber ?? l.block_number),
    transactionHash: l.transactionHash || l.transaction_hash || l.hash,
    logIndex:        toHex(l.logIndex ?? l.log_index ?? l.index),
  };
}

async function fetchLogsViaBlockscout(contractAddress, topics, fromBlock) {
  const params = new URLSearchParams({
    module: "logs", action: "getLogs",
    fromBlock: String(fromBlock), toBlock: "latest",
    address: contractAddress,
  });
  if (topics[0]) params.set("topic0", topics[0]);
  if (topics[1]) { params.set("topic1", topics[1]); params.set("topic0_1_opr", "and"); }

  const res = await fetch(`${BLOCKSCOUT_API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== "1") {
    // Blockscout returns status "0" + message "No records found" for a
    // legitimately empty (but successful) result — not a real error.
    if ((json.message || "").toLowerCase().includes("no records")) return [];
    throw new Error(`Blockscout: ${json.message || "unknown error"}`);
  }
  return Array.isArray(json.result) ? json.result.map(normalizeBlockscoutLog) : [];
}

// Generic paginated, rate-limit-resilient eth_getLogs fetcher.
//
// Originally built only for PrivarCloudVault, then extracted after finding
// the other two log-scanning call sites (scanStealthNotes, on-chain note
// reconciliation) each fired a SINGLE unpaginated eth_getLogs spanning up to
// 5,000,000 blocks, with no retry/backoff at all, on every connect AND every
// 2-minute poll — while this scanner was already paginated and polite, those
// two were re-scanning a huge range from scratch, repeatedly, and were the
// dominant source of the sustained RPC rate-limiting seen in console logs
// (a real log showed "on-chain latestVersion=27" succeed, then the actual
// eth_getLogs calls stall under continuous "rate limit exceeded" from all
// three subsystems firing concurrently).
//
// Two DIFFERENT failure modes need two DIFFERENT responses, and conflating
// them was an earlier bug: "rate limit exceeded" → the range was fine, we're
// just going too fast — wait, then retry the EXACT SAME window (shrinking it
// would only turn one throttled request into several more). "requested
// range too large" → the range itself was rejected — shrink the window.
//
// Deliberately does a LITTLE work per call (small window, small per-call
// chunk budget) rather than gambling on one long call: progress is saved
// after every successful chunk, so repeated calls (2-minute poll,
// reconnects) accumulate steadily and visibly instead of one call spending
// minutes retrying in silence, which looks indistinguishable from "stuck".
async function fetchLogsPaginated(contractAddress, topics, fromBlock, keyPrefix, address, label) {
  // 1) Try the Blockscout indexed API first — one request, no chunking,
  //    separate rate-limit budget from the RPC node.
  try {
    const logs = await fetchLogsViaBlockscout(contractAddress, topics, fromBlock);
    console.info(`[${label}] scan(${topics[0]?.slice(2,10)}): ${logs.length} log(s) via Blockscout API (single request, no RPC pagination needed)`);
    try {
      const headHex = await rpcCallWithBackoff("eth_blockNumber", []);
      saveScanProgress(keyPrefix, topics, address, Number(BigInt(headHex || "0x0")) + 1);
    } catch {} // progress bookkeeping only — the logs were already fetched successfully either way
    return logs;
  } catch (e) {
    console.warn(`[${label}] scan(${topics[0]?.slice(2,10)}): Blockscout API unavailable (${e.message}), falling back to paginated RPC`);
  }

  // 2) Fallback: paginated, backoff-aware eth_getLogs against the RPC node.
  const headHex = await rpcCallWithBackoff("eth_blockNumber", []);
  const head = Number(BigInt(headHex || "0x0"));
  const all = [];
  let start = Math.max(fromBlock, getScanProgress(keyPrefix, topics, address, fromBlock));
  let window = 2000;
  let rateLimitRetries = 0;
  let chunkCount = 0;
  const MAX_CHUNKS_PER_CALL = 6;

  if (start > head) { console.info(`[${label}] scan(${topics[0]?.slice(2,10)}): already caught up to head`); return all; }
  console.info(`[${label}] scan(${topics[0]?.slice(2,10)}): resuming from block ${start}, head=${head}, ${head - start} blocks remaining`);

  while (start <= head && chunkCount < MAX_CHUNKS_PER_CALL) {
    const end = Math.min(start + window - 1, head);
    try {
      const logs = await rpcCall("eth_getLogs", [{
        fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16),
        address: contractAddress, topics,
      }]);
      if (Array.isArray(logs)) all.push(...logs);
      start = end + 1;
      saveScanProgress(keyPrefix, topics, address, start);
      rateLimitRetries = 0;
      chunkCount++;
      if (start <= head) await sleep(1500); // be a good citizen — this RPC is easily overwhelmed
    } catch (e) {
      const msg = (e.message || "").toLowerCase();
      const isRateLimit = msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("request limit");
      if (isRateLimit && rateLimitRetries < 3) {
        rateLimitRetries++;
        console.info(`[${label}] scan(${topics[0]?.slice(2,10)}): rate limited, backing off (retry ${rateLimitRetries}/3)`);
        await sleep(1200 * rateLimitRetries); // backoff, same window/range — shrinking wouldn't help a rate limit
        continue;
      }
      if (window <= 200 || !isRateLimit) {
        console.warn(`[${label}] scan(${topics[0]?.slice(2,10)}): stopping this pass at block ${start} — progress saved, will resume next call:`, e.message);
        break;
      }
      window = Math.floor(window / 4) || 200; // provider actually rejected the RANGE — retry narrower
      rateLimitRetries = 0;
    }
  }
  console.info(`[${label}] scan(${topics[0]?.slice(2,10)}): pass done — ${all.length} log(s) this call, now at block ${start}${start <= head ? ` (${head - start} blocks still remaining, will continue next call)` : " (caught up)"}`);
  return all;
}

// Thin CloudVault-specific wrapper — keeps the exact call shape existing
// callers already use, and the exact progress-key prefix already persisted
// in users' browsers (privar_cloudvault_scanprogress_...) so no progress is
// lost by this refactor.
async function cloudVaultGetLogs(topics, address, fromBlock) {
  return fetchLogsPaginated(CONTRACTS.PrivarCloudVault, topics, fromBlock, "privar_cloudvault_scanprogress", address, "cloud vault resync");
}

const _resyncInFlight = new Map(); // address(lowercase) -> Promise, prevents overlapping resync runs

async function resyncFromCloudVault(address, recompute) {
  if (!address || !CONTRACTS.PrivarCloudVault) return;
  const key = address.toLowerCase();
  // If a resync for this address is already running (e.g. the connect effect
  // and the 2-minute poll fired close together), just await the existing run
  // instead of starting a second one — two concurrent runs doing their own
  // getNotes()/saveNotes() read-modify-write can race and clobber each
  // other's merge.
  if (_resyncInFlight.has(key)) return _resyncInFlight.get(key);
  const p = _resyncFromCloudVaultImpl(address, recompute).finally(() => _resyncInFlight.delete(key));
  _resyncInFlight.set(key, p);
  return p;
}

async function _resyncFromCloudVaultImpl(address, recompute) {
  try {
    await ensureSelfBackupKeyReady(address);

    const [latestVerHex, lastCkBlockHex] = await Promise.all([
      rpcCallWithBackoff("eth_call", [{ to: CONTRACTS.PrivarCloudVault, data: buildCvLatestVersionCall(address) }, "latest"]),
      rpcCallWithBackoff("eth_call", [{ to: CONTRACTS.PrivarCloudVault, data: buildCvLastCheckpointBlockCall(address) }, "latest"]),
    ]);
    const latestVer = decodeUint64Return(latestVerHex);
    console.info(`[cloud vault resync] ${address}: on-chain latestVersion=${latestVer}`);
    if (latestVer === 0) return; // nothing ever pushed for this address

    const fromBlock = Math.max(decodeUint64Return(lastCkBlockHex), CLOUD_VAULT_GENESIS_BLOCK); // 0 if no checkpoint has ever been pushed
    const ownerTopic = "0x" + "0".repeat(24) + address.toLowerCase().slice(2);

    // 1. Most recent checkpoint at/after fromBlock, if any
    let state = new Map();
    let syncedVersion = 0;
    if (fromBlock > 0) {
      const ckLogs = await cloudVaultGetLogs([NOTE_CHECKPOINT_TOPIC, ownerTopic], address, fromBlock);
      if (ckLogs.length > 0) {
        const latestLog = ckLogs[ckLogs.length - 1];
        const encHex = decodeCheckpointLogSnapshot(latestLog);
        const snap = encHex ? await decryptJournalBlob(address, encHex) : null;
        if (snap && Array.isArray(snap.notes)) {
          for (const n of snap.notes) if (n?.commitment) state.set(n.commitment, n);
          syncedVersion = decodeUint64Return(latestLog.topics?.[2]);
        }
      }
    }

    // 2. Replay every delta after the checkpoint (or from genesis if none).
    // `spentCommitments` tracks ONLY commitments we saw an explicit SPEND op
    // for — kept separate from "not present in `state`" on purpose (see fix
    // below).
    const deltaLogs = await cloudVaultGetLogs([NOTE_DELTA_TOPIC, ownerTopic], address, fromBlock);
    console.info(`[cloud vault resync] ${address}: found ${deltaLogs.length} NoteDelta event(s) from block ${fromBlock}`);
    let decrypted = 0, failed = 0;
    const spentCommitments = new Set();
    {
      const sorted = deltaLogs
        .map(log => ({ log, version: decodeUint64Return(log.topics?.[2]) }))
        .filter(x => x.version > syncedVersion)
        .sort((a, b) => a.version - b.version);
      for (const { log } of sorted) {
        // Event data for a single dynamic `bytes` param has EXACTLY the same
        // [offset][length][data] shape as an eth_call bytes return — reuse.
        const raw = decodeBytesReturn(log.data);
        if (!raw) { failed++; continue; }
        const entry = await decryptJournalBlob(address, raw);
        if (!entry?.ops) { failed++; continue; }
        decrypted++;
        for (const op of entry.ops) {
          if (op.t === 0 && op.commitment) { state.set(op.commitment, { commitment: op.commitment, amount: op.amount, token: op.token, ts: entry.ts }); spentCommitments.delete(op.commitment); }
          else if (op.t === 1 && op.commitment) { state.delete(op.commitment); spentCommitments.add(op.commitment); }
        }
      }
    }
    console.info(`[cloud vault resync] ${address}: decrypted ${decrypted}, failed to decrypt ${failed} (wrong/missing key or corrupt), active notes after replay: ${state.size}`);

    // 3. Merge into local notes.
    //
    // REGRESSION FIX: this used to drop any local note flagged cloudSynced
    // whose commitment wasn't in this pass's `state` (the ADD-derived active
    // set). That's wrong — "absent from `state`" only means "no ADD event
    // observed [YET] in this query", not "confirmed spent". If a device just
    // pushed a delta and this resync runs before the RPC has finished
    // indexing that event (or before the next poll re-reads it), the note
    // would get silently pruned from local storage seconds after being
    // created — even on the SAME device that just shielded it. That's
    // exactly the "history shows the shield but the shielded balance stays
    // 0.00" regression.
    //
    // Fix: only remove a local note when we have POSITIVE evidence it was
    // spent (an explicit SPEND op decrypted from a delta) — never merely
    // because it's missing from this pass's reconstructed active set.
    const local = getNotes(address);
    const merged = local.filter(n => !n.commitment || !spentCommitments.has(n.commitment));
    const quarantined = loadQuarantinedCommitments(address);
    let added = 0;
    for (const [commitment, n] of state) {
      if (quarantined.has(commitment.toLowerCase())) continue; // don't resurrect a deliberately-quarantined note
      if (!merged.some(x => x.commitment === commitment)) {
        merged.push({ ...n, cloudSynced: true, source: "cloudvault" });
        added++;
      }
    }
    if (added > 0 || merged.length !== local.length) {
      saveNotes(address, merged);
      recompute?.();
    }
  } catch (e) { console.warn("[cloud vault resync]", e.message); }
}

// ── v3.4 — resync from PrivarShieldVault's own NoteJournal events ─────────
// Sibling to resyncFromCloudVault(), same journal format (ops array,
// AES-256-GCM, personal_sign-derived key — decryptJournalBlob is shared),
// same conservative merge (only ever remove a note on positive SPEND
// evidence). Different transport: since v3.4, deposit()/withdraw()/
// shieldedSend()/privateSwap*() embed the journal entry directly in the
// SAME transaction as the operation itself via NoteJournal(owner, entry) —
// see PrivarShieldVault.sol's doc comment — so this is now the PRIMARY
// source for new activity. PrivarCloudVault (resyncFromCloudVault above)
// stays in place for backward compatibility with journal entries pushed
// before this upgrade, and as a manual backfill path (Settings → Sync Notes
// to Cloud) for any note that still predates NoteJournal. No checkpoint
// concept here (unlike CloudVault) — ShieldVault has no pushCheckpoint
// equivalent, every entry is a plain incremental delta.
const NOTE_JOURNAL_TOPIC = "0x7165dc7fc38d2a514b779acd1810fb57b3569ba2f4ddf0b31d35d6d711747d0f";
const _shieldVaultJournalInFlight = new Map();

async function resyncFromShieldVaultJournal(address, recompute) {
  if (!address || !CONTRACTS.PrivarShieldVault) return;
  const key = address.toLowerCase();
  if (_shieldVaultJournalInFlight.has(key)) return _shieldVaultJournalInFlight.get(key);
  const p = _resyncFromShieldVaultJournalImpl(address, recompute).finally(() => _shieldVaultJournalInFlight.delete(key));
  _shieldVaultJournalInFlight.set(key, p);
  return p;
}

async function _resyncFromShieldVaultJournalImpl(address, recompute) {
  try {
    await ensureSelfBackupKeyReady(address);
    const ownerTopic = "0x" + "0".repeat(24) + address.toLowerCase().slice(2);
    const logs = await fetchLogsPaginated(
      CONTRACTS.PrivarShieldVault, [NOTE_JOURNAL_TOPIC, ownerTopic],
      SHIELD_VAULT_JOURNAL_GENESIS_BLOCK, "privar_shieldvault_journal_scanprogress", address, "shield vault journal resync"
    );
    if (!Array.isArray(logs) || logs.length === 0) return;

    const spentCommitments = new Set();
    const state = new Map();
    let decrypted = 0, failed = 0;
    for (const log of logs) {
      const raw = decodeBytesReturn(log.data);
      if (!raw) { failed++; continue; }
      const entry = await decryptJournalBlob(address, raw);
      if (!entry?.ops) { failed++; continue; }
      decrypted++;
      for (const op of entry.ops) {
        if (op.t === 0 && op.commitment) { state.set(op.commitment, { commitment: op.commitment, amount: op.amount, token: op.token, ts: entry.ts }); spentCommitments.delete(op.commitment); }
        else if (op.t === 1 && op.commitment) { state.delete(op.commitment); spentCommitments.add(op.commitment); }
      }
    }
    console.info(`[shield vault journal resync] ${address}: ${logs.length} event(s), decrypted ${decrypted}, failed ${failed}`);

    // Same conservative merge as resyncFromCloudVault — only remove on positive SPEND evidence.
    const local = getNotes(address);
    const merged = local.filter(n => !n.commitment || !spentCommitments.has(n.commitment));
    const quarantined = loadQuarantinedCommitments(address);
    let added = 0;
    for (const [commitment, n] of state) {
      if (quarantined.has(commitment.toLowerCase())) continue; // don't resurrect a deliberately-quarantined note
      if (!merged.some(x => x.commitment === commitment)) {
        merged.push({ ...n, cloudSynced: true, source: "shieldvault-journal" });
        added++;
      }
    }
    if (added > 0 || merged.length !== local.length) {
      saveNotes(address, merged);
      recompute?.();
    }
  } catch (e) { console.warn("[shield vault journal resync]", e.message); }
}

// ── Scan chain for stealth notes addressed to this wallet ─────────────────
// Relayed via ViewKeyRegistry.emitNote() — NOT PrivarShieldVault — so this works
// against the currently-deployed PrivarShieldVault v2.2 with no vault redeploy.
const NOTE_EMITTED_TOPIC = "0x8aa4f1b6dca845fb984ab9e095ea9417a69f44be2922e9b5cc5e19f83e336851";

async function scanStealthNotes(address, recompute) {
  if (!address || !CONTRACTS.ViewKeyRegistry) return;
  try {
    const cur = Number(BigInt(await rpcCallWithBackoff("eth_blockNumber", [])));
    const recipientTopic = "0x" + "0".repeat(24) + address.toLowerCase().slice(2);
    // Was previously a single unpaginated eth_getLogs spanning up to
    // 5,000,000 blocks with no retry — fired fresh from scratch on every
    // connect AND every 2-minute poll. That's a huge, un-throttled request
    // hitting the same rate-limited RPC that PrivarCloudVault's resync also
    // depends on, and was almost certainly the dominant source of the
    // sustained "rate limit exceeded" errors seen in production logs. Now
    // uses the same paginated, backoff-aware, progress-persisting fetcher.
    const logs = await fetchLogsPaginated(
      CONTRACTS.ViewKeyRegistry, [NOTE_EMITTED_TOPIC, recipientTopic],
      Math.max(0, cur - 5_000_000), "privar_stealthscan_scanprogress", address, "Privar stealth scan"
    );
    if (!Array.isArray(logs) || logs.length === 0) return;

    const existing  = getNotes(address);
    const existingSet = new Set(existing.map(n => n.commitment).filter(Boolean));
    const quarantined = loadQuarantinedCommitments(address);
    let added = 0;

    for (const log of logs) {
      try {
        // data = abi.encode(bytes encryptedNote, bytes ephemeralPubKey, uint256 timestamp)
        const data = (log.data || "").replace("0x","");
        if (data.length < 192) continue;

        const offset1 = parseInt(data.slice(0, 64), 16);     // byte offset to encryptedNote
        const offset2 = parseInt(data.slice(64, 128), 16);   // byte offset to ephemeralPubKey
        const ts      = parseInt(data.slice(128, 192), 16);  // timestamp

        const len1   = parseInt(data.slice(offset1*2, offset1*2+64), 16);
        const encHex = "0x" + data.slice(offset1*2+64, offset1*2+64+len1*2);

        const len2   = parseInt(data.slice(offset2*2, offset2*2+64), 16);
        const ephHex = "0x" + data.slice(offset2*2+64, offset2*2+64+len2*2);

        if (!encHex || !ephHex) continue;

        const note = await eciesDecryptNoteWithViewKey(address, encHex, ephHex);
        if (!note || !note.commitment) continue;
        if (existingSet.has(note.commitment)) continue;
        if (quarantined.has(note.commitment.toLowerCase())) continue; // don't resurrect a deliberately-quarantined note
        // FIX (v2.9): a note's commitment only exists in the Merkle tree of the
        // PrivarShieldVault it was created against. Without this check, a confidential
        // send or self-backup made before the latest PrivarShieldVault redeploy would
        // still decrypt successfully and get silently treated as spendable balance
        // on the NEW (unrelated) contract — re-introducing the "phantom balance"
        // bug that vault-scoping notesKey already fixes for deposit/withdraw/swap/
        // bridge notes. Notes without a `vault` tag (sent before this fix shipped)
        // are accepted leniently rather than hidden outright — the vault-scoped
        // notesKey is the primary defense; this only closes the narrower stealth-
        // note path where ViewKeyRegistry events aren't vault-filtered upstream.
        if (note.vault && note.vault.toLowerCase() !== CONTRACTS.PrivarShieldVault.toLowerCase()) continue;

        existing.push({ ...note, ts: ts*1000 || Date.now(), source:"stealth" });
        existingSet.add(note.commitment);
        added++;
      } catch {}
    }

    if (added > 0) {
      saveNotes(address, existing);
      recompute?.();
    }
  } catch(e) { console.warn("[Privar stealth scan]", e.message); }
}

// ── SHIELDED NOTES — wallet-scoped AND PrivarShieldVault-scoped, on-chain reconciled ─
//
// FIX (critical): notes used to be keyed ONLY by wallet address. After a
// PrivarShieldVault redeploy (new address, fresh empty Merkle tree), the frontend kept
// reading the SAME localStorage bucket and displaying the SAME balance — even
// though those notes' commitments don't exist anywhere in the new contract's
// tree at all. The displayed "shielded balance" was showing money the user
// could never actually spend (any withdraw/send/swap against those commitments
// would simply revert on-chain). The underlying tokens are still safe — they
// never moved, they're just sitting in the OLD, now-abandoned PrivarShieldVault
// contract — but the active UI had no way to reach them anymore.
//
// Now the storage key includes CONTRACTS.PrivarShieldVault, so a redeploy
// automatically and correctly resets the displayed balance to 0 (a fresh,
// empty bucket for the new address) without deleting the old data — it's
// still sitting under the OLD key if ever needed for manual recovery via the
// old contract address directly.
const notesKey  = (addr) => addr ? `privar_notes_${addr.toLowerCase()}_${CONTRACTS.PrivarShieldVault.toLowerCase()}` : "privar_notes_anon";
const getNotes  = (addr) => { try { return JSON.parse(localStorage.getItem(notesKey(addr)) || "[]"); } catch { return []; } };
const saveNotes = (addr, notes) => { try { localStorage.setItem(notesKey(addr), JSON.stringify(notes)); } catch {} };

// ═══════════════════════════════════════════════════════════════════════
// PENDING OPS LEDGER — robust note lifecycle for swap / send / withdraw / bridge
// ═══════════════════════════════════════════════════════════════════════
// AUDIT FINDING (2026-08): reconcileAndVerifyNotes() below prunes "spent"
// notes by matching n.nullifier against on-chain Withdrawn events. But NO
// code path anywhere ever writes a `nullifier` field onto a saved note —
// the nullifier used to spend a note is generated fresh (randomBytes32())
// at the moment of the spend and never persisted back onto the note object,
// before or after. So that matching branch can never fire, for ANY
// operation (swap/send/withdraw/bridge alike): there is no on-chain data
// that lets you map "this nullifier was spent" back to "this local
// commitment" after the fact — the mock ZK verifier here doesn't enforce
// (or expose) a deterministic commitment↔nullifier relationship either.
//
// The only place that link can ever be captured is HERE, the instant a
// spend is initiated — BEFORE the transaction is sent. That's what this
// ledger does, and it's what actually implements "point 1" (detect
// swap/send/bridge spends, not just explicit withdraw()) — scanning more
// on-chain events alone cannot do it, given the above.
//
// Every note-consuming operation MUST, in order:
//   1. lockNotesForOp()  — synchronously, before building/sending the tx.
//                          Freezes the exact input commitments as "locked"
//                          (excluded from note selection) and records the
//                          op (status CREATED) together with the outputs
//                          it will create on success. This read-modify-
//                          write always uses a FRESH getNotes() taken right
//                          before the write — never a snapshot captured
//                          before earlier async work — which is the fix
//                          for "point 2" (the stale read-modify-write race
//                          in swap()/sendShielded()/withdraw()/bridge()).
//                          Returns null if the race was lost (a targeted
//                          commitment is already gone/locked) so the
//                          caller can abort cleanly instead of sending a
//                          transaction doomed to revert.
//   2. onHash callback   — sendRealTx() calls this the instant a txHash
//                          exists, via markOpSubmitted(). From that point
//                          the op survives a closed tab / dropped
//                          connection / RPC timeout.
//   3. finalizeOp()      — once the outcome is known: SUCCESS creates the
//                          real output notes and drops the inputs; REVERTED
//                          / ABANDONED restores the inputs to AVAILABLE;
//                          "unknown" is a deliberate no-op — notes are
//                          NEVER guessed at ("point 3" — pending ≠ success,
//                          pending ≠ failure). Idempotent (guarded by
//                          op.finalized), so it's always safe to call from
//                          both the panel itself and the background watcher.
const pendingOpsKey = (addr) => addr ? `privar_pending_ops_${addr.toLowerCase()}_${CONTRACTS.PrivarShieldVault.toLowerCase()}` : "privar_pending_ops_anon";
const getPendingOps  = (addr) => { try { return JSON.parse(localStorage.getItem(pendingOpsKey(addr)) || "[]"); } catch { return []; } };
const savePendingOps = (addr, ops) => { try { localStorage.setItem(pendingOpsKey(addr), JSON.stringify(ops)); } catch {} };

// How long an op may sit with no txHash at all (sendTransaction() itself
// never returned — rejected in the wallet, or an error before broadcast)
// before the watcher gives up and restores its inputs. Generous on
// purpose — this only ever fires for a tx that provably never reached
// the mempool, never for one that's merely slow to confirm.
const OP_ABANDON_MS = 3 * 60 * 1000; // 3 min

function newOpId() {
  return "op_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

// Step 1 — lock inputs + record the op. See module doc comment above.
function lockNotesForOp(address, { kind, label, inputCommitments, outputs }) {
  const notes = getNotes(address); // fresh read, right before the write
  const byCommitment = new Map(notes.map(n => [n.commitment, n]));
  for (const c of inputCommitments) {
    const n = byCommitment.get(c);
    if (!n || n.status === "locked") return null; // lost the race — abort, don't send a doomed tx
  }
  const opId = newOpId();
  const inputSet = new Set(inputCommitments);
  const nextNotes = notes.map(n => inputSet.has(n.commitment) ? { ...n, status: "locked", lockedByOp: opId } : n);
  saveNotes(address, nextNotes);

  const ops = getPendingOps(address);
  ops.push({
    opId, kind, label,
    inputCommitments,
    outputs,             // [{commitment, amount, token, ...}] to create on SUCCESS (incl. any change note)
    txHash: null,
    status: "created",   // created -> submitted -> (success|reverted|abandoned), then finalized:true
    finalized: false,
    createdAt: Date.now(),
  });
  savePendingOps(address, ops);
  return opId;
}

// Step 2 — called from sendRealTx's onHash the instant the tx is broadcast.
function markOpSubmitted(address, opId, txHash) {
  const ops = getPendingOps(address);
  const idx = ops.findIndex(o => o.opId === opId);
  if (idx === -1) return;
  ops[idx] = { ...ops[idx], txHash, status: "submitted" };
  savePendingOps(address, ops);
}

// Step 2.5 (optional) — called from sendRealTx's onReceipt once the tx is
// confirmed, BEFORE finalizeOp() persists the op's outputs as real notes.
// Overwrites one predicted output's amount with the value actually decoded
// from the matching on-chain Deposited log (see
// decodeDepositedAmountForCommitment) — the whole point being that
// finalizeOp() never has to trust a pre-tx client estimate for what gets
// written to storage. Silently a no-op if the op/commitment isn't found
// (e.g. already finalized by a background watcher) — reconciliation is
// best-effort, never a hard requirement for the op to complete.
function correctOpOutputAmount(address, opId, commitment, newAmount) {
  const ops = getPendingOps(address);
  const idx = ops.findIndex(o => o.opId === opId);
  if (idx === -1 || ops[idx].finalized) return;
  const outputs = (ops[idx].outputs || []).map(o =>
    o.commitment === commitment ? { ...o, amount: newAmount.toString() } : o
  );
  ops[idx] = { ...ops[idx], outputs };
  savePendingOps(address, ops);
}

// Step 3 — resolve an op. outcome: "success" | "reverted" | "abandoned" | "unknown".
// "unknown" is intentionally a no-op — see module doc comment (invariant:
// PENDING ≠ SUCCESS, PENDING ≠ FAILURE — never modify notes on an
// unresolved outcome). Idempotent via the `finalized` guard.
function finalizeOp(address, opId, outcome) {
  if (outcome === "unknown") return;
  const ops = getPendingOps(address);
  const idx = ops.findIndex(o => o.opId === opId);
  if (idx === -1 || ops[idx].finalized) return;
  const op = ops[idx];

  const notes = getNotes(address); // fresh read at finalize time too
  let nextNotes;
  if (outcome === "success") {
    const inputSet = new Set(op.inputCommitments);
    const existing = new Set(notes.map(n => n.commitment));
    nextNotes = notes.filter(n => !inputSet.has(n.commitment));
    for (const out of op.outputs || []) {
      // Outputs default to spendable ("available"); a caller can override
      // (e.g. sendShielded()'s sender-side history copy of the note it just
      // gave away — real ownership transferred to the recipient, so THAT
      // copy must stay non-spendable, not "available").
      // `origin: op.kind` ("swap"/"send"/"bridge") records that this note
      // was NOT created via ShieldPanel's deposit() flow — it has no
      // corresponding Deposited event of its own (it's a change/output
      // commitment embedded in this op's own NoteJournal entry instead).
      // reconcileAndVerifyNotes() below relies on this to avoid wrongly
      // quarantining a legitimate swap/send/bridge-created note just
      // because it never had — and never will have — a matching Deposited
      // event on-chain.
      if (!existing.has(out.commitment)) nextNotes.push({ ...out, ts: out.ts || Date.now(), status: out.status || "available", origin: out.origin || op.kind });
    }
  } else {
    // reverted / abandoned — on-chain state never changed for this op's
    // inputs (a revert rolls back the nullifier spend in the SAME atomic
    // tx — see PrivarShieldVault.sol's _privateSwap/_privateSend/withdraw),
    // so restoring to AVAILABLE is always correct here, never a guess.
    nextNotes = notes.map(n => n.lockedByOp === opId ? { ...n, status: "available", lockedByOp: undefined } : n);
  }
  saveNotes(address, nextNotes);

  ops[idx] = { ...op, status: outcome, finalized: true };
  savePendingOps(address, ops);
}

// Best-effort single receipt check — status=1 -> success, present but
// status!=1 -> reverted, no receipt / RPC error -> unknown (never guess).
// Used both inline (right after sendRealTx() returns false, to tell a
// confirmed revert apart from a genuinely unresolved tx) and by the
// background watcher below.
async function checkReceiptOutcome(txHash) {
  try {
    const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
    if (!receipt) return "unknown";
    return Number(receipt.status) === 1 ? "success" : "reverted";
  } catch { return "unknown"; }
}

// Background watcher — resolves any op left dangling by a closed tab, a
// dropped connection, or the 60s waitForReceipt() ceiling in sendRealTx()
// being hit while the tx was actually still mining. Safe to call
// repeatedly/concurrently — finalizeOp() is idempotent. Wired into the
// same periodic pass as reconcileAndVerifyNotes (see useShieldedBalances).
async function watchPendingOps(address) {
  if (!address) return { resolved: 0 };
  const open = getPendingOps(address).filter(o => !o.finalized);
  if (open.length === 0) return { resolved: 0 };

  let resolved = 0;
  for (const op of open) {
    if (!op.txHash) {
      // Never reached the mempool — nothing can confirm later. Only give
      // up after a grace period, in case markOpSubmitted() is just about
      // to land from a still-in-flight sendTransaction() call.
      if (Date.now() - op.createdAt > OP_ABANDON_MS) {
        finalizeOp(address, op.opId, "abandoned");
        resolved++;
      }
      continue;
    }
    const outcome = await checkReceiptOutcome(op.txHash);
    if (outcome !== "unknown") {
      finalizeOp(address, op.opId, outcome);
      resolved++;
    }
    // outcome === "unknown" -> still genuinely pending, or RPC hiccup —
    // leave it locked, try again on the next pass. Never force a guess.
  }
  return { resolved };
}

// Same vault-scoping fix as notesKey above, applied to tx history. Without
// this, a vault redeploy left the OLD vault's transactions (including any
// leftover corrupted/implausible amounts from a prior bug generation)
// permanently stuck in this cache forever — they don't match any hash in
// the NEW vault's on-chain events, so the "keep local-only entries" merge
// logic in the tx-history-loading effect kept re-adding and re-persisting
// them on every single page load, indefinitely, with no way to age out.
const txHistoryKey = (addr) => addr ? `privar_txhistory_${addr.toLowerCase()}_${CONTRACTS.PrivarShieldVault.toLowerCase()}` : null;
// A local-only entry (no on-chain match yet) is only trusted for this long
// after being recorded — past that, it's treated as genuinely stale (from
// a retired vault, a dropped/replaced tx, etc.) rather than "just not
// indexed yet", and is dropped instead of being kept and re-persisted forever.
const TX_HISTORY_LOCAL_GRACE_MS = 10 * 60 * 1000; // 10 min

// ── Migration / manual resync: push THIS device's local-only notes to the
// cloud backup, for notes created before the self-backup-key fix shipped
// (or where the backup tx silently failed at the time). Run this on the
// ORIGINAL device where the note is still visible locally — e.g. reconnect
// on the phone that did the original Shield, tap "Sync notes to cloud" once,
// then any other device (PC, another browser) auto-recovers it on connect.
// One on-chain tx per un-synced note; sequential so wallets don't choke on
// concurrent signature requests. Returns { synced, failed, total }.
async function resyncLocalNotesToCloud(account, sendRealTx, onProgress) {
  const address = account?.address;
  if (!address) return { synced: 0, failed: 0, total: 0 };

  await ensureSelfBackupKeyReady(address);

  const notes = getNotes(address);
  const pending = notes.filter(n => n.commitment && !n.cloudSynced);
  let synced = 0, failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const n = pending[i];
    onProgress?.(i + 1, pending.length + getPendingSpends(address).length);
    const ok = await relaySelfNote({
      account, sendRealTx,
      commitment: n.commitment, amount: BigInt(n.amount || 0), token: n.token,
      label: "Cloud Sync — backfill",
      description: "Backing up an existing shielded note so it's recoverable on other devices.",
    }).catch(() => false);
    if (ok) { n.cloudSynced = true; synced++; } else { failed++; }
  }
  saveNotes(address, notes);

  // Also retry any SPEND broadcasts that never made it through — otherwise
  // a note already spent on THIS device stays "active" forever on any
  // device that never received that SPEND delta (permanent phantom
  // balance, no self-correction). See "Pending SPEND broadcast queue" above.
  const spendResult = await retryPendingSpends(account, sendRealTx);

  return {
    synced: synced + spendResult.synced,
    failed: failed + spendResult.failed,
    total: pending.length + spendResult.total,
  };
}


// Event topic0 hashes (keccak256 of event signature)
const EV = {
  Deposited:                "0xe758dd586554a30e85101e8e9ab611091d9230b7233f0f6a9736488e55d9d9e7",
  Withdrawn:                "0xa6786aab7dbbc48b4b0387488b407bd81448030ab207b50bea7dbb5fbc1cd9eb",
  SwapExecuted:             "0x2f4c76c8d18f45069b0941499205a7fceaaa3caf9e2e6328f6a544cd339120f3",
  BridgeInitiated:          "0xaba39d71efa30c57b34ac80bfd1c5a6ad2a46bb6887c1bdb8d8500410c59b5ab",
  ShieldedTransferProcessed:"0x6a0c61ef664f8d0c17a5bee04becc9ed40374fc0f473a7bf7f3cce66d1bd2b7d",
  // PrivarStaking contract events — keccak256("Staked(address,uint256,uint256,uint256,uint256,uint256)") etc.
  Staked:           "0x1449c6dd7851abc30abf37f57715f492010519147cc2652fbc38202c18a6ee90",
  Unstaked:         "0x0f5bb82176feb1b5e747e28471aa92156a04d9f3ab9f45f28e2d704232b93f75",
  RewardsClaimed:   "0x106f923f993c2149d49b4255ff723acafa1f2d94393f561d3eda32ae348f7241",
};

// ── Token decimals/symbol — single source of truth for tx-history formatting ──
// AUDIT FINDING (2026-08): buildTxHistoryFromChain() below used to do
// `Number(amount)/1e6` unconditionally for every event type. That's wrong for
// native USDC read from PrivarShieldVault events specifically: deposit()
// enforces `msg.value == amount` (see PrivarShieldVault.sol), so `amount` —
// and therefore whatever Deposited/Withdrawn/PrivateSwap/etc. emit — is in
// 18-dec wei, matching NATIVE_TO_ERC20 (1e12) used everywhere else amounts
// are sent TO the vault (buildDepositCalldata et al.). Dividing that by 1e6
// instead of 1e18 inflated every native-USDC shield/withdraw amount in the
// history panel by exactly 1e12 — purely a display bug, the real shielded
// balance (useShieldedBalances) and the actual on-chain transfer were never
// affected.
//
// IMPORTANT NUANCE: this 18-dec scaling is specific to PrivarShieldVault's
// OWN internal accounting for native USDC. PrivarStaking is a separate
// contract that holds/transfers native USDC through a plain ERC20
// approve()/safeTransferFrom() interface at its real 6 decimals (see
// stake()'s `amtWei = stakeAmt * 1e6`, unchanged by this fix) — its
// Staked/Unstaked/RewardsClaimed amounts were ALREADY correct at /1e6 and
// must stay that way. That's what the `nativeScaled` flag below is for:
// true (default) for ShieldVault-native-USDC amounts, false for
// PrivarStaking amounts — getting this backwards would "fix" one bug by
// introducing a 1e12 UNDER-count in staking history instead.
function decimalsForToken(tokenAddr, { nativeScaled = true } = {}) {
  const t = tokenAddr?.toLowerCase?.();
  if (t === CONTRACTS.EURC?.toLowerCase())   return 6;
  if (t === CONTRACTS.cirBTC?.toLowerCase()) return 8;
  if (t === NATIVE_USDC.toLowerCase())       return nativeScaled ? 18 : 6;
  return 6; // sane fallback for an unrecognized/zero token address
}
function symbolForToken(tokenAddr) {
  const t = tokenAddr?.toLowerCase?.();
  if (t === CONTRACTS.EURC?.toLowerCase())   return "EURC";
  if (t === CONTRACTS.cirBTC?.toLowerCase()) return "cirBTC";
  return "USDC";
}

// ── Cross-device tx history: rebuild from on-chain events ─────────────────────
// Called on wallet connect. Fetches PrivarShieldVault + PrivarStaking events for this address,
// merges with localStorage cache, deduplicates by tx hash, returns sorted array.
async function buildTxHistoryFromChain(address) {
  if (!address) return [];
  const MAX_BLOCKS = 5_000_000;
  try {
    const cur = Number(BigInt(await rpcCallWithBackoff("eth_blockNumber", [])));
    const from = Math.max(0, cur - MAX_BLOCKS);
    const addrTopic = "0x" + "000000000000000000000000" + address.slice(2).toLowerCase();

    // Fetch all PrivarShieldVault + PrivarStaking events where the user is an
    // indexed topic. Was previously 8 unpaginated eth_getLogs fired all at
    // once via Promise.allSettled, each spanning up to 5,000,000 blocks — a
    // major contributor to the RPC rate-limiting that was also blocking
    // PrivarCloudVault's resync. Now paginated (same backoff-aware fetcher)
    // and run SEQUENTIALLY rather than in parallel, since this call is
    // fire-and-forget (`.then(...)`, not awaited by the render path) and tx
    // history isn't time-critical the way the shielded balance is — it's
    // fine for this to populate gradually over a few connects/polls instead
    // of contending with CloudVault/stealth-scan for the same RPC budget.
    const sv = CONTRACTS.PrivarShieldVault, st = CONTRACTS.PrivarStaking;
    const depLogs      = await fetchLogsPaginated(sv, [EV.Deposited, null, addrTopic], from, "privar_txhist_dep", address, "Privar tx-history");
    const wdLogs        = await fetchLogsPaginated(sv, [EV.Withdrawn, null, null, addrTopic], from, "privar_txhist_wd", address, "Privar tx-history");
    const swLogs         = await fetchLogsPaginated(sv, [EV.SwapExecuted], from, "privar_txhist_sw", address, "Privar tx-history");
    const bridgeLogs   = await fetchLogsPaginated(sv, [EV.BridgeInitiated], from, "privar_txhist_br", address, "Privar tx-history");
    const sendLogs     = await fetchLogsPaginated(sv, [EV.ShieldedTransferProcessed], from, "privar_txhist_st", address, "Privar tx-history");
    const stakeLogs     = st ? await fetchLogsPaginated(st, [EV.Staked, addrTopic], from, "privar_txhist_stk", address, "Privar tx-history") : [];
    const unstakeLogs   = st ? await fetchLogsPaginated(st, [EV.Unstaked, addrTopic], from, "privar_txhist_unstk", address, "Privar tx-history") : [];
    const claimLogs     = st ? await fetchLogsPaginated(st, [EV.RewardsClaimed, addrTopic], from, "privar_txhist_clm", address, "Privar tx-history") : [];

    const tc = (tsMs) => tsMs ? new Date(tsMs).toLocaleString("fr-FR", { dateStyle:"short", timeStyle:"short" }) : "—";

    // FIX: every entry used to be stamped with tc(Date.now()) — the moment
    // the query ran, NOT the transaction's real on-chain date. A shield from
    // days ago and one from 5 seconds ago both displayed "now". Real dates
    // require looking up each log's block timestamp — eth_getLogs doesn't
    // include it, only blockNumber, so batch-fetch eth_getBlockByNumber for
    // every DISTINCT block referenced across all 8 event types (small
    // concurrency to stay RPC-friendly, matches this function's existing
    // "fire-and-forget, not time-critical" posture).
    const allLogs = [...depLogs, ...wdLogs, ...swLogs, ...bridgeLogs, ...sendLogs, ...stakeLogs, ...unstakeLogs, ...claimLogs];
    const uniqueBlocks = [...new Set(allLogs.map(l => l.blockNumber).filter(Boolean))];
    const blockTsMap = new Map();
    const BLOCK_TS_CONCURRENCY = 5;
    for (let i = 0; i < uniqueBlocks.length; i += BLOCK_TS_CONCURRENCY) {
      const batch = uniqueBlocks.slice(i, i + BLOCK_TS_CONCURRENCY);
      const results = await Promise.all(batch.map(async (bn) => {
        try {
          const block = await rpcCallWithBackoff("eth_getBlockByNumber", [bn, false]);
          return [bn, block?.timestamp ? Number(BigInt(block.timestamp)) * 1000 : null];
        } catch { return [bn, null]; }
      }));
      for (const [bn, ts] of results) if (ts) blockTsMap.set(bn, ts);
    }
    const tsFor = (log) => blockTsMap.get(log.blockNumber) || null;

    const entries = [];

    // Helper to extract uint256 from 32-byte hex chunk
    const u256 = (hex, offset=0) => { try { return BigInt("0x" + hex.slice(offset*64, offset*64+64)); } catch { return 0n; } };

    for (const log of depLogs) {
      const data = (log.data||"0x").replace("0x","");
      const amount = data.length >= 64 ? u256(data,0) : 0n;
      const tok = log.topics?.[2] ? "0x"+log.topics[2].slice(26) : "";
      const sym = symbolForToken(tok);
      entries.push({ hash:log.transactionHash, label:"Shield", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount: formatToken(amount, decimalsForToken(tok), 2)+" "+sym, blockHex:log.blockNumber });
    }
    for (const log of wdLogs) {
      const data = (log.data||"0x").replace("0x","");
      const amount = data.length >= 64 ? u256(data,0) : 0n;
      // FIX: this used to hardcode "USDC" regardless of the actual token —
      // Withdrawn's token IS an indexed topic (topics[2]), same field
      // depLogs above already reads correctly; a withdraw of EURC/cirBTC
      // was mislabeled as USDC.
      const tok = log.topics?.[2] ? "0x"+log.topics[2].slice(26) : "";
      const sym = symbolForToken(tok);
      entries.push({ hash:log.transactionHash, label:"Withdraw", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:formatToken(amount, decimalsForToken(tok), 2)+" "+sym, blockHex:log.blockNumber });
    }
    for (const log of swLogs) {
      entries.push({ hash:log.transactionHash, label:"Swap", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:"—", blockHex:log.blockNumber });
    }
    for (const log of bridgeLogs) {
      const data = (log.data||"0x").replace("0x","");
      const amount = data.length >= 64 ? u256(data,0) : 0n;
      // FIX: this used to hardcode " EURC" regardless of the actual bridged
      // token (and, like depLogs, divide by 1e6 even for native USDC).
      const tok = log.topics?.[2] ? "0x"+log.topics[2].slice(26) : "";
      const sym = symbolForToken(tok);
      entries.push({ hash:log.transactionHash, label:"Bridge", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:formatToken(amount, decimalsForToken(tok), 2)+" "+sym, blockHex:log.blockNumber });
    }
    for (const log of sendLogs) {
      entries.push({ hash:log.transactionHash, label:"Send", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:"—", blockHex:log.blockNumber });
    }
    for (const log of stakeLogs) {
      const data = (log.data||"0x").replace("0x","");
      const amount = data.length >= 64 ? u256(data,0) : 0n;
      // PrivarStaking holds native USDC via plain ERC20 transferFrom at its
      // real 6 decimals — NOT the ShieldVault's 18-dec internal scaling.
      // nativeScaled:false keeps this at the already-correct /1e6 behavior.
      entries.push({ hash:log.transactionHash, label:"Stake", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:formatToken(amount, decimalsForToken(NATIVE_USDC, { nativeScaled:false }), 2)+" USDC", blockHex:log.blockNumber });
    }
    for (const log of unstakeLogs) {
      const data = (log.data||"0x").replace("0x","");
      const amount = data.length >= 64 ? u256(data,0) : 0n;
      entries.push({ hash:log.transactionHash, label:"Unstake", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:formatToken(amount, decimalsForToken(NATIVE_USDC, { nativeScaled:false }), 2)+" USDC", blockHex:log.blockNumber });
    }
    for (const log of claimLogs) {
      const data = (log.data||"0x").replace("0x","");
      const amount = data.length >= 64 ? u256(data,0) : 0n;
      entries.push({ hash:log.transactionHash, label:"Claim Rewards", ts:tc(tsFor(log)), tsRaw:tsFor(log), status:"success", amount:formatToken(amount, decimalsForToken(NATIVE_USDC, { nativeScaled:false }), 4)+" USDC", blockHex:log.blockNumber });
    }

    // Deduplicate by txHash (keep first seen)
    const seen = new Set();
    const unique = entries.filter(e => { if (!e.hash || seen.has(e.hash)) return false; seen.add(e.hash); return true; });

    // Sort by blockNumber descending (most recent first)
    unique.sort((a,b) => {
      const na = parseInt(a.blockHex||"0x0",16);
      const nb = parseInt(b.blockHex||"0x0",16);
      return nb - na;
    });

    return unique.slice(0, 200); // cap at 200 entries
  } catch(e) {
    console.warn("[Privar] buildTxHistoryFromChain failed:", e.message);
    return [];
  }
}

// ── Cross-device staking positions: rebuild from PrivarStaking contract ──────────────
// getUserStakes(address) returns StakePosition[] — ABI-decoded here.
// StakePosition: (uint256 amount, uint256 lockDuration, uint256 lockMultiplier,
//                 uint256 stakeTime, uint256 unlockTime, uint256 lastClaimTime,
//                 uint256 apyBps, bool active)  — 8 fields × 32 bytes each
async function loadStakingPositionsFromChain(address) {
  if (!address || !CONTRACTS.PrivarStaking) return null;
  try {
    // getUserStakes(address) — selector 0x5e0e5b3e (computed from exact sig)
    const sel = "0x5e0e5b3e";
    const raw = await rpcCall("eth_call", [{ to:CONTRACTS.PrivarStaking, data: sel + "000000000000000000000000" + address.slice(2).toLowerCase() }, "latest"]);
    if (!raw || raw === "0x" || raw.length < 4) return [];

    const hex = raw.replace("0x","");
    // ABI decode dynamic array: offset(32), length(32), then N×(8×32) structs
    if (hex.length < 128) return [];
    const count = parseInt(hex.slice(64,128),16);
    if (count === 0 || count > 500) return [];

    const positions = [];
    const FIELD = 64; // each uint256/bool is 32 bytes = 64 hex chars
    const STRUCT_SIZE = 8 * FIELD; // 8 fields
    const base = 128; // skip offset + length words

    for (let i = 0; i < count; i++) {
      const s = base + i * STRUCT_SIZE;
      if (hex.length < s + STRUCT_SIZE) break;
      const amount       = BigInt("0x" + hex.slice(s,           s+FIELD));
      const lockDuration = BigInt("0x" + hex.slice(s+FIELD,     s+FIELD*2));
      // lockMultiplier at s+FIELD*2 (skip)
      const stakeTime    = Number(BigInt("0x" + hex.slice(s+FIELD*3, s+FIELD*4)));
      const unlockTime   = Number(BigInt("0x" + hex.slice(s+FIELD*4, s+FIELD*5)));
      // lastClaimTime at s+FIELD*5 (skip)
      const apyBps       = Number(BigInt("0x" + hex.slice(s+FIELD*6, s+FIELD*7)));
      const active       = hex.slice(s+FIELD*7, s+FIELD*8).endsWith("1");
      if (!active) continue; // skip already-unstaked positions
      positions.push({
        id:         stakeTime * 1000 + i, // deterministic, stable across devices
        amount:     Number(amount) / 1e6,
        lockDays:   Math.round(Number(lockDuration) / 86400),
        unlockedAt: unlockTime * 1000,
        stakedAt:   stakeTime  * 1000,
        apyBps,
      });
    }
    return positions;
  } catch(e) {
    console.warn("[Privar] loadStakingPositionsFromChain failed:", e.message);
    return null; // null = fallback to localStorage
  }
}

// Reconcile local notes with on-chain events for the connected wallet
// Deposits are public (commitment + token + amount emitted on-chain)
// We add any deposit we don't already have in local notes
async function reconcileNotesOnChain(address) {
  // ── Design note ────────────────────────────────────────────────────────────
  // The Deposited event does NOT index the depositor address, so we cannot
  // filter logs by wallet. Blindly adding every Deposited event to the connected
  // wallet's notes was a critical bug: it inflated the ShieldedWallet balance
  // with deposits from ALL wallets, creating a false > TVL reading.
  //
  // Cross-device note recovery is handled exclusively by:
  //   1. scanStealthNotes() — decrypts self-addressed encrypted notes relayed on-chain
  //   2. buildTxHistoryFromChain() — reconstructs tx history from indexed events
  //
  // v3.4.1 — MERGED with the former verifyNotesBackedOnChain() into one
  // atomic pass (see reconcileAndVerifyNotes below). The two used to run
  // concurrently, un-coordinated, each doing its own getNotes()->filter->
  // saveNotes() — a real race: if their RPC fetches resolved in an
  // interleaved order, one's write could silently clobber the other's
  // pruning. This function is kept as a thin wrapper (same name/signature)
  // for any external caller, but now just delegates to the merged pass.
  return (await reconcileAndVerifyNotes(address)).spent;
}

// SKIP_WINDOW_MS guards a fresh note whose Deposited event isn't visible
// yet on-chain (RPC lag / indexing delay) from being mistaken for a
// phantom — never quarantine anything younger than this.
const VERIFY_SKIP_WINDOW_MS = 10 * 60 * 1000; // 10 min grace period

// ── Single atomic reconciliation pass ───────────────────────────────────────
// Replaces the former reconcileNotesOnChain() + verifyNotesBackedOnChain()
// pair. Both checks now read local notes ONCE, classify every note against
// BOTH on-chain sets in the same pass, and write the result back ONCE —
// eliminating the read-modify-write race described above, and halving the
// number of "getNotes/saveNotes" round trips.
//
// A note is:
//   SPENT    — its nullifier matches a real Withdrawn event    -> dropped (correct, not corrupt)
//   UNBACKED — its commitment has no matching Deposited event,
//              AND it's older than the grace window            -> quarantined (see verifyNotesBackedOnChain's
//                                                                   original doc comment for why this is safe
//                                                                   and precise regardless of amount)
//   VALID    — neither of the above                            -> kept
//
// AUDIT NOTE (2026-08): the SPENT check below (n.nullifier vs Withdrawn
// events) can only ever match a note that has a `nullifier` field — but no
// code path writes one onto a saved note (the nullifier used to spend a
// note is generated fresh at spend time and never persisted back onto it).
// In practice this branch never fires, for any operation. It's left as-is
// here (harmless — just never true) rather than removed, to keep this
// patch minimal; the actual mechanism that now detects a swap/send/
// withdraw/bridge spend is the pending-ops ledger (lockNotesForOp /
// finalizeOp / watchPendingOps, defined above getNotes/saveNotes) — see
// its doc comment for the full reasoning.
async function reconcileAndVerifyNotes(address) {
  if (!address) return { spent: 0, unbacked: 0 };
  const notes = getNotes(address);
  if (notes.length === 0) return { spent: 0, unbacked: 0 };

  try {
    const current = Number(BigInt(await rpcCallWithBackoff("eth_blockNumber", [])));
    const fromBlock = Math.max(0, current - 5_000_000);

    // Two independent scans (different event types, different progress
    // checkpoints already persisted in users' browsers under these exact
    // key prefixes — kept as-is so no one loses resume progress) but run
    // together and classified together, so the local notes array is only
    // ever read and written ONCE per reconciliation pass.
    const [withdrawnLogs, depositedLogs] = await Promise.all([
      fetchLogsPaginated(CONTRACTS.PrivarShieldVault, [EV.Withdrawn],
        fromBlock, "privar_reconcile_scanprogress", address, "Privar"),
      fetchLogsPaginated(CONTRACTS.PrivarShieldVault, [EV.Deposited],
        fromBlock, "privar_verify_scanprogress", address, "Privar"),
    ]);

    const spentNullifiers = new Set();
    if (Array.isArray(withdrawnLogs)) {
      for (const log of withdrawnLogs) {
        const n = log.topics?.[1]; // Withdrawn: bytes32 indexed nullifier
        if (n) spentNullifiers.add(n.toLowerCase());
      }
    }
    const depositedCommitments = new Set();
    let depositedScanOk = false;
    if (Array.isArray(depositedLogs)) {
      depositedScanOk = true;
      for (const log of depositedLogs) {
        const c = log.topics?.[1]; // Deposited: bytes32 indexed commitment
        if (c) depositedCommitments.add(c.toLowerCase());
      }
    }

    const kept = [], spentNotes = [], unbackedNotes = [];
    for (const n of notes) {
      if (n.nullifier && spentNullifiers.has(n.nullifier.toLowerCase())) {
        spentNotes.push(n);
        continue;
      }
      // A note's `origin` tells us WHERE it was created:
      //   - "deposit" or undefined (legacy notes, all pre-dating the
      //     `origin` field, are assumed deposit-sourced) -> must have a
      //     matching Deposited event, exactly as before.
      //   - "swap" / "send" / "bridge" (tagged by finalizeOp from the op's
      //     own `kind`) -> created via that op's embedded NoteJournal
      //     entry, NOT a top-level deposit() call. It structurally has no
      //     Deposited event of its own and never will — checking for one
      //     was mistakenly quarantining perfectly legitimate change/output
      //     notes (e.g. the leftover USDC from a partial swap) once they
      //     aged past the grace window. Confirmed: a swap-created USDC
      //     note vanished from the shielded wallet ~10+ min after a
      //     successful swap while the vault's real on-chain balance (and
      //     protocol TVL) still held the funds.
      const origin = n.origin || "deposit";
      const pastGrace = (Date.now() - (n.ts || 0)) > VERIFY_SKIP_WINDOW_MS;
      if (origin === "deposit" && depositedScanOk && depositedCommitments.size > 0 && n.commitment && pastGrace
          && !depositedCommitments.has(n.commitment.toLowerCase())) {
        unbackedNotes.push(n);
        continue;
      }
      kept.push(n);
    }

    if (spentNotes.length > 0 || unbackedNotes.length > 0) {
      saveNotes(address, kept);
      if (spentNotes.length > 0) {
        console.log(`[Privar] Pruned ${spentNotes.length} spent note(s) for ${address.slice(0,8)}…`);
      }
      if (unbackedNotes.length > 0) {
        try {
          const existingBad = JSON.parse(localStorage.getItem(quarantineKey(address)) || "[]");
          localStorage.setItem(quarantineKey(address), JSON.stringify([
            ...existingBad,
            ...unbackedNotes.map(n => ({ ...n, quarantineReason: "no matching Deposited event on-chain" })),
          ]));
        } catch {}
        console.warn(`[Privar] Quarantined ${unbackedNotes.length} unbacked note(s) for ${address.slice(0,8)}… — no matching Deposited event found on-chain.`);
      }
    }

    return { spent: spentNotes.length, unbacked: unbackedNotes.length };
  } catch (e) {
    console.warn("[Privar] reconcileAndVerifyNotes failed:", e.message);
    return { spent: 0, unbacked: 0 };
  }
}

// ── Plausibility ceiling for a single note ──────────────────────────────────
// Defense-in-depth against decimal-scale bugs (like the LI.FI/NATIVE_USDC
// 1e12 inflation fixed above) or any other corruption path (bad cloud-journal
// restore, manual localStorage tampering, a future regression): no single
// legitimate testnet note should ever be worth more than this in raw 6/8-dec
// units. This is deliberately generous ($1M-equivalent) — it exists only to
// catch orders-of-magnitude corruption, not to second-guess real amounts.
// A note that fails this check is not "probably fine" — the on-chain vault
// has no matching balance for it (any spend attempt reverts), so quarantining
// it is strictly safer than displaying/offering to spend a ghost balance.
// Keyed lowercase — always look this up via .toLowerCase() on the token
// address being checked (same convention used elsewhere in this file for
// address comparisons, e.g. useShieldedBalances' `acc` matching below).
const MAX_PLAUSIBLE_RAW = {
  [NATIVE_USDC.toLowerCase()]:      10n ** 12n,
  [CONTRACTS.EURC.toLowerCase()]:   10n ** 12n,
  [CONTRACTS.cirBTC.toLowerCase()]: 10n ** 14n,
};
const quarantineKey = (addr) => notesKey(addr) + "_quarantined";

// Returns the set of commitments currently sitting in the quarantine
// bucket for this address, lowercased. Used by every resync path
// (resyncFromCloudVault, resyncFromShieldVaultJournal, scanStealthNotes)
// to avoid resurrecting a note that was deliberately quarantined — without
// this check, each resync re-discovers the SAME commitment from its
// on-chain/CloudVault source (which has no concept of "quarantined"), adds
// it back to active notes, the next reconciliation pass quarantines it
// again, and the cycle repeats every sync interval indefinitely. This is
// exactly what produced the "Removed 1 corrupted local note" banner
// reappearing every ~2 minutes instead of firing once and staying resolved.
function loadQuarantinedCommitments(address) {
  try {
    const bad = JSON.parse(localStorage.getItem(quarantineKey(address)) || "[]");
    return new Set(bad.map(n => n.commitment).filter(Boolean).map(c => c.toLowerCase()));
  } catch { return new Set(); }
}

// ── One-time retroactive recovery for the "unbacked" quarantine bug ────────
// Before the `origin` field existed, reconcileAndVerifyNotes() required
// EVERY local note — including perfectly legitimate swap/send/bridge/
// withdraw-change outputs, which structurally never have a Deposited event
// of their own — to match a Deposited event once past the grace window.
// That wrongly quarantined real, spendable notes (confirmed: a swap-created
// USDC note vanished from the shielded wallet ~10+ min after a successful
// swap while the vault's real on-chain balance/TVL still held the funds;
// with enough swap/send/bridge activity this can end up quarantining
// EVERY local note, leaving the shielded wallet at $0.00 while TVL is
// still nonzero).
//
// The pending-ops ledger (getPendingOps) is untouched by that bug — it's
// written directly by lockNotesForOp/finalizeOp from each op's own
// confirmed outcome, never from the Deposited-event check — so it's a
// reliable, independent record of which commitments were legitimately
// created by a successful swap/send/bridge/withdraw, and which of those
// were later themselves spent (i.e. appear as an input of a LATER
// successful op). Anything sitting in the quarantine bucket that (a) was
// quarantined only for "no matching Deposited event on-chain", (b) appears
// as an output of some successful non-deposit op in the ledger, and (c) was
// never itself later spent, is restored to active notes. Idempotent — safe
// to call on every load; does nothing once everything's recovered.
function recoverWronglyQuarantinedNotes(address) {
  if (!address) return 0;
  let bucket;
  try { bucket = JSON.parse(localStorage.getItem(quarantineKey(address)) || "[]"); } catch { return 0; }
  if (!Array.isArray(bucket) || bucket.length === 0) return 0;

  const ops = getPendingOps(address).filter(o => o.status === "success");
  const createdBy = new Map(); // commitment(lowercase) -> op.kind that created it
  const laterSpent = new Set(); // commitment(lowercase) that was itself later spent as an input
  for (const op of ops) {
    for (const out of op.outputs || []) {
      if (out?.commitment) createdBy.set(out.commitment.toLowerCase(), op.kind);
    }
  }
  for (const op of ops) {
    for (const c of op.inputCommitments || []) {
      if (c) laterSpent.add(c.toLowerCase());
    }
  }

  const stillBad = [], recovered = [];
  for (const n of bucket) {
    const c = n.commitment?.toLowerCase();
    const kind = c ? createdBy.get(c) : undefined;
    if (n.quarantineReason === "no matching Deposited event on-chain"
        && kind && kind !== "deposit"
        && !laterSpent.has(c)) {
      const { quarantineReason, ...clean } = n;
      recovered.push({ ...clean, origin: clean.origin || kind, status: "available" });
    } else {
      stillBad.push(n);
    }
  }

  if (recovered.length > 0) {
    const notes = getNotes(address);
    const existing = new Set(notes.map(x => x.commitment));
    const merged = notes.concat(recovered.filter(r => !existing.has(r.commitment)));
    saveNotes(address, merged);
    try { localStorage.setItem(quarantineKey(address), JSON.stringify(stillBad)); } catch {}
    console.warn(`[Privar] Recovered ${recovered.length} note(s) wrongly quarantined by the Deposited-event check (legitimate swap/send/bridge/withdraw outputs).`);
  }
  return recovered.length;
}

// Sweep local notes for implausible amounts, moving anything corrupt to a
// separate "quarantined" bucket (kept for audit/manual recovery, never
// summed into the displayed balance) instead of leaving it in the active
// notes array where it silently inflates the ShieldedWallet total forever.
// Returns the count actually quarantined this call (0 = nothing to do).
function quarantineCorruptNotes(address) {
  if (!address) return 0;
  const notes = getNotes(address);
  const good = [], bad = [];
  for (const n of notes) {
    const ceiling = MAX_PLAUSIBLE_RAW[n.token?.toLowerCase?.()] ?? (10n ** 12n);
    let raw;
    try {
      raw = n.amount == null ? 0n : typeof n.amount === "bigint" ? n.amount : BigInt(Math.round(Number(n.amount)));
    } catch { raw = null; }
    if (raw == null || raw < 0n || raw > ceiling) bad.push(n); else good.push(n);
  }
  if (bad.length > 0) {
    saveNotes(address, good);
    try {
      const existingBad = JSON.parse(localStorage.getItem(quarantineKey(address)) || "[]");
      localStorage.setItem(quarantineKey(address), JSON.stringify([...existingBad, ...bad]));
    } catch {}
    console.warn(`[Privar] Quarantined ${bad.length} implausible note(s) for ${address.slice(0,8)}… — these exceeded the sanity ceiling and were excluded from the shielded balance.`);
  }
  return bad.length;
}

function useShieldedBalances(prices, address) {
  const SAFE_BALS = { usdc:0, eurc:0, cbtc:0, totalUsd:0, rawUsdc:0n, rawEurc:0n, rawCbtc:0n, noteCount:0, quarantined:0 };
  const [bals, setBals] = useState(SAFE_BALS);
  // Timestamp of the last successful on-chain reconciliation pass — shown
  // in the UI so "this balance is precise" is a verifiable fact the user
  // can see, not just an invisible background promise. null = not yet
  // verified this session (e.g. still loading, or offline).
  const [lastVerified, setLastVerified] = useState(null);
  // Cumulative count of notes removed THIS SESSION by the async on-chain
  // existence check (verifyNotesBackedOnChain) — separate from the sync
  // amount-ceiling check because it resolves later (after an RPC round
  // trip) and compute() has no other way to know about it.
  const unbackedRemovedRef = useRef(0);

  const compute = useCallback(() => {
    // Retroactive recovery FIRST — restores any note previously (and
    // wrongly) quarantined for lacking a Deposited event when it was
    // actually a legitimate swap/send/bridge/withdraw output. Synchronous
    // (localStorage-only) and idempotent — cheap to run every pass.
    recoverWronglyQuarantinedNotes(address);
    // Sanity sweep — never sum a note past the plausibility ceiling.
    const quarantinedNow = quarantineCorruptNotes(address);
    // Wallet-scoped notes — address-keyed to prevent cross-account leakage
    const notes = getNotes(address);
    const acc = {
      [NATIVE_USDC]:        0n,
      [CONTRACTS.EURC]:     0n,
      [CONTRACTS.cirBTC]:   0n,
    };
    for (const n of notes) {
      const k = n.token?.toLowerCase?.();
      const match = Object.keys(acc).find(a => a.toLowerCase() === k);
      if (match) {
        try {
          // Guard: old notes may have float amounts ("10.5") or corrupt values
          const raw = n.amount;
          const safe = raw == null ? 0n
            : typeof raw === "bigint" ? raw
            : BigInt(Math.round(Number(raw)));   // handles "10.5", "10000000", 0, etc.
          acc[match] += safe;
        } catch { /* skip corrupt note */ }
      }
    }
    // Convert to display values — guard against BigInt overflow or zero-address tokens
    const usdc  = isFinite(Number(acc[NATIVE_USDC]))      ? Number(acc[NATIVE_USDC])      / 1e6 : 0;
    const eurc  = isFinite(Number(acc[CONTRACTS.EURC]))   ? Number(acc[CONTRACTS.EURC])   / 1e6 : 0;
    const cbtc  = isFinite(Number(acc[CONTRACTS.cirBTC])) ? Number(acc[CONTRACTS.cirBTC]) / 1e8 : 0;

    const usdcPrice = 1;
    const eurcPrice = prices?.EURC  ?? prices?.EUR ?? 1.08;
    const btcPrice  = prices?.BTC   ?? prices?.WBTC ?? 0;

    const rawTotal = usdc * usdcPrice + eurc * eurcPrice + cbtc * btcPrice;
    const totalUsd = isFinite(rawTotal) ? rawTotal : 0;

    setBals({
      usdc, eurc, cbtc, totalUsd,
      rawUsdc:  acc[NATIVE_USDC],
      rawEurc:  acc[CONTRACTS.EURC],
      rawCbtc:  acc[CONTRACTS.cirBTC],
      noteCount: notes.length,
      quarantined: quarantinedNow + unbackedRemovedRef.current,
    });
  }, [prices, address]);

  useEffect(() => {
    compute();
    // Listen for cross-tab writes (uses wallet-scoped key)
    const key = notesKey(address);
    const handler = (e) => { if (e.key === key || e.key === "privarc_notes") compute(); };
    window.addEventListener("storage", handler);
    if (!address) return () => window.removeEventListener("storage", handler);

    // On-chain reconciliation: prune SPENT notes (nullifier matches a
    // Withdrawn event) AND quarantine UNBACKED notes (commitment has no
    // matching Deposited event) — both checks now run as ONE atomic pass
    // (reconcileAndVerifyNotes) instead of two independently-scheduled
    // functions racing to read-modify-write the same localStorage key.
    // Runs on mount AND on the same periodic cadence as the other
    // background resyncs (scanStealthNotes / resyncFromCloudVault / etc.)
    // so it's fully automatic — no manual action ever required.
    unbackedRemovedRef.current = 0;
    const runChecks = () => {
      // Resolve any swap/send/withdraw/bridge left dangling by a closed
      // tab, a timeout, or a dropped connection — see watchPendingOps()'s
      // doc comment. Independent of reconcileAndVerifyNotes below (which
      // only ever catches explicit withdraw() — see its own doc comment)
      // — this is what actually covers swap/send/bridge.
      watchPendingOps(address).catch(() => {});
      reconcileAndVerifyNotes(address).then(({ unbacked }) => {
        // OVERWRITE, not accumulate: this ref should reflect "how many were
        // found unbacked in the MOST RECENT check", not a running session
        // total. Accumulating meant the "Removed N corrupted notes" banner
        // would stay visible for the rest of the session even after the
        // condition was fully resolved (0 new removals on every check
        // since) — because old counts from earlier, already-resolved
        // incidents kept being added to new ones instead of being replaced.
        unbackedRemovedRef.current = unbacked;
        setLastVerified(Date.now());
        compute();
      }).catch(() => {});
    };
    runChecks();
    const id = setInterval(runChecks, 120_000); // 2 min, matches other resyncs
    // Also re-check when the tab regains focus after being hidden — a user
    // who tabbed away for a while shouldn't have to wait up to 2 more
    // minutes for a fresh reconciliation once they're actually looking at
    // the screen again. Guarded to at most once per 15s to avoid hammering
    // the RPC on rapid tab-switching.
    let lastVisRun = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastVisRun < 15_000) return;
      lastVisRun = Date.now();
      runChecks();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", handler);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [compute, address]);

  return { bals, recompute: compute, lastVerified };
}

// ── ShieldedWallet mini-panel ─────────────────────────────────────────────────
// Shown at top of Send / Swap / Withdraw / Bridge panels.
// Displays per-token shielded balance + MAX buttons.
function ShieldedWallet({ bals, onMax, tokenFilter, actionableFilter, compact = false, protocolStats }) {
  // actionableFilter: tokens the user can actually act on in this panel.
  // Both old tokenFilter and new actionableFilter control clickability;
  // ALL 3 tokens are always displayed for visual uniformity across panels.
  const activeFilter = actionableFilter || tokenFilter;

  // Small "verified Xs ago" readout — makes the automatic reconciliation
  // pass (reconcileAndVerifyNotes, see useShieldedBalances) a visible,
  // checkable fact instead of an invisible background promise. Ticks every
  // second purely for display; reads the timestamp via the same
  // window._privar* exposure pattern used for recomputeShielded, to avoid
  // threading one more prop through every panel that renders this component.
  // Hooks must run unconditionally (before the `if (!bals)` early return
  // below) — this component is always mounted at a fixed position in each
  // panel, so that's safe; `bals` only gates what's rendered, not whether
  // the hooks themselves run.
  const [, forceTick] = useState(0);
  useEffect(() => { const id = setInterval(() => forceTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  if (!bals) return null;

  const verifiedAt = window._privarShieldedLastVerified;
  const verifiedAgoS = verifiedAt ? Math.max(0, Math.floor((Date.now() - verifiedAt) / 1000)) : null;
  const verifiedLabel = verifiedAgoS == null ? "verifying…"
    : verifiedAgoS < 5   ? "verified just now"
    : verifiedAgoS < 60  ? `verified ${verifiedAgoS}s ago`
    : verifiedAgoS < 3600 ? `verified ${Math.floor(verifiedAgoS / 60)}m ago`
    : "verify overdue — check connection";

  // ── Stale-note diagnostic (informational only — no destructive action) ──
  // A previous "Clear stale notes" button here compared the LOCAL wallet
  // balance to the GLOBAL protocol TVL (across every user) and, if it fired,
  // wiped ALL local notes unconditionally — including a note the user had
  // just shielded seconds earlier, because there was no way to tell "old/
  // invalid" apart from "brand new" using only a balance comparison. Real
  // staleness (a note actually spent on-chain) is already detected
  // precisely and safely by reconcileNotesOnChain(), which only removes a
  // note when its nullifier matches a real on-chain Withdrawn event — no
  // user action needed, and it can never remove a note it can't verify.
  // This banner is now purely diagnostic: it can flag a genuine mismatch
  // worth investigating, but never offers a destructive one-click fix.
  const globalUsdc = protocolStats?.shieldedUsdc != null ? Number(protocolStats.shieldedUsdc) / 1e6 : null;
  const globalEurc = protocolStats?.shieldedEurc != null ? Number(protocolStats.shieldedEurc) / 1e6 : null;
  const globalCbtc = protocolStats?.shieldedBtc  != null ? Number(protocolStats.shieldedBtc)  / 1e8 : null;
  // Tolerance widened from $0.01 to $0.03 — protocolStats.shieldedUsdc
  // (the on-chain TVL) polls every 30s, while the local shielded balance
  // updates INSTANTLY on any note change (storage listener). A single
  // recent shield/swap/withdraw can legitimately put the local balance
  // ~$0.01-0.02 ahead of TVL for up to 30s while the next poll catches up —
  // $0.01 was tight enough to false-positive on exactly that normal lag.
  // Real phantom/unbacked notes are still caught precisely (regardless of
  // amount) by verifyNotesBackedOnChain, not by this coarse comparison.
  const staleUsdc = globalUsdc != null && bals.usdc > 0 && bals.usdc > globalUsdc + 0.03;
  const staleEurc = globalEurc != null && bals.eurc > 0 && bals.eurc > globalEurc + 0.03;
  const staleCbtc = globalCbtc != null && bals.cbtc > 0 && bals.cbtc > globalCbtc + 0.000001;
  const hasStale  = staleUsdc || staleEurc || staleCbtc;
  const usdc  = bals.usdc  ?? 0;
  const eurc  = bals.eurc  ?? 0;
  const cbtc  = bals.cbtc  ?? 0;
  const rawUsdc = bals.rawUsdc  ?? 0n;
  const rawEurc = bals.rawEurc  ?? 0n;
  const rawCbtc = bals.rawCbtc  ?? 0n;

  const allTokens = [
    { sym:"USDC",   val:usdc, raw:rawUsdc, dec:6, fmt:v=>"$"+v.toFixed(2),  color:"#00FFB0", usdVal:usdc },
    { sym:"EURC",   val:eurc, raw:rawEurc, dec:6, fmt:v=>"€"+v.toFixed(2),  color:"#60a5fa", usdVal:eurc * 1.08 },
    { sym:"cirBTC", val:cbtc, raw:rawCbtc, dec:8, fmt:v=>"₿"+v.toFixed(5),  color:"#F7931A", usdVal:0 },
  ];

  // USD total: only from actionable tokens (what this panel can spend)
  const actionable = allTokens.filter(t => !activeFilter || activeFilter.includes(t.sym));
  const totalUsd = actionable.reduce((sum, t) => sum + (isFinite(t.usdVal) ? t.usdVal : 0), 0);

  if (compact) {
    const t = actionable[0];
    if (!t) return null;
    return (
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>Shielded {t.sym}</span>
        <button onClick={() => onMax?.(t.sym, t.val, t.raw, t.dec)}
          style={{ fontSize:9, color: t.val > 0 ? t.color : "#334155", background:"none", border:"none", cursor: t.val > 0 ? "pointer" : "default", fontFamily:"monospace", fontWeight:700 }}>
          MAX {t.fmt(t.val)}
        </button>
      </div>
    );
  }

  return (
    <div style={{ background:"rgba(0,255,176,.03)", border:`1px solid ${hasStale ? "rgba(248,113,113,.35)" : "rgba(0,255,176,.12)"}`, borderRadius:5, padding:"10px 12px", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
        <span style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace" }}>🛡 SHIELDED WALLET</span>
        <span style={{ fontSize:10, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>
          ≈ ${totalUsd.toFixed(2)} <span style={{ fontSize:8, color:"#4a7c5f" }}>USD</span>
        </span>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
        <span style={{ fontSize:7, color: verifiedAgoS != null && verifiedAgoS < 150 ? "#4a7c5f" : "#f59e0b", fontFamily:"monospace" }}>
          {verifiedAgoS != null && verifiedAgoS < 150 ? "✓ " : "⏳ "}{verifiedLabel}
        </span>
      </div>
      {bals.quarantined > 0 && (
        <div style={{ background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:4, padding:"7px 10px", marginBottom:8, fontSize:8, color:"#fca5a5", fontFamily:"monospace", lineHeight:1.6 }}>
          ⚠ Removed {bals.quarantined} corrupted local note{bals.quarantined>1?"s":""} with an
          implausible amount (kept in a quarantine bucket, not deleted, in case manual
          recovery is needed). These never matched a real on-chain balance and could not
          have been spent — the shielded balance shown now excludes them.
        </div>
      )}
      {hasStale && (
        <div style={{ background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:4, padding:"7px 10px", marginBottom:8, fontSize:8, color:"#fca5a5", fontFamily:"monospace", lineHeight:1.6 }}>
          ⚠ Local balance is currently higher than the protocol-wide TVL reading — this
          can happen right after a fresh shield or sync while on-chain stats catch up.
          Any note actually spent on-chain is pruned automatically in the background;
          notes with implausible amounts are quarantined automatically (see above if
          that just happened); notes with no matching on-chain deposit are quarantined
          automatically as well, checked periodically in the background. If this
          persists for more than a few minutes, treat it as worth investigating.
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:5 }}>
        {allTokens.map(t => {
          const isActionable = !activeFilter || activeFilter.includes(t.sym);
          const isClickable  = isActionable && t.val > 0;
          const rgb = t.color === "#00FFB0" ? "0,255,176" : t.color === "#60a5fa" ? "96,165,250" : "247,147,26";
          return (
            <button key={t.sym}
              onClick={() => isClickable && onMax?.(t.sym, t.val, t.raw, t.dec)}
              title={!isActionable ? `${t.sym} is not actionable in this panel` : ""}
              style={{
                background: isClickable ? `rgba(${rgb},.06)` : "rgba(0,0,0,.2)",
                border: `1px solid ${isClickable ? t.color+"30" : "rgba(255,255,255,.04)"}`,
                borderRadius:4, padding:"7px 5px",
                cursor: isClickable ? "pointer" : "default",
                textAlign:"center", transition:"all .15s",
                opacity: !isActionable ? 0.38 : 1,
              }}>
              <div style={{ fontSize:8, color: isActionable ? "#64748b" : "#334155", fontFamily:"monospace", marginBottom:3 }}>{t.sym}</div>
              <div style={{ fontSize:11, color: isClickable ? t.color : "#334155", fontFamily:"monospace", fontWeight:700 }}>{t.fmt(t.val)}</div>
              {isClickable  && <div style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>tap → MAX</div>}
              {!isActionable && <div style={{ fontSize:6, color:"#475569", fontFamily:"monospace", marginTop:2 }}>not used here</div>}
            </button>
          );
        })}
      </div>
      {bals.noteCount === 0 && (
        <div style={{ fontSize:8, color:"#F59E0B", fontFamily:"monospace", marginTop:7 }}>
          ⚠ No shielded notes — use Shield panel first
        </div>
      )}
    </div>
  );
}

function useTxSend({ account, onArc, notify, refreshBalance, onSuccess }) {
  const sendRealTx = useCallback(async ({ label, description, buildTx, onHash, onReceipt }) => {
    if (!onArc) { notify(label, "Switch to Arc Testnet first", "error"); return false; }
    if (!account?.address) { notify(label, "Wallet not connected", "error"); return false; }
    notify(label, description + " — confirm in wallet...", "pending");
    try {
      const tx = await buildTx(account.address);
      const hash = await sendTransaction(account.address, tx.to, tx.value || "0x0", tx.data || "0x");
      // Optional hook — callers using the pending-ops ledger (swap/send/
      // withdraw/bridge) persist the hash here so the op survives a
      // closed tab even if waitForReceipt() below times out. No-op for
      // every other existing caller (onHash is undefined for them).
      try { onHash?.(hash); } catch {}
      notify(label, "Waiting for confirmation on Arc Testnet...", "pending", hash);
      const receipt = await waitForReceipt(hash);
      if (Number(receipt.status) === 1) {  // FIX F-11: handles both "0x1" (string) and 1 (int) from different RPC implementations
        notify(`${label} ✓`, "Transaction confirmed on Arc Testnet", "success", hash);
        await refreshBalance(account.address);
        // Optional hook — lets a caller reconcile a pre-tx-predicted note
        // (e.g. swap()'s noteAmountOut, computed from an off-chain quote +
        // client-mirrored fee math) against the AUTHORITATIVE value the
        // contract actually emitted in this same receipt, before the op is
        // finalized into local storage. This is what keeps the local
        // shielded balance from ever drifting out of sync with
        // totalShielded() on-chain — the client's pre-tx estimate is only
        // ever a best-effort guess for gas/UX purposes, never the source of
        // truth for what gets persisted. Awaited so finalizeOp() below (in
        // the caller) always sees the corrected outputs. No-op for every
        // existing caller that doesn't pass one.
        try { await onReceipt?.(receipt); } catch (e) { console.warn(`[${label}] onReceipt reconciliation failed (note kept at its pre-tx estimate):`, e.message); }
        // Dashboard stats (TVL, tx count, volume, fees) poll on a timer and
        // would otherwise wait up to 30s to reflect this transaction — refresh
        // them immediately instead of leaving the UI looking stale/unchanged.
        try { onSuccess?.(); } catch {}
        return true;
      } else {
        notify(`${label} Failed`, "Transaction reverted", "error", hash);
        return false;
      }
    } catch (e) {
      const msg = e.code === 4001 ? "Rejected by user" : e.message || "Transaction failed";
      notify(`${label} Failed`, msg, "error");
      return false;
    }
  }, [account, onArc, notify, refreshBalance, onSuccess]);


  return { sendRealTx };
}

function ShieldPanel({ account, usdcBalance, onArc, notify, refreshBalance, protocolStats, onChainActivity, prices, recomputeShielded }) {
  const [amount, setAmount] = useState("");
  const [tokenIdx, setTokenIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmTx, setConfirmTx] = useState(null); // pending TxConfirmModal
  const confirmRef = useRef(null);                   // resolves the modal promise
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance, onSuccess: () => { protocolStats?.refresh?.(); onChainActivity?.refresh?.(); } });

  // Ask user to confirm before hitting wallet — shows real amount for ERC-20 / ZK txs
  const askConfirm = (txInfo) => new Promise(resolve => {
    confirmRef.current = resolve;
    setConfirmTx(txInfo);
  });
  const onConfirm = () => { setConfirmTx(null); confirmRef.current?.(true); };
  const onCancel  = () => { setConfirmTx(null); confirmRef.current?.(false); };

  const token = TOKEN_LIST[tokenIdx] || TOKEN_LIST[0];

  const submit = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) return;
    setLoading(true);

    // Block deposit of tokens not deployed on Arc Testnet
    if (token.deployed === false) {
      notify("Deposit", `${token.symbol} is not yet deployed on Arc Testnet. Deposit unavailable.`, "error");
      setLoading(false); return;
    }

    const amountBig = BigInt(Math.round(parsed * 10 ** token.decimals));
    if (amountBig < token.minDeposit) {
      notify("Deposit", `Min deposit: ${token.minDisplay}`, "error");
      setLoading(false); return;
    }

    // ── PRE-FLIGHT: verify token is registered in PrivarDepositManager ──────────
    // Arc Testnet truncates revert data in receipts ("0x" on ARCScan).
    // The most common cause of deposit failure is TokenNotSupported —
    // addToken() was not called on PrivarDepositManager after deployment.
    // We check this BEFORE sending the tx to give a clear error.
    try {
      const isSupportedData = SEL.supportedTokens + encodeAddress(token.address);
      const res = await rpcCall("eth_call", [
        { to: CONTRACTS.PrivarShieldVault, data: isSupportedData },
        "latest",
      ]);
      // Returns bool: 0x00...01 = true, 0x00...00 = false
      const isSupported = res && res !== "0x" && BigInt(res) === 1n;
      if (!isSupported) {
        notify(
          "Deposit blocked",
          `${token.symbol} deposits are temporarily unavailable. Please try again later.`,
          "error"
        );
        setLoading(false); return;
      }
    } catch {
      // If the pre-flight call itself fails (network issue), warn but proceed
      notify("Deposit", "Could not verify token support — proceeding anyway.", "warning");
    }

    // Step 1: ERC-20 approve (skip for native USDC — uses msg.value instead)
    if (needsApproveBeforeDeposit(token.address)) {
      const approved = await sendRealTx({
        label: `Approve ${token.symbol}`,
        description: `Approving ${amount} ${token.symbol} for PrivarShieldVault`,
        buildTx: () => ({ to: token.address, value: "0x0", data: buildApproveCalldata(CONTRACTS.PrivarShieldVault, amountBig) }),
      });
      if (!approved) { setLoading(false); return; }
    }

    // Step 2: Generate commitment (random secret note)
    // In a real ZK system: commitment = Poseidon(secret, nullifier, amount, token)
    // With MockVerifierZK, any bytes32 is accepted — random is fine for testnet
    const commitment = randomBytes32();

    // ── Protocol fee preview (v2.8 — ALWAYS denominated/collected in USDC) ──────
    // Native USDC: % fee (protocolFeeBps, floored at MIN_DEPOSIT_FEE), skimmed from
    // amount — note saved locally must use the NET amount, matching what PrivarShieldVault
    // actually credits to totalShieldedByToken. EURC/cirBTC: flat flatFeeUsdc paid as
    // a SEPARATE USDC side-payment via msg.value — the deposited amount itself is
    // credited in FULL (no skim), so netAmount == amountBig for those tokens.
    const isNativeUsdc = token.isNative;
    let depositFee = 0n, netAmount = amountBig, flatFeeUsdc = 0n;
    try {
      const [bpsRes, flatRes] = await Promise.all([
        rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.protocolFeeBps }, "latest"]),
        rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.flatFeeUsdc },   "latest"]),
      ]);
      const bps = bpsRes && bpsRes !== "0x" ? BigInt(bpsRes) : 0n;
      flatFeeUsdc = flatRes && flatRes !== "0x" ? BigInt(flatRes) : 0n;
      const preview = previewDepositFee(amountBig, bps, isNativeUsdc, flatFeeUsdc);
      depositFee = preview.fee; netAmount = preview.net;
    } catch (e) {
      // Silently assuming 0 here used to be safe (flatFeeUsdc was always 0 in
      // practice). Now that it's a real nonzero fee, defaulting to 0 builds a
      // tx with msg.value=0 that the contract WILL reject with WrongFee() —
      // guaranteed wasted gas. Abort instead of guessing.
      notify("Shield", "Could not read current fees (slow network) — please retry.", "error");
      setLoading(false);
      return;
    }

    // Step 3: Build deposit calldata
    // v3.4 — the note-journal entry is embedded DIRECTLY in this same
    // transaction (NoteJournal event) instead of a separate follow-up call
    // to PrivarCloudVault.pushDelta(). This closes the reliability gap where
    // that second, independent transaction could fail (rate limit, dropped
    // signature, network drop) after the shield itself had already
    // succeeded, permanently orphaning the note's journal entry on every
    // OTHER device — see PrivarShieldVault.sol's NoteJournal doc comment.
    await ensureSelfBackupKeyReady(account?.address);
    const journalEntry = await encryptJournalBlob(account?.address, { ts: Date.now(), ops: [{ t: 0, commitment, amount: netAmount.toString(), token: token.address }] });

    // For native USDC: value = amount * 1e12 (wei), no ERC-20 transferFrom
    // For EURC/cirBTC: value = flatFeeUsdc * 1e12 (the separate USDC fee payment, v2.8), standard ERC-20 transferFrom
    const { data: depositData, value: depositValue } = buildDepositCalldata(commitment, token.address, amountBig, flatFeeUsdc, journalEntry || "0x");

    // Show confirmation modal before hitting wallet — shows real amount (wallet shows value=0 for ERC-20)
    const confirmed = await askConfirm({
      label:  `Shield ${token.symbol}`,
      amount,
      token:  token.symbol,
      note:   (token.isNative
        ? "Native USDC — wallet will show the USDC value correctly. 1 transaction."
        : `Token deposit — your wallet shows value: 0 for the ${token.symbol} transfer itself (the protocol fee is paid separately, in USDC). 2 steps: approve then deposit.`)
        + (isNativeUsdc && depositFee > 0n ? ` Protocol fee: ${formatToken(depositFee, token.decimals)} ${token.symbol} — you'll receive ${formatToken(netAmount, token.decimals)} ${token.symbol} shielded.` : "")
        + (!isNativeUsdc && flatFeeUsdc > 0n ? ` Protocol fee: ${formatToken(flatFeeUsdc, 6)} USDC (paid separately — your full ${amount} ${token.symbol} is shielded, untouched).` : ""),
    });
    if (!confirmed) { setLoading(false); return; }

    const ok = await sendRealTx({
      label: `Shield ${token.symbol}`,
      description: `Shielding ${amount} ${token.symbol} into PrivarShieldVault`,
      buildTx: () => ({ to: CONTRACTS.PrivarShieldVault, value: depositValue, data: depositData }),
    });

    if (ok) {
      // Store note locally with the NET (post-fee) amount — matches what PrivarShieldVault
      // actually credited to totalShieldedByToken, so future withdraw/send/swap on this
      // note request an amount the pool can actually back.
      // cloudSynced is true here BY CONSTRUCTION (v3.4): the journal entry
      // was embedded in the SAME transaction that just confirmed — there is
      // no separate broadcast that could still be pending or fail.
      const note = { commitment, amount: netAmount.toString(), token: token.address, ts: Date.now(), cloudSynced: !!journalEntry };
      const notes = getNotes(account?.address);
      notes.push(note);
      saveNotes(account?.address, notes);
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly

      const backedUp = !!journalEntry;

      notify(
        "Shield ✓",
        depositFee > 0n
          ? `${formatToken(netAmount, token.decimals)} ${token.symbol} shielded (${formatToken(depositFee, token.decimals)} protocol fee)${backedUp ? " · backed up on-chain" : ""}.`
          : `${amount} ${token.symbol} shielded — note saved in browser storage${backedUp ? " and backed up on-chain" : ""}.`,
        "success"
      );
    }

    setAmount(""); setLoading(false);
  };

  const ps = protocolStats;
  const tvlUsdc  = ps?.shieldedUsdc  != null ? "$"+(Number(ps.shieldedUsdc)/1e6).toFixed(2)  : "—";
  const tvlEurc  = ps?.shieldedEurc  != null ? "€"+(Number(ps.shieldedEurc)/1e6).toFixed(2)  : "—";
  const tvlBtc   = ps?.shieldedBtc   != null ? "₿"+(Number(ps.shieldedBtc)/1e8).toFixed(4)   : "—";
  // FIX: null (never successfully fetched) is NOT the same as "paused" — a transient
  // RPC failure used to display as 🔴 PAUSED even though the vault was fine and
  // deposits/withdrawals kept succeeding. Three explicit states: unknown/active/paused.
  // v3.4.1 — dropped the old "emergency" 3rd state: it was sourced from the
  // long-gone EmergencyController contract's pauseState()==2, a concept the
  // current ShieldVault never had (just a single `paused` bool) — so that
  // branch could never fire from real on-chain data, only from a stale read.
  const vaultState = ps?.vaultPaused == null ? "unknown"
    : ps.vaultPaused ? "paused" : "active";
  const leafCnt  = ps?.leafCount != null ? ps.leafCount.toString() : "—";

  // ── Item 4: USD-blended protocol-wide totals across ALL tokens ─────────────
  // EURC approximated 1:1 USD (stablecoin near parity, no live EUR/USD feed wired
  // up yet); cirBTC priced off the WBTC feed (already polled — see PRICE_FALLBACK)
  // as the closest available BTC-USD proxy.
  const btcUsd = prices?.WBTC || 0;
  const blendedUsd = (usdcUnits, eurcUnits, btcUnits) => {
    if (usdcUnits == null && eurcUnits == null && btcUnits == null) return null;
    const u = Number(usdcUnits || 0) / 1e6;
    const e = Number(eurcUnits || 0) / 1e6;
    const b = Number(btcUnits  || 0) / 1e8 * btcUsd;
    return u + e + b;
  };
  const blend = (u,e,b) => (u==null && e==null && b==null) ? null
    : (Number(u||0)/1e6) + (Number(e||0)/1e6) + (Number(b||0)/1e8)*btcUsd;
  const volTotal  = blend(ps?.volumeUsdc, ps?.volumeEurc, ps?.volumeBtc)
    ?? (onChainActivity?.ready ? (Number(onChainActivity.volumeUsdc||0) + Number(onChainActivity.volumeEurc||0)/1e6 + (Number(onChainActivity.volumeBtc||0)/1e8)*btcUsd) : null);
  const feesTotal = ps?.feesUsdc != null ? Number(ps.feesUsdc)/1e6
    : (onChainActivity?.ready ? Number(onChainActivity.feesUsdc||0) : null);
  const protocolVolumeUsd = volTotal  != null ? "$"+volTotal.toLocaleString(undefined,{maximumFractionDigits:2})  : (onChainActivity?.loading ? "loading…" : "—");
  const protocolFeesUsd   = feesTotal != null ? "$"+feesTotal.toLocaleString(undefined,{maximumFractionDigits:4}) : (onChainActivity?.loading ? "loading…" : "—");

  // Token registration status — if false, deposit will revert TokenNotSupported
  const tokenSupport  = ps?.tokenSupport || {};
  const selectedSupported = onArc
    ? tokenSupport[token?.address?.toLowerCase?.()] ?? tokenSupport[token?.address] ?? null
    : null;

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <TxConfirmModal open={!!confirmTx} tx={confirmTx} onConfirm={onConfirm} onCancel={onCancel}/>
      <PH icon="🛡" title="SHIELD" sub="Shield USDC — move to confidential balance (Arc Testnet)"/>
      <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.12)", borderRadius:4, padding:"8px 12px", marginBottom:8, fontSize:8, color:"#4a7c5f", fontFamily:"monospace", lineHeight:1.6 }}>
        ✦ <b style={{ color:"#00FFB0" }}>Governed Visibility</b> — shielded balances are confidential by default.
        Only you and parties you explicitly authorize can view your activity.
        Aligned with <a href="https://www.arc.io/privacy-whitepaper" target="_blank" rel="noreferrer" style={{ color:"#00FFB0" }}>Arc Privacy Sector whitepaper</a>.
      </div>
      <NotOnArcWarning/>
      {/* Live stats — polled every 10s from chain, see useProtocolStats() */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:10 }}>
        {[
          { l:"TVL USDC",    v:tvlUsdc,  c:"#00FFB0" },
          { l:"TVL EURC",    v:tvlEurc,  c:"#4ade80" },
          { l:"TVL cirBTC",  v:tvlBtc,   c:"#F7931A" },
          { l:"COMMITMENTS (tree, all-time)", v:leafCnt,  c:"#a78bfa" },
          { l:"VAULT",       v: vaultState==="active" ? "🟢 ACTIVE" : vaultState==="paused" ? "🔴 PAUSED" : "⚪ —",
                              c: vaultState==="active" ? "#4ade80"   : vaultState==="paused" ? "#f87171"   : "#64748b" },
          { l:"VERSION",     v:"v"+PROTOCOL_VERSION, c:"#64748b" },
          { l:"PROTOCOL TXS",  v: ps?.totalTxCount != null ? ps.totalTxCount.toString() : (onChainActivity?.ready ? onChainActivity.totalTxCount.toString() : (onChainActivity?.loading ? "loading…" : "—")), c:"#38bdf8" },
          { l:"VOLUME (TOTAL)", v:protocolVolumeUsd, c:"#facc15" },
          { l:"FEES COLLECTED", v:protocolFeesUsd,   c:"#fb923c" },
        ].map(s=>(
          <div key={s.l} style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.08)", borderRadius:4, padding:"7px 8px" }}>
            <div style={{ fontSize:7, color:"#64748b", letterSpacing:".12em", fontFamily:"monospace", marginBottom:2 }}>{s.l}</div>
            <div style={{ fontSize:11, fontWeight:700, color:s.c, fontFamily:"monospace" }}>{s.v}</div>
          </div>
        ))}
      </div>
      {/* Token selector + amount */}
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.12)", borderRadius:5, padding:"13px 15px", marginBottom:12 }}>
        <div style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", letterSpacing:".12em", marginBottom:6 }}>TOKEN</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:10 }}>
          {TOKEN_LIST.map((t,i)=>(
            <button key={t.symbol} onClick={()=>{setTokenIdx(i);setAmount("");}}
              style={{ padding:"9px 4px", background:tokenIdx===i?"rgba(0,255,176,.12)":"rgba(0,0,0,.5)", border:`1px solid ${tokenIdx===i?"rgba(0,255,176,.5)":"rgba(0,255,176,.1)"}`, borderRadius:4, color:tokenIdx===i?"#00FFB0":"#94a3b8", fontSize:11, fontFamily:"monospace", cursor:"pointer", fontWeight:tokenIdx===i?700:400 }}>
              {t.logo} {t.symbol}
            </button>
          ))}
        </div>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:5, letterSpacing:".1em" }}>
          AMOUNT — min {token.minDisplay}
        </div>
        <OsField label={`${token.symbol} AMOUNT`} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon={token.logo} suffix={token.symbol}/>
        {(() => {
          if (token.isNative) {
            // Native USDC: % fee, naturally USDC-denominated
            const bps = ps?.protocolFeeBps;
            const rateLabel = bps == null ? "loading…" : bps === 0 ? "0.00%" : `${(bps/100).toFixed(2)}%`;
            let feeAmountLabel = rateLabel;
            if (bps != null && amount && !isNaN(parseFloat(amount))) {
              const amountUnits = BigInt(Math.round(parseFloat(amount) * 1e6));
              const { fee } = previewDepositFee(amountUnits, bps, true, 0n);
              feeAmountLabel = fee > 0n ? `${formatToken(fee, token.decimals)} ${token.symbol}` : "Free";
            }
            return <IG items={[["Protocol Fee", feeAmountLabel, bps==null ? "loading…" : `${rateLabel} rate`], ["Gas","USDC","Arc Testnet"], ["Privacy","ZK proof","On-chain"]]}/>;
          }
          // EURC/cirBTC (v2.8): flat fee, paid SEPARATELY in USDC — never a % of the
          // deposited token, since there's no on-chain price feed to convert one to
          // the other. The deposited amount itself is always credited in full.
          const flat = ps?.flatFeeUsdc;
          const feeLabel = flat == null ? "loading…" : Number(flat) === 0 ? "Free" : `${formatToken(flat, 6)} USDC`;
          return <IG items={[["Protocol Fee", feeLabel, "paid in USDC, separate"], ["Gas","USDC","Arc Testnet"], ["Privacy","ZK proof","On-chain"]]}/>;
        })()}
      </div>
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:3, padding:"8px 11px", marginBottom:8, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5 }}>
        ℹ {token.isNative ? "1 transaction: Deposit (native USDC via msg.value)." : `2 transactions: Approve ${token.symbol} → Deposit (protocol fee paid separately in USDC via msg.value).`} Gas paid in USDC on Arc Testnet.
        <br/>Need tokens? <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ color:"#0EA5E9" }}>faucet.circle.com ↗</a>
        {" · "}<a href={`${ARC_TESTNET.explorer}/address/${CONTRACTS.PrivarShieldVault}`} target="_blank" rel="noreferrer" style={{ color:"#00FFB0" }}>PrivarShieldVault ↗</a>
      </div>

      {/* Token registration status — shown when connected */}
      {onArc && selectedSupported === false && (
        <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.3)", borderRadius:3, padding:"8px 11px", marginBottom:8, fontSize:9, color:"#f87171", fontFamily:"monospace", lineHeight:1.6 }}>
          ⚠ {token.symbol} deposits are temporarily unavailable on this deployment. Please contact support or try again later.
        </div>
      )}
      {onArc && selectedSupported === true && (
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, padding:"6px 11px", marginBottom:8, fontSize:9, color:"#00FFB0", fontFamily:"monospace" }}>
          ✓ {token.symbol} is available for shielding
        </div>
      )}

      <ArcBtn label={onArc ? (selectedSupported === false ? `⚠ ${token.symbol} NOT REGISTERED` : `⟶ SHIELD ${token.symbol} (REAL TX)`) : "⚠ SWITCH TO ARC TESTNET FIRST"} onClick={onArc && selectedSupported !== false ? submit : undefined} loading={loading} disabled={!onArc || selectedSupported === false || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0} color={selectedSupported === false ? "#ef4444" : onArc ? "#00FFB0" : "#F59E0B"}/>
    </div>
  );
}

function SwapPanel({ account, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded, protocolStats, onChainActivity }) {
  // ── Architecture: PrivarShieldVault.privateSwap()/privateSwapWithRouter() ──
  // Flow (1 tx via PrivarShieldVault) :
  //   PrivarShieldVault.privateSwapWithRouter(dexRouter, ...)
  //     → dexRouter.executeSwap()
  //       → XyloNetPrivacyAdapter (direct, real on-chain AMM — XyloRouter, always deployed)
  //       → UniswapPrivacyAdapter (direct, real on-chain AMM, if configured)
  //       → LiFiPrivacyAdapter (reserve, LI.FI Diamond, off-chain-quoted route)
  //       → CurvePrivacyAdapter (reserve, real on-chain StableSwap, if a pool is wired up)
  //
  // v4.0.0/v5.0.0 — TowerSwapAdapter (simulated pricing, always-succeeds
  // fallback) removed entirely. Unlike v4.0.0, there IS now a guaranteed
  // direct-adapter fallback even during a LI.FI outage — XyloNetPrivacyAdapter
  // is always deployed — see CONTRACTS.XyloNetPrivacyAdapter's doc comment
  // in contracts.js.
  //
  // See scripts/deploy-v5.0.0-full.js for how the router whitelist gets set.

  const TK  = ["USDC","EURC","cirBTC"];
  const [fr, setFr]           = useState("USDC");
  const [to, setTo]           = useState("EURC");
  const [amount, setAmount]   = useState("");
  const [q, setQ]             = useState(null);
  const [loading, setLoading] = useState(false);
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance, onSuccess: () => { protocolStats?.refresh?.(); onChainActivity?.refresh?.(); } });
  const bals = shieldedBals;

  const SWAP_TOKENS = {
    USDC:   { sym:"USDC",   addr: NATIVE_USDC,      dec:6, bal: bals?.usdc ?? 0, fmt:v=>"$"+v.toFixed(2)  },
    EURC:   { sym:"EURC",   addr: CONTRACTS.EURC,   dec:6, bal: bals?.eurc ?? 0, fmt:v=>"€"+v.toFixed(2)  },
    cirBTC: { sym:"cirBTC", addr: CONTRACTS.cirBTC, dec:8, bal: bals?.cbtc ?? 0, fmt:v=>"₿"+v.toFixed(5)  },
  };
  const tkFr = SWAP_TOKENS[fr] || SWAP_TOKENS.USDC;
  const tkTo = SWAP_TOKENS[to] || SWAP_TOKENS.EURC;

  // Price-matrix quote
  useEffect(() => {
    if (!amount || isNaN(amount) || Number(amount) <= 0) { setQ(null); return; }
    const id = setTimeout(() => {
      const eurUsd = prices?.EUR ?? prices?.EURC ?? 1.08;
      const btcUsd = prices?.BTC ?? prices?.cirBTC ?? 100000;
      const toUsd  = { USDC:1, EURC:eurUsd, cirBTC:btcUsd };
      const rate   = toUsd[fr] / toUsd[to];
      setQ({ out:(Number(amount)*rate*0.9995).toFixed(tkTo.dec===8?6:4), rate:rate.toFixed(tkTo.dec===8?8:4) });
    }, 400);
    return () => clearTimeout(id);
  }, [amount, fr, to, prices]);

  const flip = () => { const t=fr; setFr(to); setTo(t); setAmount(""); setQ(null); };

  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const isRouterSet = (a) => a && a.toLowerCase() !== ZERO_ADDR;

  const swap = async () => {
    if (!amount || !q || !onArc) return;
    if (fr === to) { notify("Swap","Sélectionnez deux tokens différents.","error"); return; }
    if (tkFr.bal <= 0) { notify("Swap",`Insufficient shielded ${fr} balance.`,"error"); return; }

    // LIQUIDITY ENGINE: privateSwapWithRouter() lets the frontend pick ANY
    // whitelisted adapter per call, instead of being locked into the
    // single admin-configured default swapRouter. v5.0.0 architecture —
    // DIRECT ADAPTERS (XyloNet, Uniswap) are the primary path: on-chain,
    // deterministic swaps against a whitelisted DEX router, tried first.
    // The RESERVE / AGGREGATOR pair (LiFiPrivacyAdapter, CurvePrivacyAdapter)
    // stays active and whitelisted — never removed from this chain — but is
    // only reached dynamically, when no direct adapter covers the pair; in
    // principle it's not chosen unless actually needed. See the
    // attempt-chain below. v4.0.0/v5.0.0 — TowerSwapAdapter removed: no
    // more guaranteed-works fallback if every router below is unavailable.
    if (!isRouterSet(CONTRACTS.XyloNetPrivacyAdapter) && !isRouterSet(CONTRACTS.UniswapPrivacyAdapter)
        && !isRouterSet(CONTRACTS.LiFiPrivacyAdapter) && !isRouterSet(CONTRACTS.CurvePrivacyAdapter)) {
      notify("Swap","No swap router configured at all (XyloNet/Uniswap/LI.FI/Curve all unset).","error");
      return;
    }

    setLoading(true);
    let   amountBig    = BigInt(Math.round(Number(amount)    * (10 ** tkFr.dec)));
    let   outAmountBig = BigInt(Math.round(parseFloat(q.out) * (10 ** tkTo.dec)));
    let   minOut       = outAmountBig * 990n / 1000n;
    const deadline     = BigInt(Math.floor(Date.now()/1000) + 600);

    // Find note for tokenIn BEFORE fetching any quote — this used to
    // happen after the quote fetch, using the original (possibly too-large,
    // e.g. MAX-button-rounded) amountBig. If the best available note was
    // slightly short, the code fell back to "largest note" but kept quoting/
    // spending the original amountBig, guaranteeing a real on-chain
    // "ERC20: transfer amount exceeds balance" revert. Now we clamp first,
    // so every downstream step (quote, routeData, calldata) is built for the
    // amount we can actually spend.
    const notes      = getNotes(account?.address);
    // status !== "locked" excludes notes already committed to another
    // in-flight swap/send/withdraw/bridge — see lockNotesForOp() doc
    // comment. Old notes with no `status` field are treated as available
    // (undefined !== "locked"), so this is backward compatible.
    const tokenNotes = notes.filter(n => n.token?.toLowerCase() === tkFr.addr.toLowerCase() && n.status !== "locked");
    let note = tokenNotes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig);
    if (!note && tokenNotes.length > 0) {
      note = tokenNotes.reduce((best, n) =>
        BigInt(Math.round(Number(n.amount)||0)) > BigInt(Math.round(Number(best.amount)||0)) ? n : best
      );
      const noteRaw = BigInt(Math.round(Number(note.amount)||0));
      if (noteRaw < amountBig) amountBig = noteRaw;
    }
    if (!note) {
      notify("Swap",`No shielded ${fr} note found.`,"error");
      setLoading(false); return;
    }

    // ── Safety clamp: real on-chain vault balance for tokenIn ────────────
    // A locally-recorded note's amount is only ever as accurate as the
    // value it was created with — e.g. a swap's output note is journaled
    // from the pre-trade router quote (attemptXyloNet()'s `out`), not the
    // post-trade balance actually measured on-chain. Even a 1-raw-unit gap
    // between that local figure and the vault's REAL token balance is
    // enough to guarantee a hard revert here: the vault does a literal
    // `IERC20(tokenIn).transfer(dexRouter, amountIn)` with no partial-fill
    // fallback ("ERC20: transfer amount exceeds balance" — confirmed via
    // ArcScan raw trace + on-chain balanceOf vs. the shielded-wallet MAX
    // amount both being off by exactly 0.000001). Read the real balance
    // right before submitting and clamp down to it — this only ever makes
    // the request SMALLER, never larger, so it can't introduce a new
    // failure mode of its own.
    // `realBal` is deliberately hoisted OUTSIDE the try block (not just a
    // local inside it): the "remaining"/change-note computation further
    // below MUST be able to see it too. Without this, a clamp firing here
    // (note ahead of real balance) let the LATER `remaining = note.amount -
    // amountBig` line keep using the inflated `note.amount` as its base —
    // manufacturing a phantom "change" note for exactly the gap that was
    // just clamped away, i.e. real value that never existed on-chain. That
    // phantom note then compounds on every subsequent MAX round-trip swap,
    // which is precisely the "shielded balance keeps growing past TVL"
    // symptom this fix addresses.
    let realBal = null;
    try {
      const balData = SEL.balanceOf + encodeAddress(CONTRACTS.PrivarShieldVault);
      const balRes  = await rpcCallWithRetry("eth_call", [{ to: tkFr.addr, data: balData }, "latest"], 2, 500);
      realBal = balRes && balRes !== "0x" ? BigInt(balRes) : null;
      if (realBal !== null && realBal < amountBig) {
        console.warn(`[Swap] local ${fr} note (${amountBig}) exceeds the vault's real on-chain balance (${realBal}) — clamping down to avoid a guaranteed revert.`);
        amountBig = realBal;
      }
    } catch (e) {
      // Safety net, not a hard requirement — if the RPC call itself fails,
      // fall through with the locally-computed amount rather than blocking
      // the swap outright. realBal stays null, so the remaining/change-note
      // computation below falls back to trusting note.amount as before —
      // exactly the pre-clamp behavior, no new failure mode introduced.
      console.warn("[Swap] real vault balance check failed, proceeding with local note amount:", e.message);
    }
    if (amountBig <= 0n) {
      notify("Swap", `The vault's real ${fr} balance is currently 0 — nothing to swap right now.`, "error");
      setLoading(false); return;
    }

    // Real on-chain quote via the router's own getAmountsOut(), used by
    // attemptXyloNet/attemptUniswap below to set minAmountOut from the
    // pool's ACTUAL current output instead of the naive off-chain
    // price-matrix estimate in `q` (derived from an external EUR/USD
    // feed). On a thin/imbalanced pool the two can diverge by more than
    // the slippage tolerance, which used to guarantee a real
    // "XyloRouter: INSUFFICIENT_OUTPUT" revert even though nothing was
    // actually broken (see v17.1.3 changelog). Returns null on any
    // failure (router unset, call reverts, bad decode) so callers can
    // fall back to the naive estimate rather than block the swap outright.
    async function quoteFromRouter(routerAddr, tokenIn, tokenOut, amountInBig) {
      if (!isRouterSet(routerAddr)) return null;
      try {
        const data = buildGetAmountsOutCall(amountInBig, [tokenIn, tokenOut]);
        const res  = await rpcCallWithRetry("eth_call", [{ to: routerAddr, data }, "latest"], 2, 500);
        return decodeAmountsOutReturn(res);
      } catch (e) {
        console.warn("[Swap] on-chain quote failed, falling back to price-matrix estimate:", e.message);
        return null;
      }
    }

    // ── Try each whitelisted router in priority order ────────────────────
    // DIRECT ADAPTERS first (XyloNet, then Uniswap) — on-chain, deterministic,
    // no off-chain quote round-trip needed. Only if NEITHER direct adapter is
    // configured/whitelisted does the chain fall through to the RESERVE pair
    // (LiFi, then Curve). This is the "direct adapters primary, aggregator
    // reserve, chosen dynamically" architecture — LiFi/Curve stay fully wired
    // and active in this same list, just not attempted unless actually needed.
    // v4.0.0/v5.0.0 — TowerSwapAdapter (simulated pricing, always-succeeds
    // fallback) removed entirely: if every entry below is either
    // unconfigured or fails, the swap fails with no fallback. See
    // CONTRACTS.XyloNetPrivacyAdapter / UniswapPrivacyAdapter's doc
    // comments in contracts.js for why the two are independent contracts.
    async function attemptXyloNet() {
      if (!isRouterSet(CONTRACTS.XyloNetPrivacyAdapter)) return null;
      // v17.1.3: real getAmountsOut() quote from XyloRouter itself — falls
      // back to the naive price-matrix estimate (+ existing 1% tolerance)
      // only if the on-chain read fails, e.g. router address unset.
      const realOut = await quoteFromRouter(CONTRACTS.XyloRouter, tkFr.addr, tkTo.addr, amountBig);
      const out = realOut !== null ? realOut : outAmountBig;
      const min = realOut !== null ? (realOut * 990n / 1000n) : minOut;
      return { router: CONTRACTS.XyloNetPrivacyAdapter, routeData: "0x", outAmountBig: out, minOut: min, label: "XyloNet" };
    }
    async function attemptUniswap() {
      if (!isRouterSet(CONTRACTS.UniswapPrivacyAdapter)) return null;
      // Same real-quote-with-fallback pattern as attemptXyloNet above.
      const realOut = await quoteFromRouter(CONTRACTS.UniswapRouter, tkFr.addr, tkTo.addr, amountBig);
      const out = realOut !== null ? realOut : outAmountBig;
      const min = realOut !== null ? (realOut * 990n / 1000n) : minOut;
      return { router: CONTRACTS.UniswapPrivacyAdapter, routeData: "0x", outAmountBig: out, minOut: min, label: "Uniswap" };
    }
    // fromAddress/toAddress for LI.FI are the ADAPTER contract, never the
    // user's EOA: that's what keeps the swap's counterparty private
    // on-chain. RESERVE — only reached if attemptXyloNet/attemptUniswap
    // above both returned null (not configured for this deployment).
    async function attemptLiFi() {
      if (!isRouterSet(CONTRACTS.LiFiPrivacyAdapter)) return null;
      try {
        const quote = await fetchLiFiQuote({
          fromChain: ARC_CHAIN_ID, toChain: ARC_CHAIN_ID,
          fromToken: tkFr.addr, toToken: tkTo.addr,
          fromAmount: amountBig.toString(),
          fromAddress: CONTRACTS.LiFiPrivacyAdapter,
        });
        const routeData = encodeLiFiRouteData(quote.transactionRequest.to, quote.transactionRequest.value, quote.transactionRequest.data);
        return {
          router: CONTRACTS.LiFiPrivacyAdapter,
          routeData,
          outAmountBig: quote?.estimate?.toAmountMin ? BigInt(quote.estimate.toAmount) : outAmountBig,
          minOut:       quote?.estimate?.toAmountMin ? BigInt(quote.estimate.toAmountMin) : minOut,
          label: "LI.FI",
        };
      } catch (e) {
        console.warn("[Swap] LI.FI attempt failed, trying next router:", e.message);
        return null;
      }
    }
    // CURVE_POOLS: per-pair (pool, i, j) config — see CurvePrivacyAdapter.sol's
    // doc comment for why this can't be derived automatically (Curve pools
    // identify tokens by index, not address, and no real pool address on
    // Arc Testnet has been independently verified yet). Empty until a real
    // pool is confirmed and its token-index mapping is known — attemptCurve
    // self-activates for whichever pair gets an entry here, no other code
    // change needed. Key format: "tokenInSymbol->tokenOutSymbol". RESERVE —
    // same "only if the direct adapters didn't cover this pair" rationale.
    const CURVE_POOLS = {
      // "USDC->EURC": { pool: "0x...", i: 0, j: 1 },
    };
    function attemptCurve() {
      if (!isRouterSet(CONTRACTS.CurvePrivacyAdapter)) return null;
      const cfg = CURVE_POOLS[`${fr}->${to}`];
      if (!cfg) return null; // this pair isn't wired to a verified pool yet
      const routeData = encodeCurveRouteData(cfg.pool, cfg.i, cfg.j);
      // Curve StableSwap pricing is on-chain and atomic, like Uniswap/XyloNet
      // — the adapter reverts (SlippageExceeded) if the real output
      // undercuts minOut, so the local naive estimate + slippage tolerance
      // is safe here too.
      return { router: CONTRACTS.CurvePrivacyAdapter, routeData, outAmountBig, minOut, label: "Curve" };
    }

    // DIRECT ADAPTERS (XyloNet, Uniswap) tried first, in that order; only
    // if NEITHER is configured/whitelisted does the chain reach the
    // RESERVE pair (LiFi, Curve) — see the block comment above.
    let chosen = null;
    for (const attempt of [attemptXyloNet, attemptUniswap, attemptLiFi, attemptCurve]) {
      chosen = await attempt();
      if (chosen) break;
    }
    if (!chosen) {
      notify("Swap", "No route available on any configured router (XyloNet/Uniswap/LI.FI/Curve).", "error");
      setLoading(false); return;
    }
    const { router: chosenRouter, routeData, label: routerLabel } = chosen;
    outAmountBig = chosen.outAmountBig;
    minOut       = chosen.minOut;

    // Read Merkle root
    let merkleRoot;
    try {
      const res = await rpcCallWithRetry("eth_call",[{ to:CONTRACTS.PrivarMerkleTreeManager, data:buildGetLastRootCall() },"latest"]);
      merkleRoot = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { merkleRoot = null; }
    if (!merkleRoot) {
      notify("Swap","Could not read the Merkle root.","error");
      setLoading(false); return;
    }

    const nullifier     = randomBytes32();
    const commitmentOut = randomBytes32();

    // v3.4.2 correction: local notes are tracked in the SAME "display
    // decimals" convention everywhere (6-dec for USDC/EURC, matching
    // token.decimals) — see ShieldPanel's deposit note, which stores
    // netAmount BEFORE the *1e12 native-wei conversion (that conversion is
    // applied only once, at calldata-build time, inside
    // buildDepositCalldata/buildWithdrawCalldata via NATIVE_TO_ERC20). The
    // contract-side fix (shieldedAmountOut in PrivarShieldVault.sol) only
    // changes what's stored ON-CHAIN in totalShieldedByToken/the real note;
    // it does not change this local-tracking convention. Scaling
    // outAmountBig here would double-apply the conversion (it's re-applied
    // again by buildWithdrawCalldata later), inflating the displayed
    // shielded balance by 1e12 — confirmed exactly by this bug report.
    // Protocol fee — flatFeeUsdc (ERC-20-out leg, paid as separate msg.value,
    // never touches the shielded note) AND swapFeeBps (native-USDC-out leg,
    // skimmed on-chain from amountOut BEFORE it's credited to
    // totalShieldedByToken[USDC] / the new note — see PrivarShieldVault.sol
    // _privateSwap()'s `if (isNativeOut && swapFeeBps > 0) { ... amountOut -= fee }`).
    // Both must be read here: the on-chain skim on the output leg was
    // previously never mirrored client-side, so every swap landing in USDC
    // journaled/tracked a note for the FULL pre-fee amountOut while the vault
    // only ever shielded amountOut-fee — a silent, compounding overcount of
    // the local balance vs the real on-chain totalShielded(USDC), which is
    // exactly the "local balance higher than TVL" drift reported in prod.
    const isNativeOut = tkTo.addr.toLowerCase() === NATIVE_USDC.toLowerCase();
    let flatFeeUsdc = 0n, swapFeeBps = 0n;
    try {
      const [flatRes, swapFeeBpsRes] = await Promise.all([
        rpcCallWithRetry("eth_call",[{ to:CONTRACTS.PrivarShieldVault, data:SEL.flatFeeUsdc },"latest"]),
        rpcCallWithRetry("eth_call",[{ to:CONTRACTS.PrivarShieldVault, data:SEL.swapFeeBps },"latest"]),
      ]);
      flatFeeUsdc = flatRes && flatRes !== "0x" ? BigInt(flatRes) : 0n;
      swapFeeBps  = swapFeeBpsRes && swapFeeBpsRes !== "0x" ? BigInt(swapFeeBpsRes) : 0n;
    } catch (e) {
      notify("Swap", "Could not read current fees (slow network) — please retry.", "error");
      setLoading(false); return;
    }

    // Mirror the contract's skim exactly (integer division, same rounding
    // as Solidity) so the local note never claims more than what actually
    // lands in totalShieldedByToken[USDC].
    const noteAmountOut = (isNativeOut && swapFeeBps > 0n)
      ? outAmountBig - (outAmountBig * swapFeeBps / 10000n)
      : outAmountBig;

    // v3.4 — embed the SPEND + ADD(s) journal ops directly in this SAME swap
    // transaction instead of 2-3 separate follow-up calls. See
    // PrivarShieldVault.sol's NoteJournal doc comment.
    await ensureSelfBackupKeyReady(account?.address);
    // The change note's base MUST be the smaller of (a) what the local note
    // claims and (b) the real on-chain balance just read above (`realBal`,
    // when available) — never note.amount alone. If the clamp above fired
    // (note.amount was ahead of reality), amountBig now equals the real
    // balance and the true leftover is realBal - amountBig (i.e. 0, if the
    // whole real balance was just spent) — NOT note.amount - amountBig,
    // which would fabricate a change note for the exact gap that was just
    // clamped away. See the clamp's doc comment above for the full story.
    const noteAmt = BigInt(Math.round(Number(note.amount)||0));
    const changeBase = (realBal !== null && realBal < noteAmt) ? realBal : noteAmt;
    const remaining = changeBase - amountBig;
    const changeCommitment = remaining > 0n ? randomBytes32() : null;
    const swapOps = [
      { t: 1, commitment: note.commitment },
      { t: 0, commitment: commitmentOut, amount: noteAmountOut.toString(), token: tkTo.addr },
    ];
    if (changeCommitment) swapOps.push({ t: 0, commitment: changeCommitment, amount: remaining.toString(), token: note.token });
    const journalEntry = await encryptJournalBlob(account?.address, { ts: Date.now(), ops: swapOps });

    // Build calldata for PrivarShieldVault.privateSwapWithRouter() — always
    // explicit about which whitelisted router executes the swap now (see
    // the attempt-chain above), instead of the old binary LI.FI/Tower choice.
    const { data, value } = buildSwapWithRouterCalldata({
      nullifier, root: merkleRoot, tokenIn: tkFr.addr, tokenOut: tkTo.addr,
      amountIn: amountBig, minAmountOut: minOut,
      commitmentOut, deadline, dexRouter: chosenRouter, routeData, flatFeeUsdc,
      encryptedEntry: journalEntry || "0x",
    });

    // ── Robust note lifecycle (see lockNotesForOp doc comment) ───────────
    // Lock the input note and pre-register the exact outputs this swap
    // will create on success — BEFORE the transaction is even sent. From
    // this point the outcome is tracked in a durable ledger instead of
    // only in this function's local `notes` variable, so it survives a
    // closed tab, a dropped connection, or the waitForReceipt() timeout.
    const swapOutputs = [{ commitment: commitmentOut, amount: noteAmountOut.toString(), token: tkTo.addr, cloudSynced: !!journalEntry }];
    if (changeCommitment) swapOutputs.push({ ...note, amount: remaining.toString(), commitment: changeCommitment, cloudSynced: !!journalEntry });
    const opId = lockNotesForOp(account?.address, {
      kind: "swap", label: `Swap ${fr}→${to}`,
      inputCommitments: [note.commitment], outputs: swapOutputs,
    });
    if (!opId) {
      notify("Swap", "This note was just used by another operation — please retry.", "error");
      setLoading(false); return;
    }
    recomputeShielded?.();

    const ok = await sendRealTx({
      label: `Swap ${fr}→${to}`,
      description: `Private swap ${amount} ${fr} → ~${q.out} ${to} via PrivarShieldVault + ${routerLabel}`,
      buildTx: () => ({ to: CONTRACTS.PrivarShieldVault, value, data }),
      onHash: (hash) => markOpSubmitted(account?.address, opId, hash),
      // Ground truth over prediction (see decodeDepositedAmountForCommitment's
      // doc comment): noteAmountOut above already mirrors the contract's
      // swapFeeBps skim, but a mirror can still drift from reality (admin
      // changes swapFeeBps between quote-time and confirmation, a future fee
      // model change, a rounding edge case). Reading the real Deposited log
      // makes that drift structurally impossible instead of relying on the
      // client math staying perfectly in sync forever.
      onReceipt: (receipt) => {
        const real = decodeDepositedAmountForCommitment(receipt, commitmentOut);
        if (real == null) return; // no matching log — keep the pre-tx estimate, unchanged behavior
        // Deposited's `amount` is native 18-dec wei for NATIVE_USDC (same
        // scale as totalShieldedByToken on-chain); local notes are tracked
        // in display decimals (6-dec) — see noteAmountOut's own doc comment
        // above for why. Scale back down before persisting.
        const realDisplay = isNativeOut ? real / NATIVE_TO_ERC20 : real;
        correctOpOutputAmount(account?.address, opId, commitmentOut, realDisplay);
      },
    });

    if (ok) {
      finalizeOp(account?.address, opId, "success");
      recomputeShielded?.();
      notify("Swap ✓",`${amount} ${fr} → ~${q.out} ${to} — swap confidentiel terminé.`,"success");
    } else {
      // ok===false covers 3 distinct cases — never blindly restore the
      // note, since a real revert and a submitted-but-unconfirmed tx are
      // NOT the same thing (the nullifier really can be spent on-chain
      // even though sendRealTx() reports failure, e.g. after its 60s
      // waitForReceipt() ceiling). Check the receipt ourselves before
      // deciding.
      const pending = getPendingOps(account?.address).find(o => o.opId === opId);
      if (!pending?.txHash) {
        // Never left the wallet (rejected, or an error before broadcast) —
        // safe to restore immediately, nothing could have reached the chain.
        finalizeOp(account?.address, opId, "abandoned");
      } else {
        const outcome = await checkReceiptOutcome(pending.txHash);
        if (outcome === "reverted") finalizeOp(account?.address, opId, "reverted");
        // outcome === "unknown" -> leave LOCKED; watchPendingOps() resolves
        // it on the next background pass once the receipt actually lands.
      }
      recomputeShielded?.();
    }

    setAmount(""); setQ(null); setLoading(false);
  };

  const TS = ({ v, onChange, exclude }) => (
    <select value={v} onChange={e => onChange(e.target.value)}
      style={{ background:"rgba(0,0,0,.5)", border:"1px solid rgba(0,255,176,.18)", borderRadius:3, color:"#ffffff", fontSize:11, fontFamily:"monospace", padding:"8px 9px", cursor:"pointer", outline:"none", flexShrink:0 }}>
      {TK.filter(t => t !== exclude).map(t => <option key={t}>{t}</option>)}
    </select>
  );

  // v5.0.0 — reflects the SAME priority chain as swap()'s attemptXyloNet/
  // attemptUniswap/attemptLiFi/attemptCurve, for the "Adapter" info badge
  // below: direct adapters (XyloNet, Uniswap) first, LI.FI reserve last.
  // Curve deliberately excluded here even though CurvePrivacyAdapter may be
  // deployed: it only actually routes a pair present in swap()'s local
  // CURVE_POOLS config, which is empty until a real pool is verified — so
  // showing it as "available" here would be misleading before that.
  const availableRouters = [
    isRouterSet(CONTRACTS.XyloNetPrivacyAdapter) && "XyloNetPrivacyAdapter",
    isRouterSet(CONTRACTS.UniswapPrivacyAdapter) && "UniswapPrivacyAdapter",
    isRouterSet(CONTRACTS.LiFiPrivacyAdapter)    && "LiFiPrivacyAdapter",
  ].filter(Boolean);
  const routerOk = availableRouters.length > 0;
  const primaryRouterLabel = availableRouters[0] || "none";

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="⇄" title="SWAP" sub="Confidential swap — PrivarShieldVault + best-execution routing (Arc Testnet)"/>
      <NotOnArcWarning/>
      {!routerOk && (
        <div style={{ background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:4, padding:"8px 12px", marginBottom:10, fontSize:8, color:"#fca5a5", fontFamily:"monospace", lineHeight:1.7 }}>
          ⚠ <strong style={{ color:"#f87171" }}>No swapRouter deployed</strong><br/>
          <code>npx hardhat run scripts/deploy-lifi.js --network arc_testnet</code><br/>
          then set <code>VITE_LIFI_ADAPTER=0x...</code> in the Vercel Dashboard
        </div>
      )}
      <ShieldedWallet bals={bals} actionableFilter={["USDC","EURC","cirBTC"]}
        onMax={(sym, val, _raw, dec) => { setFr(sym); if (sym===to) setTo(TK.find(t=>t!==sym)||"EURC"); setAmount((Number(_raw)/10**dec).toFixed(dec)); }}
        protocolStats={protocolStats}/>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:4 }}>DE</div>
          <TS v={fr} onChange={v => { setFr(v); if (v===to) setTo(TK.find(t=>t!==v)||"EURC"); setAmount(""); setQ(null); }} exclude={to}/>
        </div>
        <button onClick={flip} style={{ background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.3)", borderRadius:"50%", width:34, height:34, cursor:"pointer", color:"#00FFB0", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", marginTop:16, flexShrink:0 }}>⇄</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:4 }}>VERS</div>
          <TS v={to} onChange={v => { setTo(v); if (v===fr) setFr(TK.find(t=>t!==v)||"USDC"); setQ(null); }} exclude={fr}/>
        </div>
      </div>
      <OsField label={`AMOUNT (${fr})`} value={amount} onChange={e=>setAmount(e.target.value)}
        placeholder={tkFr.dec===8?"0.00000":"0.00"} icon="⇄" suffix={fr}/>
      {q && (
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.12)", borderRadius:4, padding:"9px 12px", marginBottom:10, fontFamily:"monospace" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontSize:8, color:"#64748b" }}>YOU RECEIVE (estimated)</span>
            <span style={{ fontSize:11, color:"#00FFB0", fontWeight:700 }}>{q.out} {to}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:7, color:"#475569" }}>Rate</span>
            <span style={{ fontSize:7, color:"#94a3b8" }}>1 {fr} ≈ {q.rate} {to}</span>
          </div>
        </div>
      )}
      <IG items={[["Privacy","✓ PrivarShieldVault","1 tx"],["Adapter", primaryRouterLabel, availableRouters.length > 1 ? `+${availableRouters.length-1} fallback` : "live"],["Available",tkFr.bal.toFixed(tkFr.dec===8?5:2)+" "+fr,"shielded"]]}/>
      {tkFr.bal <= 0 && (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ Solde shieldé {fr} à zéro. Shieldez des {fr} d'abord.
        </div>
      )}
      <ArcBtn
        label={!onArc ? "⚠ SWITCH TO ARC TESTNET" : loading ? "En cours…" : `⇄ SWAP ${fr} → ${to}`}
        onClick={onArc && !loading && routerOk ? swap : undefined} loading={loading}
        disabled={!onArc||!amount||Number(amount)<=0||!q||tkFr.bal<=0||loading||!routerOk}
        color={onArc && routerOk ? "#00FFB0" : "#F59E0B"}
      />
    </div>
  );
}

function SendPanel({ account, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded, protocolStats, onChainActivity }) {
  const [to, setTo]=useState(""); const [amount, setAmount]=useState(""); const [loading, setLoading]=useState(false);
  const [mode, setMode]=useState("shielded");
  const [confirmTx, setConfirmTx] = useState(null);
  const confirmRef = useRef(null);
  const askConfirm = (txInfo) => new Promise(resolve => { confirmRef.current = resolve; setConfirmTx(txInfo); });
  const onConfirm  = () => { setConfirmTx(null); confirmRef.current?.(true); };
  const onCancel   = () => { setConfirmTx(null); confirmRef.current?.(false); };
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance, onSuccess: () => { protocolStats?.refresh?.(); onChainActivity?.refresh?.(); } });
  const bals = shieldedBals;

  // NOTE: ARC Name Service (.arc) is not yet deployed — there is no on-chain
  // registry to resolve names against. Only raw 0x addresses are accepted.
  const isArcName = to.trim().toLowerCase().endsWith(".arc");

  // Token selector for send
  const SEND_TOKENS = {
    USDC:   { sym:"USDC",   addr: NATIVE_USDC,      dec:6, bal: bals?.usdc ?? 0 },
    EURC:   { sym:"EURC",   addr: CONTRACTS.EURC,   dec:6, bal: bals?.eurc ?? 0 },
    cirBTC: { sym:"cirBTC", addr: CONTRACTS.cirBTC, dec:8, bal: bals?.cbtc ?? 0 },
  };
  const [sendToken, setSendToken] = useState("USDC");
  const tkSend = SEND_TOKENS[sendToken] || SEND_TOKENS.USDC;

  const sendShielded = async () => {
    if (!amount || Number(amount) <= 0) return;
    const dest = to.trim();
    if (isArcName) { notify("Send", "ARC Name Service is not live yet — enter a 0x address directly.", "error"); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) { notify("Send", "Invalid address format", "error"); return; }
    if (!tkSend.addr || tkSend.addr === "0x0000000000000000000000000000000000000000") {
      notify("Send", `${sendToken} address not configured.`, "error"); return;
    }
    setLoading(true);

    const notes     = getNotes(account?.address);
    let   amountBig = BigInt(Math.round(Number(amount) * (10 ** tkSend.dec)));

    // Float-safe note lookup filtered by token — locked notes (already
    // committed to another in-flight op) are excluded, see lockNotesForOp.
    const tokenNotes = notes.filter(n => n.token?.toLowerCase() === tkSend.addr.toLowerCase() && n.status !== "locked");
    let note = tokenNotes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig);
    if (!note && tokenNotes.length > 0) {
      // Fallback to largest note — clamp amountBig so we never request more
      // than the note's real raw balance (avoids a guaranteed on-chain revert).
      note = tokenNotes.reduce((best, n) =>
        BigInt(Math.round(Number(n.amount)||0)) > BigInt(Math.round(Number(best.amount)||0)) ? n : best
      );
      const noteRaw = BigInt(Math.round(Number(note.amount)||0));
      if (noteRaw < amountBig) amountBig = noteRaw;
    }
    if (!note) {
      notify("Send", `No shielded ${sendToken} found. Shield ${sendToken} first.`, "error");
      setLoading(false); return;
    }

    let merkleRoot;
    try {
      const res = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarMerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      merkleRoot = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { merkleRoot = null; }
    if (!merkleRoot) {
      notify("Send", "Could not read on-chain state. Ensure you are on Arc Testnet.", "error");
      setLoading(false); return;
    }

    const nullifierIn   = randomBytes32();
    const commitmentOut = randomBytes32();

    // ── ECDH: encrypt the note for the recipient (real P-256 ECDH, see eciesEncryptNoteForRecipient) ──
    // Looks up the recipient's registered view public key on ViewKeyRegistry. Returns null
    // (graceful fallback) if ViewKeyRegistry isn't deployed yet or the recipient hasn't
    // registered a view key — the confidential send itself still proceeds either way.
    let encryptedNote   = null;
    let ephemeralPubKey = null;
    const isSelfSend = dest.toLowerCase() === account?.address?.toLowerCase?.();

    if (!isSelfSend) {
      try {
        const noteJson = JSON.stringify({
          commitment: commitmentOut,
          amount:     amountBig.toString(),
          token:      note.token,
          from:       account?.address,
          ts:         Date.now(),
          vault:      CONTRACTS.PrivarShieldVault, // see relaySelfNote's v2.9 comment for why
        });
        const ecies = await eciesEncryptNoteForRecipient(dest, noteJson);
        if (ecies) {
          encryptedNote   = ecies.encryptedNote;
          ephemeralPubKey = ecies.ephemeralPubKey;
        }
      } catch(e) {
        console.warn("[ECDH encrypt]", e.message);
        // Fallback: recipient note stays local-only (existing manual-share behavior)
      }
    }

    // ── Flat protocol fee (PrivarShieldVault v2.4+ — flatFeeUsdc, native USDC msg.value) ──
    // Read before showing the confirm modal so the fee is disclosed up front.
    // Defaults to 0 until governance opts in via setSendFlatFee — matches pre-v2.4
    // behavior exactly when unset.
    let sendFee = 0n;
    try {
      const feeRes = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.flatFeeUsdc }, "latest"]);
      sendFee = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
    } catch { /* fee read failed — assume 0, matches default deploy state */ }

    const confirmed = await askConfirm({
      label:  "Confidential Send",
      amount,
      token:  sendToken,
      to:     dest,
      note:   (encryptedNote
        ? "Recipient has confidential receiving enabled — an encrypted note will be relayed on-chain so their wallet auto-discovers these funds. 2 transactions: shielded transfer, then note relay."
        : "Private send — recipient hasn't enabled confidential receiving yet, so no auto-discovery note will be sent. 1 transaction.")
        + (sendFee > 0n ? ` Flat protocol fee: ${formatToken(sendFee, 6)} USDC (paid separately, not from your shielded balance).` : ""),
    });
    if (!confirmed) { setLoading(false); return; }

    // v3.4 — embed the SPEND (and, if there's change, ADD) journal ops for
    // the SENDER's own records directly in this SAME transaction, separate
    // from `encryptedNote` (which is encrypted to the RECIPIENT's view key
    // and relayed via ViewKeyRegistry in a second tx below — unrelated
    // transport, unrelated key). See PrivarShieldVault.sol's NoteJournal
    // doc comment for why embedding beats a follow-up broadcast.
    await ensureSelfBackupKeyReady(account?.address);
    const remaining = BigInt(Math.round(Number(note.amount)||0)) - amountBig;
    const changeCommitment = remaining > 0n ? randomBytes32() : null;
    const selfOps = [{ t: 1, commitment: note.commitment }];
    if (changeCommitment) selfOps.push({ t: 0, commitment: changeCommitment, amount: remaining.toString(), token: note.token });
    const selfEntry = await encryptJournalBlob(account?.address, { ts: Date.now(), ops: selfOps });

    // Tx 1: the actual shielded fund movement
    const { data, value } = buildShieldedSendCalldata({
      nullifier: nullifierIn, root: merkleRoot, commitmentOut,
      encryptedNote: encryptedNote || "0x",
      encryptedSelfEntry: selfEntry || "0x",
    });
    // ── Robust note lifecycle (see lockNotesForOp doc comment) ───────────
    // The sender-side copy of the output note is history only (`status:
    // "sent"`, not "available") — ownership transferred to the recipient,
    // so it must never re-enter the sender's spendable set even on
    // finalizeOp's SUCCESS path.
    const sendOutputs = [{ commitment: commitmentOut, amount: amountBig.toString(), token: tkSend.addr, sentTo: dest, status: "sent" }];
    if (changeCommitment) sendOutputs.push({ ...note, amount: remaining.toString(), commitment: changeCommitment, cloudSynced: !!selfEntry });
    const opId = lockNotesForOp(account?.address, {
      kind: "send", label: "Confidential Send",
      inputCommitments: [note.commitment], outputs: sendOutputs,
    });
    if (!opId) {
      notify("Send", "This note was just used by another operation — please retry.", "error");
      setLoading(false); return;
    }
    recomputeShielded?.();

    const ok = await sendRealTx({
      label: "Confidential Send",
      description: `${amount} ${sendToken} → ${dest.slice(0,8)}… (shielded)`,
      buildTx: () => ({ to: CONTRACTS.PrivarShieldVault, value, data }),
      onHash: (hash) => markOpSubmitted(account?.address, opId, hash),
    });

    if (ok) {
      finalizeOp(account?.address, opId, "success");
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly; this is why the sender's displayed balance wasn't dropping after a confidential send

      if (isSelfSend) {
        notify("Confidential Send ✓", `${amount} ${sendToken} sent to your own shielded balance.`, "success");
      } else if (encryptedNote) {
        // Tx: relay the encrypted note via ViewKeyRegistry — non-blocking on failure,
        // funds already moved successfully in tx 1 regardless of this outcome.
        const { data: noteData } = buildEmitNoteCalldata({ recipient: dest, encryptedNote, ephemeralPubKey });
        const relayed = await sendRealTx({
          label: "Confidential Send · Note Relay",
          description: `Delivering encrypted note to ${dest.slice(0,8)}…`,
          buildTx: () => ({ to: CONTRACTS.ViewKeyRegistry, value: "0x0", data: noteData }),
        });
        notify(
          "Confidential Send ✓",
          relayed
            ? `${amount} USDC sent. Recipient's wallet will auto-decrypt and show these funds when they next connect to Privar.`
            : `${amount} USDC sent. Note relay was not confirmed — share the recipient address manually so they can locate the transfer.`,
          "success"
        );
      } else {
        notify("Confidential Send ✓", `${amount} USDC sent privately.${selfEntry ? " Change note backed up on-chain." : ""}`, "success");
      }
    } else {
      // See swap()'s identical comment: ok===false is not the same thing
      // as "safe to restore" — check the receipt before touching notes.
      const pending = getPendingOps(account?.address).find(o => o.opId === opId);
      if (!pending?.txHash) {
        finalizeOp(account?.address, opId, "abandoned");
      } else {
        const outcome = await checkReceiptOutcome(pending.txHash);
        if (outcome === "reverted") finalizeOp(account?.address, opId, "reverted");
      }
      recomputeShielded?.();
    }

    setTo(""); setAmount(""); setLoading(false);
  };

  const sendPublic = async () => {
    if (!amount) return;
    const dest = to.trim();
    if (isArcName) { notify("Send", "ARC Name Service is not live yet — enter a 0x address directly.", "error"); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) { notify("Send", "Invalid address format", "error"); return; }
    setLoading(true);
    const amountHex = "0x" + (BigInt(Math.round(Number(amount)*1e6)) * NATIVE_TO_ERC20_SHIFT).toString(16);
    await sendRealTx({ label:"Public Send", description:`${amount} USDC → ${sh(dest)} (public)`, buildTx:()=>({ to:dest, value:amountHex, data:"0x" }) });
    setTo(""); setAmount(""); setLoading(false);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <TxConfirmModal open={!!confirmTx} tx={confirmTx} onConfirm={onConfirm} onCancel={onCancel}/>
      <PH icon="↗" title="SEND" sub="Confidential send (shielded) or public transfer (on-chain)"/>
      <NotOnArcWarning/>
      <div style={{ display:"flex", gap:7, marginBottom:14 }}>
        {[["shielded","🛡 Confidential Send","Shielded — governed visibility"],["public","↗ Public Send","Direct transfer — visible on ARCScan"]].map(([m,label,desc])=>(
          <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:"9px 10px", background:mode===m?"rgba(0,255,176,.1)":"rgba(0,0,0,.35)", border:`1.5px solid ${mode===m?"rgba(0,255,176,.5)":"rgba(0,255,176,.1)"}`, borderRadius:5, cursor:"pointer", textAlign:"left", transition:"all .2s" }}>
            <div style={{ fontSize:10, color:mode===m?"#00FFB0":"#94a3b8", fontFamily:"monospace", fontWeight:700, marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:8, color:mode===m?"#4a7c5f":"#334155", fontFamily:"monospace" }}>{desc}</div>
          </button>
        ))}
      </div>
      {mode==="shielded"
        ? <>
            <ShieldedWallet bals={bals} actionableFilter={["USDC","EURC","cirBTC"]}
              onMax={(sym, val, _raw, dec) => { setSendToken(sym); setAmount((Number(_raw)/10**dec).toFixed(dec)); }}
              protocolStats={protocolStats}/>
            {/* Token selector pills */}
            <div style={{ display:"flex", gap:5, marginBottom:10 }}>
              {Object.values(SEND_TOKENS).map(t => {
                const active = sendToken === t.sym;
                const col = t.sym==="USDC"?"#00FFB0":t.sym==="EURC"?"#60a5fa":"#F7931A";
                return (
                  <button key={t.sym} onClick={() => { setSendToken(t.sym); setAmount(""); }}
                    style={{ flex:1, background:active?"rgba(0,0,0,.4)":"rgba(0,0,0,.2)", border:`1px solid ${active?col+"80":"rgba(255,255,255,.07)"}`, borderRadius:5, padding:"7px 4px", cursor:"pointer", textAlign:"center" }}>
                    <div style={{ fontSize:9, color:active?col:"#64748b", fontFamily:"monospace", fontWeight:700 }}>{t.sym}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"9px 12px", marginBottom:10, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.6 }}>
              🛡 Confidential send — shielded balance is transferred with governed visibility. Sender and recipient addresses are not linked on-chain.
            </div>
          </>
        : <div style={{ background:"rgba(245,158,11,.04)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"9px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
            ⚠ Public transfer — fully visible on-chain. Use Confidential Send to shield this transaction.
          </div>
      }
      <OsField label="RECIPIENT (0x address)" value={to} onChange={e=>setTo(e.target.value)} placeholder="0x..." icon="↗" hint={isArcName?"⚠ ARC Name Service not live yet — use a 0x address":null}/>
      <OsField label={`AMOUNT (${sendToken})`} value={amount} onChange={e=>setAmount(e.target.value)} placeholder={tkSend.dec===8?"0.00000":"0.00"} icon="💸" suffix={sendToken}/>
      <IG items={[
        ["Privacy", mode==="shielded"?"✓ Hidden":"✗ Public", ""],
        ["Route",   mode==="shielded"?"PrivarShieldVault":"Direct", ""],
        ["Token",   sendToken, "selected"],
        ["Gas",     "USDC",    "Arc Testnet"],
      ]}/>
      <ArcBtn
        label={!onArc?"⚠ SWITCH TO ARC TESTNET":mode==="shielded"?`⟶ SEND ${sendToken} (SHIELDED)`:"⟶ PUBLIC SEND"}
        onClick={onArc?(mode==="shielded"?sendShielded:sendPublic):undefined}
        loading={loading} disabled={!onArc||!to||!amount||isArcName}
        color={!onArc?"#F59E0B":mode==="shielded"?"#00FFB0":"#F59E0B"}
      />
    </div>
  );
}

function WithdrawPanel({ account, usdcBalance, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded, protocolStats, onChainActivity }) {
  const [amount, setAmount]   = useState("");
  const [dest, setDest]       = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken]     = useState("USDC"); // selected token to withdraw
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance, onSuccess: () => { protocolStats?.refresh?.(); onChainActivity?.refresh?.(); } });
  const bals = shieldedBals;

  // Token metadata — mirrors BridgePanel BRIDGE_TOKENS
  const WD_TOKENS = {
    USDC:   { sym:"USDC",   addr: NATIVE_USDC,        dec:6, isNative:true,  color:"#00FFB0", bal: bals?.usdc  ?? 0, fmt:v=>"$"+v.toFixed(2)  },
    EURC:   { sym:"EURC",   addr: CONTRACTS.EURC,     dec:6, isNative:false, color:"#60a5fa", bal: bals?.eurc  ?? 0, fmt:v=>"€"+v.toFixed(2)  },
    cirBTC: { sym:"cirBTC", addr: CONTRACTS.cirBTC,   dec:8, isNative:false, color:"#F7931A", bal: bals?.cbtc  ?? 0, fmt:v=>"₿"+v.toFixed(5)  },
  };
  const tk = WD_TOKENS[token] || WD_TOKENS.USDC;

  const withdraw = async () => {
    if (!amount || Number(amount) <= 0) return;
    const target = dest || account?.address;
    if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
      notify("Withdraw", "Invalid destination address", "error"); return;
    }
    if (!tk.addr || tk.addr === "0x0000000000000000000000000000000000000000") {
      notify("Withdraw", `${tk.sym} contract address not configured.`, "error"); return;
    }
    setLoading(true);

    const notes     = getNotes(account?.address);
    let   amountBig = BigInt(Math.round(Number(amount) * (10 ** tk.dec)));
    const noteAmt   = (n) => BigInt(Math.round(Number(n.amount)||0));

    const tokenNotes = notes.filter(n => n.token.toLowerCase() === tk.addr.toLowerCase() && n.status !== "locked");
    if (tokenNotes.length === 0) {
      notify("Withdraw", `No shielded ${tk.sym} note found. Shield ${tk.sym} first.`, "error");
      setLoading(false); return;
    }

    // Note selection — fixes fragmented-balance withdrawals (e.g. after
    // swap A then swap the result back: two USDC notes instead of one).
    // Greedy, largest-first: pick the FEWEST notes needed to cover
    // amountBig, instead of the old behavior of requiring ONE note to
    // cover it and silently clamping down to the largest single note when
    // none did (which is what caused "Tap Max" to only withdraw part of
    // the shown total). If even ALL notes together fall short (shouldn't
    // normally happen — displayed balance IS their sum — but float
    // rounding at MAX could theoretically leave a dust gap), clamp down to
    // the true total instead of reverting on-chain.
    const sorted = [...tokenNotes].sort((a, b) => {
      const d = noteAmt(b) - noteAmt(a);
      return d > 0n ? 1 : d < 0n ? -1 : 0;
    });
    let acc = 0n;
    const selectedNotes = [];
    for (const n of sorted) {
      if (acc >= amountBig) break;
      selectedNotes.push(n);
      acc += noteAmt(n);
    }
    if (acc < amountBig) amountBig = acc; // genuinely insufficient — clamp to true total, not one note

    // Single note still covers it — unchanged path, same contract call
    // (withdraw()) as before this fix, for the common case.
    const note = selectedNotes.length === 1 ? selectedNotes[0] : null;

    let root;
    try {
      const res = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarMerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      root = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { root = null; }
    if (!root) {
      notify("Withdraw", "Could not read Merkle root. Ensure you are on Arc Testnet.", "error");
      setLoading(false); return;
    }

    const nullifier = randomBytes32();

    // ── Protocol fee (v2.8) ────────────────────────────────────────────────────
    // Native USDC: % bps skimmed on-chain from withdrawAmt → msg.value = 0x0
    // EURC/cirBTC: flat flatFeeUsdc paid as separate USDC via msg.value
    //              buildWithdrawCalldata computes: value = flatFeeUsdc * NATIVE_TO_ERC20
    let flatFeeUsdc = 0n;
    let withdrawFee = 0n;
    try {
      if (tk.isNative) {
        const feeRes = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.protocolFeeBps }, "latest"]);
        const bps = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
        withdrawFee = previewWithdrawFee(amountBig, bps, true, 0n).fee;
        // flatFeeUsdc stays 0n for native USDC — fee is skimmed on-chain, no msg.value needed
      } else {
        const feeRes = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.flatFeeUsdc }, "latest"]);
        flatFeeUsdc  = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
        withdrawFee  = flatFeeUsdc;
      }
    } catch (e) {
      notify("Withdraw", "Could not read current fees (slow network) — please retry.", "error");
      setLoading(false); return;
    }
    // v3.4 — embed the SPEND (and, if there's change, ADD) journal ops
    // directly in this SAME withdraw transaction instead of separate
    // follow-up calls — see PrivarShieldVault.sol's NoteJournal doc comment
    // for why that used to be a reliability gap.
    await ensureSelfBackupKeyReady(account?.address);

    const feeDesc = withdrawFee > 0n
      ? ` (protocol fee: ${formatToken(withdrawFee, 6)} USDC)`
      : "";

    let data, txValue, updated, changeCommitment, remaining, journalEntry, withdrawInputCommitments;

    if (note) {
      // ── Single note covers it — UNCHANGED path (same withdraw() call as
      //    before this fix), for the common case.
      remaining = noteAmt(note) - amountBig;
      changeCommitment = remaining > 0n ? randomBytes32() : null;
      const ops = [{ t: 1, commitment: note.commitment }];
      if (changeCommitment) ops.push({ t: 0, commitment: changeCommitment, amount: remaining.toString(), token: note.token });
      journalEntry = await encryptJournalBlob(account?.address, { ts: Date.now(), ops });

      ({ data, value: txValue } = buildWithdrawCalldata({
        nullifier, root,
        token:       tk.addr,
        recipient:   target,
        amount:      amountBig,
        relayerFee:  0n,
        relayer:     "0x0000000000000000000000000000000000000000",
        flatFeeUsdc,
        noteOwner:   account?.address,
        encryptedEntry: journalEntry || "0x",
      }));

      updated = notes.filter(n => n.commitment !== note.commitment);
      if (changeCommitment) updated.push({ ...note, amount: remaining.toString(), commitment: changeCommitment, cloudSynced: !!journalEntry });
      withdrawInputCommitments = [note.commitment];

    } else {
      // ── Fragmented balance — SEVERAL notes needed. Spends every selected
      //    note's nullifier via withdrawBatch() in ONE transaction, single
      //    payout. Each note is spent for its FULL value except (if needed)
      //    the LAST one, whose leftover becomes a single local change note —
      //    exactly the same change-note mechanic as the single-note path
      //    above, just applied to the last note in the set instead of the
      //    only note. See PrivarShieldVault.sol's withdrawBatch() doc
      //    comment for why this is safe / matches withdraw()'s semantics.
      let acc2 = 0n;
      const batchNotes = selectedNotes.map((n) => {
        const full = noteAmt(n);
        const need = amountBig - acc2;
        const use  = full <= need ? full : need;
        acc2 += use;
        return { note: n, nullifier: randomBytes32(), amount: use, full };
      });
      const last = batchNotes[batchNotes.length - 1];
      remaining = last.full - last.amount;
      changeCommitment = remaining > 0n ? randomBytes32() : null;

      const ops = batchNotes.map(bn => ({ t: 1, commitment: bn.note.commitment }));
      if (changeCommitment) ops.push({ t: 0, commitment: changeCommitment, amount: remaining.toString(), token: tk.addr });
      journalEntry = await encryptJournalBlob(account?.address, { ts: Date.now(), ops });

      ({ data, value: txValue } = buildWithdrawBatchCalldata({
        notes: batchNotes.map(bn => ({ nullifier: bn.nullifier, amount: bn.amount })),
        root,
        token:       tk.addr,
        recipient:   target,
        relayerFee:  0n,
        relayer:     "0x0000000000000000000000000000000000000000",
        flatFeeUsdc,
        noteOwner:   account?.address,
        encryptedEntry: journalEntry || "0x",
      }));

      const spentCommitments = new Set(selectedNotes.map(n => n.commitment));
      updated = notes.filter(n => !spentCommitments.has(n.commitment));
      if (changeCommitment) updated.push({ ...last.note, amount: remaining.toString(), commitment: changeCommitment, cloudSynced: !!journalEntry });
      withdrawInputCommitments = selectedNotes.map(n => n.commitment);
    }

    // ── Robust note lifecycle (see lockNotesForOp doc comment) ───────────
    // The only "output" a withdraw can create locally is the change note —
    // the withdrawn funds themselves leave the shielded pool entirely, to
    // `target`, and are not a local note at all.
    const withdrawOutputs = changeCommitment
      ? [updated.find(n => n.commitment === changeCommitment)]
      : [];
    const opId = lockNotesForOp(account?.address, {
      kind: "withdraw", label: "Withdraw",
      inputCommitments: withdrawInputCommitments, outputs: withdrawOutputs,
    });
    if (!opId) {
      notify("Withdraw", "One of these notes was just used by another operation — please retry.", "error");
      setLoading(false); return;
    }
    recomputeShielded?.();

    const ok = await sendRealTx({
      label: "Withdraw",
      description: `${amount} ${tk.sym} → ${sh(target)} from PrivarShieldVault${feeDesc}${note ? "" : ` (${selectedNotes.length} notes)`}`,
      buildTx: () => ({ to: CONTRACTS.PrivarShieldVault, value: txValue, data }),
      onHash: (hash) => markOpSubmitted(account?.address, opId, hash),
    });

    if (ok) {
      finalizeOp(account?.address, opId, "success");
    } else {
      // See swap()'s identical comment: ok===false is not the same thing
      // as "safe to restore" — check the receipt before touching notes.
      const pending = getPendingOps(account?.address).find(o => o.opId === opId);
      if (!pending?.txHash) {
        finalizeOp(account?.address, opId, "abandoned");
      } else {
        const outcome = await checkReceiptOutcome(pending.txHash);
        if (outcome === "reverted") finalizeOp(account?.address, opId, "reverted");
      }
    }
    recomputeShielded?.();

    setAmount(""); setDest(""); setLoading(false);
  };

  const avail = tk.bal;

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="↙" title="WITHDRAW" sub="Unshield — exit confidential balance to public address"/>
      <NotOnArcWarning/>

      <ShieldedWallet bals={bals} actionableFilter={["USDC","EURC","cirBTC"]} onMax={(sym, val, _raw, dec) => { setToken(sym); setAmount((Number(_raw)/10**dec).toFixed(dec)); }} protocolStats={protocolStats}/>

      <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"9px 12px", marginBottom:10, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.6 }}>
        🛡 Unshield — exit the confidential balance to a public address. Governed visibility: only you and parties you authorize can link deposit and withdrawal.
      </div>

      <OsField label={`AMOUNT (${tk.sym})`} value={amount} onChange={e=>setAmount(e.target.value)} placeholder={tk.dec===8?"0.00000":"0.00"} icon="↙" suffix={tk.sym}/>
      <OsField label="DESTINATION (defaults to connected wallet)" value={dest} onChange={e=>setDest(e.target.value)} placeholder={account?.address||"0x..."} icon="📍"/>

      <IG items={[
        ["Privacy","✓ Unlinkable","ZK note spend"],
        ["Available", avail.toFixed(tk.dec===8?5:2) + " " + tk.sym, "local notes"],
        ["Gas","USDC","Arc Testnet"],
      ]}/>

      {(bals?.noteCount ?? 0) === 0 && (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ No shielded notes found. Use the Shield panel to deposit first.
        </div>
      )}
      {avail <= 0 && (bals?.noteCount ?? 0) > 0 && (
        <div style={{ background:"rgba(14,165,233,.05)", border:"1px solid rgba(14,165,233,.2)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#0EA5E9", fontFamily:"monospace" }}>
          ⚠ Shielded {tk.sym} balance is zero. Select another token or shield {tk.sym} first.
        </div>
      )}

      <ArcBtn
        label={!onArc?"⚠ SWITCH TO ARC TESTNET":`⟶ WITHDRAW ${tk.sym} FROM SHIELD`}
        onClick={onArc?withdraw:undefined} loading={loading}
        disabled={!onArc||!amount||Number(amount)<=0||avail<=0}
        color={onArc?"#00FFB0":"#F59E0B"}
      />
    </div>
  );
}

function BridgePanel({ account, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded, protocolStats, onChainActivity }) {
  // ── Architecture: LiFiPrivacyBridge.privateBridge() — v3.2 ─────────────────
  // Replaces the old 3-step (unshield → swap → CCTP) flow, which sent EURC/
  // cirBTC into the user's PUBLIC wallet mid-flight — see /areas/privar.md
  // audit notes. Now: ONE transaction, ONE contract, funds never at rest
  // anywhere except LiFiPrivacyBridge itself:
  //
  //   LiFiPrivacyBridge.privateBridge(nullifier, root, token, amount, ...,
  //     routeData)
  //     → ShieldVault.withdraw(recipient = LiFiPrivacyBridge)   [same tx]
  //     → LI.FI Diamond.call(routeData)                         [same tx]
  //
  // routeData is an off-chain LI.FI quote (any token, cross-chain in one
  // route) — no more separate manual swap-then-bridge step for EURC/cirBTC.
  const CH = Object.values(CCTP_DOMAINS);
  const [destId, setDestId]       = useState(0);
  const [amount, setAmount]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [recipient, setRecipient] = useState("");
  const [token, setToken]         = useState("USDC");
  const [step, setStep]           = useState("");
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance, onSuccess: () => { protocolStats?.refresh?.(); onChainActivity?.refresh?.(); } });
  const bals = shieldedBals;
  const ch   = CH.find(c=>c.domainId===destId) || CH[0];

  // ── LI.FI reachable destinations ────────────────────────────────────────
  // The CCTP-era chain list above is a hint, not a guarantee — LI.FI's
  // testnet routing only supports a curated subset of chains as `toChain`,
  // and an unsupported one fails with a schema-validation 400 at quote time.
  // Ask LI.FI directly which of these are actually reachable from Arc right
  // now, and grey out the rest instead of hardcoding an assumption.
  const [reachable, setReachable] = useState(null);   // null = not yet checked
  const [fetchFailed, setFetchFailed] = useState(false); // true = API itself errored (fail open)
  useEffect(() => {
    let cancelled = false;
    fetchLiFiDestinations(ARC_CHAIN_ID)
      .then(ids => { if (!cancelled) setReachable(ids); })          // even an empty Set is real info
      .catch(() => { if (!cancelled) { setReachable(new Set()); setFetchFailed(true); } });
    return () => { cancelled = true; };
  }, []);
  // Fail open ONLY when the LI.FI API call itself errored — an empty-but-
  // successful response means LI.FI genuinely has no reachable destination
  // from Arc right now, which is real information, not a glitch to paper over.
  const isReachable = (c) => reachable === null || fetchFailed || reachable.has(c.chainId);

  const BRIDGE_TOKENS = {
    USDC:   { sym:"USDC",   addr: NATIVE_USDC,      dec:6, bal: bals?.usdc ?? 0, color:"#00FFB0" },
    EURC:   { sym:"EURC",   addr: CONTRACTS.EURC,   dec:6, bal: bals?.eurc ?? 0, color:"#60a5fa" },
    cirBTC: { sym:"cirBTC", addr: CONTRACTS.cirBTC, dec:8, bal: bals?.cbtc ?? 0, color:"#F7931A" },
  };
  const tk = BRIDGE_TOKENS[token] || BRIDGE_TOKENS.USDC;

  const bridge = async () => {
    if (!amount || Number(amount) <= 0 || !onArc) return;
    if (tk.bal <= 0) { notify("Bridge", `Insufficient shielded ${token} balance.`, "error"); return; }
    if (!isReachable(ch)) {
      notify("Bridge", `${ch.name} isn't (yet) reachable via LI.FI from Arc Testnet.`, "error");
      return;
    }

    const bridgeAddr = CONTRACTS.LiFiPrivacyBridge;
    if (!bridgeAddr || bridgeAddr === "0x0000000000000000000000000000000000000000") {
      notify("Bridge", "LiFiPrivacyBridge non déployé. Exécutez scripts/deploy-lifi.js et ajoutez VITE_LIFI_BRIDGE dans .env", "error");
      return;
    }

    const recipientAddr = (recipient.trim().startsWith("0x") && recipient.trim().length === 42)
      ? recipient.trim() : account?.address;

    setLoading(true);
    let amountBig = BigInt(Math.round(Number(amount) * (10 ** tk.dec)));

    // 1. Merkle root
    setStep("Étape 1/3 — Lecture du Merkle root…");
    let root;
    try {
      const res = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarMerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      root = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { root = null; }
    if (!root) {
      notify("Bridge", "Could not read the Merkle root.", "error");
      setLoading(false); setStep(""); return;
    }

    // 2. Find shielded note for the selected token
    const notes      = getNotes(account?.address);
    const tokenNotes = notes.filter(n => n.token?.toLowerCase() === tk.addr.toLowerCase() && n.status !== "locked");
    let note = tokenNotes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig);
    if (!note && tokenNotes.length > 0) {
      // Fallback to largest note — clamp amountBig so we never request more
      // than the note's real raw balance (avoids a guaranteed on-chain revert).
      note = tokenNotes.reduce((best, n) =>
        BigInt(Math.round(Number(n.amount)||0)) > BigInt(Math.round(Number(best.amount)||0)) ? n : best
      );
      const noteRaw = BigInt(Math.round(Number(note.amount)||0));
      if (noteRaw < amountBig) amountBig = noteRaw;
    }
    if (!note) {
      notify("Bridge", `No shielded ${token} note found.`, "error");
      setLoading(false); setStep(""); return;
    }

    // 3. LI.FI route: fromAddress is LiFiPrivacyBridge itself (never the
    // user's EOA) — it's the contract that will hold the unshielded funds
    // for the single atomic tx and is what LI.FI/any observer sees as
    // counterparty on Arc. toAddress is the destination recipient, since
    // that's inherently a public wallet on the destination chain anyway.
    setStep(`Étape 2/3 — Route LI.FI vers ${ch.name}…`);
    let routeData;
    try {
      const quote = await fetchLiFiQuote({
        fromChain: ARC_CHAIN_ID, toChain: ch.chainId,
        fromToken: tk.addr, toToken: "USDC",
        fromAmount: amountBig.toString(),
        fromAddress: bridgeAddr, toAddress: recipientAddr,
      });
      routeData = encodeLiFiRouteData(quote.transactionRequest.to, quote.transactionRequest.value, quote.transactionRequest.data);
    } catch (e) {
      notify("Bridge", `LI.FI route unavailable: ${e.message}`, "error");
      setLoading(false); setStep(""); return;
    }

    // 4. Protocol fee (flat USDC side-payment, EURC/cirBTC only — same model as withdraw())
    let flatFeeUsdc = 0n;
    try {
      const feeRes = await rpcCallWithRetry("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.flatFeeUsdc }, "latest"]);
      flatFeeUsdc = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
    } catch (e) {
      notify("Bridge", "Could not read current fees (slow network) — please retry.", "error");
      setLoading(false); setStep(""); return;
    }

    // v3.4 — embed the SPEND (+ ADD for change) journal ops directly in this
    // SAME bridge transaction, forwarded through LiFiPrivacyBridge to
    // ShieldVault.withdraw() and emitted there. See PrivarShieldVault.sol's
    // NoteJournal doc comment.
    await ensureSelfBackupKeyReady(account?.address);
    const remaining = BigInt(Math.round(Number(note.amount)||0)) - amountBig;
    const changeCommitment = remaining > 0n ? randomBytes32() : null;
    const bridgeOps = [{ t: 1, commitment: note.commitment }];
    if (changeCommitment) bridgeOps.push({ t: 0, commitment: changeCommitment, amount: remaining.toString(), token: note.token });
    const journalEntry = await encryptJournalBlob(account?.address, { ts: Date.now(), ops: bridgeOps });

    // 5. Atomic unshield + LI.FI bridge — ONE transaction, targeting
    // LiFiPrivacyBridge directly (NOT PrivarShieldVault).
    setStep(`Étape 3/3 — Unshield + Bridge ${token} → ${ch.name}…`);
    const { data, value } = buildLiFiBridgeCalldata({
      nullifier: randomBytes32(), root,
      token: tk.addr, amount: amountBig,
      relayer: "0x0000000000000000000000000000000000000000", relayerFee: 0n,
      routeData, flatFeeUsdc,
      encryptedEntry: journalEntry || "0x",
    });

    // ── Robust note lifecycle (see lockNotesForOp doc comment) ───────────
    // Bridged funds leave the shielded pool entirely (destination chain),
    // so the only local output is the change note, if any.
    const bridgeOutputs = changeCommitment
      ? [{ ...note, amount: remaining.toString(), commitment: changeCommitment, cloudSynced: !!journalEntry }]
      : [];
    const opId = lockNotesForOp(account?.address, {
      kind: "bridge", label: `Bridge → ${ch.name}`,
      inputCommitments: [note.commitment], outputs: bridgeOutputs,
    });
    if (!opId) {
      notify("Bridge", "This note was just used by another operation — please retry.", "error");
      setLoading(false); setStep(""); return;
    }
    recomputeShielded?.();

    const bridgeOk = await sendRealTx({
      label: `Bridge → ${ch.name}`,
      description: `${amount} ${token} → ${ch.name} via LiFiPrivacyBridge (privé, 1 tx)`,
      buildTx: () => ({ to: bridgeAddr, value, data }),
      onHash: (hash) => markOpSubmitted(account?.address, opId, hash),
    });

    if (bridgeOk) {
      finalizeOp(account?.address, opId, "success");
      recomputeShielded?.();
      notify("Bridge ✓", `${amount} ${token} → ${ch.name} — arriving in 1-5 min.`, "success");
    } else {
      // See swap()'s identical comment: ok===false is not the same thing
      // as "safe to restore" — check the receipt before touching notes.
      const pending = getPendingOps(account?.address).find(o => o.opId === opId);
      if (!pending?.txHash) {
        finalizeOp(account?.address, opId, "abandoned");
      } else {
        const outcome = await checkReceiptOutcome(pending.txHash);
        if (outcome === "reverted") finalizeOp(account?.address, opId, "reverted");
      }
      recomputeShielded?.();
      notify("Bridge", "LI.FI bridge failed.", "error");
    }

    setAmount(""); setRecipient(""); setLoading(false); setStep("");
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="⟺" title="BRIDGE" sub="Confidential bridge — LiFiPrivacyBridge (Arc Testnet)"/>
      <NotOnArcWarning/>

      <ShieldedWallet bals={bals} actionableFilter={["USDC","EURC","cirBTC"]}
        onMax={(sym, val, _raw, dec) => { setToken(sym); setAmount((Number(_raw)/10**dec).toFixed(dec)); }}
        protocolStats={protocolStats}/>

      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:7 }}>
          DESTINATION {reachable === null && <span style={{ color:"#475569" }}>· checking LI.FI…</span>}
          {reachable !== null && !fetchFailed && reachable.size === 0 && (
            <span style={{ color:"#f87171" }}>· LI.FI reports no reachable destination from Arc right now</span>
          )}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5 }}>
          {CH.map(c=>{
            const ok = isReachable(c);
            return (
              <button key={c.domainId} onClick={()=> ok && setDestId(c.domainId)} disabled={!ok}
                style={{
                  background:destId===c.domainId?"rgba(0,255,176,.08)":"rgba(0,0,0,.35)",
                  border:`1px solid ${destId===c.domainId?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`,
                  borderRadius:5, padding:"8px 4px", textAlign:"center",
                  cursor: ok ? "pointer" : "not-allowed", opacity: ok ? 1 : .35,
                }}>
                <div style={{ fontSize:15, marginBottom:2 }}>{c.icon}</div>
                <div style={{ fontSize:7, color:destId===c.domainId?"#00FFB0":"#94a3b8", fontFamily:"monospace" }}>{c.name}</div>
                {!ok && <div style={{ fontSize:6, color:"#f87171", fontFamily:"monospace", marginTop:2 }}>indisponible</div>}
              </button>
            );
          })}
        </div>
      </div>

      <OsField label={`AMOUNT (${token})`} value={amount} onChange={e=>setAmount(e.target.value)}
        placeholder={tk.dec===8?"0.00000":"0.00"} icon="⟺" suffix={token}/>

      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:5 }}>
          RECIPIENT ON {ch?.name?.toUpperCase()} (leave blank = your own address)
        </div>
        <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.15)", borderRadius:3 }}>
          <input value={recipient} onChange={e=>setRecipient(e.target.value)}
            placeholder={`${account?.address?.slice(0,6)||"0x1dc7"}…${account?.address?.slice(-4)||"9894"} (yourself)`}
            style={{ width:"100%", background:"transparent", border:"none", outline:"none", padding:"10px 12px", color:"#ffffff", fontSize:9, fontFamily:"monospace" }}/>
        </div>
      </div>

      {step && (
        <div style={{ background:"rgba(14,165,233,.08)", border:"1px solid rgba(14,165,233,.25)", borderRadius:4, padding:"8px 12px", marginBottom:10, fontSize:9, color:"#0EA5E9", fontFamily:"monospace" }}>
          ⏳ {step}
        </div>
      )}

      <IG items={[
        ["Token",   token,    "selected"],
        ["Vers",    ch?.name, "LI.FI"],
        ["Privacy", "✓ LiFiPrivacyBridge", "1 atomic tx"],
      ]}/>

      {tk.bal <= 0 && (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ Solde shieldé {token} à zéro.
        </div>
      )}

      <ArcBtn
        label={!onArc ? "⚠ SWITCH TO ARC TESTNET" : loading ? step||"En cours…" : `⟶ BRIDGE ${token} → ${ch?.name?.toUpperCase()}`}
        onClick={onArc && !loading ? bridge : undefined} loading={loading}
        disabled={!onArc || !amount || Number(amount)<=0 || tk.bal<=0 || loading}
        color={onArc ? "#00FFB0" : "#F59E0B"}
      />
    </div>
  );
}

function AnalyticsPanel({ protocolStats, txHistory, account, onArc, prices, onChainActivity }) {
  const ps = protocolStats || {};

  // Safe numeric helpers
  const safeNum = (v, div=1) => { try { const n = Number(v) / div; return isFinite(n) ? n : 0; } catch { return 0; } };
  const safeFmt = (v, dec=2) => { try { const n = Number(v); return isFinite(n) ? n.toFixed(dec) : "0." + "0".repeat(dec); } catch { return "—"; } };

  const tvlUsdc   = ps.shieldedUsdc  != null ? safeNum(ps.shieldedUsdc,  1e6) : null;
  const tvlEurc   = ps.shieldedEurc  != null ? safeNum(ps.shieldedEurc,  1e6) : null;
  const tvlBtc    = ps.shieldedBtc   != null ? safeNum(ps.shieldedBtc,   1e8) : null;
  const leafCount = ps.leafCount     != null ? Number(ps.leafCount) || 0       : null;
  const isConnected = !!onArc;

  const [blockchainStats, setBlockchainStats] = useState(null);
  useEffect(() => {
    if (!onArc) return;
    rpcCall("eth_blockNumber", []).then(hex => {
      const n = parseInt(hex, 16);
      if (isFinite(n)) setBlockchainStats({ blockNum: n });
    }).catch(() => {});
  }, [onArc]);

  // ── Protocol fees — persistent ──────────────────────────────────────────
  const FEES_KEY = "privar_protocol_fees";

  const [stats24h, setStats24h] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(FEES_KEY) || "{}");
      return {
        txCount: null, volume: null, fees: null,
        allTimeVolume:   s.allTimeVolume   ?? null,
        allTimeFees:     s.allTimeFees     ?? null,
        allTimeTxCount:  s.allTimeTxCount  ?? null,
      };
    } catch { return { txCount:null, volume:null, fees:null, allTimeVolume:null, allTimeFees:null, allTimeTxCount:null }; }
  });

  useEffect(() => {
    if (!onArc) return;
    const run = async () => {
      try {
        const blockHex = await rpcCall("eth_blockNumber", []);
        const cur = parseInt(blockHex, 16);
        if (!isFinite(cur)) return;

        // ── Read fees directly from contract state (most reliable) ──────────
        // NOTE: feesCollectedByToken(address) does NOT exist on the deployed
        // PrivarShieldVault v3.0.0 — this always reverted silently before.
        // Only nextIndex() (commitment count) is real; fees stay at 0 until
        // this contract exposes a real per-token fee counter.
        const [leafRaw] = await Promise.all([
          rpcCall("eth_call", [{ to:CONTRACTS.PrivarMerkleTreeManager, data: SEL.nextIndex }, "latest"]),
        ]);
        const feesUsdc   = 0;
        const feesEurc   = 0;
        const allTimeTxCount = leafRaw && leafRaw !== "0x" ? Number(BigInt(leafRaw)) : 0; // 1 leaf = 1 deposit
        const totalFeesCollected = feesUsdc + feesEurc;

        // ── 24h logs (limited range to avoid timeout) ───────────────────────
        const from24 = Math.max(0, cur - 172800); // ~24h at 2 blk/sec
        let logs24 = [];
        try {
          const res = await rpcCall("eth_getLogs", [{
            fromBlock: "0x"+from24.toString(16),
            toBlock:   "latest",
            address:   CONTRACTS.PrivarShieldVault,
          }]);
          if (Array.isArray(res)) logs24 = res;
        } catch {}

        // Count 24h deposits + compute 24h volume from log data
        let vol24 = 0, cnt24 = logs24.length;
        for (const log of logs24) {
          try {
            const d = (log.data || "").replace("0x","");
            if (d.length >= 64) {
              const a = Number(BigInt("0x"+d.slice(0,64))) / 1e6;
              if (isFinite(a) && a > 0 && a < 1e9) vol24 += a;
            }
          } catch {}
        }

        // ── 24h fees: decode real FeeCollected events, don't guess ──────────
        // FIX: this used to assume every tx costs a flat 0.03 USDC (cnt24 * 0.03),
        // which became wrong the moment protocolFeeBps became configurable (v2.4)
        // and especially once deposits became fee-free by default (v2.6). Decode
        // the actual amount from each FeeCollected(token indexed, amount, treasury)
        // log instead — accurate regardless of whatever rate is currently set.
        const FEE_COLLECTED_TOPIC = "0x36119f4f28ae3384ed31589f21ec2992cb0ebe53b11c79a24466ee74471764ed";
        let fees24 = 0;
        for (const log of logs24) {
          try {
            if (!log.topics || log.topics[0]?.toLowerCase() !== FEE_COLLECTED_TOPIC) continue;
            const tokenAddr = "0x" + (log.topics[1] || "").slice(-40);
            const d = (log.data || "").replace("0x","");
            if (d.length < 64) continue;
            const amountRaw = BigInt("0x" + d.slice(0, 64));
            const dec = tokenAddr.toLowerCase() === CONTRACTS.cirBTC.toLowerCase() ? 1e8 : 1e6;
            const a = Number(amountRaw) / dec;
            if (isFinite(a) && a >= 0) fees24 += a;
          } catch {}
        }

        const persisted = {
          allTimeVolume:  vol24 > 0 ? vol24.toFixed(2) : null,
          allTimeFees:    totalFeesCollected.toFixed(4),
          allTimeTxCount: allTimeTxCount,
          updatedAt:      Date.now(),
        };
        try { localStorage.setItem(FEES_KEY, JSON.stringify(persisted)); } catch {}

        setStats24h({
          txCount:        cnt24,
          volume:         vol24.toFixed(2),
          fees:           fees24.toFixed(4),
          allTimeVolume:  vol24.toFixed(2),
          allTimeFees:    totalFeesCollected.toFixed(4),
          allTimeTxCount: allTimeTxCount,
          feesUsdc,
          feesEurc,
        });
      } catch(e) { console.warn("[Privar analytics]", e.message); }
    };
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [onArc]);

  // ── Live fee rate + treasury (was hardcoded "0.03 USDC/tx" — stale since the
  //     v2.6 fix made deposits fee-free by default; now reads the real on-chain rate) ──
  const [feeConfig, setFeeConfig] = useState({ bps: null, treasury: null });
  useEffect(() => {
    if (!onArc) return;
    const run = () => Promise.all([
      rpcCall("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.protocolFeeBps }, "latest"]).catch(() => null),
      rpcCall("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data: SEL.treasury }, "latest"]).catch(() => null),
    ]).then(([bpsRes, treasuryRes]) => {
      setFeeConfig({
        bps:      bpsRes && bpsRes !== "0x" ? Number(BigInt(bpsRes)) : null,
        treasury: treasuryRes && treasuryRes !== "0x" ? "0x" + treasuryRes.slice(-40) : null,
      });
    }).catch(() => {});
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [onArc]);
  const feeRateLabel = feeConfig.bps == null ? "loading…" : feeConfig.bps === 0 ? "Free (launch phase)" : `${(feeConfig.bps/100).toFixed(2)}%`;

  // ── PrivarStaking tx count (v1.2+) — combined with PrivarShieldVault.totalTxCount below
  //     for a true protocol-wide "Total Tx" figure, not just vault actions ──
  const [stakingTxCount, setStakingTxCount] = useState(null);
  useEffect(() => {
    if (!onArc || !CONTRACTS.PrivarStaking) return;
    const run = () => rpcCall("eth_call", [{ to: CONTRACTS.PrivarStaking, data: SEL.totalTxCount }, "latest"])
      .then(res => setStakingTxCount(res && res !== "0x" ? Number(BigInt(res)) : 0))
      .catch(() => {}); // older PrivarStaking (pre-v1.2) doesn't have this — silently keep null, not an error
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [onArc]);


  // ── Sparkline builder — fully NaN-safe ──────────────────────────────────
  const mkSpk = (rawData, col, label, fmt = v => String(v), realValue = null) => {
    try {
      if (!Array.isArray(rawData) || rawData.length < 2) return null;
      const data = rawData.map(v => { const n = Number(v); return isFinite(n) ? n : 0; });
      const mx = Math.max(...data) || 1;
      const mn = Math.min(...data);
      const range = mx - mn || 1;
      const W = 260, H = 55;
      const pts = data.map((v, i) => ({
        x: (i / (data.length - 1)) * W,
        y: H - ((v - mn) / range) * H * .82 - H * .09,
      })).filter(p => isFinite(p.x) && isFinite(p.y));
      if (pts.length < 2) return null;
      const path = pts.map((p,i) => `${i===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      const lastPt = pts[pts.length - 1];
      const lastV  = realValue != null ? realValue : data[data.length - 1];
      const prevV  = data[data.length - 2] || data[data.length - 1];
      const rawChg = prevV ? ((data[data.length-1] - prevV) / prevV * 100) : 0;
      const chg    = isFinite(rawChg) ? rawChg : 0;
      return (
        <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7 }}>
            <div>
              <div style={{ fontSize:7, color:"#64748b", letterSpacing:".15em", fontFamily:"monospace", marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:17, fontWeight:700, color:"#ffffff", fontFamily:"monospace" }}>{fmt(lastV)}</div>
            </div>
            <div style={{ fontSize:9, color:chg>=0?"#00FFB0":"#f87171", fontFamily:"monospace", background:`rgba(${chg>=0?"0,255,176":"248,113,113"},.08)`, border:`1px solid rgba(${chg>=0?"0,255,176":"248,113,113"},.2)`, borderRadius:2, padding:"2px 5px" }}>{chg>=0?"+":""}{chg.toFixed(1)}%</div>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height:48 }}>
            <defs><linearGradient id={`ag${col}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".2"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
            <path d={`${path} L${W} ${H} L0 ${H} Z`} fill={`url(#ag${col})`}/>
            <path d={path} fill="none" stroke={col} strokeWidth="1.5" opacity=".85"/>
            <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={col}/>
          </svg>
        </div>
      );
    } catch(e) {
      console.warn("[mkSpk]", e.message);
      return null;
    }
  };

  // ── Sparkline data ───────────────────────────────────────────────────────
  const tvlHistory = useMemo(() => {
    const base = tvlUsdc != null && isFinite(tvlUsdc) ? tvlUsdc : 0;
    if (!txHistory || txHistory.length === 0) return Array.from({length:30}, () => base);
    let running = base;
    const pts = [];
    [...txHistory].reverse().forEach(tx => {
      const a = parseFloat(tx.amount) || 0;
      if (tx.label?.includes("Shield"))   running = Math.max(0, running + a);
      if (tx.label?.includes("Withdraw")) running = Math.max(0, running - a);
      pts.push(isFinite(running) ? running : 0);
    });
    while (pts.length < 30) pts.unshift(pts[0] || 0);
    return pts.slice(-30).map(v => isFinite(v) ? v : 0);
  }, [txHistory, tvlUsdc]);

  // ── Heatmap ──────────────────────────────────────────────────────────────
  const HM = useMemo(() => {
    const g = Array.from({length:7}, () => Array(24).fill(0));
    if (Array.isArray(txHistory)) {
      txHistory.forEach(tx => {
        try {
          const d = new Date(tx.ts || Date.now());
          const day = d.getDay();
          const hr  = d.getHours();
          if (day >= 0 && day < 7 && hr >= 0 && hr < 24) g[day][hr]++;
        } catch {}
      });
    }
    return g;
  }, [txHistory]);
  const hmMax = Math.max(1, ...HM.flat());
  const totalTxCount = Array.isArray(txHistory) ? txHistory.length : 0;

  // ── Safe display helpers ─────────────────────────────────────────────────
  const fmtVol = v => { const n = Number(v); return isFinite(n) ? "$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"; };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="📈" title="ANALYTICS" sub="Arc Testnet protocol metrics"/>

      {isConnected ? (
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"7px 12px", marginBottom:8, fontSize:9, color:"#00FFB0", fontFamily:"monospace", display:"flex", alignItems:"center", gap:6 }}>
          ● LIVE — Arc Testnet (chainId: 5042002) · Block #{blockchainStats?.blockNum?.toLocaleString() || "…"}
          {" · "}<a href={ARC_TESTNET.explorer} target="_blank" rel="noreferrer" style={{ color:"#00FFB0" }}>ARCScan ↗</a>
        </div>
      ) : (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.25)", borderRadius:4, padding:"7px 12px", marginBottom:8, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ Connect wallet to Arc Testnet to load live metrics
        </div>
      )}

      {/* Charts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
        {mkSpk(tvlHistory, "#00FFB0", "SHIELDED TVL (USDC)", v => "$"+(isFinite(Number(v))?Number(v).toFixed(2):"0"), tvlUsdc)}
        <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(14,165,233,.1)", borderRadius:5, padding:"11px 13px" }}>
          <div style={{ fontSize:7, color:"#64748b", letterSpacing:".15em", fontFamily:"monospace", marginBottom:6 }}>ALL-TIME ON-CHAIN</div>
          {(() => {
            const btcUsd = prices?.WBTC || 0;
            const oc = onChainActivity || {};
            const txCount = ps?.totalTxCount ?? (oc.ready ? oc.totalTxCount : null);
            const vol = ps?.volumeUsdc != null
              ? (Number(ps.volumeUsdc)/1e6 + Number(ps.volumeEurc||0)/1e6 + (Number(ps.volumeBtc||0)/1e8)*btcUsd)
              : (oc.ready ? (Number(oc.volumeUsdc||0) + Number(oc.volumeEurc||0)/1e6 + (Number(oc.volumeBtc||0)/1e8)*btcUsd) : null);
            const fees = ps?.feesUsdc != null ? Number(ps.feesUsdc)/1e6 : (oc.ready ? Number(oc.feesUsdc||0) : null);
            return [
              { l:"TX COUNT", v: txCount != null ? String(txCount) : (oc.loading?"loading…":"—"), c:"#0EA5E9" },
              { l:"VOLUME",   v: vol  != null ? "$"+vol.toLocaleString(undefined,{maximumFractionDigits:2})  : (oc.loading?"loading…":"—"), c:"#00FFB0" },
              { l:"FEES",     v: fees != null ? "$"+fees.toLocaleString(undefined,{maximumFractionDigits:4}) : (oc.loading?"loading…":"—"), c:"#fbbf24" },
            ];
          })().map(s=>(
            <div key={s.l} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>{s.l}</span>
              <span style={{ fontSize:10, color:s.c, fontFamily:"monospace", fontWeight:700 }}>{s.v}</span>
            </div>
          ))}
          <div style={{ fontSize:7, color:"#1e3a2a", fontFamily:"monospace", marginTop:4 }}>
            <span style={{ cursor:"pointer", textDecoration:"underline" }} onClick={()=>onChainActivity?.refresh?.()}>Refresh</span>
          </div>
        </div>
      </div>

      {/* All-time fees */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(251,191,36,.12)", borderRadius:5, padding:"11px 13px", marginBottom:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:8, color:"#fbbf24", letterSpacing:".14em", fontFamily:"monospace" }}>⚡ PROTOCOL FEES — ALL TIME</div>
          <div style={{ fontSize:7, color:"#64748b", fontFamily:"monospace" }}>{feeRateLabel} · live</div>
        </div>
        {(() => {
          const oc = onChainActivity || {};
          const vaultTx = ps?.totalTxCount ?? (oc.ready ? oc.totalTxCount : null);
          const combinedTx = vaultTx != null ? Number(vaultTx) + Number(stakingTxCount || 0) : null;
          const feesUsd = ps?.feesUsdc != null ? Number(ps.feesUsdc)/1e6 : (oc.ready ? Number(oc.feesUsdc||0) : null);
          return [
            { l:"Total Tx (vault + staking)",  v: combinedTx!=null ? String(combinedTx) : (oc.loading?"loading…":"—"), c:"#0EA5E9" },
            { l:"Fees Collected (USDC)", v: feesUsd != null ? "$"+feesUsd.toLocaleString(undefined,{maximumFractionDigits:4}) : (oc.loading?"loading…":"—"), c:"#fbbf24" },
            { l:"Fee Rate (deposit/withdraw)", v: feeRateLabel,                                                       c:"#64748b" },
            { l:"Treasury",             v: feeConfig.treasury ? feeConfig.treasury.slice(0,6)+"…"+feeConfig.treasury.slice(-4) : "loading…", c:"#64748b" },
          ];
        })().map(s=>(
          <div key={s.l} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{s.l}</span>
            <span style={{ fontSize:9, color:s.c, fontFamily:"monospace", fontWeight:600 }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* Arc Testnet info */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px", marginBottom:8 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:8 }}>ARC TESTNET STATS</div>
        {[["Network","Arc Testnet — Circle L1"],["Chain ID","5042002"],["Gas Token","USDC (ERC-20, 6 dec)"],["Finality","< 1 second"],["Explorer","testnet.arcscan.app"],["Faucet","faucet.circle.com (1 USDC/day)"]].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{k}</span>
            <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Live protocol */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px", marginBottom:8 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:8 }}>PRIVAR PROTOCOL — LIVE</div>
        {[
          ["Shielded USDC", tvlUsdc !=null ? "$"+safeFmt(tvlUsdc,2) : isConnected?"loading…":"—"],
          ["Shielded EURC", tvlEurc !=null ? "€"+safeFmt(tvlEurc,2) : isConnected?"loading…":"—"],
          ["Shielded cirBTC", tvlBtc !=null ? "₿"+safeFmt(tvlBtc,6) : isConnected?"loading…":"—"],
          ["Commitments",  leafCount!=null ? String(leafCount) : isConnected?"loading…":"—"],
          ["Vault Status", ps.depositsAllowed===true?"ACTIVE":ps.depositsAllowed===false?"PAUSED":isConnected?"loading…":"—"],
          ["ZK Protocol",  "Groth16 (testnet mode)"],
        ].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{k}</span>
            <span style={{ fontSize:9, color:k==="Vault Status"&&v==="ACTIVE"?"#00FFB0":"#94a3b8", fontFamily:"monospace" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px" }}>
        <div style={{ fontSize:7, color:"#64748b", letterSpacing:".15em", fontFamily:"monospace", marginBottom:8 }}>
          SESSION TX HEATMAP — 7 DAYS × 24H {totalTxCount===0&&"(no transactions yet)"}
        </div>
        <div style={{ display:"flex", gap:2 }}>
          {Array.from({length:24},(_,col)=>(
            <div key={col} style={{ display:"flex", flexDirection:"column", gap:2, flex:1 }}>
              {Array.from({length:7},(_,row)=>(
                <div key={row} style={{ height:10, borderRadius:2, background:`rgba(0,255,176,${(HM[row]?.[col]||0)/hmMax*.7+.05})` }}/>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
          <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>00:00</span>
          <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>12:00</span>
          <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>23:00</span>
        </div>
      </div>
    </div>
  );
}

function GovPanel() {
  const PARAMS = [
    { k: "Voting delay",       v: "1 block (~1s on Arc)" },
    { k: "Voting period",      v: "50,400 blocks (~7 days)" },
    { k: "Proposal threshold", v: "10,000 tokens" },
    { k: "Quorum",             v: "4% of total supply (400 bps)" },
    { k: "Timelock delay",     v: "48h minimum (MIN_DELAY)" },
    { k: "Voting power",       v: "veARC — snapshot at block T‑1 (flash-loan resistant)" },
  ];
  const CONTRACTS_LIST = [
    { name: "Governance", address: CONTRACTS.Governance },
    { name: "Timelock",   address: CONTRACTS.Timelock },
    { name: "PrivarStaking (veARC source)", address: CONTRACTS.PrivarStaking },
  ];

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="🗳" title="GOVERNANCE" sub="Protocol parameters — Arc Testnet"/>
      <NotOnArcWarning/>
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>
        ℹ On-chain proposal creation and voting UI is in development. Use the contract addresses below to interact directly via ARCScan in the meantime.
      </div>
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".16em", fontFamily:"monospace", marginBottom:8 }}>PROTOCOL PARAMETERS</div>
        {PARAMS.map(({k,v})=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", flexShrink:0 }}>{k}</span>
            <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", textAlign:"right" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px 14px" }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".16em", fontFamily:"monospace", marginBottom:8 }}>DEPLOYED CONTRACTS</div>
        {CONTRACTS_LIST.map(c=>(
          <div key={c.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", flexShrink:0 }}>{c.name}</span>
            <a href={`${ARC_TESTNET.explorer}/address/${c.address}`} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#00FFB0", fontFamily:"monospace", textDecoration:"none" }}>{sh(c.address)} ↗</a>
          </div>
        ))}
      </div>
    </div>
  );
}

function StakingPanel({ account, usdcBalance, onArc, notify, refreshBalance }) {
  const [stakeAmt, setStakeAmt] = useState("");
  const [lock, setLock]         = useState("7");
  const [staking, setStaking]   = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [positions, setPositions] = useState(null);   // StakePosition[]
  const [rewards, setRewards]     = useState(null);   // BigInt
  const [totalStaked, setTotalStaked] = useState(null);
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });

  const LOCKS = [
    { d:"7",  sec:604800,   mult:"1.0×", apy:"8.40%",  c:"#4ade80" },
    { d:"30", sec:2592000,  mult:"1.5×", apy:"12.80%", c:"#00FFB0" },
    { d:"90", sec:7776000,  mult:"2.0×", apy:"18.40%", c:"#a78bfa" },
    { d:"180",sec:15552000, mult:"3.0×", apy:"24.20%", c:"#fbbf24" },
  ];
  const lk = LOCKS.find(l => l.d === lock) || LOCKS[0];

  // Read on-chain staking data
  const loadStakingData = useCallback(async () => {
    if (!account?.address || !onArc) return;
    try {
      // getUserStakes(address) — returns StakePosition[]
      const [stakesRaw, rewardsRaw, totalRaw] = await Promise.all([
        rpcCall("eth_call", [{ to: CONTRACTS.PrivarStaking, data: SEL.previewRewards + encodeAddress(account.address) }, "latest"]),
        rpcCall("eth_call", [{ to: CONTRACTS.PrivarStaking, data: SEL.previewRewards + encodeAddress(account.address) }, "latest"]),
        rpcCall("eth_call", [{ to: CONTRACTS.PrivarStaking, data: "0x817b1cd2" /* totalStakedGlobal() */ }, "latest"]),
      ]);
      // previewRewards returns uint256
      if (rewardsRaw && rewardsRaw !== "0x") setRewards(BigInt(rewardsRaw));
      if (totalRaw   && totalRaw   !== "0x") setTotalStaked(BigInt(totalRaw));

      // getUserStakes — ABI decode (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)[]
      // Too complex to hand-decode; use a simplified approach: read from localStorage staking notes
    } catch (e) { console.warn("staking load:", e); }
  }, [account?.address, onArc]);

  useEffect(() => { loadStakingData(); const id = setInterval(loadStakingData, 15000); return () => clearInterval(id); }, [loadStakingData]);

  // PrivarStaking positions — cross-device: prefer on-chain data, fallback to localStorage cache
  const [stakingNotes, setStakingNotes] = useState([]);

  const saveNotes = useCallback((notes) => {
    try { localStorage.setItem(`privar_stakes_${account?.address || "x"}`, JSON.stringify(notes)); } catch {}
    setStakingNotes(notes);
  }, [account?.address]);

  // Re-load notes when account changes — pull from chain first for cross-device sync
  useEffect(() => {
    if (!account?.address) { setStakingNotes([]); return; }
    // Immediately show localStorage cache
    let cached = [];
    try { cached = JSON.parse(localStorage.getItem(`privar_stakes_${account.address}`) || "[]"); } catch {}
    setStakingNotes(cached);
    // Then replace with on-chain truth (getUserStakes)
    loadStakingPositionsFromChain(account.address).then(positions => {
      if (positions === null) return; // call failed — keep localStorage
      setStakingNotes(positions);
      try { localStorage.setItem(`privar_stakes_${account.address}`, JSON.stringify(positions)); } catch {}
    }).catch(() => {});
  }, [account?.address]);

  const totalStakedLocal = stakingNotes.reduce((a, n) => a + Number(n.amount || 0), 0);

  const stake = async () => {
    if (!stakeAmt || !onArc) return;
    setStaking(true);
    const amtWei = BigInt(Math.round(Number(stakeAmt) * 1e6));

    // Arc native USDC (0x3600...) supports ERC-20 interface for approve
    // Must approve PrivarStaking contract to call safeTransferFrom
    const approveOk = await sendRealTx({
      label: "Approve USDC",
      description: `Approve ${stakeAmt} USDC for PrivarStaking`,
      buildTx: () => ({ to: CONTRACTS.USDC, value: "0x0", data: buildApproveCalldata(CONTRACTS.PrivarStaking, amtWei) }),
    });

    if (approveOk) {
      // Pass lk.sec directly — buildStakeCalldata now takes seconds, not days
      const stakeOk = await sendRealTx({
        label: "Stake",
        description: `PrivarStaking ${stakeAmt} USDC (${lock}d lock, ${lk.apy} APY)`,
        buildTx: () => ({ to: CONTRACTS.PrivarStaking, value: "0x0", data: buildStakeCalldata(amtWei, lk.sec) }),
      });
      if (stakeOk) {
        // Optimistic local update — so the position appears immediately without waiting for chain scan
        const optimistic = [...stakingNotes, {
          id:         Date.now(),
          amount:     Number(stakeAmt),
          lockDays:   Number(lock),
          unlockedAt: Date.now() + lk.sec * 1000,
          stakedAt:   Date.now(),
        }];
        saveNotes(optimistic);
        loadStakingData();
        // After a short delay, replace with authoritative on-chain data (cross-device truth)
        setTimeout(() => {
          loadStakingPositionsFromChain(account?.address).then(positions => {
            if (positions === null || positions.length === 0) return;
            setStakingNotes(positions);
            try { localStorage.setItem(`privar_stakes_${account?.address}`, JSON.stringify(positions)); } catch {}
          }).catch(() => {});
        }, 4000);
      }
    }
    setStakeAmt(""); setStaking(false);
  };

  const unstake = async (noteIdx, note) => {
    // unstake(stakeId) — stakeId is the index in the contract's _userStakes array
    // For simplicity on testnet: we use the array index in our local notes as stakeId
    await sendRealTx({
      label: "Unstake",
      description: `Unstaking ${note.amount.toFixed(2)} USDC`,
      buildTx: () => ({ to: CONTRACTS.PrivarStaking, value: "0x0", data: SEL.unstake + encodeUint256(BigInt(noteIdx)) }),
    });
    // Optimistic local removal, then refresh from chain
    saveNotes(stakingNotes.filter((_, i) => i !== noteIdx));
    loadStakingData();
    setTimeout(() => {
      loadStakingPositionsFromChain(account?.address).then(positions => {
        if (positions === null) return;
        setStakingNotes(positions);
        try { localStorage.setItem(`privar_stakes_${account?.address}`, JSON.stringify(positions)); } catch {}
      }).catch(() => {});
    }, 4000);
  };

  const claim = async () => {
    setClaiming(true);
    await sendRealTx({ label:"Claim Rewards", description:"Claiming staking rewards", buildTx: () => ({ to: CONTRACTS.PrivarStaking, value: "0x0", data: SEL.claimRewards }) });
    setClaiming(false); setRewards(0n);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="💎" title="STAKING" sub="Stake USDC on Arc Testnet — real transactions"/>
      <NotOnArcWarning/>

      {/* Protocol + user stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:10 }}>
        {[
          { l:"MY STAKED", v: totalStakedLocal > 0 ? totalStakedLocal.toFixed(2) : "0.00", u:"USDC", c:"#00FFB0" },
          { l:"PENDING REWARDS", v: rewards != null ? (Number(rewards)/1e6).toFixed(4) : "—", u:"USDC", c:"#fbbf24" },
          { l:"PROTOCOL TVL", v: totalStaked != null ? "$"+(Number(totalStaked)/1e6).toFixed(0) : "—", u:"total staked", c:"#a78bfa" },
        ].map(s => (
          <div key={s.l} style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"10px 12px" }}>
            <div style={{ fontSize:7, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:4 }}>{s.l}</div>
            <div style={{ fontSize:15, fontWeight:700, color:s.c, fontFamily:"monospace" }}>{s.v}</div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{s.u}</div>
          </div>
        ))}
      </div>

      {/* Active positions */}
      {stakingNotes.length > 0 && (
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6 }}>YOUR POSITIONS</div>
          {stakingNotes.map((n, i) => {
            const canUnstake = Date.now() >= (n.unlockedAt || n.unlockAt || 0);
            const daysLeft = Math.max(0, Math.ceil(((n.unlockedAt || n.unlockAt || 0) - Date.now()) / 86400000));
            return (
              <div key={n.id || i} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"rgba(0,0,0,.3)", border:`1px solid rgba(0,255,176,${canUnstake?.2:.08})`, borderRadius:5, marginBottom:5 }}>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:10, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{Number(n.amount||0).toFixed(2)} USDC</span>
                  <span style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginLeft:8 }}>{n.lockDays}d lock</span>
                </div>
                <span style={{ fontSize:8, color: canUnstake ? "#00FFB0" : "#64748b", fontFamily:"monospace" }}>
                  {canUnstake ? "✓ Unlocked" : `🔒 ${daysLeft}d left`}
                </span>
                {canUnstake && (
                  <button onClick={() => unstake(i, n)} style={{ padding:"4px 9px", background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.3)", borderRadius:3, color:"#00FFB0", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>
                    UNSTAKE
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stake form */}
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px", marginBottom:8 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:8 }}>NEW STAKE</div>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
          <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>Available</span>
          <button onClick={() => setStakeAmt(usdcBalance != null ? (Number(usdcBalance)/1e6).toFixed(2) : "")} style={{ fontSize:9, color:"#00FFB0", background:"none", border:"none", cursor:"pointer", fontFamily:"monospace" }}>
            MAX {usdcBalance != null ? (Number(usdcBalance)/1e6).toFixed(2) : "—"} USDC
          </button>
        </div>
        <OsField label="AMOUNT (USDC)" value={stakeAmt} onChange={e=>setStakeAmt(e.target.value)} placeholder="0.00" icon="💎" suffix="USDC"/>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".12em", fontFamily:"monospace", marginBottom:6, marginTop:8 }}>LOCK PERIOD</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:10 }}>
          {LOCKS.map(l => (
            <button key={l.d} onClick={() => setLock(l.d)} style={{ padding:"7px 4px", background:lock===l.d?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)", border:`1px solid ${lock===l.d?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:3, cursor:"pointer", textAlign:"center" }}>
              <div style={{ fontSize:10, color:lock===l.d?"#ffffff":"#94a3b8", fontFamily:"monospace", fontWeight:700 }}>{l.d}d</div>
              <div style={{ fontSize:7, color:lock===l.d?l.c:"#64748b", fontFamily:"monospace" }}>{l.apy}</div>
              <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>{l.mult}</div>
            </button>
          ))}
        </div>
        <ArcBtn label={staking ? "PrivarStaking..." : `⟶ STAKE ${lock}d (REAL TX)`} onClick={onArc ? stake : undefined} loading={staking} disabled={!stakeAmt || Number(stakeAmt)<=0 || !onArc} color={onArc ? "#00FFB0" : "#F59E0B"}/>
      </div>

      {/* Claim rewards */}
      {rewards != null && rewards > 0n && (
        <div style={{ background:"rgba(251,191,36,.04)", border:"1px solid rgba(251,191,36,.2)", borderRadius:5, padding:"12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>PENDING REWARDS</div>
            <div style={{ fontSize:16, color:"#fbbf24", fontFamily:"monospace", fontWeight:700 }}>{(Number(rewards)/1e6).toFixed(4)} USDC</div>
          </div>
          <ArcBtn label={claiming ? "Claiming..." : "⟶ CLAIM"} onClick={onArc ? claim : undefined} loading={claiming} disabled={!onArc} color="#fbbf24" small/>
        </div>
      )}
    </div>
  );
}


function PortfolioPanel({ account, balance, usdcBalance, prices, shieldedBals }) {
  const [eurcBal, setEurcBal] = useState(null);
  const [cbtcBal, setCbtcBal] = useState(null);

  useEffect(() => {
    if (!account?.address) return;
    const a = account.address;
    Promise.all([
      rpcCall("eth_call", [{ to: CONTRACTS.EURC,   data: "0x70a08231" + encodeAddress(a) }, "latest"]),
      rpcCall("eth_call", [{ to: CONTRACTS.cirBTC,  data: "0x70a08231" + encodeAddress(a) }, "latest"]),
    ]).then(([e, b]) => {
      setEurcBal(e && e !== "0x" ? BigInt(e) : 0n);
      setCbtcBal(b && b !== "0x" ? BigInt(b) : 0n);
    }).catch(() => {});
  }, [account?.address]);

  const usdc = usdcBalance != null ? Number(usdcBalance) / 1e6 : 0;
  const eurc = eurcBal != null ? Number(eurcBal) / 1e6 : null;
  const cbtc = cbtcBal != null ? Number(cbtcBal) / 1e8 : null;

  const usdcPrice = prices?.USDC  ?? 1;
  const eurcPrice = prices?.EURC  ?? prices?.EUR ?? 1.08;
  const btcPrice  = prices?.BTC   ?? prices?.WBTC ?? 0;

  const totalUsd = Math.max(0, (usdc * usdcPrice)
    + (eurc != null && isFinite(eurc) ? eurc * eurcPrice : 0)
    + (cbtc != null && isFinite(cbtc) ? cbtc * btcPrice  : 0));

  const shBals = shieldedBals;

  const tokens = [
    { token:"USDC",   val: usdc,  ready: true,        fmt: v=>"$"+(v??0).toFixed(2),   usd: (usdc??0)*usdcPrice,  icon:"💵", c:"#00FFB0" },
    { token:"EURC",   val: eurc,  ready: eurc!=null,  fmt: v=>"€"+(v??0).toFixed(2),   usd: eurc!=null&&isFinite(eurc)?eurc*eurcPrice:0, icon:"💶", c:"#60a5fa" },
    { token:"cirBTC", val: cbtc,  ready: cbtc!=null,  fmt: v=>"₿"+(v??0).toFixed(5),   usd: cbtc!=null&&isFinite(cbtc)?cbtc*btcPrice:0,  icon:"₿",  c:"#F7931A" },
  ];

  const exportReport = () => {
    const lines = [
      "PRIVAR OS — PORTFOLIO REPORT", "=".repeat(40),
      `Generated  : ${new Date().toLocaleString()}`,
      `Address    : ${account?.address || "—"}`,
      `Network    : Arc Testnet (chainId: 5042002)`, "",
      "PUBLIC BALANCES",
      `  USDC   : ${usdc.toFixed(6)}  ≈ $${(usdc*usdcPrice).toFixed(2)}`,
      `  EURC   : ${eurc!=null?eurc.toFixed(6):"—"}  ≈ $${eurc!=null?(eurc*eurcPrice).toFixed(2):"—"}`,
      `  cirBTC : ${cbtc!=null?cbtc.toFixed(8):"—"}  ≈ $${cbtc!=null?(cbtc*btcPrice).toFixed(2):"—"}`,
      `  TOTAL  : $${totalUsd.toFixed(2)} USD`, "",
      "SHIELDED (private notes)",
      `  USDC   : $${(shBals?.usdc||0).toFixed(2)}`,
      `  EURC   : €${(shBals?.eurc||0).toFixed(2)}`,
      `  cirBTC : ₿${(shBals?.cbtc||0).toFixed(5)}`,
      `  TOTAL  : ~$${(shBals?.totalUsd||0).toFixed(2)} USD`,
    ];
    const blob = new Blob([lines.join("\n")], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `privar_portfolio_${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="📊" title="PORTFOLIO" sub="Real wallet balances from Arc Testnet"/>
      <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.15)", borderRadius:5, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".2em", fontFamily:"monospace", marginBottom:4 }}>TOTAL WALLET VALUE</div>
        <div style={{ fontSize:26, fontWeight:700, color:"#ffffff", fontFamily:"monospace" }}>${totalUsd.toFixed(2)}</div>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:2 }}>USD · public balances</div>
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          <button onClick={exportReport} style={{ padding:"5px 10px", background:"rgba(0,255,176,.06)", border:"1px solid rgba(0,255,176,.2)", borderRadius:3, color:"#00FFB0", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>⬇ EXPORT</button>
          <a href={`${ARC_TESTNET.explorer}/address/${account?.address}`} target="_blank" rel="noreferrer"
            style={{ padding:"5px 10px", background:"rgba(14,165,233,.06)", border:"1px solid rgba(14,165,233,.2)", borderRadius:3, color:"#0EA5E9", fontSize:8, fontFamily:"monospace", textDecoration:"none" }}>↗ ARCSCAN</a>
        </div>
      </div>

      <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6 }}>PUBLIC BALANCES</div>
      {tokens.map(p => (
        <div key={p.token} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.06)", borderRadius:5, marginBottom:6 }}>
          <span style={{ fontSize:16, width:22, textAlign:"center" }}>{p.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{p.token}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, color: p.ready ? p.c : "#334155", fontFamily:"monospace", fontWeight:600 }}>
              {!p.ready ? "…" : p.fmt(p.val)}
            </div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>
              {p.ready && p.usd > 0 ? `≈ $${p.usd.toFixed(2)}` : "—"}
            </div>
          </div>
        </div>
      ))}

      <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6, marginTop:10 }}>SHIELDED BALANCES (private notes)</div>
      <ShieldedWallet bals={shBals} onMax={null}/>

      <div style={{ marginTop:10, background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:4, padding:"10px 13px" }}>
        <div style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>💧 NEED MORE USDC?</div>
        <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer"
          style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5, textDecoration:"none" }}>
          <span style={{ color:"#0EA5E9" }}>faucet.circle.com ↗</span> — Select Arc Testnet → paste address → request (1 USDC/day)
        </a>
      </div>
    </div>
  );
}

function HistoryPanel({ txHistory }) {
  const [filter,setFilter]=useState("all");
  const all = txHistory.length ? txHistory : [];
  const filtered = filter==="all" ? all : all.filter(t=>t.label.toLowerCase().includes(filter));
  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="📋" title="TRANSACTION HISTORY" sub="Real on-chain transactions on Arc Testnet"/>
      <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap" }}>
        {["all","shield","swap","send","withdraw","bridge","stake"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{ padding:"4px 9px", background:filter===f?"rgba(0,255,176,.12)":"rgba(0,0,0,.35)", border:`1px solid ${filter===f?"rgba(0,255,176,.35)":"rgba(0,255,176,.08)"}`, borderRadius:3, color:filter===f?"#00FFB0":"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace", letterSpacing:".08em", textTransform:"uppercase", transition:"all .2s" }}>{f}</button>
        ))}
      </div>
      {filtered.length===0
        ? <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ fontSize:10, color:"#334155", fontFamily:"monospace", marginBottom:8 }}>No transactions yet</div>
            <div style={{ fontSize:9, color:"#1e3a2a", fontFamily:"monospace" }}>Make your first real transaction on Arc Testnet</div>
            <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ display:"inline-block", marginTop:10, fontSize:9, color:"#0EA5E9", fontFamily:"monospace", textDecoration:"none" }}>💧 Get testnet USDC first ↗</a>
          </div>
        : filtered.map((t,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 12px", background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.06)", borderRadius:4, marginBottom:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 4px #00FFB0", flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{t.label}</div>
              <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{t.ts} · {t.hash.slice(0,16)}···</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, color:"#4ade80", fontFamily:"monospace", fontWeight:600 }}>{t.amount}</div>
              <a href={`${ARC_TESTNET.explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#64748b", textDecoration:"none", fontFamily:"monospace", transition:"color .2s" }} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#64748b"}>ARCScan ↗</a>
            </div>
          </div>
        ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   THEME SECTION — lives inside Settings, but reads/writes the
   shared ThemeProvider context so the choice applies instantly
   across the whole app (and is remembered via localStorage).
═══════════════════════════════════════════════════════════════ */
function ThemeSection() {
  const { themeId, setThemeId, THEMES: T } = useTheme();
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:8, color:"var(--text-faint)", letterSpacing:".18em", fontFamily:"monospace", marginBottom:6, paddingBottom:5, borderBottom:"1px solid rgba(var(--accent-rgb),.06)" }}>APPEARANCE</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
        {Object.values(T).map(t => {
          const active = t.id === themeId;
          return (
            <button key={t.id} onClick={() => setThemeId(t.id)} style={{
              display:"flex", alignItems:"center", gap:8, textAlign:"left",
              background: active ? `rgba(${t.accentRgb},.1)` : "rgba(0,0,0,.3)",
              border: active ? `1.5px solid ${t.accent}` : "1px solid rgba(255,255,255,.06)",
              borderRadius:5, padding:"9px 11px", cursor:"pointer", transition:"all .15s",
            }}>
              <span style={{
                width:16, height:16, borderRadius:"50%", flexShrink:0,
                background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                border: `1px solid ${t.accent}55`,
              }}/>
              <span>
                <div style={{ fontSize:9, fontWeight:700, color: active ? t.accent : "var(--text-dim)", fontFamily:"monospace" }}>{t.label}</div>
                {active && <div style={{ fontSize:7, color:"var(--text-faint)", fontFamily:"monospace", marginTop:1 }}>ACTIVE</div>}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize:7, color:"var(--text-faint)", fontFamily:"monospace", marginTop:7, lineHeight:1.5 }}>
        Applies instantly and is remembered on this device. Core transaction panels keep the Privar green accent for now.
      </div>
    </div>
  );
}

function SettingsPanel({ account, onArc, notify, sendRealTx, recomputeShielded }) {
  const [slip, setSlip]=useState("0.5"); const [dl, setDl]=useState("20"); const [expert, setExpert]=useState(false);
  const [backupVisible, setBackupVisible] = useState(false);
  const [backupBlob, setBackupBlob] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const Tog=({on,onClick})=><div onClick={onClick} style={{ width:32, height:17, background:on?"rgba(0,255,176,.2)":"rgba(0,0,0,.5)", border:`1px solid ${on?"rgba(0,255,176,.55)":"rgba(0,255,176,.15)"}`, borderRadius:9, cursor:"pointer", position:"relative", transition:"all .2s", flexShrink:0 }}><div style={{ position:"absolute", top:2.5, left:on?15:2.5, width:10, height:10, borderRadius:"50%", background:on?"#00FFB0":"#475569", boxShadow:on?"0 0 5px #00FFB0":"none", transition:"all .2s" }}/></div>;
  const Sec=({t,c})=><div style={{ marginBottom:12 }}><div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:6, paddingBottom:5, borderBottom:"1px solid rgba(0,255,176,.06)" }}>{t}</div>{c}</div>;
  const Row=({label,sub,c})=><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:"rgba(0,0,0,.3)", borderRadius:3, marginBottom:4, border:"1px solid rgba(255,255,255,.04)" }}><div><div style={{ fontSize:10, color:"#ffffff", fontFamily:"monospace" }}>{label}</div><div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{sub}</div></div>{c}</div>;

  const handleExport = () => {
    if (!account?.address) return;
    const blob = exportViewKeyBackup(account.address);
    if (!blob) { notify?.("No view key yet", "Connect and send/receive once first — a view key is generated automatically.", "error"); return; }
    setBackupBlob(blob);
    setBackupVisible(true);
  };
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(backupBlob); notify?.("Copied ✓", "Backup copied — store it somewhere safe (password manager).", "success"); }
    catch { /* clipboard permission denied — blob is already shown for manual copy */ }
  };
  const handleSyncNotes = async () => {
    if (!account?.address || syncing) return;
    setSyncing(true); setSyncProgress(null);
    try {
      const { synced, failed, total } = await resyncLocalNotesToCloud(
        account, sendRealTx, (done, n) => setSyncProgress(`${done}/${n}`)
      );
      if (total === 0) {
        notify?.("Already in sync ✓", "Every shielded note on this device already has a cloud backup.", "success");
      } else if (failed === 0) {
        notify?.("Notes synced ✓", `${synced} note${synced===1?"":"s"} backed up — now recoverable on any device with this wallet.`, "success");
      } else {
        notify?.("Partial sync", `${synced} backed up, ${failed} failed (check wallet for rejected signatures) — try again.`, "error");
      }
      recomputeShielded?.();
    } catch (e) {
      notify?.("Sync failed", e.message || "Could not reach the cloud backup registry.", "error");
    } finally {
      setSyncing(false); setSyncProgress(null);
    }
  };
  const handleRestore = async () => {
    if (!account?.address || !restoreInput.trim()) return;
    try {
      await importViewKeyBackup(account.address, restoreInput.trim());
      notify?.("View key restored ✓", "This device can now auto-decrypt confidential transfers sent to this wallet.", "success");
      setRestoreInput("");
    } catch (e) {
      notify?.("Restore failed", "That doesn't look like a valid Privar view-key backup.", "error");
    }
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="⚙" title="SETTINGS" sub="Network configuration and transaction preferences"/>

      {/* Network selector */}
      <Sec t="NETWORK" c={<>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:10 }}>
          {/* Testnet — ACTIVE */}
          <div style={{ background:"rgba(0,255,176,.06)", border:"1.5px solid #00FFB0", borderRadius:5, padding:"10px 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 5px #00FFB0", animation:"pulse 2s infinite" }}/>
              <span style={{ fontSize:10, color:"#00FFB0", fontFamily:"monospace", fontWeight:700 }}>Arc Testnet</span>
              <span style={{ fontSize:7, background:"rgba(0,255,176,.12)", border:"1px solid rgba(0,255,176,.3)", borderRadius:2, padding:"0 4px", color:"#00FFB0", fontFamily:"monospace", marginLeft:"auto" }}>ACTIVE</span>
            </div>
            <div style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>chainId: 5042002</div>
            <div style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>RPC: rpc.testnet.arc.network</div>
            <div style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>Gas: USDC · Sub-second finality</div>
          </div>
          {/* Mainnet — LOCKED */}
          <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.08)", borderRadius:5, padding:"10px 12px", opacity:.45, position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#475569" }}/>
              <span style={{ fontSize:10, color:"#475569", fontFamily:"monospace", fontWeight:700 }}>Arc Mainnet</span>
              <span style={{ fontSize:7, background:"rgba(71,85,105,.2)", border:"1px solid rgba(71,85,105,.3)", borderRadius:2, padding:"0 4px", color:"#475569", fontFamily:"monospace", marginLeft:"auto" }}>🔒 LOCKED</span>
            </div>
            <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>chainId: TBD</div>
            <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>Not yet available</div>
            <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:2 }}>Will unlock when Circle launches mainnet</div>
          </div>
        </div>
        <Row label="RPC Endpoint" sub={ARC_TESTNET.rpcUrl} c={<span style={{ fontSize:8, color:onArc?"#4ade80":"#f87171", fontFamily:"monospace" }}>{onArc?"CONNECTED":"DISCONNECTED"}</span>}/>
        <Row label="Block Explorer" sub="testnet.arcscan.app" c={<a href={ARC_TESTNET.explorer} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", textDecoration:"none" }}>OPEN ↗</a>}/>
        <Row label="Faucet" sub="1 USDC/day — Arc Testnet" c={<a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#0EA5E9", fontFamily:"monospace", textDecoration:"none" }}>GET USDC ↗</a>}/>
        <Row label="Chain" sub="Circle L1 — EVM compatible" c={<span style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>EVM</span>}/>
      </>}/>

      <ThemeSection/>

      <Sec t="TRANSACTION" c={<>
        <Row label="Max Slippage" sub="Price movement tolerance" c={<div style={{ display:"flex", gap:4 }}>{["0.1","0.5","1.0"].map(v=><button key={v} onClick={()=>setSlip(v)} style={{ padding:"3px 7px", background:slip===v?"rgba(0,255,176,.14)":"rgba(0,0,0,.35)", border:`1px solid ${slip===v?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:2, color:slip===v?"#00FFB0":"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>{v}%</button>)}</div>}/>
        <Row label="TX Deadline" sub="Minutes until expiry" c={<div style={{ display:"flex", gap:4 }}>{["10","20","30"].map(v=><button key={v} onClick={()=>setDl(v)} style={{ padding:"3px 7px", background:dl===v?"rgba(0,255,176,.14)":"rgba(0,0,0,.35)", border:`1px solid ${dl===v?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:2, color:dl===v?"#00FFB0":"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>{v}m</button>)}</div>}/>
        <Row label="Expert Mode" sub="Skip confirmation dialogs" c={<Tog on={expert} onClick={()=>setExpert(!expert)}/>}/>
      </>}/>

      <Sec t="CONNECTED WALLET" c={<>
        <Row label="Address" sub={account?.address||"—"} c={<span style={{ fontSize:8, color:"#4ade80", fontFamily:"monospace" }}>ACTIVE</span>}/>
        <Row label="Provider" sub={account?.walletName||"—"} c={<span style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>{account?.walletName||"—"}</span>}/>
        <Row label="Network" sub={onArc?"Arc Testnet (5042002)":"Wrong network"} c={<span style={{ fontSize:8, color:onArc?"#4ade80":"#f87171", fontFamily:"monospace" }}>{onArc?"CORRECT":"WRONG"}</span>}/>
      </>}/>

      <Sec t="SHIELDED NOTES — CLOUD SYNC" c={<>
        {!CONTRACTS.PrivarCloudVault ? (
          <div style={{ fontSize:8, color:"#f59e0b", fontFamily:"monospace", lineHeight:1.6 }}>
            PrivarCloudVault isn't deployed on this network yet (VITE_CLOUD_VAULT
            unset) — cross-device note sync is temporarily unavailable. Deposits,
            swaps, sends, and withdrawals are completely unaffected.
          </div>
        ) : <>
          <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", lineHeight:1.6, marginBottom:8 }}>
            Shielded balances sync automatically across every device that controls
            this wallet via PrivarCloudVault — a dedicated, decentralized on-chain
            journal (no server, no IPFS). New shields, swaps, sends, and withdrawals
            back themselves up the moment they happen.
            If a note was created before this update (or a backup tx failed at the
            time), sync it from the device where it's still visible below.
          </div>
          <button onClick={handleSyncNotes} disabled={syncing || !account?.address} style={{ width:"100%", padding:"8px", background:syncing?"rgba(0,0,0,.3)":"rgba(0,255,176,.08)", border:`1px solid ${syncing?"rgba(255,255,255,.06)":"rgba(0,255,176,.3)"}`, borderRadius:3, color:syncing?"#475569":"#00FFB0", fontSize:9, fontFamily:"monospace", cursor:syncing?"default":"pointer" }}>
            {syncing ? `SYNCING… ${syncProgress || ""}` : "🔄 SYNC NOTES TO CLOUD"}
          </button>
        </>}
      </>}/>

      <Sec t="CONFIDENTIAL RECEIVING — VIEW KEY" c={<>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", lineHeight:1.6, marginBottom:8 }}>
          Confidential sends/deposits auto-decrypt using a view key stored only on <i>this</i> browser.
          It does not sync across devices — back it up to use confidential receiving elsewhere,
          the same way you'd back up a seed phrase.
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          <button onClick={handleExport} style={{ flex:1, padding:"8px", background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.3)", borderRadius:3, color:"#00FFB0", fontSize:9, fontFamily:"monospace", cursor:"pointer" }}>
            ↓ EXPORT BACKUP
          </button>
        </div>
        {backupVisible && (
          <div style={{ background:"rgba(0,0,0,.5)", border:"1px solid rgba(0,255,176,.2)", borderRadius:3, padding:8, marginBottom:8 }}>
            <textarea readOnly value={backupBlob} onClick={(e)=>e.target.select()}
              style={{ width:"100%", height:60, background:"transparent", border:"none", color:"#94a3b8", fontSize:7, fontFamily:"monospace", resize:"none", outline:"none" }}/>
            <button onClick={handleCopy} style={{ width:"100%", marginTop:4, padding:"5px", background:"rgba(0,255,176,.06)", border:"1px solid rgba(0,255,176,.2)", borderRadius:2, color:"#00FFB0", fontSize:8, fontFamily:"monospace", cursor:"pointer" }}>COPY TO CLIPBOARD</button>
            <div style={{ fontSize:7, color:"#fb923c", fontFamily:"monospace", marginTop:4 }}>⚠ Anyone with this blob can read your confidential transfers. Store it like a private key.</div>
          </div>
        )}
        <textarea value={restoreInput} onChange={(e)=>setRestoreInput(e.target.value)} placeholder="Paste backup from another device to restore here…"
          style={{ width:"100%", height:50, background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, padding:6, color:"#ffffff", fontSize:8, fontFamily:"monospace", resize:"none", marginBottom:6 }}/>
        <button onClick={handleRestore} disabled={!restoreInput.trim()} style={{ width:"100%", padding:"8px", background:restoreInput.trim()?"rgba(0,255,176,.08)":"rgba(0,0,0,.3)", border:`1px solid ${restoreInput.trim()?"rgba(0,255,176,.3)":"rgba(255,255,255,.06)"}`, borderRadius:3, color:restoreInput.trim()?"#00FFB0":"#475569", fontSize:9, fontFamily:"monospace", cursor:restoreInput.trim()?"pointer":"default" }}>
          ↑ RESTORE ON THIS DEVICE
        </button>
      </>}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════════ */
function AppCore() {
  const [user,      setUser]      = useState(null);
  const [showTour,  setShowTour]  = useState(false);
  const { prices, changes, change24h, lastUpdate, priceError } = usePriceFeed();
  const { account }               = useW3();
  const { theme }                 = useTheme();

  // Auto-logout when wallet disconnects
  useEffect(() => { if (user && !account) setUser(null); }, [account, user]);

  const handleAuth = (u) => { setUser(u); setTimeout(() => setShowTour(true), 600); };

  return (
    <div style={cssVars(theme)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); overflow: hidden; }
        input, select, button, textarea { font-family: 'JetBrains Mono', monospace; }
        input::placeholder, textarea::placeholder { color: var(--divider) !important; }
        select option { background: var(--bg); color: var(--text); }
        @keyframes fi  { from { opacity:0 } to { opacity:1 } }
        @keyframes fu  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.9)} }
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes g1 { 0%,89%,100%{opacity:0} 90%{opacity:.8;transform:translateX(-3px)} 95%{opacity:0;transform:translateX(3px)} }
        @keyframes g2 { 0%,93%,100%{opacity:0} 94%{opacity:.6;transform:translateX(3px)} 98%{opacity:0;transform:translateX(-2px)} }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:var(--bg); }
        ::-webkit-scrollbar-thumb { background:rgba(var(--accent-rgb),.2); border-radius:2px; }
      `}</style>

      <HexGrid theme={theme} />
      <ChainBanner />
      {showTour && <OnboardingTour onFinish={() => setShowTour(false)} />}

      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:user?"0":"24px 16px", position:"relative", zIndex:1, overflow:"hidden" }}>
        {!user
          ? <AuthScreen onAuth={handleAuth} />
          : <Dashboard user={user} prices={prices} changes={changes} change24h={change24h} lastUpdate={lastUpdate} priceError={priceError} />
        }
      </div>
    </div>
  );
}

export function PrivarOS() {
  return (
    <Web3Provider>
      <NotifProvider>
        <AppCore />
      </NotifProvider>
    </Web3Provider>
  );
}
