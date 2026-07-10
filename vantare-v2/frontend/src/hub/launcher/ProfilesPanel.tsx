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
import { ProfileEditor } from "./ProfileEditor";

type ProfilesPanelProps = {
  className?: string;
};

export function ProfilesPanel({ className }: ProfilesPanelProps) {
  const { t } = useI18n();
  const [apps, setApps] = useState<LauncherAppEntry[]>([]);
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

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

  // Find the profile being edited (if any)
  const editingProfile = editingProfileId
    ? profiles.find((p) => p.id === editingProfileId) ?? null
    : null;

  const handleSave = (updated: LaunchProfile) =>
    Events.Emit("launcher:profile:save", { profile: updated });

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
          className="px-3 py-1.5 rounded-lg border border-dashed border-white/20 text-[10px] font-bold uppercase tracking-[.22em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
          data-testid="profiles-create"
        >
          {t("launcher.profiles.create")}
        </button>
      </div>

      <div className="flex flex-col gap-3" data-testid="profiles-list">
        {profiles.length === 0 && (
          <article className="card-sleek rounded-xl p-5" data-testid="profiles-empty">
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
            onEdit={(id) => setEditingProfileId(id)}
          />
        ))}
      </div>

      {/* Profile Editor — rendered ONCE at panel level, only when editing */}
      {editingProfile && (
        <ProfileEditor
          key={editingProfile.id}
          profile={editingProfile}
          open={true}
          onClose={() => setEditingProfileId(null)}
          onSave={handleSave}
          apps={apps}
        />
      )}
    </section>
  );
}
