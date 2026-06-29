import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  isRunningProfile,
  profileLabel,
  type OverlayStatus,
  type ProfileEntry,
} from "../state/overlay-workbench";
import type { AppSettings } from "../pages/SettingsPage";

type ActiveOverlayCardProps = {
  onNavigate: (section: string) => void;
};

type HubProfilesPayload = {
  profiles?: ProfileEntry[];
};

function findActiveProfile(
  profiles: ProfileEntry[],
  activeProfileId: string | null,
): ProfileEntry | null {
  if (!activeProfileId) return null;
  return profiles.find((p) => p.id === activeProfileId) ?? null;
}

export function ActiveOverlayCard({ onNavigate }: ActiveOverlayCardProps) {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null);

  useEffect(() => {
    const unsubSettings = Events.On(
      "settings",
      (event: { data?: AppSettings }) => {
        setSettingsLoaded(true);
        const next = event.data?.activeOverlayProfileId;
        setActiveProfileId(next && next.length > 0 ? next : null);
      },
    );

    const unsubProfiles = Events.On(
      "hub:profiles",
      (event: { data?: HubProfilesPayload }) => {
        setProfiles(Array.isArray(event.data?.profiles) ? event.data!.profiles! : []);
      },
    );

    const unsubProfilesReload = Events.On("hub:profiles:reload", () => {
      Events.Emit("hub:list");
    });

    const unsubOverlayStatus = Events.On(
      "overlay:status",
      (event: { data?: OverlayStatus }) => {
        setOverlayStatus((event.data ?? null) as OverlayStatus | null);
      },
    );

    Events.Emit("settings:get");
    Events.Emit("hub:list");

    return () => {
      unsubSettings();
      unsubProfiles();
      unsubProfilesReload();
      unsubOverlayStatus();
    };
  }, []);

  const activeProfile = findActiveProfile(profiles, activeProfileId);
  const hasActiveProfile = activeProfile !== null;
  const hasStaleActiveId = activeProfileId !== null && activeProfile === null && settingsLoaded;
  const overlayRunningWithActive =
    hasActiveProfile && isRunningProfile(activeProfile, overlayStatus);
  const overlayInEditMode = overlayStatus?.mode === "edit";

  function handleOpen() {
    if (!hasActiveProfile) return;
    Events.Emit("overlay:start-active");
  }

  function handleEdit() {
    if (!hasActiveProfile) return;
    Events.Emit("overlay:toggle-edit-mode");
  }

  function handleGoToProfiles() {
    onNavigate("profiles");
  }

  if (!settingsLoaded) {
    return (
      <section
        data-testid="active-overlay-card"
        className="glass-panel rounded-xl p-6 border border-white/5"
      >
        <h2 className="font-display font-semibold text-lg text-white mb-2">
          Overlay activo
        </h2>
        <p className="text-sm text-vantare-textMuted">Cargando estado...</p>
      </section>
    );
  }

  if (hasActiveProfile) {
    const label = profileLabel(activeProfile);
    const openLabel = overlayRunningWithActive
      ? "Overlay en ejecucion"
      : "Abrir overlay";
    const editLabel = overlayInEditMode ? "Salir de edicion" : "Editar overlay";

    return (
      <section
        data-testid="active-overlay-card"
        className="glass-panel rounded-xl p-6 border border-white/5"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-semibold text-lg text-white">
                Overlay activo
              </h2>
              <span
                data-testid="active-overlay-badge"
                className="rounded-full bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-900/30"
              >
                Activo
              </span>
            </div>
            <p
              data-testid="active-overlay-name"
              className="mt-2 font-display text-xl font-semibold text-white truncate"
            >
              {label}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
              {activeProfile.displayMode} · {activeProfile.widgets} widgets
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-testid="active-overlay-open"
              aria-label={`Abrir overlay ${label}`}
              disabled={overlayRunningWithActive}
              onClick={handleOpen}
              className="btn-primary rounded-lg px-5 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {openLabel}
            </button>
            <button
              type="button"
              data-testid="active-overlay-edit"
              aria-label={`Editar overlay ${label}`}
              onClick={handleEdit}
              className="btn-secondary rounded-lg px-5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              {editLabel}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (hasStaleActiveId) {
    return (
      <section
        data-testid="active-overlay-card"
        className="glass-panel rounded-xl p-6 border border-white/5"
      >
        <h2 className="font-display font-semibold text-lg text-white mb-2">
          Overlay activo
        </h2>
        <p className="text-sm text-vantare-textMuted">
          Tu perfil activo ya no esta disponible. Activa uno en Overlays Studio.
        </p>
        <button
          type="button"
          data-testid="active-overlay-cta"
          onClick={handleGoToProfiles}
          className="mt-4 btn-primary rounded-lg px-5 py-2 text-xs font-bold text-white cursor-pointer"
        >
          Ir a Overlays Studio
        </button>
      </section>
    );
  }

  return (
    <section
      data-testid="active-overlay-card"
      className="glass-panel rounded-xl p-6 border border-white/5"
    >
      <h2 className="font-display font-semibold text-lg text-white mb-2">
        Overlay activo
      </h2>
      <p className="text-sm text-vantare-textMuted">
        Aun no tienes un overlay activo. Crea o activa uno para empezar.
      </p>
      <button
        type="button"
        data-testid="active-overlay-cta"
        onClick={handleGoToProfiles}
        className="mt-4 btn-primary rounded-lg px-5 py-2 text-xs font-bold text-white cursor-pointer"
      >
        Ir a Overlays Studio
      </button>
    </section>
  );
}