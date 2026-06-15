// Profile types mirroring Go pkg/config/profile.go

export type DisplayMode = "racing" | "edit" | "streaming";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WidgetAppearance = {
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  opacity?: number;
  positiveColor?: string;
  negativeColor?: string;
  rpmGreen?: string;
  rpmYellow?: string;
  rpmRed?: string;
  rpmBlue?: string;
  pedalThrottleColor?: string;
  pedalBrakeColor?: string;
  pedalClutchColor?: string;
  posLeaderColor?: string;
  pitColor?: string;
  tireSoftColor?: string;
  tireMediumColor?: string;
  tireHardColor?: string;
  gapAheadColor?: string;
  gapBehindColor?: string;
  classHypercarColor?: string;
  classLmp2Color?: string;
  classLmp3Color?: string;
  classGt3Color?: string;
  classUnknownColor?: string;
};

export type WidgetPropsMap = Record<string, unknown> & {
  appearance?: WidgetAppearance;
  style?: string;
};

export type WidgetConfig = {
  id: string;
  type: string;
  style?: string;
  enabled: boolean;
  updateHz?: number;
  position: Rect;
  props?: WidgetPropsMap;
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

export function getWidgetStyle(widget: WidgetConfig): string {
  return widget.style ?? widget.props?.style ?? "vantare-racing";
}

export function getWidgetStyleFromProps(
  _type: string,
  props?: Record<string, unknown>,
): string {
  return (props?.style as string | undefined) ?? "vantare-racing";
}

export function getWidgetAppearance(props?: Record<string, unknown>): WidgetAppearance {
  if (!props?.appearance) return {};
  if (typeof props.appearance !== "object") return {};
  return props.appearance as WidgetAppearance;
}

// Convert profile widget coords to window-local coords
export function toWindowLocal(
  widgetPos: Rect,
  origin: LayoutOrigin,
): Rect {
  return {
    x: widgetPos.x - origin.x,
    y: widgetPos.y - origin.y,
    w: widgetPos.w,
    h: widgetPos.h,
  };
}

