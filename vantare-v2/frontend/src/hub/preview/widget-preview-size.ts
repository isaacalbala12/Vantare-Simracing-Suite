import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";

export type WidgetPreviewBaseSize = {
  width: number;
  height: number;
  mode: "declared" | "intrinsic";
};

export function resolveWidgetPreviewBaseSize(
  profile: ProfileConfig,
  widget: WidgetConfig,
): WidgetPreviewBaseSize {
  const declared = {
    width: widget.position.w,
    height: widget.position.h,
    mode: "declared" as const,
  };

  if (widget.type !== "relative") {
    return declared;
  }

  const props = enrichWidgetPropsWithVariant(profile, widget);
  const columns = props.variant?.columns ?? [];
  if (columns.length === 0) {
    return declared;
  }

  const intrinsicWidth = getRelativeIntrinsicWidth(columns);
  const width = Math.max(widget.position.w, intrinsicWidth);

  return {
    width,
    height: widget.position.h,
    mode: width > widget.position.w ? "intrinsic" : "declared",
  };
}
