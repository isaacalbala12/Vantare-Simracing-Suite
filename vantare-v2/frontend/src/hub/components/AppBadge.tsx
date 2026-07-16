import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { LauncherAppEntry } from "../launcher/launcher-state";
import { resolveIconCandidates } from "../launcher/app-icons";

type AppBadgeProps = {
  app: LauncherAppEntry;
  size?: "sm" | "md";
  onFavorite?: (id: string, isFavorite: boolean) => void;
};

const CATEGORY_LABEL: Record<LauncherAppEntry["category"], string> = {
  simulator: "Simulador",
  streaming: "Streaming",
  audio: "Audio",
  telemetry: "Telemetría",
  utility: "Utilidad",
};

/**
 * Known icon URLs for apps whose icons can't be extracted from .exe AND have no
 * desktop shortcut to fall back to. Reserved for apps with a reliable, hotlink-
 * friendly asset. Currently empty: Discord, MoTeC and SimHub resolve via the
 * backend, which extracts the real icon from the executable or its desktop
 * shortcut (.lnk) — matching what Windows shows on the desktop.
 */
const KNOWN_ICONS: Record<string, string> = {};

/** Cache for resolved icon data URIs (id → data URI) */
const iconCache = new Map<string, string>();

export function AppBadge({ app, size = "md", onFavorite }: AppBadgeProps) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const title = `${app.displayName} · ${CATEGORY_LABEL[app.category]}`;

  const [extractedIcon, setExtractedIcon] = useState<string | null>(() =>
    iconCache.get(app.id) ?? null,
  );
  const iconKey = `${app.id}|${app.iconUrl ?? ""}|${app.executablePath ?? ""}`;
  const [failedCandidateState, setFailedCandidateState] = useState({
    key: "",
    count: 0,
  });
  const failedCandidateCount =
    failedCandidateState.key === iconKey ? failedCandidateState.count : 0;
  const iconCandidates = [
    ...resolveIconCandidates(app),
    KNOWN_ICONS[app.id],
    extractedIcon,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const iconUrl = iconCandidates[failedCandidateCount] ?? null;
  const appId = app.id;
  const executablePath = app.executablePath;

  // Request icon from Go backend and listen for the result in a single effect,
  // so the listener is always registered BEFORE the emit.
  useEffect(() => {
    const off = Events.On(
      "launcher:app:icon:result",
      (event: { data?: { id?: string; iconUrl?: string } }) => {
        const data = event.data;
        if (!data || data.id !== appId || !data.iconUrl) return;
        iconCache.set(appId, data.iconUrl);
        setExtractedIcon(data.iconUrl);
      },
    );

    if (!iconUrl && executablePath && !iconCache.has(appId)) {
      Events.Emit("launcher:app:icon", {
        id: appId,
        executablePath,
      });
    }

    return off;
  }, [appId, app.iconUrl, executablePath, iconUrl]);

  return (
    <span
      className="inline-flex items-center gap-2"
      title={title}
      data-testid={`app-badge-${app.id}`}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          loading="lazy"
          className={`${dim} rounded-lg object-contain`}
          onError={() => {
            // Try the next ranked candidate before falling back to the abbreviation.
            if (extractedIcon === iconUrl) {
              iconCache.delete(appId);
              setExtractedIcon(null);
            }
            setFailedCandidateState({
              key: iconKey,
              count: failedCandidateCount + 1,
            });
          }}
        />
      ) : (
        <span
          className={`inline-flex items-center justify-center rounded-lg font-bold text-white ${dim}`}
          style={{
            backgroundImage: `linear-gradient(135deg, ${app.gradientFrom}, ${app.gradientTo})`,
          }}
          aria-hidden="true"
        >
          {app.abbreviation}
        </span>
      )}
      <span className="text-sm text-white">{app.displayName}</span>
      {onFavorite && (
        <button
          type="button"
          onClick={() => onFavorite(app.id, !app.isFavorite)}
          data-testid={`app-favorite-${app.id}`}
          aria-label={
            app.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"
          }
          className="ml-auto text-sm transition-colors hover:text-amber-400"
        >
          {app.isFavorite ? "★" : "☆"}
        </button>
      )}
    </span>
  );
}
