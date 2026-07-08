export type DesignSystemTokens = {
  id: string;
  name: string;
  colors: {
    accent: string;
    background: string;
    surface: string;
    border: string;
    text: string;
    textMuted: string;
    textDim: string;
    positive: string;
    negative: string;
    warning: string;
    info: string;
    purple: string;
  };
  badges: {
    free: { bg: string; text: string; border: string };
    pro: { bg: string; text: string; border: string };
    tester: { bg: string; text: string; border: string };
    experimental: { bg: string; text: string; border: string };
    dataOk: { bg: string; text: string; border: string };
    dataPartial: { bg: string; text: string; border: string };
    dataPending: { bg: string; text: string; border: string };
  };
  surfaces: {
    card: string;
    panel: string;
    header: string;
    rowEven: string;
    rowOdd: string;
    playerHighlight: string;
    lockedOverlay: string;
  };
  typography: {
    displayFont: string;
    bodyFont: string;
    monoFont: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  glow: {
    accent: string;
    none: string;
  };
};

const BASE_TOKENS: DesignSystemTokens = {
  id: "base",
  name: "Base",
  colors: {
    accent: "#9b2226",
    background: "#000000",
    surface: "#111111",
    border: "#222222",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,.6)",
    textDim: "rgba(255,255,255,.35)",
    positive: "#22c55e",
    negative: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
    purple: "#a855f7",
  },
  badges: {
    free: { bg: "rgba(34,197,94,.15)", text: "#22c55e", border: "rgba(34,197,94,.3)" },
    pro: { bg: "rgba(155,34,38,.15)", text: "#9b2226", border: "rgba(155,34,38,.3)" },
    tester: { bg: "rgba(245,158,11,.15)", text: "#f59e0b", border: "rgba(245,158,11,.3)" },
    experimental: { bg: "rgba(168,85,247,.15)", text: "#a855f7", border: "rgba(168,85,247,.3)" },
    dataOk: { bg: "rgba(34,197,94,.1)", text: "#22c55e", border: "rgba(34,197,94,.2)" },
    dataPartial: { bg: "rgba(245,158,11,.1)", text: "#f59e0b", border: "rgba(245,158,11,.2)" },
    dataPending: { bg: "rgba(100,100,100,.15)", text: "#888", border: "rgba(100,100,100,.3)" },
  },
  surfaces: {
    card: "rgba(20,20,20,.8)",
    panel: "#111111",
    header: "linear-gradient(180deg,rgba(255,255,255,.05),transparent)",
    rowEven: "rgba(255,255,255,.03)",
    rowOdd: "rgba(0,0,0,.3)",
    playerHighlight: "linear-gradient(90deg,rgba(155,34,38,.3),rgba(155,34,38,.05))",
    lockedOverlay: "rgba(0,0,0,.3)",
  },
  typography: {
    displayFont: "'Inter',sans-serif",
    bodyFont: "'Inter',sans-serif",
    monoFont: "'JetBrains Mono',monospace",
  },
  radius: {
    sm: "4px",
    md: "6px",
    lg: "10px",
    xl: "14px",
  },
  glow: {
    accent: "0 0 8px rgba(155,34,38,.5)",
    none: "none",
  },
};

const VANTARE_CRYSTAL_TOKENS: DesignSystemTokens = {
  id: "vantare-crystal",
  name: "Vantare Crystal",
  colors: {
    accent: "#ff3b3b",
    background: "#060608",
    surface: "#121216",
    border: "rgba(255,255,255,0.09)",
    text: "#ffffff",
    textMuted: "#999999",
    textDim: "#555555",
    positive: "#22c55e",
    negative: "#ff2a3b",
    warning: "#f59e0b",
    info: "#3b82f6",
    purple: "#a855f7",
  },
  badges: {
    free: { bg: "rgba(34,197,94,.12)", text: "#22c55e", border: "rgba(34,197,94,.25)" },
    pro: { bg: "rgba(255,59,59,.1)", text: "#ff3b3b", border: "rgba(255,59,59,.25)" },
    tester: { bg: "rgba(245,158,11,.1)", text: "#f59e0b", border: "rgba(245,158,11,.25)" },
    experimental: { bg: "rgba(168,85,247,.1)", text: "#a855f7", border: "rgba(168,85,247,.25)" },
    dataOk: { bg: "rgba(34,197,94,.1)", text: "#22c55e", border: "rgba(34,197,94,.2)" },
    dataPartial: { bg: "rgba(245,158,11,.1)", text: "#f59e0b", border: "rgba(245,158,11,.2)" },
    dataPending: { bg: "rgba(74,74,74,.2)", text: "#4A4A4A", border: "rgba(74,74,74,.3)" },
  },
  surfaces: {
    card: "rgba(18,18,22,0.82)",
    panel: "#141414",
    header: "linear-gradient(180deg,rgba(255,255,255,.03),transparent)",
    rowEven: "rgba(255,255,255,.015)",
    rowOdd: "rgba(0,0,0,.25)",
    playerHighlight: "linear-gradient(90deg,rgba(255,42,59,.22),rgba(230,57,70,.05))",
    lockedOverlay: "rgba(0,0,0,.2)",
  },
  typography: {
    displayFont: "'Plus Jakarta Sans', sans-serif",
    bodyFont: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
  },
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
  },
  glow: {
    accent: "0 0 10px rgba(255,59,59,.5)",
    none: "none",
  },
};

const THEMES: Record<string, DesignSystemTokens> = {
  base: BASE_TOKENS,
  "vantare-crystal": VANTARE_CRYSTAL_TOKENS,
};

export function resolveWidgetDesignSystem(
  themeId: string | undefined,
): DesignSystemTokens {
  if (themeId && THEMES[themeId]) {
    return THEMES[themeId];
  }
  return BASE_TOKENS;
}
