import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type {
  ProfileConfig,
  LayoutOrigin,
  DisplayMode,
  WidgetConfig,
} from "../lib/profile";
import { toWindowLocal } from "../lib/profile";
import {
  applyTelemetryUpdate,
  parseTelemetryPayload,
  resetTelemetryRef,
} from "../lib/telemetry-ref";
import { WidgetHost } from "./WidgetHost";
import { DeltaWidget } from "./widgets/DeltaWidget";
import { RelativeWidget } from "./widgets/RelativeWidget";
import { StandingsWidget } from "./widgets/StandingsWidget";
import { TelemetryWidget } from "./widgets/TelemetryWidget";
import { TelemetryVerticalWidget } from "./widgets/TelemetryVerticalWidget";
import { PedalsWidget } from "./widgets/PedalsWidget";
import { applyOverlayDocumentMode } from "./overlay-document";
import type { ComponentType } from "react";
import type { WidgetTelemetryMode } from "./widgets/use-widget-telemetry";

// Widget registry — maps widget type to component
const WIDGETS: Record<string, ComponentType<{ editMode: boolean; telemetryMode?: WidgetTelemetryMode; updateHz?: number; props?: Record<string, unknown> }>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
  telemetry: TelemetryWidget,
  "telemetry-vertical": TelemetryVerticalWidget,
  pedals: PedalsWidget,
};

export function CompositeApp() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [layoutOrigin, setLayoutOrigin] = useState<LayoutOrigin>({ x: 0, y: 0 });
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);

  useEffect(() => {
    return applyOverlayDocumentMode();
  }, []);

  useEffect(() => {
    const unsubscribe = Events.On("telemetry:update", (event: { data: unknown }) => {
      try {
        applyTelemetryUpdate(parseTelemetryPayload(event.data));
      } catch (err) {
        console.error("telemetry:update parse failed", err);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

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
      } catch (err) {
        console.error("profile:loaded parse failed", err);
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

  if (!profile) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-sm font-mono">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      {widgets.map((w) => {
        const Component = WIDGETS[w.type];
        if (!Component) {
          console.warn(`unknown widget type: ${w.type}`);
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
