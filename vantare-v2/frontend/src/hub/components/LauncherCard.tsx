import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  DEFAULT_LMU_STEAM_APP_ID,
  parseLauncherStatus,
  type LauncherView,
} from "../launcher/launcher-state";
import type { AppSettings } from "../pages/SettingsPage";

type LauncherCardProps = {
  onOpenSettings?: () => void;
};

const SIMULATOR_ID = "lmu";

export function LauncherCard({ onOpenSettings }: LauncherCardProps) {
  const [view, setView] = useState<LauncherView>({ kind: "unconfigured" });
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [launchMethod, setLaunchMethod] = useState<"steam-uri" | "executable">(
    "steam-uri",
  );
  const [executablePath, setExecutablePath] = useState("");

  useEffect(() => {
    Events.Emit("launcher:status:get", { simulatorId: SIMULATOR_ID });
    Events.Emit("settings:get");

    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On("launcher:status", (event: { data: { lmu?: unknown } }) => {
        const payload = event?.data?.lmu as
          | { configured?: boolean; launchMethod?: string; steamAppId?: number; executablePath?: string }
          | undefined;
        if (!payload) {
          setView({ kind: "unconfigured" });
          return;
        }
        if (payload.configured) {
          setConfigured(true);
          if (payload.launchMethod === "executable") {
            setView({
              kind: "ready-exec",
              path: payload.executablePath ?? "",
              ok: true,
            });
          } else {
            setView({
              kind: "ready-steam",
              steamAppId: payload.steamAppId ?? DEFAULT_LMU_STEAM_APP_ID,
            });
          }
        } else {
          setConfigured(false);
          setView({ kind: "unconfigured" });
        }
      }),
    );

    handlers.push(
      Events.On("settings", (event: { data: AppSettings }) => {
        setView(parseLauncherStatus(event.data, SIMULATOR_ID));
        const cfg = event.data?.launchers?.[SIMULATOR_ID];
        if (cfg) {
          setConfigured(true);
          if (cfg.launchMethod === "executable") {
            setLaunchMethod("executable");
            setExecutablePath(cfg.executablePath ?? "");
          } else {
            setLaunchMethod("steam-uri");
          }
        } else {
          setConfigured(false);
        }
      }),
    );

    handlers.push(
      Events.On("launcher:error", (event: { data: { message?: string } }) => {
        setError(event?.data?.message ?? "Error desconocido");
      }),
    );

    handlers.push(
      Events.On("launcher:launched", () => {
        setError(null);
      }),
    );

    return () => {
      for (const off of handlers) {
        off();
      }
    };
  }, []);

  const handleLaunch = () => {
    setError(null);
    Events.Emit("launcher:launch", { simulatorId: SIMULATOR_ID });
  };

  const handleConfigure = () => {
    setError(null);
    if (launchMethod === "executable" && !executablePath.trim()) {
      setError("Introduce la ruta del ejecutable de LMU.");
      return;
    }
    const payload: Record<string, unknown> = {
      simulatorId: SIMULATOR_ID,
      launchMethod,
      executablePath: launchMethod === "executable" ? executablePath.trim() : undefined,
      steamAppId: launchMethod === "steam-uri" ? DEFAULT_LMU_STEAM_APP_ID : undefined,
    };
    Events.Emit("launcher:configure", payload);
    setShowConfig(false);
  };

  return (
    <section
      data-testid="launcher-card"
      className="glass-panel rounded-xl p-6 border border-white/5"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display font-semibold text-lg text-white">
            Launcher LMU
          </h2>
          <p className="text-xs text-vantare-textMuted">
            Abre Le Mans Ultimate desde Vantare.
          </p>
        </div>
      </header>

      {error && (
        <p
          data-testid="launcher-error"
          className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 mb-3"
        >
          {error}
        </p>
      )}

      {view.kind === "unconfigured" && (
        <div data-testid="launcher-unconfigured" className="flex flex-col gap-3">
          <p className="text-sm text-vantare-textMuted">
            Launcher LMU por configurar.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="launcher-configure-toggle"
              onClick={() => setShowConfig((v) => !v)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-vantare-red-700 hover:bg-vantare-red-600 transition-colors"
            >
              {showConfig ? "Cancelar" : "Configurar LMU"}
            </button>
            {onOpenSettings && (
              <button
                type="button"
                data-testid="launcher-settings-cta"
                onClick={onOpenSettings}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textMuted bg-vantare-surface border border-white/5 hover:border-vantare-red-900/50"
              >
                Ajustes
              </button>
            )}
          </div>
        </div>
      )}

      {view.kind === "ready-steam" && (
        <div data-testid="launcher-ready-steam" className="flex flex-col gap-3">
          <p className="text-sm text-white">
            Listo para abrir LMU (Steam).
          </p>
          <p className="text-[11px] text-vantare-textMuted">
            App ID {view.steamAppId}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="launcher-open"
              onClick={handleLaunch}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-vantare-red-700 hover:bg-vantare-red-600 transition-colors"
            >
              Abrir LMU
            </button>
            <button
              type="button"
              data-testid="launcher-configure-toggle"
              onClick={() => setShowConfig((v) => !v)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textMuted bg-vantare-surface border border-white/5 hover:border-vantare-red-900/50"
            >
              Cambiar método
            </button>
          </div>
        </div>
      )}

      {view.kind === "ready-exec" && (
        <div data-testid="launcher-ready-exec" className="flex flex-col gap-3">
          <p className="text-sm text-white">
            Listo para abrir LMU (ejecutable local).
          </p>
          <p className="text-[11px] text-vantare-textMuted truncate" title={view.path}>
            {view.path}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="launcher-open"
              onClick={handleLaunch}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-vantare-red-700 hover:bg-vantare-red-600 transition-colors"
            >
              Abrir LMU
            </button>
            <button
              type="button"
              data-testid="launcher-configure-toggle"
              onClick={() => setShowConfig((v) => !v)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textMuted bg-vantare-surface border border-white/5 hover:border-vantare-red-900/50"
            >
              Cambiar ruta
            </button>
          </div>
        </div>
      )}

      {view.kind === "stale" && (
        <div data-testid="launcher-stale" className="flex flex-col gap-3">
          <p className="text-sm text-amber-300">{view.reason}</p>
          <button
            type="button"
            data-testid="launcher-configure-toggle"
            onClick={() => setShowConfig(true)}
            className="self-start px-4 py-2 rounded-lg text-xs font-semibold text-white bg-vantare-red-700 hover:bg-vantare-red-600 transition-colors"
          >
            Reconfigurar LMU
          </button>
        </div>
      )}

      {showConfig && (
        <form
          data-testid="launcher-config-form"
          className="mt-4 p-4 rounded-lg bg-black/30 border border-white/5 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfigure();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs text-vantare-textMuted mb-1">
              Método de lanzamiento
            </legend>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="radio"
                name="launch-method"
                value="steam-uri"
                data-testid="launcher-method-steam"
                checked={launchMethod === "steam-uri"}
                onChange={() => setLaunchMethod("steam-uri")}
              />
              Steam (App ID {DEFAULT_LMU_STEAM_APP_ID})
            </label>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="radio"
                name="launch-method"
                value="executable"
                data-testid="launcher-method-exec"
                checked={launchMethod === "executable"}
                onChange={() => setLaunchMethod("executable")}
              />
              Ejecutable local
            </label>
          </fieldset>
          {launchMethod === "executable" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-vantare-textMuted">
                Ruta del ejecutable
              </span>
              <input
                type="text"
                data-testid="launcher-exec-path"
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                placeholder="C:/Games/Le Mans Ultimate/LMU.exe"
                className="px-3 py-2 rounded-md bg-vantare-surface border border-white/5 text-sm text-white"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              data-testid="launcher-save"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-vantare-red-700 hover:bg-vantare-red-600 transition-colors"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textMuted bg-vantare-surface border border-white/5 hover:border-vantare-red-900/50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {configured && view.kind === "unconfigured" && null}
    </section>
  );
}
