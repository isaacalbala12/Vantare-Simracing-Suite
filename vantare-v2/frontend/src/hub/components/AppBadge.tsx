import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { LauncherAppEntry } from "../launcher/launcher-state";

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

/** Steam CDN header image for Steam apps. */
function steamIconUrl(steamAppId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

/** Cache for resolved icon data URIs (id → data URI) */
const iconCache = new Map<string, string>();

export function AppBadge({ app, size = "md", onFavorite }: AppBadgeProps) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const title = `${app.displayName} · ${CATEGORY_LABEL[app.category]}`;

  const [iconUrl, setIconUrl] = useState<string | null>(() => {
    // 1. Explicit iconUrl from settings
    if (app.iconUrl) return app.iconUrl;
    // 2. In-memory cache
    if (iconCache.has(app.id)) return iconCache.get(app.id) ?? null;
    // 3. Steam CDN for steam-uri apps
    if (app.launchMethod === "steam-uri" && app.steamAppId) {
      return steamIconUrl(app.steamAppId);
    }
    // 4. Known icons for apps that can't be extracted from .exe
    const known = KNOWN_ICONS[app.id];
    if (known) {
      iconCache.set(app.id, known);
      return known;
    }
    // 5. Will try backend extraction via useEffect
    return null;
  });

  // Request icon from Go backend and listen for the result in a single effect,
  // so the listener is always registered BEFORE the emit.
  useEffect(() => {
    const off = Events.On(
      "launcher:app:icon:result",
      (event: { data?: { id?: string; iconUrl?: string } }) => {
        const data = event.data;
        if (!data || data.id !== app.id || !data.iconUrl) return;
        iconCache.set(app.id, data.iconUrl);
        setIconUrl(data.iconUrl);
      },
    );

    if (!iconUrl && app.executablePath && !iconCache.has(app.id)) {
      Events.Emit("launcher:app:icon", {
        id: app.id,
        executablePath: app.executablePath,
      });
    }

    return off;
  }, [app.id, app.executablePath, iconUrl]);

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
          className={`${dim} rounded-lg object-cover`}
          onError={() => {
            // Image failed — try known icon or fallback to abbreviation
            iconCache.delete(app.id);
            setIconUrl(null);
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
