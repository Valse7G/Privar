import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   HEX CANVAS BACKGROUND
═══════════════════════════════════════════════════════════════ */
function HexCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); let raf, t = 0;
    const rz = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    rz(); window.addEventListener("resize", rz);
    const draw = () => {
      t += .005; ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createRadialGradient(c.width * .5, c.height * .35, 0, c.width * .5, c.height * .35, c.width * .8);
      g.addColorStop(0, "rgba(0,22,13,1)"); g.addColorStop(1, "rgba(0,5,3,1)");
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
          if (alpha > .14) { ctx.fillStyle = `rgba(0,255,160,${alpha * .06})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(0,255,180,${alpha})`; ctx.lineWidth = .6; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   GLITCH TEXT
═══════════════════════════════════════════════════════════════ */
function GlitchText({ text, style }) {
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
      <span style={{ position: "absolute", top: 0, left: 0, color: "#00FFB0", opacity: 0, animation: "g1 5s infinite", clipPath: "polygon(0 20%,100% 20%,100% 45%,0 45%)", transform: "translateX(-3px)" }}>{text}</span>
      <span style={{ position: "absolute", top: 0, left: 0, color: "#0EA5E9", opacity: 0, animation: "g2 5s infinite", clipPath: "polygon(0 65%,100% 65%,100% 85%,0 85%)", transform: "translateX(3px)" }}>{text}</span>
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

  const TERMINAL_LINES = [
    "ShieldVault :: deployed @ 0xDC92...e8D02  ✓",
    "MerkleTreeManager :: depth 20 — Poseidon2  ✓",
    "NullifierRegistry :: append-only, anti double-spend  ✓",
    "EmergencyController :: circuit breaker ARMED  ✓",
    "CCTP v2 Bridge :: 6 chains supported  ✓",
    "Timelock :: 48h minimum delay on upgrades  ✓",
  ];

  const NAV_LINKS = ["Features", "Architecture", "How It Works", "Roadmap"];

  return (
    <div style={{ background: "#000A06", minHeight: "100vh", color: "#ffffff", fontFamily: "'JetBrains Mono', monospace", overflowX: "hidden" }}>
      <HexCanvas />

      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #000A06; overflow-x: hidden; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #000A06; } ::-webkit-scrollbar-thumb { background: rgba(0,255,176,.3); border-radius: 2px; }
        @keyframes g1 { 0%,88%,100%{opacity:0} 90%{opacity:.7;transform:translateX(-3px)} 94%{opacity:0} }
        @keyframes g2 { 0%,92%,100%{opacity:0} 94%{opacity:.5;transform:translateX(3px)} 98%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes scanline { 0%{top:-10%} 100%{top:110%} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes borderGlow { 0%,100%{box-shadow:0 0 20px rgba(0,255,176,.1)} 50%{box-shadow:0 0 40px rgba(0,255,176,.25)} }
      `}</style>

      {/* ═══════════════════════════════════════════════════════
          NAVBAR
      ═══════════════════════════════════════════════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        height: 62, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 5vw",
        background: scrolled ? "rgba(0,5,3,.92)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(0,255,176,.1)" : "none",
        transition: "all .35s",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, border: "1.5px solid #00FFB0", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", color: "#00FFB0", fontSize: 14, boxShadow: "0 0 12px rgba(0,255,176,.25)" }}>◈</div>
          <GlitchText text="privARC" style={{ fontSize: 18, fontWeight: 800, color: "#00FFB0", fontFamily: "'Syne', sans-serif" }} />
          <span style={{ fontSize: 8, color: "#1E5C3A", letterSpacing: ".18em", marginLeft: 2 }}>OS</span>
        </div>

        {/* Desktop nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }} className="desktop-nav">
          {NAV_LINKS.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, "-")}`}
              style={{ fontSize: 10, color: "#64748b", letterSpacing: ".14em", textDecoration: "none", textTransform: "uppercase", transition: "color .2s" }}
              onMouseEnter={e => e.target.style.color = "#00FFB0"}
              onMouseLeave={e => e.target.style.color = "#64748b"}>{l}</a>
          ))}
        </div>

        {/* CTA */}
        <button onClick={() => navigate("/app")} style={{
          padding: "9px 20px", background: "transparent",
          border: "1px solid #00FFB0", borderRadius: 3,
          color: "#00FFB0", fontSize: 10, fontWeight: 700,
          cursor: "pointer", fontFamily: "monospace", letterSpacing: ".16em",
          textTransform: "uppercase", boxShadow: "0 0 18px rgba(0,255,176,.15)",
          transition: "all .2s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.12)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >Launch App →</button>
      </nav>

      {/* ═══════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════ */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 5vw 60px", position: "relative", zIndex: 1, textAlign: "center" }}>

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,255,176,.06)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 20, padding: "6px 16px", marginBottom: 32, animation: "fadeUp .6s ease" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FFB0", boxShadow: "0 0 6px #00FFB0", animation: "pulse 1.5s infinite", display: "inline-block" }} />
          <span style={{ fontSize: 9, color: "#00FFB0", letterSpacing: ".2em", textTransform: "uppercase" }}>Live on Arc Testnet · chainId 5042002</span>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: "clamp(38px,7vw,96px)", fontWeight: 900, fontFamily: "'Syne', sans-serif", lineHeight: 1.0, marginBottom: 10, animation: "fadeUp .7s .1s ease both" }}>
          <GlitchText text="privARC" style={{ color: "#00FFB0", display: "block" }} />
          <span style={{ color: "#ffffff", display: "block", fontWeight: 700 }}>Confidential</span>
          <span style={{ color: "#ffffff", display: "block", fontWeight: 700 }}>Capital OS</span>
        </h1>

        {/* Subheadline */}
        <p style={{ fontSize: "clamp(13px,1.8vw,18px)", color: "#94a3b8", maxWidth: 620, lineHeight: 1.7, marginBottom: 44, animation: "fadeUp .7s .2s ease both" }}>
          The first confidential on-chain capital management system built on ARC Network. Shield, swap, send and bridge USDC with governed visibility — only you control who sees what.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", animation: "fadeUp .7s .3s ease both", marginBottom: 70 }}>
          <button onClick={() => navigate("/app")} style={{
            padding: "14px 36px", background: "#00FFB0",
            border: "none", borderRadius: 4, color: "#000A06",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "monospace", letterSpacing: ".16em",
            textTransform: "uppercase", boxShadow: "0 0 30px rgba(0,255,176,.35)",
            transition: "all .2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 50px rgba(0,255,176,.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 0 30px rgba(0,255,176,.35)"; }}
          >⟶ Launch PrivARC OS</button>
          <a href="#how-it-works" style={{
            padding: "14px 30px", background: "transparent",
            border: "1px solid rgba(0,255,176,.25)", borderRadius: 4,
            color: "#94a3b8", fontSize: 12, cursor: "pointer",
            fontFamily: "monospace", letterSpacing: ".14em",
            textTransform: "uppercase", textDecoration: "none",
            transition: "all .2s", display: "inline-block",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.6)"; e.currentTarget.style.color = "#ffffff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.25)"; e.currentTarget.style.color = "#94a3b8"; }}
          >How It Works</a>
        </div>

        {/* Terminal window */}
        <div style={{ width: "100%", maxWidth: 680, background: "rgba(0,5,3,.85)", border: "1px solid rgba(0,255,176,.15)", borderRadius: 8, overflow: "hidden", backdropFilter: "blur(12px)", animation: "fadeUp .7s .4s ease both, borderGlow 3s 1s infinite", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
          {/* Terminal header */}
          <div style={{ background: "rgba(0,0,0,.4)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid rgba(0,255,176,.08)" }}>
            {["#EF4444","#F59E0B","#00FFB0"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: .7 }} />)}
            <span style={{ marginLeft: 8, fontSize: 9, color: "#4a7c5f", letterSpacing: ".2em" }}>PRIVARC OS — PROTOCOL STATUS — ARC TESTNET</span>
          </div>
          {/* Terminal body */}
          <div style={{ padding: "16px 18px", minHeight: 130 }}>
            {TERMINAL_LINES.slice(0, (tick % TERMINAL_LINES.length) + 3 > TERMINAL_LINES.length ? TERMINAL_LINES.length : (tick % TERMINAL_LINES.length) + 3).map((line, i) => (
              <div key={`${tick}-${i}`} style={{ fontSize: 11, color: i % 2 === 0 ? "#00FFB0" : "#4ade80", marginBottom: 5, letterSpacing: ".04em", animation: "fadeUp .3s ease" }}>
                <span style={{ color: "#1e3a2a", marginRight: 8 }}>[{String(i).padStart(2, "0")}]</span>{line}
              </div>
            ))}
            <span style={{ color: "#00FFB0", animation: "pulse .8s infinite", fontSize: 14 }}>▌</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          STATS
      ═══════════════════════════════════════════════════════ */}
      <section style={{ padding: "60px 5vw", position: "relative", zIndex: 1, borderTop: "1px solid rgba(0,255,176,.06)", borderBottom: "1px solid rgba(0,255,176,.06)" }}>
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
                <div style={{ fontSize: "clamp(24px,4vw,38px)", fontWeight: 700, color: "#00FFB0", fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>
                  {s.prefix || ""}<Counter to={typeof s.value === "number" ? Math.round(s.value * (s.decimals ? Math.pow(10, s.decimals) : 1)) : s.value} duration={1600} />{s.suffix}
                </div>
                <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".18em", textTransform: "uppercase", marginTop: 6 }}>{s.label}</div>
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
              <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ Core Features</div>
              <h2 style={{ fontSize: "clamp(28px,4vw,52px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>
                Everything shielded.<br /><span style={{ color: "#00FFB0" }}>Governed visibility.</span>
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
      <section id="architecture" style={{ padding: "100px 5vw", position: "relative", zIndex: 1, background: "rgba(0,255,176,.015)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ Architecture</div>
              <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#ffffff" }}>
                Modular. Secure. <span style={{ color: "#00FFB0" }}>Non-custodial.</span>
              </h2>
              <p style={{ fontSize: 13, color: "#64748b", marginTop: 14, maxWidth: 560, margin: "14px auto 0", lineHeight: 1.7 }}>
                ShieldVault is the sole custodian of funds. Every module operates with least privilege — no module can move USDC without ShieldVault's explicit approval.
              </p>
            </div>
          </Reveal>

          {/* Architecture diagram */}
          <Reveal delay={100}>
            <div style={{ background: "rgba(0,5,3,.85)", border: "1px solid rgba(0,255,176,.15)", borderRadius: 8, padding: "32px", backdropFilter: "blur(12px)", fontFamily: "monospace", fontSize: 11, color: "#4ade80", lineHeight: 1.8 }}>
              <div style={{ color: "#00FFB0", fontWeight: 700, marginBottom: 12, fontSize: 12 }}>ShieldVault.sol <span style={{ color: "#4a7c5f" }}>← Orchestrator · Sole custody of USDC</span></div>
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
                  <span style={{ color: code.includes("│") ? "#1e3a2a" : "#4ade80", minWidth: 220, flexShrink: 0 }}>{code}</span>
                  {comment && <span style={{ color: "#334155", fontSize: 10 }}>← {comment}</span>}
                </div>
              ))}
            </div>
          </Reveal>

          {/* Security badges */}
          <Reveal delay={200}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28, justifyContent: "center" }}>
              {["Arc Privacy Sector Aligned", "Governed Visibility", "CEI Pattern Enforced", "CCTP v2 Bridge", "Least Privilege", "NonReentrant Guards", "48h Timelock", "Auto Circuit Breaker"].map(badge => (
                <span key={badge} style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", background: "rgba(0,255,176,.06)", border: "1px solid rgba(0,255,176,.15)", borderRadius: 3, padding: "5px 10px", color: "#00FFB0" }}>{badge}</span>
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
              <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ How It Works</div>
              <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#ffffff" }}>
                Connect. Shield. <span style={{ color: "#00FFB0" }}>Governed visibility.</span>
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
                <div style={{ flexShrink: 0, width: 52, height: 52, background: "rgba(0,255,176,.06)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{s.icon}</div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace" }}>STEP {s.step}</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(0,255,176,.08)" }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", fontFamily: "'Syne', sans-serif", marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ROADMAP
      ═══════════════════════════════════════════════════════ */}
      <section id="roadmap" style={{ padding: "100px 5vw", position: "relative", zIndex: 1, background: "rgba(0,255,176,.015)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".25em", marginBottom: 12, textTransform: "uppercase" }}>▸ Roadmap</div>
              <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#ffffff" }}>
                The path to <span style={{ color: "#00FFB0" }}>mainnet.</span>
              </h2>
            </div>
          </Reveal>

          {[
            { q: "Q3 2026", label: "CURRENT", color: "#00FFB0", items: ["Arc Testnet deployment", "ShieldVault v2.3.1 live", "Confidential Shield / Swap / Send / Bridge", "Emergency circuit breaker armed", "Governed visibility (user-scoped notes)", "Governance + Staking live"] },
            { q: "Q4 2026", label: "NEXT",    color: "#0EA5E9", items: ["EIP-712 authorized view keys (Arc whitepaper §3)", "Independent security audit x2", "ZK circuit audit (Veridise)", "Admin multisig deployment", "Bug bounty program (Immunefi)", "Arc Mainnet soft launch"] },
            { q: "Q1 2027", label: "PLANNED", color: "#a78bfa", items: ["Arc Private EVM integration (synchronous execution)", "Governed visibility API — compliance & audit mode", "veARC governance token launch", "CCTP v2 mainnet bridge activation", "Full DEX integration (Arc StableFX)", "Mobile app (iOS + Android)"] },
            { q: "Q2 2027", label: "FUTURE",  color: "#fbbf24", items: ["Hardware enclave execution (Arc Privacy Sector)", "Institutional shield pools with audit access", "Post-quantum encryption layer", "Privacy-preserving DeFi aggregator", "SDK for third-party confidential apps", "DAO transition"] },
          ].map((phase, i) => (
            <Reveal key={phase.q} delay={i * 80}>
              <div style={{ display: "flex", gap: 20, marginBottom: 32 }}>
                <div style={{ flexShrink: 0, textAlign: "center", paddingTop: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: phase.color, boxShadow: `0 0 10px ${phase.color}`, margin: "0 auto 8px" }} />
                  <div style={{ width: 1, height: "calc(100% - 20px)", background: "rgba(0,255,176,.1)", margin: "0 auto" }} />
                </div>
                <div style={{ flex: 1, background: "rgba(0,5,3,.7)", border: `1px solid ${phase.color}22`, borderRadius: 6, padding: "16px 20px", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", fontFamily: "'Syne', sans-serif" }}>{phase.q}</span>
                    <span style={{ fontSize: 8, background: `${phase.color}18`, border: `1px solid ${phase.color}40`, borderRadius: 2, padding: "2px 8px", color: phase.color, letterSpacing: ".14em" }}>{phase.label}</span>
                  </div>
                  <ul style={{ listStyle: "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 16px" }}>
                    {phase.items.map(item => (
                      <li key={item} style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 7 }}>
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
            <div style={{ width: 64, height: 64, border: "1.5px solid #00FFB0", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#00FFB0", margin: "0 auto 28px", boxShadow: "0 0 30px rgba(0,255,176,.2)", animation: "float 4s ease infinite" }}>◈</div>
            <h2 style={{ fontSize: "clamp(28px,5vw,56px)", fontFamily: "'Syne', sans-serif", fontWeight: 900, color: "#ffffff", marginBottom: 18, lineHeight: 1.1 }}>
              Start managing capital<br /><span style={{ color: "#00FFB0" }}>privately today.</span>
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, marginBottom: 40, maxWidth: 500, margin: "0 auto 40px" }}>
              PrivARC OS is live on Arc Testnet. Connect your wallet, get USDC from the faucet, and start shielding your assets in under 60 seconds.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => navigate("/app")} style={{
                padding: "16px 40px", background: "#00FFB0", border: "none",
                borderRadius: 4, color: "#000A06", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "monospace", letterSpacing: ".16em",
                textTransform: "uppercase", boxShadow: "0 0 40px rgba(0,255,176,.4)",
                transition: "all .2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(0,255,176,.6)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 0 40px rgba(0,255,176,.4)"; }}
              >⟶ Launch PrivARC OS</button>
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{
                padding: "16px 30px", background: "transparent",
                border: "1px solid rgba(0,255,176,.25)", borderRadius: 4,
                color: "#94a3b8", fontSize: 13, cursor: "pointer",
                fontFamily: "monospace", letterSpacing: ".14em",
                textTransform: "uppercase", textDecoration: "none",
                transition: "all .2s", display: "inline-block",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.5)"; e.currentTarget.style.color = "#ffffff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.25)"; e.currentTarget.style.color = "#94a3b8"; }}
              >💧 Get Testnet USDC</a>
            </div>

            {/* Trust badges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 36, flexWrap: "wrap" }}>
              {["Non-custodial", "EIP-191 Auth", "Open Source", "ZK Privacy", "Arc Testnet"].map(t => (
                <span key={t} style={{ fontSize: 9, color: "#334155", letterSpacing: ".14em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "#00FFB0" }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════ */}
      <footer style={{ padding: "40px 5vw", borderTop: "1px solid rgba(0,255,176,.08)", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 22, height: 22, border: "1px solid rgba(0,255,176,.4)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#00FFB0" }}>◈</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#00FFB0", fontFamily: "'Syne', sans-serif" }}>privARC</span>
            <span style={{ fontSize: 9, color: "#334155", letterSpacing: ".1em" }}>OS v12.0.0</span>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[["Docs", "#"], ["Security", "#"], ["GitHub", "#"], ["ARCScan", "https://testnet.arcscan.app"], ["Faucet", "https://faucet.circle.com"]].map(([label, href]) => (
              <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
                style={{ fontSize: 10, color: "#334155", textDecoration: "none", letterSpacing: ".12em", textTransform: "uppercase", transition: "color .2s" }}
                onMouseEnter={e => e.target.style.color = "#00FFB0"}
                onMouseLeave={e => e.target.style.color = "#334155"}>{label}</a>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "#1e3a2a", letterSpacing: ".1em" }}>
            ARC TESTNET · CHAIN 5042002 · USDC GAS
          </div>
        </div>
      </footer>
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
        background: h ? "rgba(0,255,176,.04)" : "rgba(0,5,3,.7)",
        border: `1px solid ${h ? "rgba(0,255,176,.3)" : "rgba(0,255,176,.1)"}`,
        borderRadius: 7, padding: "24px 22px", transition: "all .25s",
        boxShadow: h ? "0 0 30px rgba(0,255,176,.08)" : "none",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <span style={{ fontSize: 26 }}>{icon}</span>
        <span style={{ fontSize: 8, background: "rgba(0,255,176,.08)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 2, padding: "3px 8px", color: "#00FFB0", letterSpacing: ".12em" }}>{tag}</span>
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", fontFamily: "'Syne', sans-serif", marginBottom: 9 }}>{title}</h3>
      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}
