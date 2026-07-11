import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { deltaDefinition } from "../overlay/widget-types/delta/delta-definition";
import { relativeDefinition } from "../overlay/widget-types/relative/relative-definition";
import type { StudioProfileClient } from "../hub/overlay-studio/state/studio-profile-client";
import { setHarnessBrowserViewProfile } from "./harness-browser-view-store";
import { syncHarnessBrowserViewProfile } from "./harness-profile-sync";

export type StudioHarnessPrimaryWidget = "delta" | "relative";

export function buildStudioHarnessDocument(
  primaryWidget: StudioHarnessPrimaryWidget = "delta",
  options?: { relativeLegacyLayout?: boolean },
): ProfileDocumentV3 {
  const widget =
    primaryWidget === "relative"
      ? relativeDefinition.createDefault("relative-main")
      : deltaDefinition.createDefault("delta-main");
  widget.layout = { ...widget.layout, x: 120, y: 96, zIndex: 1 };
  if (primaryWidget === "delta") {
    widget.layout = { ...widget.layout, w: 420, h: 180 };
  }
  if (primaryWidget === "relative" && options?.relativeLegacyLayout) {
    widget.layout = { ...widget.layout, w: 430, h: 300 };
  }
  return {
    schemaVersion: 3,
    id: "profile-harness",
    name: "Perfil harness",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget],
      },
    },
  };
}

export function createInMemoryStudioProfileClient(
  profileFile: string,
  primaryWidget: StudioHarnessPrimaryWidget = "delta",
  options?: { relativeLegacyLayout?: boolean },
): StudioProfileClient {
  let revision = "rev-harness-1";
  let document = structuredClone(buildStudioHarnessDocument(primaryWidget, options));

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