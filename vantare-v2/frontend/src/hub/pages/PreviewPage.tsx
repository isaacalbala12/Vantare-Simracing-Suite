// Legacy fallback for the pre-Overlays-Studio preview flow. Do not route to this
// page from HubApp; remove after Overlays Studio has passed manual validation.
import { useEffect, useMemo, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig, LayoutOrigin, DisplayMode, WidgetConfig } from "../../lib/profile";
import { PreviewCanvas } from "../preview/PreviewCanvas";
import { PreviewInspector } from "../preview/PreviewInspector";
import { WidgetList } from "../preview/WidgetList";
import { useDemoMode } from "../../lib/useDemoMode";
import {
  isRunningProfile,
  profileLabel,
  profileTarget,
  type OverlayStatus,
  type ProfileEntry,
} from "../state/overlay-workbench";

type ProfileLoadedEvent = {
  data: {
    profile: ProfileConfig;
    layoutOrigin?: LayoutOrigin;
    windowMode?: DisplayMode;
  };
};

export function PreviewPage() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const nextProfilesRef = useRef<ProfileEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ProfileEntry | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null);
  const [overlayRunning, setOverlayRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoInPit, setDemoInPit] = useState(false);
  const [history, setHistory] = useState<ProfileConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const selectedProfileRunning = selectedEntry
    ? isRunningProfile(selectedEntry, overlayStatus)
    : overlayRunning;

  const obsUrl = useMemo(() => {
    if (!selectedEntry) return "";
    return `${window.location.origin}/overlay?profile=${encodeURIComponent(selectedEntry.file)}&obs=1`;
  }, [selectedEntry]);

  useEffect(() => {
    const unsub = Events.On("profile:loaded", (event: ProfileLoadedEvent) => {
      const loaded = event.data.profile;
      setProfile(loaded);
      setHistory([loaded]);
      setHistoryIndex(0);
      setSelectedWidgetId((current) => current ?? loaded.widgets[0]?.id ?? null);
      setDirty(false);
      setSaveState("idle");
      setPendingProfileId((pending) => {
        if (pending && pending !== loaded.id) return pending;
        return null;
      });
      setSelectedEntry((current) => {
        if (current && current.id === loaded.id) return current;
        const fromList = nextProfilesRef.current.find((entry) => entry.id === loaded.id);
        if (fromList) return fromList;
        if (!loaded.id) return current;
        // hub:profiles may arrive after profile:loaded. Build a temporary entry
        // so the start button is never blocked by event ordering. Once the list
        // arrives it will replace this entry with the real one (same id).
        return {
          id: loaded.id,
          file: loaded.id + ".json",
          name: loaded.name,
          displayMode: loaded.displayMode,
          widgets: loaded.widgets.length,
        };
      });
    });
    const unsubSaved = Events.On("layout:saved", () => {
      setSaveState("saved");
      setDirty(false);
      setLastError(null);
    });
    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const data = event.data as { message?: string };
      setSaveState("error");
      setPendingProfileId(null);
      setLastError(data?.message ?? "Error del hub");
    });
    const unsubOverlayStatus = Events.On("overlay:status", (event: { data: unknown }) => {
      const data = event.data as OverlayStatus;
      setOverlayStatus(data);
      setOverlayRunning(Boolean(data?.running));
    });
    const unsubProfiles = Events.On("hub:profiles", (event: { data: unknown }) => {
      const data = event.data as { profiles?: ProfileEntry[] };
      const nextProfiles = data.profiles ?? [];
      nextProfilesRef.current = nextProfiles;
      setProfiles(nextProfiles);
      setSelectedEntry((current) => {
        if (current) {
          return nextProfiles.find((entry) => entry.id === current.id) ?? current;
        }
        return nextProfiles[0] ?? null;
      });
    });

    Events.Emit("hub:list");
    Events.Emit("profile:request");

    return () => {
      unsub();
      unsubSaved();
      unsubError();
      unsubOverlayStatus();
      unsubProfiles();
    };
  }, []);

  useDemoMode(demoMode, 20, demoInPit);

  // Disable demo mode when live telemetry arrives
  useEffect(() => {
    if (!demoMode) return;
    const unsubDemo = Events.On("telemetry:update", () => {
      setDemoMode(false);
    });
    return () => unsubDemo();
  }, [demoMode]);

  // ---- Undo/Redo ----

  function undo() {
    if (historyIndex <= 0 || !history.length) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setProfile(history[nextIndex]);
    setDirty(true);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setProfile(history[nextIndex]);
    setDirty(true);
  }

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (e.key === "s") {
        e.preventDefault();
        saveProfile();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIndex, history, profile, dirty]);

  // Auto-save after 800ms of inactivity when dirty
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => saveProfile(), 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, dirty]);

  // ---- Widget handlers ----

  function duplicateWidget(widget: WidgetConfig) {
    if (!profile) return;
    const copy: WidgetConfig = {
      ...widget,
      id: crypto.randomUUID(),
      name: widget.name ? `${widget.name} copy` : `${widget.id} copy`,
    };
    updateDraft({ ...profile, widgets: [...profile.widgets, copy] });
  }

  function resetWidget(widget: WidgetConfig) {
    if (!profile) return;
    const reset = { ...widget, position: { ...widget.position, x: 0, y: 0 } };
    updateDraft({
      ...profile,
      widgets: profile.widgets.map((w) => (w.id === reset.id ? reset : w)),
    });
  }

  function deleteWidget(id: string) {
    if (!profile) return;
    updateDraft({ ...profile, widgets: profile.widgets.filter((w) => w.id !== id) });
    if (selectedWidgetId === id) setSelectedWidgetId(null);
  }

  function addWidget(type: string) {
    if (!profile) return;
    const newWidget: WidgetConfig = {
      id: crypto.randomUUID(),
      type,
      name: `Nuevo ${type}`,
      enabled: true,
      position: { x: 0, y: 0, w: 200, h: 100 },
      updateHz: 60,
    };
    updateDraft({ ...profile, widgets: [...profile.widgets, newWidget] });
    setSelectedWidgetId(newWidget.id);
  }

  function activateProfile(entry: ProfileEntry) {
    if (overlayStatus?.running) return;
    setPendingProfileId(entry.id);
    setLastError(null);
    setSaveState("idle");
    setDirty(false);
    Events.Emit("hub:activate", profileTarget(entry));
  }
  function updateDraft(nextProfile: ProfileConfig) {
    if (overlayRunning) return;
    setHistory((prev) => {
      const nextHistory = prev.slice(0, historyIndex + 1);
      nextHistory.push(nextProfile);
      return nextHistory;
    });
    setHistoryIndex((prev) => prev + 1);
    setProfile(nextProfile);
    setDirty(true);
    setSaveState("idle");
    setLastError(null);
  }

  function saveProfile() {
    if (!profile || overlayRunning || !dirty) return;
    setSaveState("saving");
    setLastError(null);
    Events.Emit("layout:save", { widgets: profile.widgets });
  }

  function startSelectedProfile() {
    if (!selectedEntry || dirty || saveState === "saving" || pendingProfileId) return;
    setLastError(null);
    Events.Emit("overlay:start", profileTarget(selectedEntry));
  }

  function stopOverlay() {
    Events.Emit("overlay:stop");
  }

  function copyObsUrl() {
    if (!obsUrl) return;
    navigator.clipboard.writeText(obsUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }

  const selectedWidget = profile?.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-display font-bold text-3xl text-white mb-2">Preview</h1>
            <p className="text-vantare-textMuted text-sm">
              Elige un perfil, ajusta widgets, guarda y arranca el overlay.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedEntry?.displayMode === "streaming" && (
              <button
                type="button"
                onClick={copyObsUrl}
                className="btn-secondary px-4 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-2"
                title={obsUrl}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {copiedUrl ? "Copiado" : "URL OBS"}
              </button>
            )}
            <div className="text-xs font-mono text-vantare-textMuted">
              {saveState === "saving" && "Guardando..."}
              {saveState === "saved" && "Guardado"}
              {saveState === "error" && "Error al guardar"}
              {saveState === "idle" && dirty && "Cambios sin guardar"}
            </div>
            <button
              type="button"
              onClick={saveProfile}
              disabled={overlayRunning || !dirty || saveState === "saving"}
              className="btn-secondary px-4 py-2 rounded-lg text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Guardar
            </button>
            {selectedProfileRunning ? (
              <button
                type="button"
                onClick={stopOverlay}
                className="btn-secondary px-5 py-2 rounded-lg text-xs font-bold text-white"
              >
                Detener overlay
              </button>
            ) : (
              <button
                type="button"
                onClick={startSelectedProfile}
                disabled={!selectedEntry || dirty || saveState === "saving" || Boolean(pendingProfileId)}
                className="btn-primary px-5 py-2 rounded-lg text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Abrir overlay
              </button>
            )}
            <div className="w-px h-6 bg-white/10" />
            <button
              type="button"
              onClick={() => setDemoMode(!demoMode)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                demoMode
                  ? "bg-vantare-red-500 text-white"
                  : "border border-white/10 text-vantare-textMuted hover:text-white"
              }`}
            >
              Demo {demoMode ? "ON" : "OFF"}
            </button>
            {demoMode && (
              <button
                type="button"
                onClick={() => setDemoInPit(!demoInPit)}
                className="border border-white/10 px-3 py-2 rounded-lg text-xs font-bold text-vantare-textMuted hover:text-white transition-colors"
              >
                {demoInPit ? "In Pit" : "On Track"}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {profiles.map((entry) => {
            const isSelected = selectedEntry?.id === entry.id;
            const isPending = pendingProfileId === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => activateProfile(entry)}
                disabled={overlayRunning}
                className={`shrink-0 rounded-lg border px-4 py-2 text-left text-xs transition-colors ${
                  isSelected || isPending
                    ? "border-vantare-red-500 bg-vantare-red-950/30 text-white"
                    : "border-white/10 bg-black/30 text-vantare-textMuted hover:text-white"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="block font-bold">{profileLabel(entry)}</span>
                <span className="block font-mono text-[10px] text-vantare-textDim">
                  {entry.displayMode} · {entry.widgets} widgets
                  {isPending && " · cargando..."}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {lastError && (
        <div className="mb-4 glass-panel rounded-lg border border-vantare-red-500/30 px-4 py-3 text-sm text-vantare-red-400">
          {lastError}
        </div>
      )}

      {overlayRunning && (
        <div className="mb-4 glass-panel rounded-lg border border-vantare-red-500/30 px-4 py-3 text-sm text-vantare-textMuted">
          Detén el overlay antes de editar el preview.
        </div>
      )}

      {!profile && (
        <div className="glass-panel rounded-xl p-8 text-vantare-textMuted text-sm">
          Selecciona un perfil en Overlays o desde el selector de arriba.
        </div>
      )}

      {profile && (
        <div className="grid grid-cols-1 2xl:grid-cols-[220px_1fr_320px] gap-6">
          <WidgetList
            widgets={profile.widgets}
            selectedWidgetId={selectedWidgetId}
            onSelectWidget={setSelectedWidgetId}
            onAddWidget={addWidget}
          />
          <PreviewCanvas
            profile={profile}
            selectedWidgetId={selectedWidgetId}
            onSelectWidget={setSelectedWidgetId}
            onChangeProfile={updateDraft}
            disabled={overlayRunning}
          />
          <PreviewInspector
            profile={profile}
            widget={selectedWidget}
            onChangeProfile={updateDraft}
            onDuplicate={duplicateWidget}
            onReset={resetWidget}
            onDelete={deleteWidget}
            disabled={overlayRunning}
          />
        </div>
      )}
    </div>
  );
}
