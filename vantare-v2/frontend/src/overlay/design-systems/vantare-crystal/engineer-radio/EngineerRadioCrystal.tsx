import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { EngineerRadioViewModel } from "../../../widget-types/engineer-radio/engineer-radio-definition";
import "./engineer-radio-crystal.css";

export function EngineerRadioCrystal(
  props: WidgetRendererProps<EngineerRadioViewModel>,
): React.ReactElement | null {
  const { model } = props;
  if (!model.visible || !model.text || !model.speaker || !model.severity) return null;
  const urgent = model.severity === "critical";
  return (
    <section
      className={`vc-engineer-radio vc-engineer-radio--${model.severity}`}
      data-engineer-radio-root
      data-widget-renderer="engineer-radio"
      data-message-id={model.messageId}
      data-role={model.role}
      data-severity={model.severity}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="vc-engineer-radio__rail" aria-hidden="true" />
      <header className="vc-engineer-radio__header">
        <span className="vc-engineer-radio__signal" aria-hidden="true">
          <i /><i /><i />
        </span>
        <span className="vc-engineer-radio__speaker">{model.speaker}</span>
        {model.category ? <span className="vc-engineer-radio__category">{model.category}</span> : null}
      </header>
      <p className="vc-engineer-radio__message">{model.text}</p>
    </section>
  );
}
