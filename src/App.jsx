import { useState, useEffect, useCallback, Component } from "react";
import { Landing }   from "./Landing.jsx";
import { PrivARCOS } from "./DApp.jsx";

/* ═══════════════════════════════════════════════════════════════
   PRIVARC OS v10 — Unified Router
   /      → Landing page
   /app   → PrivARC OS DApp (Web3 + ZK)
═══════════════════════════════════════════════════════════════ */

// ── Error Boundary ─────────────────────────────────────────────
// Catches any uncaught render exception so the app never goes black.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  componentDidCatch(err, info) {
    console.error("[PrivARC ErrorBoundary]", err, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div style={{
          minHeight: "100vh",
          background: "#020d08",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "monospace",
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 13, color: "#00FFB0", letterSpacing: ".1em", marginBottom: 8 }}>
            RENDER ERROR
          </div>
          <div style={{
            fontSize: 10, color: "#64748b", maxWidth: 340, textAlign: "center",
            background: "rgba(0,0,0,.4)", border: "1px solid rgba(239,68,68,.2)",
            borderRadius: 6, padding: "12px 16px", marginBottom: 20, wordBreak: "break-all",
          }}>
            {msg}
          </div>
          <button
            onClick={() => {
              // Clear potentially corrupt localStorage entries
              try {
                localStorage.removeItem("privarc_notes");
                localStorage.removeItem("privarc_txhistory_global");
              } catch {}
              this.setState({ error: null });
            }}
            style={{
              padding: "9px 20px",
              background: "rgba(0,255,176,.08)",
              border: "1px solid rgba(0,255,176,.3)",
              borderRadius: 4, color: "#00FFB0",
              fontSize: 10, cursor: "pointer",
              letterSpacing: ".12em", marginBottom: 10,
            }}
          >
            ⟳ RETRY (CLEAR CACHE)
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "9px 20px",
              background: "transparent",
              border: "1px solid rgba(100,116,139,.3)",
              borderRadius: 4, color: "#64748b",
              fontSize: 10, cursor: "pointer",
              letterSpacing: ".12em",
            }}
          >
            ↺ RELOAD PAGE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Router ──────────────────────────────────────────────────────
function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  return { path, navigate };
}

export default function App() {
  const { path, navigate } = useRoute();

  if (path === "/app") {
    return (
      <ErrorBoundary>
        <button
          onClick={() => navigate("/")}
          style={{
            position: "fixed", top: 14, left: 14, zIndex: 9999,
            background: "rgba(0,8,5,.88)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,255,176,.22)", borderRadius: 4,
            color: "#00FFB0", fontSize: 10, fontFamily: "monospace",
            letterSpacing: ".14em", padding: "7px 14px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
            transition: "all .2s", textTransform: "uppercase",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(0,255,176,.12)";
            e.currentTarget.style.borderColor = "rgba(0,255,176,.45)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(0,8,5,.88)";
            e.currentTarget.style.borderColor = "rgba(0,255,176,.22)";
          }}
        >
          ← Back to Site
        </button>
        <PrivARCOS />
      </ErrorBoundary>
    );
  }

  return <Landing navigate={navigate} />;
}
