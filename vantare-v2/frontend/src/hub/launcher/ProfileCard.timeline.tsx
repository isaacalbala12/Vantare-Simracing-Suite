import { motion } from "motion/react";
import { useI18n } from "../../i18n/I18nProvider";
import { AppBadge } from "../components/AppBadge";
import type { LauncherAppEntry } from "./launcher-state";
import type { ChainState } from "./chain-store";

type Props = {
  chain: ChainState;
  apps: LauncherAppEntry[];
  onCancel: () => void;
  /** Heading shown while the chain runs. Falls back to the generic label. */
  title?: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  simulator: "#ff3b3b",
  streaming: "#302e31",
  audio: "#06b6d4",
  telemetry: "#f59e0b",
  utility: "#3b82f6",
};

const DEFAULT_COLOR = "#6b7280";

const STATUS_KEYS: Record<string, string> = {
  pending: "launcher.chain.status.pending",
  launching: "launcher.chain.status.launching",
  done: "launcher.chain.status.done",
  failed: "launcher.chain.status.failed",
};

function getCategoryColor(apps: LauncherAppEntry[], appId: string): string {
  const app = apps.find((a) => a.id === appId);
  if (!app) return DEFAULT_COLOR;
  return CATEGORY_COLORS[app.category] ?? DEFAULT_COLOR;
}

// The accent colour is the app's own category while it opens, and the outcome
// colour once the step settles, so a glance at the strip reads as progress.
function getStepAccent(status: string, color: string): string {
  switch (status) {
    case "launching":
      return color;
    case "done":
      return "#10b981";
    case "failed":
      return "#ef4444";
    default:
      return "rgba(255,255,255,0.15)";
  }
}

function getStatusTextClass(status: string): string {
  switch (status) {
    case "done":
      return "text-emerald-400/90";
    case "failed":
      return "text-vantare-red-400";
    case "launching":
      return "text-white/80";
    default:
      return "text-white/35";
  }
}

// ProfileCardTimeline replaces the resting profile card while its chain runs.
// It mirrors that card's layout — same header, same one-row-per-step list — so
// starting a chain does not reshuffle the page.
export function ProfileCardTimeline({ chain, apps, onCancel, title }: Props) {
  const { t } = useI18n();
  const total = chain.steps.length;
  const settled = chain.steps.filter(
    (step) => step.status === "done" || step.status === "failed",
  ).length;
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100);

  return (
    <article
      className="card-sleek rounded-xl p-5"
      data-testid="profile-timeline"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="v52-eyebrow">{t("launcher.chain.launching")}</p>
          <h3 className="mt-1 font-display text-lg font-bold text-white">
            {title ?? t("launcher.chain.launching")}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-xs tabular-nums text-white/50">
            {settled}/{total}
          </span>
          <button
            type="button"
            onClick={onCancel}
            data-testid="profile-cancel"
            aria-label={t("launcher.chain.cancel")}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-white/70 transition-colors hover:border-white/40 hover:text-white"
          >
            {t("launcher.chain.cancel")}
          </button>
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className="h-full rounded-full bg-vantare-red-500"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      <ul className="mt-4 flex flex-col gap-1.5">
        {chain.steps.map((step, i) => {
          const app = apps.find((a) => a.id === step.appId);
          const accent = getStepAccent(step.status, getCategoryColor(apps, step.appId));
          const launching = step.status === "launching";

          return (
            <motion.li
              key={`${step.appId}-${i}`}
              data-testid={`timeline-step-${i}`}
              className="flex items-center gap-3 overflow-hidden rounded-md bg-black/20 py-1.5 pr-3"
              style={{ borderLeft: `2px solid ${accent}`, paddingLeft: "0.625rem" }}
              animate={launching ? { opacity: [0.65, 1, 0.65] } : { opacity: 1 }}
              transition={
                launching
                  ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              {app ? (
                <AppBadge app={app} size="sm" />
              ) : (
                <span className="text-xs font-bold text-white">{step.appId}</span>
              )}
              <span
                className={`ml-auto text-[10px] uppercase tracking-[.18em] ${getStatusTextClass(step.status)}`}
              >
                {t(STATUS_KEYS[step.status] ?? "launcher.chain.status.pending")}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </article>
  );
}
