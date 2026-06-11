// Profile types mirroring Go pkg/config/profile.go

export type DisplayMode = "racing" | "edit" | "streaming";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WidgetConfig = {
  id: string;
  type: string;
  enabled: boolean;
  updateHz?: number;
  position: Rect;
  props?: Record<string, unknown>;
};

export type ProfileConfig = {
  id?: string;
  name?: string;
  displayMode: DisplayMode;
  monitorIndex: number;
  widgets: WidgetConfig[];
};

export type LayoutOrigin = {
  x: number;
  y: number;
};

export type ProfileLoadedPayload = {
  profile: ProfileConfig;
  layoutOrigin: LayoutOrigin;
  windowMode: DisplayMode;
};
