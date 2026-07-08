import type { LauncherAppEntry } from "../launcher/launcher-state";

type AppBadgeProps = {
  app: LauncherAppEntry;
  size?: "sm" | "md";
};

const CATEGORY_LABEL: Record<LauncherAppEntry["category"], string> = {
  simulator: "Simulador",
  streaming: "Streaming",
  audio: "Audio",
  telemetry: "Telemetría",
  utility: "Utilidad",
};

export function AppBadge({ app, size = "md" }: AppBadgeProps) {
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
    </span>
  );
}
