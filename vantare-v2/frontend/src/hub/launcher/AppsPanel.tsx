import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  appSortOrder,
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

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function AppsPanel({ className }: AppsPanelProps) {
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
    const offPicked = Events.On(
      "launcher:app:picked",
      (event: { data?: { path?: string } }) => {
        const path = event.data?.path;
        if (path) {
          setPickedPath(path);
          const base =
            path.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? "App";
          setDraftName(base);
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

  const handlePick = () => Events.Emit("launcher:app:pick");

  const handleAdd = () => {
    if (!pickedPath || !draftName.trim()) return;
    const entry: LauncherAppEntry = {
      id: newId("app"),
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
        <span className="v52-eyebrow">Apps</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePick}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
            data-testid="apps-add-manual"
          >
            + Añadir app manualmente
          </button>
          <button
            type="button"
            onClick={() => Events.Emit("launcher:apps:discover")}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
            data-testid="apps-rescan"
          >
            Reescanear
          </button>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2" data-testid="apps-list">
        {apps.length === 0 && (
          <li className="text-xs text-vantare-textDim">
            No se han detectado apps todavía.
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
                  Detectada
                </span>
              )}
              {!referenced && (
                <button
                  type="button"
                  onClick={() => handleRemove(app.id)}
                  className="text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:text-vantare-red-400 transition-colors"
                  data-testid={`app-remove-${app.id}`}
                >
                  Eliminar
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
            placeholder="Nombre de la app"
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
                {c}
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
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90"
              data-testid="app-add-save"
            >
              Guardar app
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
