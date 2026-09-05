import { useMemo } from "react";
import { buildAuthoringV2ScenarioRuntime } from "../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import { createTelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";
import { OverlayStudioV3 } from "../hub/overlay-studio/OverlayStudioV3";
import { ConnectedStudioProvider } from "../hub/overlay-studio/state/studio-store";
import {
  createInMemoryStudioProfileClient,
  type StudioHarnessPrimaryWidget,
} from "./studio-profile-fixture";

const HARNESS_PROFILE_FILE = "profiles/harness.json";

function parseHarnessSearch(search: string): {
  primaryWidget: StudioHarnessPrimaryWidget;
  relativeLegacyLayout: boolean;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return {
    primaryWidget: params.get("widget") === "relative" ? "relative" : "delta",
    relativeLegacyLayout: params.get("layout") === "legacy",
  };
}

export function OverlayStudioV3HarnessPage({ search }: { search: string }): React.ReactElement {
  const harnessSearch = parseHarnessSearch(search);
  const client = useMemo(
    () =>
      createInMemoryStudioProfileClient(HARNESS_PROFILE_FILE, harnessSearch.primaryWidget, {
        relativeLegacyLayout: harnessSearch.relativeLegacyLayout,
      }),
    [harnessSearch.primaryWidget, harnessSearch.relativeLegacyLayout],
  );
  const coordinator = useMemo(() => {
    const next = createTelemetryRateCoordinator();
    const runtime = buildAuthoringV2ScenarioRuntime({
      session: "race",
      location: "track",
      state: "ready",
      widget: "delta",
      system: "vantare-endurance",
      variant: "default",
    });
    next.setOverlayFrame(runtime.overlayV2Frame, runtime.overlayV2Source);
    return next;
  }, []);

  return (
    <ConnectedStudioProvider
      client={client}
      initialFile={HARNESS_PROFILE_FILE}
      recoveryStorage={typeof window !== "undefined" ? window.sessionStorage : null}
      recoveryWriteDelayMs={300}
    >
      <OverlayStudioV3
        profiles={[{ id: "profile-harness", name: "Perfil harness", file: HARNESS_PROFILE_FILE }]}
        activeFile={HARNESS_PROFILE_FILE}
        coordinator={coordinator}
        liveAvailable={false}
        browserViewStudioPreview
        recoveryStorage={typeof window !== "undefined" ? window.sessionStorage : null}
        onRequestProfileChange={() => undefined}
      />
    </ConnectedStudioProvider>
  );
}
