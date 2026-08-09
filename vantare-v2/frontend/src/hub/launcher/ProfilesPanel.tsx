import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  appSortOrder,
  newProfileId,
  type LauncherAppEntry,
  type LaunchProfile,
} from "./launcher-state";
import { useLauncherSnapshot, useLauncherStore } from "./launcher-store";
import { ProfileCard } from "./ProfileCard";
import { ProfileEditor } from "./ProfileEditor";

type ProfilesPanelProps = {
  className?: string;
};

export function ProfilesPanel({ className }: ProfilesPanelProps) {
  const { t } = useI18n();
  const snapshot = useLauncherSnapshot();
  const { dispatchLauncherCommand } = useLauncherStore();
  const apps = useMemo<LauncherAppEntry[]>(
    () =>
      (snapshot?.apps ?? []).map((app) => ({
        ...app,
        detected: app.detected ?? app.availability.found,
      })).sort(appSortOrder),
    [snapshot],
  );
  const profiles = useMemo<LaunchProfile[]>(
    () => [
      ...(snapshot?.vantareProfiles ?? []),
      ...(snapshot?.userProfiles ?? []),
    ],
    [snapshot],
  );
  const vantareProfiles = snapshot?.vantareProfiles ?? [];
  const userProfiles = snapshot?.userProfiles ?? [];
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const handleCreate = () => {
    const id = newProfileId("profile");
    const blank: LaunchProfile = {
      id,
      name: t("launcher.profiles.newPlaceholder"),
      description: "",
      steps: [],
    };
    dispatchLauncherCommand("launcher:profile:save", { profile: blank });
  };

  // Find the profile being edited (if any)
  const editingProfile = editingProfileId
    ? profiles.find((p) => p.id === editingProfileId) ?? null
    : null;

  const handleSave = (updated: LaunchProfile) =>
    dispatchLauncherCommand("launcher:profile:save", { profile: updated });

  return (
    <section
      className={`card-sleek rounded-xl p-5 ${className ?? ""}`}
      data-testid="profiles-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="v52-eyebrow">{t("launcher.profiles.title")}</span>
        <button
          type="button"
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-[10px] font-bold uppercase tracking-[.18em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
          data-testid="profiles-create"
        >
          {t("launcher.profiles.create")}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-5" data-testid="profiles-list">
        {profiles.length === 0 && (
          <p className="text-xs text-vantare-textMuted" data-testid="profiles-empty">
            {t("launcher.profiles.empty")}
          </p>
        )}
        {[
          { id: "vantare", title: t("launcher.profiles.vantare"), items: vantareProfiles },
          { id: "user", title: t("launcher.profiles.mine"), items: userProfiles },
        ].map((section) => {
          // An empty group has nothing to label, and leaving the heading behind
          // left two orphan captions floating over the page background.
          if (section.items.length === 0) return null;
          const sectionProfiles = [...section.items].sort((a, b) => {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            return a.name.localeCompare(b.name);
          });
          return (
            <section key={section.id} data-testid={`profiles-section-${section.id}`}>
              <h2 className="mb-2 text-[10px] uppercase tracking-[.22em] text-white/40">
                {section.title}
              </h2>
              <div className="flex flex-col gap-3">
                {sectionProfiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    apps={apps}
                    onEdit={(id) => setEditingProfileId(id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
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
