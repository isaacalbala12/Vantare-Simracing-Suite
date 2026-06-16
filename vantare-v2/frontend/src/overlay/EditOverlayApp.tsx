import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig, Rect } from "../lib/profile";
import { applyOverlayDocumentMode } from "./overlay-document";
import { WidgetEditFrame } from "./WidgetEditFrame";

export function EditOverlayApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);

  useEffect(() => {
    return applyOverlayDocumentMode();
  }, []);

  useEffect(() => {
    const unsub = Events.On("profile:loaded", (event: { data: { profile?: ProfileConfig } }) => {
      if (event.data.profile) {
        setProfile(event.data.profile);
      }
    });

    const unsubSaved = Events.On("layout:saved", () => {
      Events.Emit("profile:request");
    });

    Events.Emit("profile:request");

    return () => {
      unsub?.();
      unsubSaved?.();
    };
  }, []);

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
    <div className="relative w-screen h-screen overflow-hidden bg-transparent">
      {profile.widgets
        .filter((w) => w.enabled)
        .map((w) => (
          <WidgetEditFrame key={w.id} widget={w} onChange={handleChange} />
        ))}
    </div>
  );
}
