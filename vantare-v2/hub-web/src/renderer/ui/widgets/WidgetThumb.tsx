import "./widget-thumbnails.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WidgetKind } from "../../../contract/generated/contract";
import { studioSizes } from "../../../contract/generated/studio";
import { widgetThumbText as t } from "../../i18n/widget-thumbnails";
import { Badge, Skeleton } from "../Data";

const vectors = import.meta.glob<string>("../../assets/widgets/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const rasters = import.meta.glob<string>("../../assets/widgets/thumbs/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});
// Tight drawing bounds of the frozen 160×80 SVG illustrations, including their stroke.
// They are schematic fallbacks, not captures at the overlays' natural dimensions.
const fallbackBounds: Record<
  WidgetKind,
  readonly [number, number, number, number]
> = {
  standings: [51, 3, 58, 77],
  radar: [49, 3, 62, 74],
  pedals: [63, 5, 34, 70],
  delta: [35, 19, 90, 42],
  "car-damage-visual": [55, 3, 50, 74],
  "input-telemetry": [13, 21, 134, 38],
  "multiclass-relative": [27, 13, 106, 54],
  "broadcast-tower": [3, 29, 154, 22],
  "delta-trace": [3, 17, 154, 46],
  "track-map": [25, 5, 110, 70],
  "track-weather": [47, 11, 66, 58],
  "car-damage-numbers": [55, 5, 50, 70],
  "head-to-head": [35, 8, 90, 64],
  "fuel-strategy": [21, 7, 118, 66],
  "pedals-telemetry": [27, 20, 106, 40],
  relative: [27, 9, 106, 62],
  "racing-flags": [43, 25, 74, 30],
  "fastest-lap": [11, 25, 138, 31.5],
  "session-alerts": [3, 21, 154, 51],
};
export function fallbackGeometry(
  kind: WidgetKind,
  width: number,
  height: number,
) {
  const [, , w, h] = fallbackBounds[kind];
  // Allow enlargement. Keep at least 60% of useful height for the drawing itself;
  // 65% includes its small stroke margin. Wide drawings crop rather than distort.
  const scale = Math.max(Math.min(width / w, height / h), (height * 0.65) / h);
  return { width: w * scale, height: h * scale, cropped: w * scale > width };
}
export function thumbnailGeometry(
  kind: WidgetKind,
  width: number,
  height: number,
  minimum = 32,
) {
  const natural = studioSizes[kind];
  let scale = Math.min(
    Math.max(width, 0) / natural.width,
    Math.max(height, 0) / natural.height,
    1,
  );
  const cropped =
    natural.height * scale < minimum && natural.width > natural.height;
  if (cropped) scale = Math.min(minimum / natural.height, 1);
  return {
    width: natural.width * scale,
    height: natural.height * scale,
    cropped,
  };
}
export function WidgetThumb({
  kind,
  icon = false,
  onFallback,
}: {
  kind: WidgetKind;
  icon?: boolean;
  onFallback?: (fallback: boolean) => void;
}) {
  const fallback =
    vectors[`../../assets/widgets/${icon ? "w-" : ""}${kind}.svg`];
  const source = rasters[`../../assets/widgets/thumbs/${kind}.png`];
  return icon ? (
    <span
      aria-hidden="true"
      className="v-widget-icon"
      style={{ maskImage: `url("${fallback}")` }}
    />
  ) : (
    <WidgetImage
      key={source ?? fallback}
      kind={kind}
      source={source}
      fallback={fallback}
      onFallback={onFallback}
    />
  );
}
function WidgetImage({
  source,
  fallback,
  kind,
  onFallback,
}: {
  source?: string;
  fallback: string;
  kind: WidgetKind;
  onFallback?: (fallback: boolean) => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const raster = !!source && state !== "error";
  useEffect(() => onFallback?.(!raster), [onFallback, raster]);
  return (
    <>
      {raster && state === "loading" && (
        <span className="v-widget-thumbnail-skeleton">
          <Skeleton label={t.loading} />
        </span>
      )}
      {raster ? (
        <img
          alt={""}
          aria-hidden="true"
          src={source}
          className="v-widget-thumbnail"
          data-fallback={!raster}
          style={{
            visibility: raster && state === "loading" ? "hidden" : undefined,
          }}
          onLoad={() => setState("ready")}
          onError={() => {
            if (raster) setState("error");
          }}
        />
      ) : (
        <svg
          aria-hidden="true"
          className="v-widget-thumbnail"
          data-fallback="true"
          viewBox={fallbackBounds[kind].join(" ")}
        >
          <image href={fallback} x={0} y={0} width={160} height={80} />
        </svg>
      )}
    </>
  );
}
export function WidgetPreview({
  kind,
  opacity = 100,
  visible = true,
  locked = false,
  unverified = false,
  small = false,
}: {
  kind: WidgetKind;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  unverified?: boolean;
  small?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(
    !rasters[`../../assets/widgets/thumbs/${kind}.png`],
  );
  const [area, setArea] = useState({ width: 293, height: 132 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width =
        element.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const height =
        element.clientHeight -
        (parseFloat(style.paddingTop) || 0) -
        (parseFloat(style.paddingBottom) || 0);
      if (width > 0 && height > 0)
        setArea((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const size = fallback
    ? fallbackGeometry(kind, area.width, area.height)
    : thumbnailGeometry(kind, area.width, area.height, small ? 20 : 32);
  return (
    <div
      ref={ref}
      className="v-widget-preview"
      data-hidden={!visible}
      data-small={small}
    >
      <span
        className="v-widget-thumb-frame"
        data-cropped={size.cropped}
        style={{
          width: size.cropped ? "100%" : size.width,
          height: size.height,
          opacity: (opacity / 100) * (!visible || locked ? 0.45 : 1),
        }}
      >
        <span
          className="v-widget-thumb-image"
          style={{ width: size.width, height: size.height }}
        >
          <WidgetThumb kind={kind} onFallback={setFallback} />
        </span>
      </span>
      {locked && (
        <span className="v-widget-plan-badge">
          <Badge tone="locked">{unverified ? t.unverified : t.pro}</Badge>
        </span>
      )}
    </div>
  );
}
