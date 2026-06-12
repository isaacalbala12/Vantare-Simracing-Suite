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
} from "../lib/telemetry-ref";
import { WidgetHost } from "./WidgetHost";
import { DeltaWidget } from "./widgets/DeltaWidget";
import { RelativeWidget } from "./widgets/RelativeWidget";
import { StandingsWidget } from "./widgets/StandingsWidget";

type WidgetProps = { editMode: boolean; props?: Record<string, unknown> };
const WIDGETS: Record<string, ComponentType<WidgetProps>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
};

const STREAMING_MODE_HINT = "obs-streaming";

export function ObsOverlayApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [layoutOrigin, setLayoutOrigin] = useState<LayoutOrigin>({ x: 0, y: 0 });
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("desktop-overlay");
    return () => document.body.classList.remove("desktop-overlay");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const profileName = params.get("profile") || "example-streaming.json";
    let cleanup: (() => void) | null = null;
    let disposed = false;

    fetch(`/api/profile?profile=${encodeURIComponent(profileName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { profile: ProfileConfig; layoutOrigin: LayoutOrigin }) => {
        setProfile(data.profile);
        setLayoutOrigin(data.layoutOrigin);
        setWidgets(data.profile.widgets.filter((w) => w.enabled));

        const es = new EventSource("/telemetry/stream");
        es.addEventListener("telemetry", (event: MessageEvent) => {
          try {
            applyTelemetryUpdate(parseTelemetryPayload(event.data));
          } catch (err) {
            console.error("SSE parse error", err);
          }
        });
        es.onerror = () => {
          console.warn("SSE connection error");
        };
        if (disposed) {
          es.close();
        }
        return es;
      })
      .then((es) => {
        cleanup = () => es.close();
      })
      .catch((err: Error) => {
        setError(`Failed to load profile: ${err.message}`);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

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
      {widgets.map((w) => {
        const Component = WIDGETS[w.type];
        if (!Component) {
          return null;
        }
        const localPos = toWindowLocal(w.position, layoutOrigin);
        return (
          <WidgetHost
            key={w.id}
            id={w.id}
            position={localPos}
            editMode={false}
          >
            <Component editMode={false} props={w.props} />
          </WidgetHost>
        );
      })}
    </div>
  );
}
