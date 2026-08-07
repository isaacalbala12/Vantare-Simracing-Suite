import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../../i18n/I18nProvider";
import type { LauncherDiscoveryProgress } from "./launcher-contract";

type LauncherScanProgressProps = {
  progress: LauncherDiscoveryProgress;
  onDismiss: () => void;
};

// LauncherScanProgress covers the page while discovery runs. Dismissing it only
// hides the overlay: discovery keeps running and the app list fills in when it
// finishes, so the user is never trapped waiting on a disk scan.
export function LauncherScanProgress({ progress, onDismiss }: LauncherScanProgressProps) {
  const { t } = useI18n();
  const [displayed, setDisplayed] = useState(progress.progress);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  useEffect(() => {
    if (displayed >= progress.progress || reducedMotion) return;
    const id = window.setTimeout(
      () => setDisplayed(Math.min(progress.progress, displayed + 5)),
      40,
    );
    return () => window.clearTimeout(id);
  }, [displayed, progress.progress, reducedMotion]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const visibleProgress = reducedMotion ? progress.progress : displayed;
  const phaseKey = progress.phase === "resolving-icons" ? "resolvingIcons" : progress.phase;
  const phase = t(`launcher.apps.scan.${phaseKey}` as never);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[9000] grid place-items-center bg-black/70 backdrop-blur-sm"
        data-testid="launcher-scan-overlay"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          role="status"
          aria-live="polite"
          aria-label={`${t("launcher.apps.scanning")}, ${phase}, ${visibleProgress}%`}
          className="card-sleek relative w-[min(26rem,calc(100vw-3rem))] rounded-xl p-6"
        >
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("launcher.apps.scan.dismiss")}
            title={t("launcher.apps.scan.dismiss")}
            data-testid="launcher-scan-dismiss"
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <p className="v52-eyebrow">{t("launcher.apps.title")}</p>
          <p className="mt-3 font-sans text-sm font-medium text-white/90">
            {t("launcher.apps.scanning")}
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="font-sans text-[11px] text-white/45">{phase}</p>
            <output
              data-testid="launcher-scan-progress-value"
              className="font-display text-sm tabular-nums text-white/80"
            >
              {visibleProgress}%
            </output>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-vantare-red-500 transition-[width] duration-500 ease-out"
              style={{ width: `${visibleProgress}%` }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
