// Legacy fallback for the pre-Overlays-Studio profile list. Do not route to this
// page from HubApp; remove after Overlays Studio has passed manual validation.
import { useState, useEffect, useCallback } from "react";
import { Events } from "@wailsio/runtime";
import { profileLabel, type ProfileEntry } from "../state/overlay-workbench";
import { ConfirmDialog } from "../settings/ConfirmDialog";
import type { ProfileConfig } from "../../lib/profile";

type ProfileTarget = {
  id: string;
  file: string;
};

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ProfileConfig | null>(null);
  const [newName, setNewName] = useState("");

  // State for Managing widgets modal
  const [managingTarget, setManagingTarget] = useState<ProfileTarget | null>(null);
  const [managingConfig, setManagingConfig] = useState<ProfileConfig | null>(null);
  const [modalNameInput, setModalNameInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProfileEntry | null>(null);

  useEffect(() => {
    const unsub = Events.On("hub:profiles", (event: { data: unknown }) => {
      try {
        const data = event.data as { profiles: ProfileEntry[] };
        setProfiles(data.profiles ?? []);
        setLoading(false);
      } catch (err) {
        console.error("hub:profiles parse failed", err);
        setLoading(false);
      }
    });

    const unsubCreated = Events.On("hub:profile-created", () => {
      setError(null);
      Events.Emit("hub:list");
    });

    const unsubDeleted = Events.On("hub:profile-deleted", () => {
      setError(null);
      Events.Emit("hub:list");
    });

    const unsubActivationNotif = Events.On("hub:profile-activated", () => {
      setError(null);
    });

    const unsubProfile = Events.On("hub:profile", (event: { data: { profile?: ProfileConfig } }) => {
      if (event.data.profile) {
        setActiveProfile(event.data.profile);
      }
    });

    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const data = event.data as { message?: string };
      if (data?.message) {
        setError(data.message);
        setLoading(false);
      }
    });

    const unsubConfig = Events.On("hub:profile:config", (event: { data: { profile?: ProfileConfig } }) => {
      if (event.data.profile) {
        setManagingConfig(event.data.profile);
        setModalNameInput(event.data.profile.name ?? "");
      }
    });

    const unsubReload = Events.On("hub:profiles:reload", () => {
      Events.Emit("hub:list");
    });

    Events.Emit("hub:list");
    Events.Emit("hub:profile:get");

    return () => {
      unsub();
      unsubCreated();
      unsubDeleted();
      unsubError();
      unsubProfile?.();
      unsubActivationNotif();
      unsubConfig();
      unsubReload();
    };
  }, []);

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) {
      setError("El nombre no puede estar vacío");
      return;
    }
    setError(null);
    setNewName("");
    Events.Emit("hub:create", { name });
  }, [newName]);

  // El borrado se pide en dos tiempos: el confirm nativo del WebView llegaba
  // con el titulo "wails.localhost dice" y no se parecia en nada al Hub.
  const handleDelete = useCallback((profile: ProfileEntry) => {
    setDeleteTarget(profile);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) {
      return;
    }
    setError(null);
    Events.Emit("hub:delete", { id: deleteTarget.id, file: deleteTarget.file });
    setDeleteTarget(null);
  }, [deleteTarget]);

  const handleSelect = useCallback((profile: ProfileEntry) => {
    setError(null);
    Events.Emit("overlay:stop");
    window.setTimeout(() => {
      Events.Emit("overlay:start", { id: profile.id, file: profile.file });
    }, 50);
  }, []);

  const handleEditPosition = useCallback((profile: ProfileEntry) => {
    setError(null);
    Events.Emit("overlay:stop");
    window.setTimeout(() => {
      Events.Emit("overlay:edit:start", { id: profile.id, file: profile.file });
    }, 50);
  }, []);

  const handleOpenManageModal = useCallback((profile: ProfileEntry) => {
    setManagingTarget({ id: profile.id, file: profile.file });
    setManagingConfig(null);
    Events.Emit("hub:profile:get-config", { id: profile.id, file: profile.file });
  }, []);

  const handleCloseManageModal = useCallback(() => {
    setManagingTarget(null);
    setManagingConfig(null);
    Events.Emit("hub:list");
  }, []);

  const handleToggleWidgetInModal = useCallback((widgetId: string, enabled: boolean) => {
    if (!managingConfig) return;
    const nextConfig = {
      ...managingConfig,
      widgets: managingConfig.widgets.map((w) =>
        w.id === widgetId ? { ...w, enabled } : w
      ),
    };
    setManagingConfig(nextConfig);
    Events.Emit("profile:save", { profile: nextConfig });
  }, [managingConfig]);

  const handleRenameInModal = useCallback(() => {
    if (!managingConfig) return;
    const trimmed = modalNameInput.trim();
    if (!trimmed) return;
    const nextConfig = {
      ...managingConfig,
      name: trimmed,
    };
    setManagingConfig(nextConfig);
    Events.Emit("profile:save", { profile: nextConfig });
  }, [managingConfig, modalNameInput]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-display font-bold text-3xl text-white mb-2">Overlays</h1>
            <p className="text-vantare-textMuted text-sm">
              Gestiona tus perfiles. Usa <strong className="text-vantare-text">Abrir overlay</strong> para lanzarlo en escritorio.
            </p>
          </div>
        </div>
      </div>

      {/* Create new profile */}
      <div className="glass-panel rounded-xl p-6 mb-8">
        <h2 className="font-display font-semibold text-lg text-white mb-4">Crear nuevo perfil</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Nombre del perfil (ej: Mi Layout)"
            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-vantare-textDim focus:outline-none focus:border-vantare-red-500/50 transition-colors"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="btn-primary px-6 py-2.5 rounded-lg text-sm font-bold text-white whitespace-nowrap"
          >
            Crear
          </button>
        </div>
        {error && <p className="text-vantare-red-400 text-xs mt-2">{error}</p>}
      </div>

      {/* Profile list */}
      <div className="flex flex-col gap-3">
        {loading && (
          <div className="text-center py-12 text-vantare-textMuted text-sm">Cargando perfiles...</div>
        )}
        {!loading && profiles.length === 0 && (
          <div className="text-center py-12 text-vantare-textMuted text-sm">
            No hay perfiles aún. Crea uno nuevo arriba.
          </div>
        )}
        {profiles.map((p) => {
          const isActive = activeProfile?.id === p.id;
          return (
            <div
              key={p.id}
              className={`card-sleek rounded-xl p-5 relative overflow-hidden group hover:-translate-y-0.5 transition-all ${
                isActive ? "border border-vantare-red-500/30 bg-vantare-red-950/5" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-vantare-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-white text-lg">{profileLabel(p)}</h3>
                      {isActive && (
                        <span className="text-[10px] font-bold text-vantare-red-400 bg-vantare-red-950/40 px-2 py-0.5 rounded border border-vantare-red-500/20">
                          ACTIVO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-vantare-textMuted font-mono mt-0.5">
                      {p.displayMode} · {p.widgets} widgets
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleEditPosition(p)}
                    className="btn-secondary px-4 py-2 rounded-lg text-xs font-medium text-white whitespace-nowrap"
                  >
                    Editar posición
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelect(p)}
                    className="btn-secondary px-4 py-2 rounded-lg text-xs font-medium text-vantare-textMuted hover:text-white whitespace-nowrap"
                  >
                    Abrir overlay
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="btn-secondary px-4 py-2 rounded-lg text-xs font-medium text-vantare-textMuted hover:text-vantare-red-400 whitespace-nowrap"
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenManageModal(p)}
                    className="btn-primary px-4 py-2 rounded-lg text-xs font-bold text-white whitespace-nowrap"
                  >
                    Gestionar widgets
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Centered Modal for Managing Widgets */}
      {managingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="glass-panel rounded-xl w-full max-w-lg border border-white/10 overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-lg text-white">Gestionar widgets</h2>
                <p className="text-[11px] text-vantare-textMuted mt-0.5">
                  ID: {managingTarget.id}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseManageModal}
                className="text-vantare-textMuted hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {!managingConfig ? (
                <div className="text-center py-6 text-sm text-vantare-textMuted">
                  Cargando perfil...
                </div>
              ) : (
                <>
                  {/* Rename Section */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white uppercase tracking-wider block">
                      Nombre del perfil
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={modalNameInput}
                        onChange={(e) => setModalNameInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRenameInModal()}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-vantare-textDim focus:outline-none focus:border-vantare-red-500/50"
                      />
                      <button
                        type="button"
                        onClick={handleRenameInModal}
                        className="btn-secondary px-3 py-2 rounded-lg text-xs font-medium text-white"
                      >
                        Renombrar
                      </button>
                    </div>
                  </div>

                  {/* Profile Metadata */}
                  <div className="grid grid-cols-2 gap-4 p-3 bg-white/5 rounded-lg text-xs">
                    <div>
                      <span className="text-vantare-textMuted block">Modo display:</span>
                      <span className="font-semibold text-white uppercase mt-0.5 block">
                        {managingConfig.displayMode}
                      </span>
                    </div>
                    <div>
                      <span className="text-vantare-textMuted block">Widgets activos:</span>
                      <span className="font-semibold text-white mt-0.5 block">
                        {managingConfig.widgets.filter((w) => w.enabled).length} / {managingConfig.widgets.length}
                      </span>
                    </div>
                  </div>

                  {/* Widgets Checkboxes List */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-white uppercase tracking-wider block">
                      Widgets habilitados
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                      {managingConfig.widgets.map((w) => (
                        <label
                          key={w.id}
                          className="flex items-center gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5 text-xs text-vantare-textMuted cursor-pointer hover:border-white/10 hover:text-white transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={w.enabled}
                            onChange={(e) => handleToggleWidgetInModal(w.id, e.target.checked)}
                            className="accent-vantare-red-500 h-4 w-4 shrink-0"
                          />
                          <div className="truncate">
                            <span className="block font-semibold text-white">{w.id}</span>
                            <span className="block font-mono text-[9px] text-vantare-textDim mt-0.5">
                              ({w.type})
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end">
              <button
                type="button"
                onClick={handleCloseManageModal}
                className="btn-secondary px-5 py-2.5 rounded-lg text-xs font-bold text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="¿Eliminar perfil?"
          cancelLabel="Cancelar"
          confirmLabel="Eliminar"
          testId="profiles-delete-dialog"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        >
          Se borrará <span className="font-semibold text-white">{profileLabel(deleteTarget)}</span> y
          su archivo de configuración. Esta acción no se puede deshacer.
        </ConfirmDialog>
      )}
    </div>
  );
}
