import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { deltaDefinition } from "../overlay/widget-types/delta/delta-definition";
import type { StudioProfileClient } from "../hub/overlay-studio/state/studio-profile-client";

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

export function createInMemoryStudioProfileClient(): StudioProfileClient {
  let revision = "rev-harness-1";
  let document = structuredClone(buildStudioHarnessDocument());

  return {
    load: async () => ({
      document: structuredClone(document),
      revision,
    }),
    save: async (input) => {
      document = structuredClone(input.document);
      revision = `rev-harness-${Date.now()}`;
      return { status: "saved", document: structuredClone(document), revision };
    },
  };
}