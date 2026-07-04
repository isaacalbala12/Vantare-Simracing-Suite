import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type {
  ProfileConfig,
  LayoutOrigin,
  DisplayMode,
  WidgetConfig,
  Rect,
} from "../lib/profile";
import { toWindowLocal } from "../lib/profile";
import {
  applyTelemetryUpdate,
  parseTelemetryPayload,
  resetTelemetryRef,
} from "../lib/telemetry-ref";
import { isWidgetVisible, getCurrentTelemetryState } from "../lib/visibility";
import { isRuntimeReadyWidget } from "../hub/overlays/widget-catalog";
import { WidgetHost } from "./WidgetHost";
import { WidgetEditFrame } from "./WidgetEditFrame";
import { enrichWidgetPropsWithVariant } from "../lib/widget-variants";
import { DeltaWidget } from "./widgets/DeltaWidget";
import { RelativeWidget } from "./widgets/RelativeWidget";
import { StandingsWidget } from "./widgets/StandingsWidget";
import { TelemetryWidget } from "./widgets/TelemetryWidget";
import { TelemetryVerticalWidget } from "./widgets/TelemetryVerticalWidget";
import { PedalsWidget } from "./widgets/PedalsWidget";
import { EngineerNotificationsWidget } from "./widgets/EngineerNotificationsWidget";
import { BroadcastTowerWidget } from "./widgets/BroadcastTowerWidget";
import { MulticlassRelativeWidget } from "./widgets/MulticlassRelativeWidget";
import { applyOverlayDocumentMode } from "./overlay-document";
import { OverlayCalendarReminderBanner } from "./OverlayCalendarReminderBanner";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import type { ComponentType } from "react";
import type { WidgetTelemetryMode } from "./widgets/use-widget-telemetry";

const WIDGETS: Record<string, ComponentType<{ editMode: boolean; telemetryMode?: WidgetTelemetryMode; updateHz?: number; props?: Record<string, unknown> }>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
  telemetry: TelemetryWidget,
  "telemetry-vertical": TelemetryVerticalWidget,
  pedals: PedalsWidget,
  "engineer-notifications": EngineerNotificationsWidget,
  "broadcast-tower": BroadcastTowerWidget,
  "multiclass-relative": MulticlassRelativeWidget,
};

export function CompositeApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [layoutOrigin, setLayoutOrigin] = useState<LayoutOrigin>({ x: 0, y: 0 });
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [telemetryKey, setTelemetryKey] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  useEffect(() => {
    return applyOverlayDocumentMode();
  }, []);

  useEffect(() => {
    const unsubscribe = Events.On("telemetry:update", (event: { data: unknown }) => {
      try {
        applyTelemetryUpdate(parseTelemetryPayload(event.data));
        if (!editMode) {
          setTelemetryKey((k) => k + 1);
        }
      } catch (err) {
        console.error("telemetry:update parse failed", err);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [editMode]);

  useEffect(() => {
    const unsub = Events.On("profile:loaded", (event: { data: unknown }) => {
      try {
        const data = event.data as {
          profile: ProfileConfig;
          layoutOrigin: LayoutOrigin;
          windowMode: DisplayMode;
        };
        resetTelemetryRef(); // avoid stale telemetry from previous profile/session
        setProfile(data.profile);
        setLayoutOrigin(data.layoutOrigin);
        setWidgets(data.profile.widgets.filter((w) => w.enabled));
        setEditMode(data.windowMode === "edit");
      } catch (err) {
        console.error("profile:loaded parse failed", err);
      }
    });

    Events.Emit("profile:request");

    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    // P1-NEW mitigation: while editing in-place, do not auto-refresh the whole
    // overlay after every autosave. The edit chrome stays mounted and the user
    // keeps the drag/resize context without a full flash/re-render.
    const unsubSaved = Events.On("layout:saved", () => {
      if (!editMode) {
        Events.Emit("profile:request");
      }
    });

    return () => {
      unsubSaved?.();
    };
  }, [editMode]);

  useEffect(() => {
    const unsub = Events.On("overlay:edit-mode-changed", (event: { data: { mode?: string } }) => {
      setEditMode(event.data?.mode === "edit");
    });

    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const unsub = Events.On("calendar:reminder", (event: { data: CalendarReminderPayload }) => {
      setReminder(event.data);
    });

    return () => {
      unsub?.();
    };
  }, []);

  function handleChange(widgetId: string, rect: Rect) {
    if (!profile) return;
    const next: ProfileConfig = {
      ...profile,
      widgets: profile.widgets.map((w) => (w.id === widgetId ? { ...w, position: rect } : w)),
    };
    setProfile(next);
    setWidgets(next.widgets.filter((w) => w.enabled));
    Events.Emit("layout:save", { widgets: next.widgets });
  }

  // telemetryKey is read during render to recompute visibility on telemetry ticks
  const telemetryState = telemetryKey >= 0 ? getCurrentTelemetryState() : undefined;

  if (!profile) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-sm font-mono">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      {editMode
        ? widgets.filter((w) => isRuntimeReadyWidget(w.type)).map((w) => {
            const enrichedWidget = { ...w, props: { ...enrichWidgetPropsWithVariant(profile, w) } };
            return <WidgetEditFrame key={w.id} widget={enrichedWidget} onChange={handleChange} />;
          })
        : (telemetryState ? widgets.filter((w) => isWidgetVisible(w, telemetryState)) : widgets)
            .filter((w) => isRuntimeReadyWidget(w.type))
            .map((w) => {
            const Component = WIDGETS[w.type];
            if (!Component) {
              console.warn(`unknown widget type: ${w.type}`);
              return null;
            }
            const localPos = toWindowLocal(w.position, layoutOrigin);
            return (
              <WidgetHost key={w.id} id={w.id} position={localPos} widget={w} profile={profile}>
                <Component editMode={false} telemetryMode="live" updateHz={w.updateHz} props={{ ...enrichWidgetPropsWithVariant(profile, w), __engineerTransport: "wails" as const }} />
              </WidgetHost>
            );
          })}

      {!editMode && reminder && (
        <OverlayCalendarReminderBanner
          reminder={reminder}
          onClose={() => setReminder(null)}
          className="absolute top-4 right-4 z-50"
        />
      )}

      {editMode && (
        <div className="fixed bottom-4 left-4 text-[10px] text-white/30 select-none" data-testid="edit-mode-hint">
          Ctrl+Shift+E para salir · arrastra y redimensiona
        </div>
      )}
    </div>
  );
}
