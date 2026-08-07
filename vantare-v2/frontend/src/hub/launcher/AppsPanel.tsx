import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  appSortOrder,
  newProfileId,
  type LauncherAppEntry,
  type LaunchProfile,
} from "./launcher-state";
import { useLauncherDiscoveryProgress, useLauncherSnapshot, useLauncherStore } from "./launcher-store";
import { LauncherScanProgress } from "./LauncherScanProgress";
import { AppBadge } from "../components/AppBadge";
import { AddNonSteamGameModal } from "./AddNonSteamGameModal";

type AppsPanelProps = {
  className?: string;
};

// AppsPanel renders the list of detected + manual apps with an AddNonSteamGameModal
// for adding apps from the Windows Registry, and an expandable details panel
// for each app showing the executable path and editable args.
export function AppsPanel({ className }: AppsPanelProps) {
  const { t } = useI18n();
  const snapshot = useLauncherSnapshot();
  const { dispatchLauncherCommand, discoverApps } = useLauncherStore();
  const progress = useLauncherDiscoveryProgress();
  const apps = useMemo<LauncherAppEntry[]>(
    () =>
      (snapshot?.apps ?? []).map((app) => ({
        ...app,
        detected: app.detected ?? app.availability.found,
      })).sort(appSortOrder),
    [snapshot],
  );
  const profiles = useMemo<LaunchProfile[]>(
    () => [
      ...(snapshot?.vantareProfiles ?? []),
      ...(snapshot?.userProfiles ?? []),
    ],
    [snapshot],
  );
  const [showAdd, setShowAdd] = useState(false);
  const [detailsAppId, setDetailsAppId] = useState<string | null>(null);
  // Dismissing the scan overlay hides it for the scan in flight only; a fresh
  // scan is a new request from the user and shows it again. The reset happens
  // during render rather than in an effect so no dismissed overlay is ever
  // painted for one frame at the start of a new scan.
  const [scanDismissed, setScanDismissed] = useState(false);
  const scanning = progress?.scanning === true;
  const [scanningWhenDismissChecked, setScanningWhenDismissChecked] = useState(scanning);
  if (scanning !== scanningWhenDismissChecked) {
    setScanningWhenDismissChecked(scanning);
    if (scanning) setScanDismissed(false);
  }

  const referencedAppIds = new Set(
    profiles.flatMap((p) => p.steps.map((s) => s.appId)),
  );

  const handleRemove = (id: string) => {
    dispatchLauncherCommand("launcher:app:remove", { id });
  };

  return (
    <section
      className={`card-sleek rounded-xl p-5 ${className ?? ""}`}
      data-testid="apps-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="v52-eyebrow">{t("launcher.apps.title")}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-lg border border-white/20 text-[10px] font-bold uppercase tracking-[.18em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
            data-testid="apps-add-manual"
          >
            + {t("launcher.apps.addManual")}
          </button>
          <button
            type="button"
            onClick={discoverApps}
            disabled={scanning}
            aria-busy={scanning}
            className="px-3 py-1.5 rounded-lg border border-white/20 text-[10px] font-bold uppercase tracking-[.18em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
            data-testid="apps-rescan"
          >
            {t("launcher.apps.rescan")}
          </button>
        </div>
      </div>

      {scanning && !scanDismissed && progress && (
        <LauncherScanProgress
          progress={progress}
          onDismiss={() => setScanDismissed(true)}
        />
      )}

      <AddNonSteamGameModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={(entry) => {
          const newEntry: LauncherAppEntry = {
            id: newProfileId("app"),
            displayName: entry.displayName,
            abbreviation: entry.displayName.slice(0, 3).toUpperCase(),
            category: "utility",
            launchMethod: "executable",
            executablePath: entry.executablePath,
            detected: false,
            gradientFrom: "#6b7280",
            gradientTo: "#1f2937",
          };
          dispatchLauncherCommand("launcher:app:add", newEntry);
        }}
      />

      <ul className="mt-4 flex flex-col gap-2" data-testid="apps-list">
        {apps.length === 0 && (
          <li className="text-xs text-vantare-textDim">
            {t("launcher.apps.noApps")}
          </li>
        )}
        {apps.map((app) => {
          const referenced = referencedAppIds.has(app.id);
          return (
            <li
              key={app.id}
              className="group rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 cursor-pointer hover:border-white/15 hover:bg-white/5 transition-colors"
              onClick={() =>
                setDetailsAppId(
                  detailsAppId === app.id ? null : app.id,
                )
              }
              data-testid={`app-row-${app.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <AppBadge app={app} />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatchLauncherCommand("launcher:app:favorite", {
                      id: app.id,
                      favorite: !app.isFavorite,
                    });
                  }}
                  data-testid={`app-favorite-btn-${app.id}`}
                  aria-label={
                    app.isFavorite
                      ? "Quitar de favoritas"
                      : "Marcar como favorita"
                  }
                  className={`ml-auto grid h-6 w-6 place-items-center rounded-md text-sm transition-colors hover:bg-white/10 hover:text-amber-400 ${
                    app.isFavorite ? "text-amber-400" : "text-white/30"
                  }`}
                >
                  {app.isFavorite ? "★" : "☆"}
                </button>
                {app.detected && (
                  <span
                    title={t("launcher.apps.detected")}
                    aria-label={t("launcher.apps.detected")}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80"
                  />
                )}
                {!referenced && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(app.id);
                    }}
                    aria-label={t("launcher.profile.delete")}
                    title={t("launcher.profile.delete")}
                    className="grid h-6 w-6 place-items-center rounded-md text-white/25 opacity-0 transition-all hover:bg-vantare-red-400/10 hover:text-vantare-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                    data-testid={`app-remove-${app.id}`}
                  >
                    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
              {detailsAppId === app.id && (
                <div
                  className="mt-2 p-3 bg-black/30 rounded-md text-xs"
                  data-testid={`app-details-${app.id}`}
                >
                  <div>
                    Path:{" "}
                    <code className="text-vantare-textMuted">
                      {app.executablePath ?? "—"}
                    </code>
                  </div>
                  <label className="block mt-1">
                    Args:
                    <input
                      type="text"
                      value={app.args ?? ""}
                      onChange={(e) =>
                        dispatchLauncherCommand("launcher:app:update", {
                          id: app.id,
                          args: e.target.value,
                        })
                      }
                      data-testid={`app-args-input-${app.id}`}
                      className="ml-2 rounded bg-black/40 border border-white/10 px-2 py-0.5 text-white w-48"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
