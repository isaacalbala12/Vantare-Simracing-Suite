import type { LayoutOrigin, ProfileConfig, WidgetConfig } from "../lib/profile";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../overlay/core/profile-document";
import { getHarnessBrowserViewProfile } from "./harness-browser-view-store";

export type HarnessProfileApiResponse = {
  profile: ProfileConfig;
  layoutOrigin: LayoutOrigin;
};

function normalizeProfileFileParam(profileParam: string): string {
  const trimmed = profileParam.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith(".json") ? trimmed : `${trimmed}.json`;
}

function legacyStyleFromWidget(widget: WidgetInstanceV3): string {
  const systemId = widget.visual.systemId;
  if (systemId === "vantare-crystal") {
    return "vantare-crystal";
  }
  return "vantare-racing";
}

export function profileDocumentV3ToLegacyProfile(document: ProfileDocumentV3): ProfileConfig {
  const layout = document.layouts.general;
  const widgets: WidgetConfig[] = (layout?.widgets ?? []).map((widget) => ({
    id: widget.id,
    type: widget.type,
    enabled: widget.behavior.enabled,
    updateHz: widget.behavior.updateHz,
    position: {
      x: widget.layout.x,
      y: widget.layout.y,
      w: widget.layout.w,
      h: widget.layout.h,
    },
    props: {
      ...widget.content,
      style: legacyStyleFromWidget(widget),
      appearance: widget.visual.appearanceOverrides,
    },
  }));

  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    name: document.name,
    displayMode: document.displayMode,
    monitorIndex: document.monitorIndex,
    widgets,
  };
}

export function resolveHarnessLayoutOrigin(document: ProfileDocumentV3, grid = 8): LayoutOrigin {
  const widgets = document.layouts.general?.widgets ?? [];
  if (widgets.length === 0) {
    return { x: 0, y: 0 };
  }

  let minX = widgets[0].layout.x;
  let minY = widgets[0].layout.y;
  for (const widget of widgets) {
    minX = Math.min(minX, widget.layout.x);
    minY = Math.min(minY, widget.layout.y);
  }

  return {
    x: Math.floor(minX / grid) * grid,
    y: Math.floor(minY / grid) * grid,
  };
}

export type HarnessProfileLookup = (file: string) => ProfileDocumentV3 | null;

export function buildHarnessProfileApiResponse(
  profileParam: string,
  lookup: HarnessProfileLookup = getHarnessBrowserViewProfile,
): HarnessProfileApiResponse | null {
  const file = normalizeProfileFileParam(profileParam);
  if (!file) {
    return null;
  }

  const document = lookup(file);
  if (!document) {
    return null;
  }

  return {
    profile: profileDocumentV3ToLegacyProfile(document),
    layoutOrigin: resolveHarnessLayoutOrigin(document),
  };
}