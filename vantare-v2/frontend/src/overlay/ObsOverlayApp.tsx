import { useEffect, useState, type ComponentType } from "react";
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
import { WidgetHost } from "./WidgetHost";
import { DeltaWidget } from "./widgets/DeltaWidget";
import { RelativeWidget } from "./widgets/RelativeWidget";
import { StandingsWidget } from "./widgets/StandingsWidget";
import { TelemetryWidget } from "./widgets/TelemetryWidget";
import { TelemetryVerticalWidget } from "./widgets/TelemetryVerticalWidget";
import { PedalsWidget } from "./widgets/PedalsWidget";
import { applyOverlayDocumentMode } from "./overlay-document";
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
};

const STREAMING_MODE_HINT = "obs-streaming";

export function ObsOverlayApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [layoutOrigin, setLayoutOrigin] = useState<LayoutOrigin>({ x: 0, y: 0 });
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [telemetryKey, setTelemetryKey] = useState(0);

  useEffect(() => {
    return applyOverlayDocumentMode();
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
  const visibleWidgets = telemetryState
    ? widgets.filter((w) => isWidgetVisible(w, telemetryState))
    : widgets;

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
          <WidgetHost key={w.id} id={w.id} position={localPos}>
            <Component editMode={false} telemetryMode="live" updateHz={w.updateHz} props={{ ...w.props, style: w.style ?? w.props?.style }} />
          </WidgetHost>
        );
      })}
    </div>
  );
}
