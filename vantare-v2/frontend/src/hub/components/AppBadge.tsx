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

export function AppBadge({ app, size = "md", onFavorite }: AppBadgeProps) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const title = `${app.displayName} · ${CATEGORY_LABEL[app.category]}`;
  return (
    <span
      className="inline-flex items-center gap-2"
      title={title}
      data-testid="app-badge"
    >
      <span
        className={`inline-flex items-center justify-center rounded-lg font-bold text-white ${dim}`}
        style={{
          backgroundImage: `linear-gradient(135deg, ${app.gradientFrom}, ${app.gradientTo})`,
        }}
        aria-hidden="true"
      >
        {app.abbreviation}
      </span>
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
