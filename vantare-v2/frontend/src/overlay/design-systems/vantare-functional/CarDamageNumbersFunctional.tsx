import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { CarDamageNumbersViewModel } from "../../widget-types/car-damage-numbers/car-damage-numbers-view-model";
import { functionalLabels } from "./labels";

export function CarDamageNumbersFunctional({ model, effects }: WidgetRendererProps<CarDamageNumbersViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;

  const format = (value: number | undefined): string => {
    if (value === undefined) return "—";
    return `${(value * 100).toFixed(0)}%`;
  };

  const items = [
    { id: "aero", label: labels.aero, value: model.aero },
    { id: "body", label: labels.body, value: model.body },
    { id: "suspension", label: labels.suspension, value: model.suspension },
    ...(model.showTyres && model.tyres ? model.tyres.map((t, i) => ({ id: `tyre-${i}`, label: `${labels.tyre} ${i + 1}`, value: t })) : []),
  ] as const;

  return (
    <section className="vf-car-damage-numbers" data-widget-system="vantare-functional" data-widget-renderer="car-damage-numbers" data-status={model.status} data-effects={effects}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      <div className="vf-car-damage-grid" role="group" aria-label={labels.damage}>
        {items.map((item) => (
          <div key={item.id} className="vf-car-damage-slot" data-damage={item.id}>
            <span className="vf-car-damage-label">{item.label}</span>
            <b className="vf-car-damage-value">{format(item.value)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
