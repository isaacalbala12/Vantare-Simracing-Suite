import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig, Rect } from "../lib/profile";
import { applyOverlayDocumentMode } from "./overlay-document";
import { WidgetEditFrame } from "./WidgetEditFrame";

export function EditOverlayApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return applyOverlayDocumentMode();
  }, []);

  useEffect(() => {
    const unsub = Events.On("profile:loaded", (event: { data: { profile?: ProfileConfig } }) => {
      if (event.data.profile) {
        setProfile(event.data.profile);
      }
    });

    const unsubSaved = Events.On("profile:saved", () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    });

    Events.Emit("profile:request");

    return () => {
      unsub?.();
      unsubSaved?.();
    };
  }, []);

  function handleClose() {
    Events.Emit("overlay:stop");
  }

  function handleChange(widgetId: string, rect: Rect) {
    if (!profile) return;
    const next: ProfileConfig = {
      ...profile,
      widgets: profile.widgets.map((w) => (w.id === widgetId ? { ...w, position: rect } : w)),
    };
    setProfile(next);
    Events.Emit("layout:save", {
      widgets: next.widgets,
    });
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center w-screen h-screen text-white/40 text-sm">
        Loading edit mode...
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-transparent" data-testid="edit-overlay-app">
      {profile.widgets
        .filter((w) => w.enabled)
        .map((w) => (
          <WidgetEditFrame key={w.id} widget={w} onChange={handleChange} />
        ))}

      <div className="fixed top-4 right-4 flex items-center gap-3 z-50" data-testid="edit-overlay-toolbar">
        {saved && (
          <span className="text-xs font-medium text-green-400 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10">
            Guardado
          </span>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="text-xs font-bold text-white bg-vantare-red-600 hover:bg-vantare-red-500 px-4 py-2 rounded-lg shadow-lg border border-white/10"
          data-testid="edit-overlay-close"
        >
          Cerrar edición
        </button>
      </div>

      <div className="fixed bottom-4 left-4 text-[10px] text-white/30 select-none">
        {profile.name} · edición · arrastra y redimensiona widgets
      </div>
    </div>
  );
}
