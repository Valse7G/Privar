import { createContext, useContext, useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   THEME SYSTEM
   4 themes: privar (default), xylonet, dark, light.
   Each palette exposes both:
   - plain JS colors (for <canvas> 2D drawing, which cannot read
     CSS custom properties)
   - a matching set of CSS custom properties (applied on the app's
     root wrapper) so inline styles across Landing.jsx / DApp.jsx's
     shared chrome (navbars, sidebars, buttons, panels) can reference
     var(--accent), rgba(var(--accent-rgb),.2), etc. without every
     component needing to import the theme object directly.
═══════════════════════════════════════════════════════════════ */

export const THEMES = {
  privar: {
    id: "privar",
    label: "Privar (défaut)",
    swatch: "#00FFB0",
    bg: "#000A06",
    bgGradA: "rgba(0,22,13,1)",
    bgGradB: "rgba(0,5,3,1)",
    panelRgb: "0,5,3",
    accent: "#00FFB0",
    accentRgb: "0,255,176",
    text: "#ffffff",
    textDim: "#94a3b8",
    textDim2: "#64748b",
    textFaint: "#4a7c5f",
    textFaint2: "#334155",
    divider: "#1e3a2a",
    danger: "#f87171",
    warn: "#F59E0B",
    blue: "#0EA5E9",
  },
  xylonet: {
    id: "xylonet",
    label: "XyloNet",
    swatch: "#2dd4bf",
    bg: "#060e1a",
    bgGradA: "rgba(12,32,52,1)",
    bgGradB: "rgba(4,10,18,1)",
    panelRgb: "8,20,36",
    accent: "#2dd4bf",
    accentRgb: "45,212,191",
    text: "#f1f5f9",
    textDim: "#94a3b8",
    textDim2: "#64748b",
    textFaint: "#3f6b73",
    textFaint2: "#334155",
    divider: "#173040",
    danger: "#f87171",
    warn: "#F59E0B",
    blue: "#38bdf8",
  },
  dark: {
    id: "dark",
    label: "Sombre",
    swatch: "#a3e635",
    bg: "#0a0a0d",
    bgGradA: "rgba(22,22,26,1)",
    bgGradB: "rgba(8,8,10,1)",
    panelRgb: "16,16,20",
    accent: "#a3e635",
    accentRgb: "163,230,53",
    text: "#f1f5f9",
    textDim: "#94a3b8",
    textDim2: "#64748b",
    textFaint: "#525a5f",
    textFaint2: "#334155",
    divider: "#26262b",
    danger: "#f87171",
    warn: "#F59E0B",
    blue: "#38bdf8",
  },
  light: {
    id: "light",
    label: "Clair",
    swatch: "#059669",
    bg: "#f8fafc",
    bgGradA: "rgba(255,255,255,1)",
    bgGradB: "rgba(226,232,240,1)",
    panelRgb: "255,255,255",
    accent: "#059669",
    accentRgb: "5,150,105",
    text: "#0f172a",
    textDim: "#475569",
    textDim2: "#64748b",
    textFaint: "#64748b",
    textFaint2: "#94a3b8",
    divider: "#e2e8f0",
    danger: "#dc2626",
    warn: "#d97706",
    blue: "#0284c7",
  },
};

export const THEME_STORAGE_KEY = "privar_theme_id";

export function cssVars(t) {
  return {
    "--bg": t.bg,
    "--bg-grad-a": t.bgGradA,
    "--bg-grad-b": t.bgGradB,
    "--panel-rgb": t.panelRgb,
    "--accent": t.accent,
    "--accent-rgb": t.accentRgb,
    "--text": t.text,
    "--text-dim": t.textDim,
    "--text-dim2": t.textDim2,
    "--text-faint": t.textFaint,
    "--text-faint2": t.textFaint2,
    "--divider": t.divider,
    "--danger": t.danger,
    "--warn": t.warn,
    "--blue": t.blue,
  };
}

const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || "privar"; } catch { return "privar"; }
  });

  const setThemeId = useCallback((id) => {
    if (!THEMES[id]) return;
    setThemeIdState(id);
    try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch {}
  }, []);

  const theme = THEMES[themeId] || THEMES.privar;

  // Also reflect on <html> so any non-React chrome (browser UI theme-color,
  // scrollbars) can pick it up too.
  useEffect(() => {
    document.documentElement.style.colorScheme = theme.id === "light" ? "light" : "dark";
  }, [theme.id]);

  return (
    <ThemeCtx.Provider value={{ themeId, theme, setThemeId, THEMES }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider (shouldn't happen)
    return { themeId: "privar", theme: THEMES.privar, setThemeId: () => {}, THEMES };
  }
  return ctx;
}
