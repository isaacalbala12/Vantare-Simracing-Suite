import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { RadarViewModel } from "../../widget-types/radar/radar-view-model-v2";

const CENTER = 110;
const SCALE = 3;

export function RadarFunctional({ model, effects }: WidgetRendererProps<RadarViewModel>) {
  return (
    <section className="vf-radar" data-widget-system="vantare-functional" data-widget-renderer="radar" data-status={model.status} data-effects={effects}>
      {model.available ? (
        <svg className="vf-radar-canvas" viewBox="0 0 220 220" role="img" aria-label="Radar de proximidad" preserveAspectRatio="xMidYMid meet">
          <path className="vf-radar-cross" d="M110 10V210 M10 110H210" />
          <rect className="vf-radar-range" x="20" y="20" width="180" height="180" rx="12" />
          {model.leftOverlap && <path className="vf-radar-side vf-radar-side-active" d="M92 94V126" />}
          {model.rightOverlap && <path className="vf-radar-side vf-radar-side-active" d="M128 94V126" />}
          <rect className="vf-radar-player" x="104" y="97" width="12" height="26" rx="4" />
          {model.cars.map((car) => (
            <rect key={car.id} className="vf-radar-car" data-overlap={car.overlap} x={CENTER - car.x * SCALE - 6} y={CENTER + car.z * SCALE - 13} width="12" height="26" rx="4">
              <title>{car.id}</title>
            </rect>
          ))}
        </svg>
      ) : <span className="vf-radar-unavailable">Sin posición espacial</span>}
    </section>
  );
}
