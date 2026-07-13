import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { LauncherDiscoveryProgress } from "./launcher-contract";

export function LauncherScanProgress({ progress }: { progress: LauncherDiscoveryProgress }) {
  const { t } = useI18n();
  const [displayed, setDisplayed] = useState(progress.progress);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || displayed >= progress.progress) { setDisplayed(progress.progress); return; }
    const id = window.setTimeout(() => setDisplayed(Math.min(progress.progress, displayed + 5)), 40);
    return () => window.clearTimeout(id);
  }, [displayed, progress.progress]);
  const phaseKey = progress.phase === "resolving-icons" ? "resolvingIcons" : progress.phase;
  const phase = t(`launcher.apps.scan.${phaseKey}` as never);
  return <div role="status" aria-live="polite" aria-label={`${t("launcher.apps.scanning")}, ${phase}, ${displayed}%`} className="mt-4">
    <div className="flex items-end justify-between gap-3"><div><p className="font-sans text-xs font-medium text-white/90">{t("launcher.apps.scanning")}</p><p className="font-sans text-[11px] text-white/45">{phase}</p></div><output data-testid="launcher-scan-progress-value" className="font-display text-sm tabular-nums text-white/80">{displayed}%</output></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-vantare-red-500 transition-[width] duration-500 ease-out" style={{ width: `${displayed}%` }} /></div>
  </div>;
}
