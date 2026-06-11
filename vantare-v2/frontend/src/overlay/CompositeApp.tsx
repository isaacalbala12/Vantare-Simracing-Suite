import { useEffect, useRef, useState, useCallback } from "react";
import { Events } from "@wailsio/runtime";
import type {
  ProfileConfig,
  LayoutOrigin,
  DisplayMode,
  WidgetConfig,
  Rect,
} from "../lib/profile";
import { WidgetHost } from "./WidgetHost";
import { DeltaWidget } from "./widgets/DeltaWidget";
import { RelativeWidget } from "./widgets/RelativeWidget";
import { StandingsWidget } from "./widgets/StandingsWidget";
import type { ComponentType } from "react";

// Widget registry — maps widget type to component
const WIDGETS: Record<string, ComponentType<{ editMode: boolean }>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
};

// Convert profile widget coords to window-local coords
function toWindowLocal(
  widgetPos: Rect,
  origin: LayoutOrigin,
): Rect {
  return {
    x: widgetPos.x - origin.x,
    y: widgetPos.y - origin.y,
    w: widgetPos.w,
    h: widgetPos.h,
  };
}

// Debounced save helper
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(widgets: WidgetConfig[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // @ts-expect-error Wails runtime binding
    window.go?.main?.ProfileService?.SaveLayout?.(widgets);
  }, 300);
}

export function CompositeApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [layoutOrigin, setLayoutOrigin] = useState<LayoutOrigin>({ x: 0, y: 0 });
  const [editMode, setEditMode] = useState(false);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const unsub = Events.On("profile:loaded", (event: { data: unknown }) => {
      try {
        const data = event.data as {
          profile: ProfileConfig;
          layoutOrigin: LayoutOrigin;
          windowMode: DisplayMode;
        };
        setProfile(data.profile);
        setLayoutOrigin(data.layoutOrigin);
        setEditMode(data.windowMode === "edit");
        setWidgets(data.profile.widgets.filter((w) => w.enabled));
      } catch (err) {
        console.error("profile:loaded parse failed", err);
      }
    });

    // Request profile from Go on mount
    // @ts-expect-error Wails runtime binding
    window.go?.main?.ProfileService?.GetProfile?.().then(
      (p: ProfileConfig) => {
        if (p) {
          setProfile(p);
          setWidgets(p.widgets.filter((w) => w.enabled));
          setEditMode(p.displayMode === "edit");
        }
      },
    );

    return () => {
      unsub?.();
    };
  }, []);

  const handleDragEnd = useCallback(
    (id: string, newPos: Rect) => {
      setWidgets((prev) => {
        const updated = prev.map((w) =>
          w.id === id
            ? { ...w, position: { x: newPos.x + layoutOrigin.x, y: newPos.y + layoutOrigin.y, w: newPos.w, h: newPos.h } }
            : w,
        );
        debouncedSave(updated);
        return updated;
      });
    },
    [layoutOrigin],
  );

  if (!profile) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-sm font-mono">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {widgets.map((w) => {
        const Component = WIDGETS[w.type];
        if (!Component) {
          console.warn(`unknown widget type: ${w.type}`);
          return null;
        }
        const localPos = toWindowLocal(w.position, layoutOrigin);
        return (
          <WidgetHost
            key={w.id}
            id={w.id}
            position={localPos}
            editMode={editMode}
            onDragEnd={handleDragEnd}
          >
            <Component editMode={editMode} />
          </WidgetHost>
        );
      })}
    </div>
  );
}
