import { motion } from "motion/react";
import type { LauncherAppEntry } from "./launcher-state";
import type { ChainState } from "./chain-store";

type Props = {
  chain: ChainState;
  apps: LauncherAppEntry[];
  onCancel: () => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  simulator: "#ff3b3b",
  streaming: "#302e31",
  audio: "#06b6d4",
  telemetry: "#f59e0b",
  utility: "#3b82f6",
};

const DEFAULT_COLOR = "#6b7280";

function getCategoryColor(apps: LauncherAppEntry[], appId: string): string {
  const app = apps.find((a) => a.id === appId);
  if (!app) return DEFAULT_COLOR;
  return CATEGORY_COLORS[app.category] ?? DEFAULT_COLOR;
}

function getStepBackground(status: string, color: string): string {
  switch (status) {
    case "launching":
      return `${color}33`; // 20% opacity
    case "done":
      return "#10b98126"; // emerald-500 at ~15% opacity
    case "failed":
      return "#ef444426"; // red-500 at ~15% opacity
    default:
      return "rgba(255,255,255,0.05)";
  }
}

function getStepBorder(status: string, color: string): string {
  switch (status) {
    case "launching":
      return `1px solid ${color}`;
    case "done":
      return "1px solid #10b98166";
    case "failed":
      return "1px solid #ef444466";
    default:
      return "1px solid rgba(255,255,255,0.1)";
  }
}

export function ProfileCardTimeline({ chain, apps, onCancel }: Props) {
  return (
    <div
      className="card-sleek rounded-xl p-5"
      data-testid="profile-timeline"
      role="status"
      aria-live="polite"
    >
      {/* Cancel button: fixed top-right */}
      <button
        onClick={onCancel}
        data-testid="profile-cancel"
        aria-label="Cancelar lanzamiento"
        className="float-right px-3 py-1.5 rounded-lg border border-amber-500/40 text-[10px] uppercase tracking-[.18em] text-amber-300 hover:bg-amber-500/10 transition-colors"
      >
        Cancelar
      </button>

      <h3 className="font-display font-bold text-lg text-white mb-3">
        Lanzando…
      </h3>

      {/* Timeline blocks */}
      <div className="flex flex-wrap gap-2">
        {chain.steps.map((step, i) => {
          const color = getCategoryColor(apps, step.appId);
          const bg = getStepBackground(step.status, color);
          const border = getStepBorder(step.status, color);

          return (
            <motion.div
              key={`${step.appId}-${i}`}
              data-testid={`timeline-step-${i}`}
              className="rounded-md p-2 min-w-[80px]"
              style={{ background: bg, border }}
              animate={
                step.status === "launching"
                  ? { opacity: [0.7, 1, 0.7] }
                  : {}
              }
              transition={
                step.status === "launching"
                  ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                  : {}
              }
            >
              <div className="text-xs font-bold text-white">
                {apps.find((a) => a.id === step.appId)?.abbreviation ??
                  step.appId}
              </div>
              <div className="text-[10px] text-vantare-textMuted">
                {step.status}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
