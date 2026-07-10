import { useMemo } from "react";
import { OverlayStudioV3 } from "../hub/overlay-studio/OverlayStudioV3";
import { ConnectedStudioProvider } from "../hub/overlay-studio/state/studio-store";
import { createInMemoryStudioProfileClient } from "./studio-profile-fixture";

const HARNESS_PROFILE_FILE = "profiles/harness.json";

function parseViewportWidth(search: string): number {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("viewport");
  if (!raw) {
    return typeof window !== "undefined" ? window.innerWidth : 1600;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1600;
}

export function OverlayStudioV3HarnessPage({ search }: { search: string }): React.ReactElement {
  const client = useMemo(() => createInMemoryStudioProfileClient(HARNESS_PROFILE_FILE), []);
  const viewportWidth = parseViewportWidth(search);

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
        viewportWidth={viewportWidth}
        browserViewStudioPreview
        recoveryStorage={typeof window !== "undefined" ? window.sessionStorage : null}
        onRequestProfileChange={() => undefined}
        onOpenManageProfiles={() => undefined}
        onOpenRecommended={() => undefined}
        onOpenCommunity={() => undefined}
        onOpenObs={() => undefined}
      />
    </ConnectedStudioProvider>
  );
}