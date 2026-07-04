import { useEffect, useState, type ComponentType } from "react";
import { Events } from "@wailsio/runtime";
import type {
  ProfileConfig,
  LayoutOrigin,
  WidgetConfig,
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
import type { WidgetTelemetryMode } from "./widgets/use-widget-telemetry";

type WidgetProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};
const WIDGETS: Record<string, ComponentType<WidgetProps>> = {
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

const STREAMING_MODE_HINT = "obs-streaming";

export function ObsOverlayApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [layoutOrigin, setLayoutOrigin] = useState<LayoutOrigin>({ x: 0, y: 0 });
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [telemetryKey, setTelemetryKey] = useState(0);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  useEffect(() => {
    return applyOverlayDocumentMode();
  }, []);

  useEffect(() => {
    const unsub = Events.On("calendar:reminder", (event: { data: CalendarReminderPayload }) => {
      setReminder(event.data);
    });

    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const profileName = params.get("profile") || "example-streaming.json";
    let es: EventSource | null = null;
    let disposed = false;

    fetch(`/api/profile?profile=${encodeURIComponent(profileName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { profile: ProfileConfig; layoutOrigin: LayoutOrigin }) => {
        if (disposed) return;
        resetTelemetryRef(); // avoid stale telemetry from previous OBS source load
        setProfile(data.profile);
        setLayoutOrigin(data.layoutOrigin);
        setWidgets(data.profile.widgets.filter((w) => w.enabled));

        es = new EventSource("/telemetry/stream");
        es.addEventListener("telemetry", (event: MessageEvent) => {
          try {
            applyTelemetryUpdate(parseTelemetryPayload(event.data));
            setTelemetryKey((k) => k + 1);
          } catch (err) {
            console.error("SSE parse error", err);
          }
        });
        es.onerror = () => {
          console.warn("SSE connection error");
        };
        es.onopen = () => {
          setError(null);
        };
        if (disposed) {
          es.close();
          es = null;
        }
      })
      .catch((err: Error) => {
        if (disposed) return;
        setError(`Failed to load profile: ${err.message}`);
      });

    return () => {
      disposed = true;
      es?.close();
      es = null;
    };
  }, []);

  // telemetryKey is read during render to recompute visibility on telemetry ticks
  const telemetryState = telemetryKey >= 0 ? getCurrentTelemetryState() : undefined;
  const visibleWidgets = (telemetryState
    ? widgets.filter((w) => isWidgetVisible(w, telemetryState))
    : widgets
  ).filter((w) => isRuntimeReadyWidget(w.type));

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-red-400 text-sm font-mono">
        {error}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-sm font-mono">
        Loading overlay...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent" data-vantare-mode={STREAMING_MODE_HINT}>
      {visibleWidgets.map((w) => {
        const Component = WIDGETS[w.type];
        if (!Component) {
          return null;
        }
        const localPos = toWindowLocal(w.position, layoutOrigin);
        return (
          <WidgetHost key={w.id} id={w.id} position={localPos} widget={w} profile={profile}>
            <Component editMode={false} telemetryMode="live" updateHz={w.updateHz} props={{ ...enrichWidgetPropsWithVariant(profile, w), __engineerTransport: "sse" as const }} />
          </WidgetHost>
        );
      })}

      {reminder && (
        <OverlayCalendarReminderBanner
          reminder={reminder}
          onClose={() => setReminder(null)}
          className="absolute top-4 right-4 z-50"
        />
      )}
    </div>
  );
}
