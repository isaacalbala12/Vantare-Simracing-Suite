import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import type { LaunchProfile } from "../launcher/launcher-state";

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

export function LauncherDock({ onNavigate }: LauncherDockProps) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);

  useEffect(() => {
    // Pide perfiles al montar y escucha solo launcher:profiles:updated.
    // No escuchar "settings" para evitar doble actualización redundante.
    Events.Emit("launcher:profiles:list");
    const offProfiles = Events.On(
      "launcher:profiles:updated",
      (event: { data?: { profiles?: LaunchProfile[] } }) => {
        setProfiles(event.data?.profiles ?? []);
      },
    );
    return () => {
      offProfiles();
    };
  }, []);

  const handleLaunch = (id: string) => Events.Emit("launcher:profile:launch", { id });

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
      <div className="overflow-y-auto flex flex-col gap-1">
        {profiles.map((p) => {
          const displayName = p.id === "creator" ? t("launcher.profiles.creator.name") : p.id === "pro" ? t("launcher.profiles.pro.name") : p.name;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleLaunch(p.id)}
              title={displayName}
              className="v52-dock-item"
              data-testid={`dock-profile-${p.id}`}
              aria-label={`Lanzar perfil ${displayName}`}
            >
              <ProfileGlyph name={displayName} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
