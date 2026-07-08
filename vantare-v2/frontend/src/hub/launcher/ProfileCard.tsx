import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import {
  formatRelativeTime,
  isProfileLaunchable,
  newProfileId,
  estimateChainDuration,
  type LauncherAppEntry,
  type LaunchProfile,
} from "./launcher-state";
import { useChainState, useLastResult, type ChainState } from "./chain-store";
import { AppBadge } from "../components/AppBadge";
import { ProfileEditor } from "./ProfileEditor";
import { ProfileCardTimeline } from "./ProfileCard.timeline";

type ProfileCardProps = {
  profile: LaunchProfile;
  apps: LauncherAppEntry[];
  className?: string;
};

function appFor(apps: LauncherAppEntry[], id: string): LauncherAppEntry | undefined {
  return apps.find((a) => a.id === id);
}

/** Format a relative time string (e.g. "hace 10m", "hace 2h"). Delegates to shared formatRelativeTime in launcher-state. */
function relativeTime(dateStr: string): string {
  try {
    const then = new Date(dateStr).getTime();
    const diffMs = Date.now() - then;
    if (Number.isNaN(diffMs)) return "";
    return formatRelativeTime(diffMs);
  } catch {
    return "";
  }
}

export function ProfileCard({ profile, apps, className }: ProfileCardProps) {
  const { t } = useI18n();
  const chain: ChainState | undefined = useChainState(profile.id);
  const lastResult = useLastResult(profile.id);
  const [editing, setEditing] = useState(false);

  // ── Early return: chain active → show mini-timeline ──────────────
  if (chain) {
    return (
      <ProfileCardTimeline
        chain={chain}
        apps={apps}
        onCancel={() => Events.Emit("launcher:profile:cancel", { id: profile.id })}
      />
    );
  }

  // ── Card normal ───────────────────────────────────────────────────
  const launchable = isProfileLaunchable(profile, apps);
  const estimatedMs = estimateChainDuration(profile, apps);
  const timeLabel = estimatedMs > 0 ? `≈${Math.round(estimatedMs / 1000)}s` : "—";

  const handleLaunch = () =>
    Events.Emit("launcher:profile:launch", { id: profile.id });
  const handleDelete = () =>
    Events.Emit("launcher:profile:delete", { id: profile.id });
  const handleDuplicate = () =>
    Events.Emit("launcher:profile:duplicate", {
      id: profile.id,
      newId: newProfileId("profile"),
      newName: `${profile.name} ${t("launcher.profiles.copy.suffix")}`.trim(),
    });
  const handleSave = (updated: LaunchProfile) =>
    Events.Emit("launcher:profile:save", { profile: updated });

  return (
    <article
      className={`card-sleek rounded-xl p-5 ${className ?? ""}`}
      data-testid={`profile-card-${profile.id}`}
    >
      {/* ── Header: name + favorite badge + lastResult + launch btn ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="font-display font-bold text-lg text-white flex items-center"
            data-testid={`profile-name-${profile.id}`}
          >
            {profile.id === "creator"
              ? t("launcher.profiles.creator.name")
              : profile.id === "pro"
                ? t("launcher.profiles.pro.name")
                : profile.name}
            {profile.isFavorite && (
              <span
                className="text-amber-400 ml-2"
                data-testid={`profile-favorite-badge-${profile.id}`}
                aria-label="Favorita"
              >
                ★
              </span>
            )}
          </h2>
          {profile.description && (
            <p
              className="text-xs text-vantare-textMuted mt-1"
              data-testid={`profile-description-${profile.id}`}
            >
              {profile.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastResult && (
            <span
              data-testid={`profile-lastresult-${profile.id}`}
              className={`inline-block w-2 h-2 rounded-full ${
                lastResult === "success"
                  ? "bg-emerald-500"
                  : lastResult === "error"
                    ? "bg-red-500"
                    : "bg-amber-500"
              }`}
              title={
                lastResult === "success"
                  ? "Último lanzamiento exitoso"
                  : lastResult === "partial"
                    ? "Último lanzamiento parcial"
                    : "Último lanzamiento fallido"
              }
            />
          )}
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!launchable}
            title={launchable ? undefined : t("launcher.profile.unlaunchable")}
            className="px-3 py-1.5 rounded-lg bg-accent text-[10px] uppercase tracking-[.18em] font-bold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid={`profile-launch-${profile.id}`}
          >
            {t("launcher.profile.start")}
          </button>
        </div>
      </div>

      {/* ── Estimated / real time ──────────────────────────────────── */}
      {timeLabel && (
        <p
          className="text-xs text-vantare-textMuted mt-2"
          data-testid={`profile-time-${profile.id}`}
        >
          {timeLabel}
        </p>
      )}

      {/* ── Last launched (telemetry) ──────────────────────────────── */}
      {profile.lastLaunchedAt && (
        <p
          className="text-xs text-vantare-textDim mt-1"
          data-testid={`profile-last-${profile.id}`}
        >
          Último: {relativeTime(profile.lastLaunchedAt)}
        </p>
      )}

      {/* ── Steps list ─────────────────────────────────────────────── */}
      <ul className="mt-3 flex flex-col gap-1.5" data-testid="profile-steps">
        {profile.steps.length === 0 && (
          <li className="text-xs text-vantare-textDim">Sin pasos configurados.</li>
        )}
        {profile.steps.map((step, index) => {
          const app = appFor(apps, step.appId);
          return (
            <li
              key={`${step.appId}-${index}`}
              className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1.5"
              data-testid={`profile-step-row-${index}`}
            >
              {app ? (
                <AppBadge app={app} size="sm" />
              ) : (
                <span className="text-xs text-vantare-textDim">
                  App desconocida ({step.appId})
                </span>
              )}
              <span className="ml-auto text-[10px] uppercase tracking-[.18em] text-vantare-textDim">
                {step.delay}s
              </span>
            </li>
          );
        })}
      </ul>

      {/* ── Profile editor (side-panel) ────────────────────────────── */}
      <ProfileEditor
        profile={profile}
        open={editing}
        onClose={() => setEditing(false)}
        onSave={handleSave}
        apps={apps}
      />

      {/* ── Footer: count in tooltip + edit + duplicate + delete ──── */}
      <div
        className="mt-3 flex items-center gap-2 justify-end"
        data-testid={`profile-actions-${profile.id}`}
      >
        <span
          className="text-[10px] uppercase tracking-[.18em] text-vantare-textMuted mr-auto"
          title={`Lanzado ${profile.launchCount ?? 0} veces`}
          data-testid={`profile-count-${profile.id}`}
        >
          {profile.launchCount ? `${profile.launchCount}×` : ""}
        </span>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
          data-testid={`profile-edit-${profile.id}`}
        >
          Editar
        </button>

        <button
          type="button"
          onClick={handleDuplicate}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
          data-testid={`profile-duplicate-${profile.id}`}
        >
          Duplicar
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase tracking-[.18em] text-vantare-textDim hover:border-vantare-red-400/50 hover:text-vantare-red-400 transition-colors"
          data-testid={`profile-delete-${profile.id}`}
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}
