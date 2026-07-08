import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import {
  appSortOrder,
  newProfileId,
  type LauncherAppCategory,
  type LauncherAppEntry,
  type LaunchProfile,
} from "./launcher-state";
import { AppBadge } from "../components/AppBadge";

type AppsPanelProps = {
  className?: string;
};

const CATEGORIES: LauncherAppCategory[] = [
  "simulator",
  "streaming",
  "audio",
  "telemetry",
  "utility",
];

// AppsPanel renders the list of detected + manual apps. Wails v3 alpha.98
// does not expose a native file dialog, so the "Add manually" flow uses a
// hidden <input type="file"> as a fallback: the browser's picker gives us
// the absolute path (via the File API on the desktop runtime) which we
// then pass to launcher:app:add.
export function AppsPanel({ className }: AppsPanelProps) {
  const { t } = useI18n();
  const [apps, setApps] = useState<LauncherAppEntry[]>([]);
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] =
    useState<LauncherAppCategory>("utility");

  const referencedAppIds = new Set(
    profiles.flatMap((p) => p.steps.map((s) => s.appId)),
  );

  useEffect(() => {
    Events.Emit("launcher:apps:discover");
    Events.Emit("launcher:profiles:list");

    const offDetected = Events.On(
      "launcher:apps:detected",
      (event: { data?: { apps?: LauncherAppEntry[] } }) => {
        setApps((event.data?.apps ?? []).slice().sort(appSortOrder));
      },
    );
    const offUpdated = Events.On(
      "launcher:apps:updated",
      (event: { data?: { apps?: LauncherAppEntry[] } }) => {
        setApps((event.data?.apps ?? []).slice().sort(appSortOrder));
      },
    );
    const offProfiles = Events.On(
      "launcher:profiles:updated",
      (event: { data?: { profiles?: LaunchProfile[] } }) => {
        setProfiles(event.data?.profiles ?? []);
      },
    );
    // The backend may also answer the file-pick request via the legacy
    // event name. We support both: a picked file opens the form.
    const offPicked = Events.On(
      "launcher:app:picked",
      (event: { data?: { path?: string } }) => {
        const path = event.data?.path;
        if (path) {
          setPickedPath(path);
        }
      },
    );

    return () => {
      offDetected();
      offUpdated();
      offProfiles();
      offPicked();
    };
  }, []);

  const handleRemove = (id: string) => {
    Events.Emit("launcher:app:remove", { id });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // On desktop runtimes the File object has a non-standard `path` property
    // pointing to the absolute filesystem path. When unavailable, we fall
    // back to the file name so the user can still see and edit the entry.
    const fileWithPath = file as File & { path?: string };
    const path = fileWithPath.path || file.name;
    setPickedPath(path);
    setDraftName(file.name.replace(/\.exe$/i, ""));
  };

  const handleAdd = () => {
    if (!pickedPath || !draftName.trim()) return;
    const entry: LauncherAppEntry = {
      id: newProfileId("app"),
      displayName: draftName.trim(),
      abbreviation: draftName.trim().slice(0, 3).toUpperCase(),
      category: draftCategory,
      launchMethod: "executable",
      executablePath: pickedPath,
      detected: false,
      gradientFrom: "#6b7280",
      gradientTo: "#1f2937",
    };
    Events.Emit("launcher:app:add", { entry });
    setPickedPath(null);
    setDraftName("");
    setDraftCategory("utility");
  };

  return (
    <section
      className={`card-sleek rounded-xl p-5 ${className ?? ""}`}
      data-testid="apps-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="v52-eyebrow">{t("launcher.apps.title")}</span>
        <div className="flex items-center gap-2">
          <label
            className="cursor-pointer px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
            data-testid="apps-add-manual"
          >
            + {t("launcher.apps.addManual")}
            <input
              type="file"
              accept=".exe"
              className="hidden"
              onChange={handleFileChange}
              data-testid="apps-file-input"
            />
          </label>
          <button
            type="button"
            onClick={() => Events.Emit("launcher:apps:discover")}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
            data-testid="apps-rescan"
          >
            {t("launcher.apps.rescan")}
          </button>
        </div>
      </div>

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
              className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2"
              data-testid={`app-row-${app.id}`}
            >
              <AppBadge app={app} />
              {app.detected && (
                <span className="text-[10px] uppercase tracking-[.18em] text-emerald-400/80">
                  {t("launcher.apps.detected")}
                </span>
              )}
              {!referenced && (
                <button
                  type="button"
                  onClick={() => handleRemove(app.id)}
                  className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:text-vantare-red-400 transition-colors"
                  data-testid={`app-remove-${app.id}`}
                >
                  {t("launcher.profile.delete")}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {pickedPath && (
        <form
          className="mt-4 rounded-lg border border-accent/30 bg-black/30 p-3 flex flex-col gap-2"
          data-testid="app-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <p className="text-xs text-vantare-textMuted break-all">{pickedPath}</p>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t("launcher.apps.namePlaceholder")}
            className="rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
            data-testid="app-add-name"
          />
          <select
            value={draftCategory}
            onChange={(e) =>
              setDraftCategory(e.target.value as LauncherAppCategory)
            }
            className="rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
            data-testid="app-add-category"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`launcher.category.${c}`)}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setPickedPath(null);
                setDraftName("");
              }}
              className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:text-white"
              data-testid="app-add-cancel"
            >
              {t("launcher.profile.cancel")}
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90"
              data-testid="app-add-save"
            >
              {t("launcher.apps.add")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
