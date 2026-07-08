import { useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import {
  appSortOrder,
  newProfileId,
  type LauncherAppEntry,
  type LaunchProfile,
} from "./launcher-state";
import { ProfileCard } from "./ProfileCard";

type ProfilesPanelProps = {
  className?: string;
};

export function ProfilesPanel({ className }: ProfilesPanelProps) {
  const { t } = useI18n();
  const [apps, setApps] = useState<LauncherAppEntry[]>([]);
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);

  useEffect(() => {
    Events.Emit("launcher:apps:discover");
    Events.Emit("launcher:profiles:list");

    const offApps = Events.On(
      "launcher:apps:detected",
      (event: { data?: { apps?: LauncherAppEntry[] } }) => {
        setApps((event.data?.apps ?? []).slice().sort(appSortOrder));
      },
    );
    const offAppsUpdated = Events.On(
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

    return () => {
      offApps();
      offAppsUpdated();
      offProfiles();
    };
  }, []);

  // handleCreate creates a new profile with a non-empty placeholder name so
  // the backend's Name validation passes. The user can then click Editar to
  // rename it. This is simpler than a full inline-edit draft state and
  // keeps the existing ProfileCard API unchanged.
  const handleCreate = () => {
    const id = newProfileId("profile");
    const blank: LaunchProfile = {
      id,
      name: t("launcher.profiles.newPlaceholder"),
      description: "",
      steps: [],
    };
    Events.Emit("launcher:profile:save", { profile: blank });
  };

  const orderedProfiles = useMemo(
    () => [...profiles].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.name.localeCompare(b.name);
    }),
    [profiles],
  );

  return (
    <section
      className={`flex flex-col gap-3 ${className ?? ""}`}
      data-testid="profiles-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="v52-eyebrow">{t("nav.launcher")}</span>
        <button
          type="button"
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted hover:border-accent/40 hover:text-white transition-colors"
          data-testid="profiles-create"
        >
          {t("launcher.profiles.create")}
        </button>
      </div>

      <div className="flex flex-col gap-3" data-testid="profiles-list">
        {profiles.length === 0 && (
          <article
            className="card-sleek rounded-xl p-5"
            data-testid="profiles-empty"
          >
            <p className="text-xs text-vantare-textMuted">
              {t("launcher.profiles.empty")}
            </p>
          </article>
        )}
        {orderedProfiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            apps={apps}
          />
        ))}
      </div>
    </section>
  );
}
