import { useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { formatRelativeTime, type LaunchProfile } from "../launcher/launcher-state";
import { useChainState, useLastResult } from "../launcher/chain-store";
import { useLauncherSnapshot, useLauncherStore } from "../launcher/launcher-store";

type LauncherDockProps = {
  onNavigate: (section: string) => void;
};

function ListIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function ProfileGlyph({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <span className="w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold text-white">
      {initials || "P"}
    </span>
  );
}

const CIRCUMFERENCE = 2 * Math.PI * 10; // ~62.83

function buildTooltip(profile: LaunchProfile): string {
  const count = profile.launchCount ?? 0;
  let tip = `${profile.name} (lanzado ${count} veces)`;
  if (profile.lastLaunchedAt) {
    const diffMs = Date.now() - new Date(profile.lastLaunchedAt).getTime();
    const formatted = formatRelativeTime(diffMs);
    if (formatted) tip += ` · ${formatted}`;
  }
  return tip;
}

type DockProfileButtonProps = {
  profile: LaunchProfile;
  onLaunch: () => void;
};

function DockProfileButton({ profile, onLaunch }: DockProfileButtonProps) {
  const chain = useChainState(profile.id);
  const lastResult = useLastResult(profile.id);

  // Use static ring color since we don't have apps array here
  const ringColor: string | null = chain ? "#3b82f6" : null;

  const tooltip = buildTooltip(profile);

  return (
    <button
      type="button"
      onClick={onLaunch}
      title={tooltip}
      className="v52-dock-item relative"
      data-testid={`dock-profile-${profile.id}`}
      aria-label={`Lanzar perfil ${profile.name}`}
    >
      {chain ? (
        <svg viewBox="0 0 24 24" className="w-5 h-5" data-testid={`dock-ring-${profile.id}`}>
          <circle
            cx="12" cy="12" r="10"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="2"
            fill="none"
          />
          <circle
            cx="12" cy="12" r="10"
            stroke={ringColor ?? "#3b82f6"}
            strokeWidth="2"
            fill="none"
            strokeDasharray={String(CIRCUMFERENCE)}
            strokeDashoffset={String(
              CIRCUMFERENCE -
                CIRCUMFERENCE *
                  ((chain.currentStepIndex + 1) / chain.steps.length),
            )}
            style={{ transform: "rotate(-90deg)", transformOrigin: "12px 12px" }}
            data-testid={`dock-ring-progress-${profile.id}`}
          />
        </svg>
      ) : lastResult ? (
        <ProfileGlyph name={profile.name} />
      ) : (
        <ProfileGlyph name={profile.name} />
      )}

      {/* Favorite golden dot */}
      {profile.isFavorite && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400"
          data-testid={`dock-favorite-${profile.id}`}
        />
      )}

      {/* Last result border badge (only when no chain active) */}
      {!chain && lastResult === "success" && (
        <span
          className="absolute inset-0 rounded border border-emerald-500/40 pointer-events-none"
          data-testid={`dock-lastresult-success-${profile.id}`}
        />
      )}
      {!chain && lastResult === "error" && (
        <span
          className="absolute inset-0 rounded border border-red-500/50 pointer-events-none"
          data-testid={`dock-lastresult-error-${profile.id}`}
        />
      )}
      {!chain && lastResult === "partial" && (
        <span
          className="absolute inset-0 rounded border border-amber-500/40 pointer-events-none"
          data-testid={`dock-lastresult-partial-${profile.id}`}
        />
      )}
    </button>
  );
}

export function LauncherDock({ onNavigate }: LauncherDockProps) {
  const { t } = useI18n();
  const snapshot = useLauncherSnapshot();
  const { dispatchLauncherCommand } = useLauncherStore();
  const profiles = useMemo<LaunchProfile[]>(
    () => [
      ...(snapshot?.vantareProfiles ?? []),
      ...(snapshot?.userProfiles ?? []),
    ],
    [snapshot],
  );
  const activeChains = snapshot?.activeChains ?? [];

  const orderedProfiles = useMemo(
    () =>
      [...profiles].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      }),
    [profiles],
  );

  const handleLaunch = (id: string) =>
    dispatchLauncherCommand("launcher:profile:launch", { id });

  return (
    <aside className="v52-dock hidden lg:flex flex-col" aria-label="Launcher rápido">
      <button
        type="button"
        onClick={() => onNavigate("launcher")}
        className="v52-dock-item"
        aria-label="Ir a Launcher"
        title="Launcher"
      >
        <ListIcon />
      </button>
      <div className="overflow-y-auto flex flex-col gap-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,245,245,0.16) transparent" }}>
        {activeChains.map((chain) => (
          <div key={`active-${chain.profileId}`} className="v52-dock-item relative" title={`${chain.profileId}: ${chain.status}`} data-testid={`dock-active-${chain.profileId}`}>
            <span className="text-[9px] font-bold text-vantare-red-400" aria-label={`Cadena ${chain.profileId} ${chain.status}`}>●</span>
            <button type="button" className="sr-only" onClick={() => dispatchLauncherCommand("launcher:app:restart", { profileId: chain.profileId })}>Reiniciar {chain.profileId}</button>
          </div>
        ))}
        {orderedProfiles.map((p) => {
          const displayName =
            p.id === "creator"
              ? t("launcher.profiles.creator.name")
              : p.id === "pro"
                ? t("launcher.profiles.pro.name")
                : p.name;
          return (
            <DockProfileButton
              key={p.id}
              profile={{ ...p, name: displayName }}
              onLaunch={() => handleLaunch(p.id)}
            />
          );
        })}
      </div>
    </aside>
  );
}
