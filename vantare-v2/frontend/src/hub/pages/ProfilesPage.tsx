import { useState, useEffect, useCallback } from "react";
import { Events } from "@wailsio/runtime";

type ProfileEntry = {
  id: string;
  file: string;
  name?: string;
  displayMode: string;
  widgets: number;
};

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

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

    const unsubActivated = Events.On("hub:profile-activated", () => {
      setError(null);
    });

    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const data = event.data as { message?: string };
      if (data?.message) {
        setError(data.message);
        setLoading(false);
      }
    });

    Events.Emit("hub:list");

    return () => {
      unsub();
      unsubCreated();
      unsubDeleted();
      unsubError();
      unsubActivated();
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

  const handleDelete = useCallback((profile: ProfileEntry) => {
    const label = profile.name || profile.id;
    if (!window.confirm(`¿Eliminar el perfil "${label}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError(null);
    Events.Emit("hub:delete", { id: profile.id, file: profile.file });
  }, []);

  const handleActivate = useCallback((profile: ProfileEntry) => {
    setError(null);
    Events.Emit("hub:activate", { id: profile.id, file: profile.file });
  }, []);

  const handleExitEdit = useCallback(() => {
    setError(null);
    Events.Emit("profile:set-mode", { mode: "racing" });
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-display font-bold text-3xl text-white mb-2">Overlays</h1>
            <p className="text-vantare-textMuted text-sm">Gestiona tus perfiles de overlay. Crea, activa o elimina configuraciones.</p>
          </div>
          <button
            type="button"
            onClick={handleExitEdit}
            className="btn-secondary px-4 py-2 rounded-lg text-xs font-bold text-white hover:text-vantare-red-300 whitespace-nowrap"
          >
            Salir de edición
          </button>
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
        {profiles.map((p) => (
          <div
            key={p.id}
            className="card-sleek rounded-xl p-5 relative overflow-hidden group hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-vantare-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-white text-lg">{p.name || p.id}</h3>
                  <p className="text-xs text-vantare-textMuted font-mono mt-0.5">
                    {p.displayMode} · {p.widgets} widgets
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleActivate(p)}
                  className="btn-primary px-5 py-2 rounded-lg text-xs font-bold text-white whitespace-nowrap"
                >
                  Activar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="btn-secondary px-4 py-2 rounded-lg text-xs font-medium text-vantare-textMuted hover:text-vantare-red-400 whitespace-nowrap"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
