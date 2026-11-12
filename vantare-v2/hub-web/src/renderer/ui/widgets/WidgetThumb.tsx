import "./widget-thumbnails.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WidgetKind } from "../../../contract/generated/contract";
import { studioSizes } from "../../../contract/generated/studio";
import { widgetThumbText as t } from "../../i18n/widget-thumbnails";
import { Badge, Skeleton } from "../Data";
import { illustrationSizes, widgetIllustrations } from "./illustrations";
import { widgetIcons, widgetRasters } from "./widget-assets";

export function fallbackGeometry(
  kind: WidgetKind,
  width: number,
  height: number,
) {
  const { width: w, height: h } = illustrationSizes[kind];
  // Allow enlargement. Keep at least 60% of useful height for the drawing itself;
  // 65% includes its small stroke margin. Wide drawings crop rather than distort.
  const scale = Math.max(Math.min(width / w, height / h), (height * 0.65) / h);
  return { width: w * scale, height: h * scale, cropped: w * scale > width };
}
/** Stage drawings fit without cropping; real raster previews still never upscale. */
export function stageGeometry(kind: WidgetKind, width: number, height: number) {
  const natural = illustrationSizes[kind];
  const scale = Math.max(
    0,
    Math.min(width / natural.width, height / natural.height, 2.6),
  );
  return {
    width: natural.width * scale,
    height: natural.height * scale,
    cropped: false,
  };
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
  fit = "contain",
}: {
  kind: WidgetKind;
  icon?: boolean;
  onFallback?: (fallback: boolean) => void;
  fit?: "contain" | "fill";
}) {
  const iconSource = widgetIcons[`../../assets/widgets/w-${kind}.svg`];
  const source = widgetRasters[`../../assets/widgets/thumbs/${kind}.png`];
  return icon ? (
    <span
      aria-hidden="true"
      className="v-widget-icon"
      style={{ maskImage: `url("${iconSource}")` }}
    />
  ) : (
    <WidgetImage
      key={source ?? kind}
      kind={kind}
      source={source}
      onFallback={onFallback}
      fit={fit}
    />
  );
}
function WidgetImage({
  source,
  kind,
  onFallback,
  fit,
}: {
  source?: string;
  kind: WidgetKind;
  onFallback?: (fallback: boolean) => void;
  fit: "contain" | "fill";
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const raster = !!source && state !== "error";
  const Illustration = widgetIllustrations[kind];
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
            objectFit: fit,
            visibility: raster && state === "loading" ? "hidden" : undefined,
          }}
          onLoad={() => setState("ready")}
          onError={() => {
            if (raster) setState("error");
          }}
        />
      ) : (
        <Illustration
          aria-hidden="true"
          className="v-widget-thumbnail"
          data-fallback="true"
          preserveAspectRatio={fit === "fill" ? "none" : undefined}
        />
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
  stage = false,
}: {
  kind: WidgetKind;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  unverified?: boolean;
  small?: boolean;
  stage?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(
    !widgetRasters[`../../assets/widgets/thumbs/${kind}.png`],
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
    ? (stage ? stageGeometry : fallbackGeometry)(kind, area.width, area.height)
    : thumbnailGeometry(kind, area.width, area.height, small ? 20 : 32);
  return (
    <div
      ref={ref}
      className="v-widget-preview"
      data-hidden={!visible}
      data-small={small}
      data-stage={stage}
    >
      <span
        className="v-widget-thumb-frame"
        data-cropped={size.cropped}
        style={{
          width: size.cropped ? "100%" : size.width,
          height: size.height,
          opacity:
            (opacity / 100) *
            (!visible ? (stage ? 0.32 : 0.45) : locked ? 0.45 : 1),
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
