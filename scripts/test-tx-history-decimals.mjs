#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Regression test — tx-history amount formatting (Shield/Withdraw/Bridge/
// Stake/Unstake/Claim in DApp.jsx's buildTxHistoryFromChain()).
//
// WHY THIS EXISTS: the bug fixed alongside this test was exactly a wrong
// assumption baked into a display formula — "every event's amount is
// 6-decimal" — that was never written down or checked anywhere, so it
// silently inflated native-USDC history entries by 1e12 (see
// CHANGELOG-tx-history-decimals-fix.md). decimalsForToken()/
// symbolForToken() in DApp.jsx are pure functions with no React/JSX
// dependency, so the exact same lookup table is reproduced here (kept
// in sync manually — see the note at the bottom) and locked down against
// the 4 categories that matter: native-USDC-in-the-vault (18-dec),
// native-USDC-in-staking (6-dec, NOT vault-scaled), EURC (6-dec), and
// cirBTC (8-dec). A future change that reintroduces a hardcoded /1e6 (or
// gets the nativeScaled flag backwards for one of the two USDC contexts)
// will fail one of these assertions instead of silently shipping.
//
// Run with: node scripts/test-tx-history-decimals.mjs
// No test framework / no network required — plain Node + contracts.js.
// ═══════════════════════════════════════════════════════════════════════
// NOTE: contracts.js itself can't be imported here — it reads
// `import.meta.env` at module scope (Vite-only global), which throws
// immediately under plain Node regardless of which export is requested.
// formatToken is 3 lines with no dependencies, so it's inlined below
// rather than dragging in a Vite runtime just to test formatting logic.
// If you change formatToken in contracts.js, update this copy too.
const formatToken = (amount, decimals, precision = 4) => {
  if (amount === null || amount === undefined) return "—";
  const n = Number(BigInt(amount)) / Math.pow(10, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: precision });
};

// Mock addresses — deliberately NOT the real deployed ones (those go
// through import.meta.env, which only exists under Vite, not plain Node —
// see the run instructions above). This test is about the DECIMAL/LABEL
// BRANCHING LOGIC (does a native-USDC address get 18-dec in a
// vault-scaled context and 6-dec in a staking context, does EURC get
// 6-dec, does cirBTC get 8-dec), not about any specific deployed address,
// so three distinct mock addresses exercise it identically and this test
// stays valid across every future redeploy.
const NATIVE_USDC = "0x3600000000000000000000000000000000000000"; // real value too — this one IS a hardcoded literal in contracts.js, not env-gated
const MOCK_EURC   = "0x00000000000000000000000000000000000eee";
const MOCK_CIRBTC = "0x00000000000000000000000000000000000bbb";
const CONTRACTS = { EURC: MOCK_EURC, cirBTC: MOCK_CIRBTC };

// Mirrors DApp.jsx's decimalsForToken()/symbolForToken() exactly — see
// that file's doc comment for the full reasoning. If you change the
// logic in DApp.jsx, update this copy in the same commit; that's the
// contract this test file exists to enforce.
function decimalsForToken(tokenAddr, { nativeScaled = true } = {}) {
  const t = tokenAddr?.toLowerCase?.();
  if (t === CONTRACTS.EURC?.toLowerCase())   return 6;
  if (t === CONTRACTS.cirBTC?.toLowerCase()) return 8;
  if (t === NATIVE_USDC.toLowerCase())       return nativeScaled ? 18 : 6;
  return 6;
}
function symbolForToken(tokenAddr) {
  const t = tokenAddr?.toLowerCase?.();
  if (t === CONTRACTS.EURC?.toLowerCase())   return "EURC";
  if (t === CONTRACTS.cirBTC?.toLowerCase()) return "cirBTC";
  return "USDC";
}

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}: got "${actual}", expected "${expected}"`);
  if (!ok) failures++;
}

// ── The exact regression from the bug report: the screenshot showed
//    "9970000000000.00 USDC" and "4970000000000.00 USDC" — those are the
//    OLD BUGGY displayed values (raw amount / 1e6). The true raw amount
//    read from the Deposited/Withdrawn event log is 1e6× that (9.97e18 /
//    4.97e18), and must now display as 9.97 / 4.97 USDC (18-dec vault
//    scaling), not the old inflated figures.
check(
  "Shield/Withdraw — native USDC, vault-scaled (18-dec)",
  formatToken(9_970_000_000_000_000_000n, decimalsForToken(NATIVE_USDC), 2) + " " + symbolForToken(NATIVE_USDC),
  "9.97 USDC"
);
check(
  "Shield/Withdraw — native USDC, vault-scaled (18-dec), second case from the bug report",
  formatToken(4_970_000_000_000_000_000n, decimalsForToken(NATIVE_USDC), 2) + " " + symbolForToken(NATIVE_USDC),
  "4.97 USDC"
);

// ── EURC is a real 6-dec ERC20 — untouched by native scaling either way.
check(
  "Shield — EURC (6-dec, unaffected by native scaling)",
  formatToken(4_510_000n, decimalsForToken(CONTRACTS.EURC), 2) + " " + symbolForToken(CONTRACTS.EURC),
  "4.51 EURC"
);

// ── cirBTC — 8-dec.
check(
  "Shield — cirBTC (8-dec)",
  formatToken(12_345_678n, decimalsForToken(CONTRACTS.cirBTC), 2) + " " + symbolForToken(CONTRACTS.cirBTC),
  "0.12 cirBTC"
);

// ── PrivarStaking amounts are native USDC too, but via plain ERC20
//    transferFrom at 6-dec — nativeScaled:false must NOT apply the 18-dec
//    vault scaling, or staking history would under-count by 1e12.
check(
  "Stake/Unstake/Claim — native USDC via PrivarStaking (6-dec, NOT vault-scaled)",
  formatToken(1_000_000n, decimalsForToken(NATIVE_USDC, { nativeScaled: false }), 2) + " USDC",
  "1 USDC"
);

// ── Withdraw mislabeling fix: a withdrawn EURC note must show "EURC", not
//    a hardcoded "USDC" (the bug prior to this fix — see topics[2]).
check(
  "Withdraw — token label follows the real token, not a hardcoded default",
  symbolForToken(CONTRACTS.EURC),
  "EURC"
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
