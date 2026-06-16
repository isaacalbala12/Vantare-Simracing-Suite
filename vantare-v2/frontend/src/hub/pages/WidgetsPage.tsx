import { useEffect, useMemo, useState, useCallback } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig } from "../../lib/profile";
import { WidgetPreview } from "../preview/WidgetPreview";
import { PreviewInspector } from "../preview/PreviewInspector";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function WidgetsPage() {
  const [savedProfile, setSavedProfile] = useState<ProfileConfig | null>(null);
  const [workingProfile, setWorkingProfile] = useState<ProfileConfig | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    const unsub = Events.On("hub:profile", (event: { data: { profile?: ProfileConfig } }) => {
      if (event.data.profile) {
        setSavedProfile(event.data.profile);
        setWorkingProfile(event.data.profile);
        setSelectedWidgetId((current) => current ?? event.data.profile?.widgets[0]?.id ?? null);
        setSaveState({ kind: "saved" });
      }
    });

    const unsubSaved = Events.On("profile:saved", () => {
      setSaveState({ kind: "saved" });
    });

    const unsubError = Events.On("hub:error", (event: { data: { message?: string } }) => {
      const message = event.data.message ?? "Error desconocido del servidor";
      setSaveState({ kind: "error", message });
    });

    Events.Emit("hub:profile:get");
    return () => {
      unsub?.();
      unsubSaved?.();
      unsubError?.();
    };
  }, []);

  useEffect(() => {
    if (saveState.kind !== "saved") return;
    const t = window.setTimeout(() => setSaveState({ kind: "idle" }), 1500);
    return () => window.clearTimeout(t);
  }, [saveState.kind]);

  const dirty = useMemo(() => {
    if (!savedProfile || !workingProfile) return false;
    return JSON.stringify(savedProfile) !== JSON.stringify(workingProfile);
  }, [savedProfile, workingProfile]);

  const selectedWidget = useMemo(
    () => workingProfile?.widgets.find((w) => w.id === selectedWidgetId) ?? workingProfile?.widgets[0],
    [workingProfile, selectedWidgetId],
  );

  const handleChangeProfile = useCallback((next: ProfileConfig) => {
    setWorkingProfile(next);
  }, []);

  const handleSave = useCallback(() => {
    if (!workingProfile) return;
    setSaveState({ kind: "saving" });
    Events.Emit("profile:save", { profile: workingProfile });
    // Backend currently returns no explicit ack for profile:save on success;
    // hub:profile is re-emitted by SaveProfile. The timeout just caps the spinner.
    window.setTimeout(() => {
      setSaveState((current) => (current.kind === "saving" ? { kind: "idle" } : current));
    }, 500);
  }, [workingProfile]);

  const handleUndo = useCallback(() => {
    if (!savedProfile) return;
    setWorkingProfile(savedProfile);
    setSelectedWidgetId(savedProfile.widgets[0]?.id ?? null);
  }, [savedProfile]);

  if (!workingProfile) {
    return <div className="p-8 text-vantare-textMuted text-sm">Cargando perfil activo...</div>;
  }

  const saveLabel = saveState.kind === "saving" ? "Guardando..." : "Guardar";
  const saveDisabled = !dirty || saveState.kind === "saving";

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-white mb-2">Widgets</h1>
          <p className="text-vantare-textMuted text-sm">
            Previsualiza y edita cada widget individualmente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && saveState.kind !== "error" && (
            <span className="text-xs font-medium text-vantare-amber-400">Cambios sin guardar</span>
          )}
          {saveState.kind === "saved" && (
            <span className="text-xs font-medium text-green-400">Guardado</span>
          )}
          {saveState.kind === "error" && (
            <span className="text-xs font-medium text-vantare-red-400" title={saveState.message}>
              Error al guardar
            </span>
          )}
          <button
            type="button"
            onClick={handleUndo}
            disabled={!dirty}
            className="btn-secondary px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            className="btn-primary px-5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
          >
            {saveLabel}
          </button>
        </div>
      </div>

      {saveState.kind === "error" && (
        <div className="mb-4 rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/30 px-4 py-3 text-xs text-vantare-red-200">
          {saveState.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_340px] gap-6">
        <aside className="glass-panel rounded-xl p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white mb-3">Lista</h2>
          <div className="flex flex-col gap-2">
            {workingProfile.widgets.map((widget) => (
              <button
                key={widget.id}
                type="button"
                onClick={() => setSelectedWidgetId(widget.id)}
                className={`text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedWidget?.id === widget.id
                    ? "bg-vantare-red-950/40 border border-vantare-red-500/50 text-white"
                    : "bg-black/30 border border-white/5 text-vantare-textMuted hover:text-white"
                }`}
              >
                <span className="block font-semibold">{widget.id}</span>
                <span className="block font-mono text-[10px] text-vantare-textDim">{widget.type}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="glass-panel rounded-xl p-6 flex items-center justify-center min-h-[540px]">
          {selectedWidget ? (
            <WidgetPreview widget={selectedWidget} scale={0.5} />
          ) : (
            <div className="text-vantare-textMuted text-sm">Selecciona un widget</div>
          )}
        </div>

        <aside className="glass-panel rounded-xl p-4">
          {selectedWidget ? (
            <PreviewInspector
              profile={workingProfile}
              widget={selectedWidget}
              onChangeProfile={handleChangeProfile}
              disabled={false}
            />
          ) : (
            <div className="text-vantare-textMuted text-sm">Selecciona un widget para editar</div>
          )}
        </aside>
      </div>
    </div>
  );
}
