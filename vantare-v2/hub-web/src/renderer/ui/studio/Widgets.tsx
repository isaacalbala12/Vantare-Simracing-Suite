import { useLayoutEffect, useRef, useState } from "react";
import type {
  OverlayInstance,
  StudioView,
  WidgetKind,
} from "../../../contract/generated/contract";
import { studioSizes } from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
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
export function widgetName(item: OverlayInstance, view: StudioView) {
  const name =
    view.catalog.find((widget) => widget.kind === item.kind)?.name ?? item.kind;
  const same = view.instances.filter((widget) => widget.kind === item.kind);
  return same.length > 1
    ? `${name} ${same.findIndex((widget) => widget.id === item.id) + 1}`
    : name;
}
export function widgetStatus(item: OverlayInstance) {
  const sessions = (["practice", "qualifying", "race"] as const)
    .filter((key) => item.showIn[key])
    .map((key) => t.sessionNames[key]);
  return [
    item.visible ? t.visible : t.hidden,
    item.opacity < 100 ? `${item.opacity} %` : null,
    sessions.length === 3
      ? null
      : sessions.length
        ? t.onlySessions(sessions)
        : t.noSessions,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function WidgetThumb({
  kind,
  icon = false,
}: {
  kind: WidgetKind;
  icon?: boolean;
}) {
  const fallback =
    vectors[`../../assets/widgets/${icon ? "w-" : ""}${kind}.svg`];
  const source = rasters[`../../assets/widgets/thumbs/${kind}.png`];
  return icon ? (
    <span
      aria-hidden="true"
      className="v-studio-widget-icon"
      style={{ maskImage: `url("${fallback}")` }}
    />
  ) : (
    <WidgetImage key={source ?? fallback} source={source} fallback={fallback} />
  );
}
function WidgetImage({
  source,
  fallback,
}: {
  source?: string;
  fallback: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const raster = source && state !== "error";
  return (
    <>
      {raster && state === "loading" && (
        <span className="v-studio-thumb-skeleton">
          <Skeleton label={t.loading} />
        </span>
      )}
      <img
        alt={""}
        aria-hidden="true"
        src={raster ? source : fallback}
        className="v-studio-widget-thumb"
        data-fallback={!raster}
        style={{
          visibility: raster && state === "loading" ? "hidden" : undefined,
        }}
        onLoad={() => setState("ready")}
        onError={() => {
          if (raster) setState("error");
        }}
      />
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
  const size = thumbnailGeometry(
    kind,
    area.width,
    area.height,
    small ? 20 : 32,
  );
  return (
    <div
      ref={ref}
      className="v-studio-preview"
      data-hidden={!visible}
      data-small={small}
    >
      <span
        className="v-studio-thumb-frame"
        data-cropped={size.cropped}
        style={{
          width: size.cropped ? "100%" : size.width,
          height: size.height,
          opacity: (opacity / 100) * (!visible || locked ? 0.45 : 1),
        }}
      >
        <span
          className="v-studio-thumb-image"
          style={{ width: size.width, height: size.height }}
        >
          <WidgetThumb kind={kind} />
        </span>
      </span>
      {locked && (
        <span className="v-studio-plan-badge">
          <Badge tone="locked">{unverified ? t.unverified : t.pro}</Badge>
        </span>
      )}
    </div>
  );
}
export function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.8 8C4 2.7 12 2.7 14.2 8C12 13.3 4 13.3 1.8 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {!visible && (
        <path d="m3 13 10-10" stroke="currentColor" strokeWidth="1.4" />
      )}
      <circle cx="7.9" cy="7.9" r="1.7" fill="currentColor" />
    </svg>
  );
}
