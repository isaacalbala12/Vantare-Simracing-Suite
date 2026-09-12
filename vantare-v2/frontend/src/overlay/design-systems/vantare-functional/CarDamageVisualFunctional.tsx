import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { CarDamageVisualViewModel } from "../../widget-types/car-damage-visual/car-damage-visual-view-model";
import { functionalLabels } from "./labels";

const damageFill = (value: number | undefined) => {
  if (value === undefined) return "rgb(245 245 245 / 10%)";
  const intensity = Math.min(1, Math.max(0, value));
  return `rgb(255 42 59 / ${20 + intensity * 60}%)`;
};

export function CarDamageVisualFunctional({ model, effects }: WidgetRendererProps<CarDamageVisualViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  const percent = (value: number | undefined) => value === undefined ? "—" : `${Math.round(value * 100)}%`;

  return (
    <section
      className="vf-car-damage-visual"
      data-widget-system="vantare-functional"
      data-widget-renderer="car-damage-visual"
      data-status={model.status}
      data-effects={effects}
    >
      {statusText ? (
        <p className="vf-status" role="status">{statusText}</p>
      ) : (
        <div className="vf-car-damage-visual-body">
          <svg className="vf-car-damage-visual-car" viewBox="0 0 120 80" aria-label="Car damage">
            <path
              className="vf-car-damage-visual-chassis"
              d="M35 15h50l20 25-5 35H40l-5-35z"
              style={{ fill: damageFill(model.body) }}
            />
            <path
              className="vf-car-damage-visual-aero"
              d="M55 12h15l5 8H50z"
              style={{ fill: damageFill(model.aero) }}
            />
            <rect
              className="vf-car-damage-visual-suspension"
              x="20"
              y="45"
              width="80"
              height="6"
              rx="2"
              style={{ fill: damageFill(model.suspension) }}
            />
          </svg>
          <div className="vf-car-damage-visual-legend">
            {model.showAero !== false && (
              <span className="vf-car-damage-visual-item" data-part="aero">
                <small>{labels.aero}</small>
                <b>{percent(model.aero)}</b>
              </span>
            )}
            <span className="vf-car-damage-visual-item" data-part="body">
              <small>{labels.body}</small>
              <b>{percent(model.body)}</b>
            </span>
            <span className="vf-car-damage-visual-item" data-part="suspension">
              <small>{labels.suspension}</small>
              <b>{percent(model.suspension)}</b>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
