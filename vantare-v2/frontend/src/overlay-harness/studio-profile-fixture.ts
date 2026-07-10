import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { deltaDefinition } from "../overlay/widget-types/delta/delta-definition";
import type { StudioProfileClient } from "../hub/overlay-studio/state/studio-profile-client";
import { setHarnessBrowserViewProfile } from "./harness-browser-view-store";
import { syncHarnessBrowserViewProfile } from "./harness-profile-sync";

export function buildStudioHarnessDocument(): ProfileDocumentV3 {
  const delta = deltaDefinition.createDefault("delta-main");
  delta.layout = { ...delta.layout, x: 120, y: 96, w: 420, h: 180, zIndex: 1 };
  return {
    schemaVersion: 3,
    id: "profile-harness",
    name: "Perfil harness",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [delta],
      },
    },
  };
}

export function createInMemoryStudioProfileClient(profileFile: string): StudioProfileClient {
  let revision = "rev-harness-1";
  let document = structuredClone(buildStudioHarnessDocument());

  const publishHarnessProfile = async (nextDocument: ProfileDocumentV3) => {
    setHarnessBrowserViewProfile(profileFile, nextDocument);
    await syncHarnessBrowserViewProfile(profileFile, nextDocument);
  };

  void publishHarnessProfile(document);

  return {
    load: async () => {
      const loaded = structuredClone(document);
      await publishHarnessProfile(loaded);
      return {
        document: loaded,
        revision,
      };
    },
    save: async (input) => {
      document = structuredClone(input.document);
      revision = `rev-harness-${Date.now()}`;
      await publishHarnessProfile(document);
      return { status: "saved", document: structuredClone(document), revision };
    },
  };
}