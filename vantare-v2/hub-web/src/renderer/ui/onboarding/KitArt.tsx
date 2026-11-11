import {
  onboardingWidgets,
  type WidgetKind,
} from "../../../contract/generated/onboarding";
import sizes from "../../assets/onboarding/previews.json";
import { onboardingText as t } from "../../i18n/onboarding";
import { WidgetArtwork } from "../home/LayoutPreview";

// Frozen art.rs placements and per-widget preview scales, in design pixels.
const placement: Record<WidgetKind, readonly [number, number, number]> = {
  standings: [24, 26, 0.48],
  relative: [264, 348, 0.8],
  delta: [286, 26, 1],
  pedals: [640, 325, 0.48],
  "racing-flags": [286, 125, 0.35],
  "head-to-head": [280, 240, 0.48],
  "fuel-strategy": [24, 230, 0.48],
  "track-weather": [24, 390, 0.48],
  "broadcast-tower": [580, 26, 0.48],
  "track-map": [555, 240, 0.48],
};
export function KitArt({
  kit,
  summary = false,
}: {
  kit: readonly WidgetKind[];
  summary?: boolean;
}) {
  const widgets = onboardingWidgets.filter(({ kind }) => kit.includes(kind));
  const label = t.widgetsSummary(
    widgets.length,
    widgets.filter((widget) => !widget.free).length,
  );
  return (
    <div className="v-ob-kit">
      <div className="v-ob-kit-head">
        <h2 className="v-ob-kit-title">
          {summary ? t.yourOverlay : t.yourWidgets}
        </h2>
        <span className="v-ob-kit-total">{label.toUpperCase()}</span>
      </div>
      <div className="v-ob-kit-screen">
        {widgets.map(({ kind }) => {
          const [x, y, scale] = placement[kind];
          const [width, height] = sizes[kind];
          return (
            <WidgetArtwork
              key={kind}
              kind={kind}
              className="v-ob-kit-widget"
              style={{
                position: "absolute",
                left: `calc(${x} * var(--ob-unit))`,
                top: `calc(${y} * var(--ob-unit))`,
                width: `calc(${width * scale} * var(--ob-unit))`,
                height: `calc(${height * scale} * var(--ob-unit))`,
              }}
            />
          );
        })}
      </div>
      <div className="v-ob-kit-chips">
        {widgets.map(({ kind, label, free }) => (
          <span className="v-ob-kit-chip" key={kind}>
            {label}
            {!free && <strong className="v-ob-kit-pro">{t.pro}</strong>}
          </span>
        ))}
      </div>
    </div>
  );
}
