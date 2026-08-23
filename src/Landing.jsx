import { useState, useEffect, useRef, useCallback } from "react";
import {
  CONTRACTS, SEL, encodeAddress, decodeUint256,
  buildTotalVolumeByTokenCall, NATIVE_TO_ERC20,
} from "./contracts.js";
import { useTheme, cssVars } from "./theme.jsx";

/* ═══════════════════════════════════════════════════════════════
   LIVE PROTOCOL STATS (read-only, no wallet required)
   Plain HTTP JSON-RPC to Arc Testnet — deliberately independent of
   window.ethereum so the landing page shows real numbers even for
   visitors with no wallet extension installed.
═══════════════════════════════════════════════════════════════ */
const ARC_RPC_URL = "https://rpc.testnet.arc.network";

async function httpRpcCall(method, params = []) {
  const res = await fetch(ARC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result;
}

const nativeToUsdc6 = (wei18) => wei18 / NATIVE_TO_ERC20;

function fmtCompact(n) {
  if (n == null || Number.isNaN(n)) return "···";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function useLiveProtocolStats() {
  const [stats, setStats] = useState({ tvl: null, volume: null, txCount: null, feeBps: null, error: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const call = (data) => httpRpcCall("eth_call", [{ to: CONTRACTS.PrivarShieldVault, data }, "latest"]);
        const [su, se, volU, volE, tx, feeBps] = await Promise.all([
          call(SEL.totalShielded + encodeAddress(CONTRACTS.USDC)),
          call(SEL.totalShielded + encodeAddress(CONTRACTS.EURC)),
          call(buildTotalVolumeByTokenCall(CONTRACTS.USDC)),
          call(buildTotalVolumeByTokenCall(CONTRACTS.EURC)),
          call(SEL.totalTxCount),
          call(SEL.protocolFeeBps),
        ]);
        if (cancelled) return;
        const tvl = Number(nativeToUsdc6(decodeUint256(su))) + Number(decodeUint256(se));
        const volume = Number(nativeToUsdc6(decodeUint256(volU))) + Number(decodeUint256(volE));
        setStats({
          tvl, volume,
          txCount: Number(decodeUint256(tx)),
          feeBps: Number(decodeUint256(feeBps)),
          error: false,
        });
      } catch {
        if (!cancelled) setStats(s => ({ ...s, error: true }));
      }
    };
    load();
    const id = setInterval(load, 45_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return stats;
}

/* ═══════════════════════════════════════════════════════════════
   HEX CANVAS BACKGROUND
═══════════════════════════════════════════════════════════════ */
function HexCanvas({ theme }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); let raf, t = 0;
    const rz = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    rz(); window.addEventListener("resize", rz);
    const accentRgb = theme?.accentRgb || "0,255,176";
    const gradA = theme?.bgGradA || "rgba(0,22,13,1)";
    const gradB = theme?.bgGradB || "rgba(var(--panel-rgb),1)";
    const draw = () => {
      t += .005; ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createRadialGradient(c.width * .5, c.height * .35, 0, c.width * .5, c.height * .35, c.width * .8);
      g.addColorStop(0, gradA); g.addColorStop(1, gradB);
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      const R = 42, cols = Math.ceil(c.width / (R * 1.73)) + 2, rows = Math.ceil(c.height / (R * 1.5)) + 2;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * R * 1.73 + (row % 2 === 0 ? 0 : R * .865);
          const y = row * R * 1.5;
          const d = Math.sqrt((x - c.width * .5) ** 2 + (y - c.height * .35) ** 2);
          const wave = Math.sin(d * .009 - t * 1.4) * .5 + .5;
          const pulse = Math.sin(t * .5 + col * .3 + row * .4) * .3 + .3;
          const alpha = wave * pulse * .3;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ag = (Math.PI / 3) * i - Math.PI / 6;
            i === 0 ? ctx.moveTo(x + R * .93 * Math.cos(ag), y + R * .93 * Math.sin(ag))
                    : ctx.lineTo(x + R * .93 * Math.cos(ag), y + R * .93 * Math.sin(ag));
          }
          ctx.closePath();
          if (alpha > .14) { ctx.fillStyle = `rgba(${accentRgb},${alpha * .06})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(${accentRgb},${alpha})`; ctx.lineWidth = .6; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, [theme?.id]);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   GLITCH TEXT
═══════════════════════════════════════════════════════════════ */
function GlitchText({ text, style }) {
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
      <span style={{ position: "absolute", top: 0, left: 0, color: "var(--accent)", opacity: 0, animation: "g1 5s infinite", clipPath: "polygon(0 20%,100% 20%,100% 45%,0 45%)", transform: "translateX(-3px)" }}>{text}</span>
      <span style={{ position: "absolute", top: 0, left: 0, color: "var(--blue)", opacity: 0, animation: "g2 5s infinite", clipPath: "polygon(0 65%,100% 65%,100% 85%,0 85%)", transform: "translateX(3px)" }}>{text}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATED COUNTER
═══════════════════════════════════════════════════════════════ */
function Counter({ to, prefix = "", suffix = "", duration = 1800 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(to * ease));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: .3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION REVEAL
═══════════════════════════════════════════════════════════════ */
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: .1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(28px)", transition: `opacity .7s ${delay}ms, transform .7s ${delay}ms` }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LANDING PAGE
═══════════════════════════════════════════════════════════════ */
export function Landing({ navigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tick, setTick] = useState(0);
  const liveStats = useLiveProtocolStats();
  const { theme } = useTheme();

  // Lock body scroll while the mobile menu overlay is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  // Animated terminal ticker
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const short = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "···";
  const TERMINAL_LINES = [
    `ShieldVault :: deployed @ ${short(CONTRACTS.PrivarShieldVault)}  ✓`,
    `MerkleTreeManager :: depth 20 — Poseidon2 @ ${short(CONTRACTS.PrivarMerkleTreeManager)}  ✓`,
    `NullifierRegistry :: append-only, anti double-spend @ ${short(CONTRACTS.PrivarNullifierRegistry)}  ✓`,
    "EmergencyController :: circuit breaker ARMED  ✓",
    "CCTP v2 Bridge :: 6 chains supported  ✓",
    `Timelock :: 48h minimum delay on upgrades @ ${short(CONTRACTS.Timelock)}  ✓`,
  ];

  // Primary product nav — mirrors the real panels inside Privar OS
  // (src/DApp.jsx NAV array), so this menu stays in lockstep with what
  // the app actually offers instead of drifting into generic marketing links.
  const PRODUCT_LINKS = [
    { label: "Shield",   icon: "🛡" },
    { label: "Swap",     icon: "⇄" },
    { label: "Send",     icon: "↗" },
    { label: "Withdraw", icon: "↙" },
    { label: "Bridge",   icon: "⟺" },
    { label: "History",  icon: "📋" },
  ];
  // Secondary / highlighted features — pill-style, matching the live
  // protocol modules that aren't core transfer actions.
  const PILL_FEATURES = [
    { label: "Analytics",  icon: "📈" },
    { label: "Governance", icon: "🗳" },
    { label: "Staking",    icon: "💎" },
  ];
  const SECTION_LINKS = ["Features", "Architecture", "How It Works", "Roadmap"];

  return (
    <div style={{ ...cssVars(theme), background: "var(--bg)", minHeight: "100vh", color: "var(--text)", fontFamily: "'JetBrains Mono', monospace", overflowX: "hidden" }}>
      <HexCanvas theme={theme} />

      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: var(--bg); overflow-x: hidden; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: var(--bg); } ::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),.3); border-radius: 2px; }
        @keyframes g1 { 0%,88%,100%{opacity:0} 90%{opacity:.7;transform:translateX(-3px)} 94%{opacity:0} }
        @keyframes g2 { 0%,92%,100%{opacity:0} 94%{opacity:.5;transform:translateX(3px)} 98%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes scanline { 0%{top:-10%} 100%{top:110%} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes borderGlow { 0%,100%{box-shadow:0 0 20px rgba(var(--accent-rgb),.1)} 50%{box-shadow:0 0 40px rgba(var(--accent-rgb),.25)} }
        @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @media (max-width: 860px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
        @media (max-width: 480px) {
          .hero-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════
          NAVBAR
      ═══════════════════════════════════════════════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        height: 62, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 5vw",
        background: scrolled ? "rgba(var(--panel-rgb),.92)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(var(--accent-rgb),.1)" : "none",
        transition: "all .35s",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, border: "1.5px solid var(--accent)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontSize: 14, boxShadow: "0 0 12px rgba(var(--accent-rgb),.25)" }}>◈</div>
          <GlitchText text="privar" style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)", fontFamily: "'Syne', sans-serif" }} />
          <span style={{ fontSize: 8, color: "var(--divider)", letterSpacing: ".18em", marginLeft: 2 }}>OS</span>
        </div>

        {/* Desktop nav — product links */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }} className="desktop-nav">
          {PRODUCT_LINKS.map(l => (
            <button key={l.label} onClick={() => navigate("/app")} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 10, color: "var(--text-dim)", letterSpacing: ".1em",
              textTransform: "uppercase", fontFamily: "monospace",
              padding: 0, transition: "color .2s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-dim)"}>{l.label}</button>
          ))}
          <div style={{ height: 16, width: 1, background: "rgba(var(--accent-rgb),.12)" }} />
          {PILL_FEATURES.map(l => (
            <button key={l.label} onClick={() => navigate("/app")} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.22)",
              borderRadius: 20, padding: "5px 12px", cursor: "pointer",
              fontSize: 9, color: "var(--accent)", letterSpacing: ".08em",
              textTransform: "uppercase", fontFamily: "monospace", transition: "all .2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--accent-rgb),.14)"; e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--accent-rgb),.06)"; e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),.22)"; }}>
              {l.label}
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 5px var(--accent)", animation: "pulse 1.8s infinite" }} />
            </button>
          ))}
        </div>

        {/* Desktop CTA */}
        <button onClick={() => navigate("/app")} className="desktop-nav" style={{
          padding: "9px 20px", background: "transparent",
          border: "1px solid var(--accent)", borderRadius: 3,
          color: "var(--accent)", fontSize: 10, fontWeight: 700,
          cursor: "pointer", fontFamily: "monospace", letterSpacing: ".16em",
          textTransform: "uppercase", boxShadow: "0 0 18px rgba(var(--accent-rgb),.15)",
          transition: "all .2s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--accent-rgb),.12)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >Connect Wallet</button>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(true)} className="mobile-menu-btn" style={{
          display: "none", background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.25)",
          borderRadius: 4, width: 34, height: 34, color: "var(--accent)", fontSize: 16,
          cursor: "pointer", alignItems: "center", justifyContent: "center",
        }} aria-label="Open menu">☰</button>
      </nav>

      {menuOpen && (
        <MobileMenu
          navigate={navigate}
          onClose={() => setMenuOpen(false)}
          productLinks={PRODUCT_LINKS}
          pillFeatures={PILL_FEATURES}
          sectionLinks={SECTION_LINKS}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════ */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 5vw 60px", position: "relative", zIndex: 1, textAlign: "center" }}>

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.2)", borderRadius: 20, padding: "6px 16px", marginBottom: 32, animation: "fadeUp .6s ease" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)", animation: "pulse 1.5s infinite", display: "inline-block" }} />
          <span style={{ fontSize: 9, color: "var(--accent)", letterSpacing: ".2em", textTransform: "uppercase" }}>Live on Arc Testnet · chainId 5042002</span>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: "clamp(38px,7vw,96px)", fontWeight: 900, fontFamily: "'Syne', sans-serif", lineHeight: 1.0, marginBottom: 10, animation: "fadeUp .7s .1s ease both" }}>
          <GlitchText text="privar" style={{ color: "var(--accent)", display: "block" }} />
          <span style={{ color: "var(--text)", display: "block", fontWeight: 700 }}>Confidential</span>
          <span style={{ color: "var(--text)", display: "block", fontWeight: 700 }}>Capital OS</span>
        </h1>

        {/* Subheadline */}
        <p style={{ fontSize: "clamp(13px,1.8vw,18px)", color: "var(--text-dim)", maxWidth: 620, lineHeight: 1.7, marginBottom: 44, animation: "fadeUp .7s .2s ease both" }}>
          The first confidential on-chain capital management system built on ARC Network. Shield, swap, send and bridge USDC with governed visibility — only you control who sees what.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", animation: "fadeUp .7s .3s ease both", marginBottom: 70 }}>
          <button onClick={() => navigate("/app")} style={{
            padding: "14px 36px", background: "var(--accent)",
            border: "none", borderRadius: 4, color: "var(--bg)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "monospace", letterSpacing: ".16em",
            textTransform: "uppercase", boxShadow: "0 0 30px rgba(var(--accent-rgb),.35)",
            transition: "all .2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 50px rgba(var(--accent-rgb),.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 0 30px rgba(var(--accent-rgb),.35)"; }}
          >⟶ Launch Privar OS</button>
          <a href="#how-it-works" style={{
            padding: "14px 30px", background: "transparent",
            border: "1px solid rgba(var(--accent-rgb),.25)", borderRadius: 4,
            color: "var(--text-dim)", fontSize: 12, cursor: "pointer",
            fontFamily: "monospace", letterSpacing: ".14em",
            textTransform: "uppercase", textDecoration: "none",
            transition: "all .2s", display: "inline-block",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),.6)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),.25)"; e.currentTarget.style.color = "var(--text-dim)"; }}
          >How It Works</a>
        </div>

        {/* Terminal window */}
        <div style={{ width: "100%", maxWidth: 680, background: "rgba(var(--panel-rgb),.85)", border: "1px solid rgba(var(--accent-rgb),.15)", borderRadius: 8, overflow: "hidden", backdropFilter: "blur(12px)", animation: "fadeUp .7s .4s ease both, borderGlow 3s 1s infinite", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
          {/* Terminal header */}
          <div style={{ background: "rgba(0,0,0,.4)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid rgba(var(--accent-rgb),.08)" }}>
            {["#EF4444","#F59E0B","var(--accent)"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: .7 }} />)}
            <span style={{ marginLeft: 8, fontSize: 9, color: "var(--text-faint)", letterSpacing: ".2em" }}>PRIVAR OS — PROTOCOL STATUS — ARC TESTNET</span>
          </div>
          {/* Terminal body */}
          <div style={{ padding: "16px 18px", minHeight: 130 }}>
            {TERMINAL_LINES.slice(0, (tick % TERMINAL_LINES.length) + 3 > TERMINAL_LINES.length ? TERMINAL_LINES.length : (tick % TERMINAL_LINES.length) + 3).map((line, i) => (
              <div key={`${tick}-${i}`} style={{ fontSize: 11, color: i % 2 === 0 ? "var(--accent)" : "var(--accent)", marginBottom: 5, letterSpacing: ".04em", animation: "fadeUp .3s ease" }}>
                <span style={{ color: "var(--divider)", marginRight: 8 }}>[{String(i).padStart(2, "0")}]</span>{line}
              </div>
            ))}
            <span style={{ color: "var(--accent)", animation: "pulse .8s infinite", fontSize: 14 }}>▌</span>
          </div>
        </div>

        {/* Live protocol stats bar */}
        <div style={{ width: "100%", maxWidth: 680, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 22 }} className="hero-stats-grid">
          {[
            { label: "Total Value Locked", value: liveStats.error ? "—" : liveStats.tvl != null ? fmtCompact(liveStats.tvl) : "···" },
            { label: "Total Volume",       value: liveStats.error ? "—" : liveStats.volume != null ? fmtCompact(liveStats.volume) : "···" },
            { label: "Transactions",       value: liveStats.error ? "—" : liveStats.txCount != null ? liveStats.txCount.toLocaleString() : "···" },
            { label: "Protocol Fee",       value: liveStats.error ? "—" : liveStats.feeBps != null ? (liveStats.feeBps / 100).toFixed(2) + "%" : "···" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(var(--panel-rgb),.75)", border: "1px solid rgba(var(--accent-rgb),.15)", borderRadius: 6, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "clamp(13px,2vw,17px)", fontWeight: 700, color: "var(--text)", fontFamily: "monospace", lineHeight: 1 }}>
                {s.value} <span style={{ width: 5, height: 5, display: "inline-block", borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 5px var(--accent)", marginLeft: 3 }} />
              </div>
              <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          STATS
      ═══════════════════════════════════════════════════════ */}
      <section style={{ padding: "60px 5vw", position: "relative", zIndex: 1, borderTop: "1px solid rgba(var(--accent-rgb),.06)", borderBottom: "1px solid rgba(var(--accent-rgb),.06)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
          {[
            { label: "Chain ID", value: 5042002, suffix: "" },
            { label: "Smart Contracts Deployed", value: 13, suffix: "" },
            { label: "Merkle Tree Depth", value: 20, suffix: "" },
            { label: "Bridge Chains (CCTP v2)", value: 6, suffix: "" },
            { label: "Timelock Delay", value: 48, suffix: "h" },
            { label: "Circuit Breaker", value: 100000, prefix: "$", suffix: "/h" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 80}>
              <div style={{ textAlign: "center", padding: "18px 10px" }}>
                <div style={{ fontSize: "clamp(24px,4vw,38px)", fontWeight: 700, color: "var(--accent)", fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>
                  {s.prefix || ""}<Counter to={typeof s.value === "number" ? Math.round(s.value * (s.decimals ? Math.pow(10, s.decimals) : 1)) : s.value} duration={1600} />{s.suffix}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".18em", textTransform: "uppercase", marginTop: 6 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FEATURES
      ═══════════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: "100px 5vw", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ Core Features</div>
              <h2 style={{ fontSize: "clamp(28px,4vw,52px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "var(--text)", lineHeight: 1.1 }}>
                Everything shielded.<br /><span style={{ color: "var(--accent)" }}>Governed visibility.</span>
              </h2>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {[
              {
                icon: "🛡", title: "Shield Assets",
                desc: "Deposit USDC into the ShieldVault. Your balance enters a confidential state — only you and parties you authorize can view it. Aligned with Arc Privacy Sector.",
                tag: "Confidential",
              },
              {
                icon: "⇄", title: "Private Swap",
                desc: "Exchange tokens with governed visibility. Amounts and addresses are confidential — accessible only to authorized parties.",
                tag: "Shielded",
              },
              {
                icon: "↗", title: "Private Send",
                desc: "Stealth address transfers. The sender is cryptographically hidden. ARC Name Service (.arc human-readable addresses) is planned for a future release.",
                tag: "Stealth",
              },
              {
                icon: "↙", title: "Private Withdraw",
                desc: "Exit confidential balance to any public address. Ownership is proven on-chain — only authorized parties can link deposit and withdrawal.",
                tag: "Groth16",
              },
              {
                icon: "⟺", title: "Cross-Chain Bridge",
                desc: "Bridge shielded USDC across 6 chains via Circle CCTP v2. Recipient address has governed visibility — public on-chain data reveals only amount and destination chain.",
                tag: "CCTP v2",
              },
              {
                icon: "🛑", title: "Emergency Controller",
                desc: "Deployed circuit-breaker contract. Auto-pauses the vault if outflow exceeds a configurable hourly threshold, protecting depositors against drains.",
                tag: "Safety",
              },
              {
                icon: "🗳", title: "On-Chain Governance",
                desc: "Vote on protocol proposals with veARC. Flash-loan resistant — voting power snapshot at T-1 block. 48-hour Timelock on all changes.",
                tag: "Anti-flashloan",
              },
              {
                icon: "💎", title: "USDC Staking",
                desc: "Stake USDC for 7–180 day lock periods. Earn yield up to 24.2% APY. Lock multipliers 1×–3× boost voting power in Governance.",
                tag: "Yield",
              },
              {
                icon: "📈", title: "Analytics",
                desc: "Real-time TVL charts, transaction heatmaps and protocol metrics. Live price feed for USDC, ETH, WBTC via CoinGecko.",
                tag: "Live Data",
              },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <FeatureCard {...f} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ARCHITECTURE
      ═══════════════════════════════════════════════════════ */}
      <section id="architecture" style={{ padding: "100px 5vw", position: "relative", zIndex: 1, background: "rgba(var(--accent-rgb),.015)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ Architecture</div>
              <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "var(--text)" }}>
                Modular. Secure. <span style={{ color: "var(--accent)" }}>Non-custodial.</span>
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-dim2)", marginTop: 14, maxWidth: 560, margin: "14px auto 0", lineHeight: 1.7 }}>
                ShieldVault is the sole custodian of funds. Every module operates with least privilege — no module can move USDC without ShieldVault's explicit approval.
              </p>
            </div>
          </Reveal>

          {/* Architecture diagram */}
          <Reveal delay={100}>
            <div style={{ background: "rgba(var(--panel-rgb),.85)", border: "1px solid rgba(var(--accent-rgb),.15)", borderRadius: 8, padding: "32px", backdropFilter: "blur(12px)", fontFamily: "monospace", fontSize: 11, color: "var(--accent)", lineHeight: 1.8 }}>
              <div style={{ color: "var(--accent)", fontWeight: 700, marginBottom: 12, fontSize: 12 }}>ShieldVault.sol <span style={{ color: "var(--text-faint)" }}>← Orchestrator · Sole custody of USDC</span></div>
              {[
                ["├── DepositManager",     "Validates ZK deposit proof → inserts Merkle leaf"],
                ["├── WithdrawalManager",  "Validates proof → spends nullifier → returns amount"],
                ["├── ShieldedTransfer",   "Note-to-note private transfer — zero fund movement"],
                ["├── PrivateSwap",        "DEX execution with exact approval + auto-revoke"],
                ["├── PrivateBridge",      "CCTP v2 burn — funds never leave vault early"],
                ["│"],
                ["├── VerifierZK",         "Groth16 BN254 stateless verifier — never holds funds"],
                ["├── NullifierRegistry",  "Append-only double-spend prevention"],
                ["├── MerkleTreeManager",  "Poseidon depth-20 — 1M commitment capacity"],
                ["│"],
                ["├── EmergencyController","3-tier circuit breaker · auto-pause at $5M/1h"],
                ["├── Timelock",           "48h delay on all admin actions"],
                ["└── Governance",         "Anti-flash-loan voting · 4% quorum"],
              ].map(([code, comment], i) => (
                <div key={i} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: code.includes("│") ? "var(--divider)" : "var(--accent)", minWidth: 220, flexShrink: 0 }}>{code}</span>
                  {comment && <span style={{ color: "var(--text-faint2)", fontSize: 10 }}>← {comment}</span>}
                </div>
              ))}
            </div>
          </Reveal>

          {/* Security badges */}
          <Reveal delay={200}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28, justifyContent: "center" }}>
              {["Arc Privacy Sector Aligned", "Governed Visibility", "CEI Pattern Enforced", "CCTP v2 Bridge", "Least Privilege", "NonReentrant Guards", "48h Timelock", "Auto Circuit Breaker"].map(badge => (
                <span key={badge} style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.15)", borderRadius: 3, padding: "5px 10px", color: "var(--accent)" }}>{badge}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════════ */}
      <section id="how-it-works" style={{ padding: "100px 5vw", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ How It Works</div>
              <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "var(--text)" }}>
                Connect. Shield. <span style={{ color: "var(--accent)" }}>Governed visibility.</span>
              </h2>
            </div>
          </Reveal>

          {[
            { step: "01", title: "Connect your wallet", desc: "Sign in with MetaMask, Rabby, WalletConnect or 5 other providers. EIP-191 signature authentication — no email, no password. Arc Testnet auto-switch included.", icon: "🔗" },
            { step: "02", title: "Get testnet USDC", desc: "Visit faucet.circle.com, select Arc Testnet, paste your address and request 1 USDC/day. USDC is the native gas token on Arc — no ETH needed.", icon: "💧" },
            { step: "03", title: "Shield your assets", desc: "Deposit USDC into the ShieldVault. Your balance enters a confidential state with governed visibility — you control who can view your activity.", icon: "🛡" },
            { step: "04", title: "Operate privately", desc: "Swap tokens, send to any address, bridge across 6 chains — all within a confidential environment with governed visibility, backed by an on-chain emergency circuit breaker.", icon: "⚡" },
          ].map((s, i) => (
            <Reveal key={s.step} delay={i * 80}>
              <div style={{ display: "flex", gap: 24, marginBottom: 36, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 52, height: 52, background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{s.icon}</div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".2em", fontFamily: "monospace" }}>STEP {s.step}</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(var(--accent-rgb),.08)" }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", fontFamily: "'Syne', sans-serif", marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: "var(--text-dim2)", lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ROADMAP
      ═══════════════════════════════════════════════════════ */}
      <section id="roadmap" style={{ padding: "100px 5vw", position: "relative", zIndex: 1, background: "rgba(var(--accent-rgb),.015)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ Roadmap</div>
              <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "var(--text)" }}>
                The path to <span style={{ color: "var(--accent)" }}>mainnet.</span>
              </h2>
            </div>
          </Reveal>

          {[
            { q: "Q3 2026", label: "CURRENT", color: "var(--accent)", items: ["Arc Testnet deployment", "ShieldVault v2.3.1 live", "Confidential Shield / Swap / Send / Bridge", "Emergency circuit breaker armed", "Governed visibility (user-scoped notes)", "Governance + Staking live"] },
            { q: "Q4 2026", label: "NEXT",    color: "var(--blue)", items: ["EIP-712 authorized view keys (Arc whitepaper §3)", "Independent security audit x2", "ZK circuit audit (Veridise)", "Admin multisig deployment", "Bug bounty program (Immunefi)", "Arc Mainnet soft launch"] },
            { q: "Q1 2027", label: "PLANNED", color: "#a78bfa", items: ["Arc Private EVM integration (synchronous execution)", "Governed visibility API — compliance & audit mode", "veARC governance token launch", "CCTP v2 mainnet bridge activation", "Full DEX integration (Arc StableFX)", "Mobile app (iOS + Android)"] },
            { q: "Q2 2027", label: "FUTURE",  color: "#fbbf24", items: ["Hardware enclave execution (Arc Privacy Sector)", "Institutional shield pools with audit access", "Post-quantum encryption layer", "Privacy-preserving DeFi aggregator", "SDK for third-party confidential apps", "DAO transition"] },
          ].map((phase, i) => (
            <Reveal key={phase.q} delay={i * 80}>
              <div style={{ display: "flex", gap: 20, marginBottom: 32 }}>
                <div style={{ flexShrink: 0, textAlign: "center", paddingTop: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: phase.color, boxShadow: `0 0 10px ${phase.color}`, margin: "0 auto 8px" }} />
                  <div style={{ width: 1, height: "calc(100% - 20px)", background: "rgba(var(--accent-rgb),.1)", margin: "0 auto" }} />
                </div>
                <div style={{ flex: 1, background: "rgba(var(--panel-rgb),.7)", border: `1px solid ${phase.color}22`, borderRadius: 6, padding: "16px 20px", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "'Syne', sans-serif" }}>{phase.q}</span>
                    <span style={{ fontSize: 8, background: `${phase.color}18`, border: `1px solid ${phase.color}40`, borderRadius: 2, padding: "2px 8px", color: phase.color, letterSpacing: ".14em" }}>{phase.label}</span>
                  </div>
                  <ul style={{ listStyle: "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 16px" }}>
                    {phase.items.map(item => (
                      <li key={item} style={{ fontSize: 11, color: "var(--text-dim2)", display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ color: phase.color, flexShrink: 0 }}>▸</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          CTA SECTION
      ═══════════════════════════════════════════════════════ */}
      <section style={{ padding: "100px 5vw", position: "relative", zIndex: 1, textAlign: "center" }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ width: 64, height: 64, border: "1.5px solid var(--accent)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--accent)", margin: "0 auto 28px", boxShadow: "0 0 30px rgba(var(--accent-rgb),.2)", animation: "float 4s ease infinite" }}>◈</div>
            <h2 style={{ fontSize: "clamp(28px,5vw,56px)", fontFamily: "'Syne', sans-serif", fontWeight: 900, color: "var(--text)", marginBottom: 18, lineHeight: 1.1 }}>
              Start managing capital<br /><span style={{ color: "var(--accent)" }}>privately today.</span>
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-dim2)", lineHeight: 1.7, marginBottom: 40, maxWidth: 500, margin: "0 auto 40px" }}>
              Privar OS is live on Arc Testnet. Connect your wallet, get USDC from the faucet, and start shielding your assets in under 60 seconds.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => navigate("/app")} style={{
                padding: "16px 40px", background: "var(--accent)", border: "none",
                borderRadius: 4, color: "var(--bg)", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "monospace", letterSpacing: ".16em",
                textTransform: "uppercase", boxShadow: "0 0 40px rgba(var(--accent-rgb),.4)",
                transition: "all .2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(var(--accent-rgb),.6)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 0 40px rgba(var(--accent-rgb),.4)"; }}
              >⟶ Launch Privar OS</button>
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{
                padding: "16px 30px", background: "transparent",
                border: "1px solid rgba(var(--accent-rgb),.25)", borderRadius: 4,
                color: "var(--text-dim)", fontSize: 13, cursor: "pointer",
                fontFamily: "monospace", letterSpacing: ".14em",
                textTransform: "uppercase", textDecoration: "none",
                transition: "all .2s", display: "inline-block",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),.5)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(var(--accent-rgb),.25)"; e.currentTarget.style.color = "var(--text-dim)"; }}
              >💧 Get Testnet USDC</a>
            </div>

            {/* Trust badges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 36, flexWrap: "wrap" }}>
              {["Non-custodial", "EIP-191 Auth", "Open Source", "ZK Privacy", "Arc Testnet"].map(t => (
                <span key={t} style={{ fontSize: 9, color: "var(--text-faint2)", letterSpacing: ".14em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "var(--accent)" }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════ */}
      <footer style={{ padding: "40px 5vw", borderTop: "1px solid rgba(var(--accent-rgb),.08)", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 22, height: 22, border: "1px solid rgba(var(--accent-rgb),.4)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--accent)" }}>◈</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "'Syne', sans-serif" }}>privar</span>
            <span style={{ fontSize: 9, color: "var(--text-faint2)", letterSpacing: ".1em" }}>OS v12.0.0</span>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[["Docs", "#"], ["Security", "#"], ["GitHub", "#"], ["ARCScan", "https://testnet.arcscan.app"], ["Faucet", "https://faucet.circle.com"]].map(([label, href]) => (
              <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
                style={{ fontSize: 10, color: "var(--text-faint2)", textDecoration: "none", letterSpacing: ".12em", textTransform: "uppercase", transition: "color .2s" }}
                onMouseEnter={e => e.target.style.color = "var(--accent)"}
                onMouseLeave={e => e.target.style.color = "var(--text-faint2)"}>{label}</a>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "var(--divider)", letterSpacing: ".1em" }}>
            ARC TESTNET · CHAIN 5042002 · USDC GAS
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MOBILE MENU (full-screen overlay)
   Layout mirrors the desktop nav split: core transfer actions as
   plain rows, then the highlighted protocol modules as pill rows —
   kept in sync with Privar OS's real feature set (src/DApp.jsx NAV).
═══════════════════════════════════════════════════════════════ */
function MobileMenu({ navigate, onClose, productLinks, pillFeatures, sectionLinks }) {
  const go = () => { onClose(); navigate("/app"); };
  const { themeId, setThemeId, THEMES: T } = useTheme();
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)",
      overflowY: "auto", animation: "fadeUp .25s ease",
    }}>
      {/* Header row */}
      <div style={{ height: 62, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 5vw", borderBottom: "1px solid rgba(var(--accent-rgb),.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 26, height: 26, border: "1.5px solid var(--accent)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontSize: 12 }}>◈</div>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)", fontFamily: "'Syne', sans-serif" }}>privar</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={go} style={{ padding: "8px 16px", background: "var(--accent)", border: "none", borderRadius: 3, color: "var(--bg)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", textTransform: "uppercase" }}>
            Connect Wallet
          </button>
          <button onClick={onClose} aria-label="Close menu" style={{ background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.25)", borderRadius: 4, width: 34, height: 34, color: "var(--accent)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 5vw 50px" }}>
        <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".22em", textTransform: "uppercase", margin: "8px 0 10px" }}>Thème</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7, marginBottom: 4 }}>
          {Object.values(T).map(t => {
            const active = t.id === themeId;
            return (
              <button key={t.id} onClick={() => setThemeId(t.id)} title={t.label} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                background: active ? `rgba(${t.accentRgb},.1)` : "rgba(0,0,0,.25)",
                border: active ? `1.5px solid ${t.accent}` : "1px solid rgba(255,255,255,.08)",
                borderRadius: 6, padding: "8px 4px", cursor: "pointer",
              }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`, border: `1px solid ${t.accent}55` }} />
                <span style={{ fontSize: 7, color: active ? t.accent : "var(--text-dim2)", fontFamily: "monospace", letterSpacing: ".04em" }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".22em", textTransform: "uppercase", margin: "22px 0 4px" }}>Product</div>
        {productLinks.map(l => (
          <button key={l.label} onClick={go} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            background: "none", border: "none", borderBottom: "1px solid rgba(var(--accent-rgb),.06)",
            padding: "16px 4px", cursor: "pointer", textAlign: "left",
          }}>
            <span style={{ fontSize: 16 }}>{l.icon}</span>
            <span style={{ fontSize: 15, color: "#e2e8f0", fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>{l.label}</span>
          </button>
        ))}

        <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".22em", textTransform: "uppercase", margin: "22px 0 10px" }}>Modules</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pillFeatures.map(l => (
            <button key={l.label} onClick={go} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(var(--accent-rgb),.06)", border: "1px solid rgba(var(--accent-rgb),.25)",
              borderRadius: 8, padding: "14px 16px", cursor: "pointer", textAlign: "left",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--accent)", fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>
                <span style={{ fontSize: 16 }}>{l.icon}</span>{l.label}
              </span>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)", animation: "pulse 1.8s infinite" }} />
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: "rgba(var(--accent-rgb),.08)", margin: "26px 0" }} />

        <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: ".22em", textTransform: "uppercase", margin: "0 0 10px" }}>Learn more</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {sectionLinks.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, "-")}`} onClick={onClose} style={{
              fontSize: 10, color: "var(--text-dim2)", letterSpacing: ".1em", textTransform: "uppercase",
              textDecoration: "none", border: "1px solid rgba(100,116,139,.2)", borderRadius: 20,
              padding: "7px 14px",
            }}>{l}</a>
          ))}
        </div>

        <div style={{ marginTop: 30, fontSize: 9, color: "var(--text-faint2)", letterSpacing: ".1em" }}>
          ARC TESTNET · CHAIN 5042002 · USDC GAS
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE CARD
═══════════════════════════════════════════════════════════════ */
function FeatureCard({ icon, title, desc, tag }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? "rgba(var(--accent-rgb),.04)" : "rgba(var(--panel-rgb),.7)",
        border: `1px solid ${h ? "rgba(var(--accent-rgb),.3)" : "rgba(var(--accent-rgb),.1)"}`,
        borderRadius: 7, padding: "24px 22px", transition: "all .25s",
        boxShadow: h ? "0 0 30px rgba(var(--accent-rgb),.08)" : "none",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <span style={{ fontSize: 26 }}>{icon}</span>
        <span style={{ fontSize: 8, background: "rgba(var(--accent-rgb),.08)", border: "1px solid rgba(var(--accent-rgb),.2)", borderRadius: 2, padding: "3px 8px", color: "var(--accent)", letterSpacing: ".12em" }}>{tag}</span>
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "'Syne', sans-serif", marginBottom: 9 }}>{title}</h3>
      <p style={{ fontSize: 12, color: "var(--text-dim2)", lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}
