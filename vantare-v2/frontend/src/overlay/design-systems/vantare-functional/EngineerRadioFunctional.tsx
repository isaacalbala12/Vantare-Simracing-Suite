import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { EngineerRadioViewModel } from "../../widget-types/engineer-radio/engineer-radio-definition";

export function EngineerRadioFunctional({ model }: WidgetRendererProps<EngineerRadioViewModel>) {
  if (!model.visible || !model.text || !model.speaker || !model.severity) return null;
  const urgent = model.severity === "critical";
  return (
    <section
      className={`vf-engineer-radio vf-engineer-radio--${model.severity}`}
      data-widget-system="vantare-functional"
      data-widget-renderer="engineer-radio"
      data-message-id={model.messageId}
      data-role={model.role}
      data-severity={model.severity}
      data-preview={model.preview ? "true" : undefined}
      lang={model.locale}
      role={model.announce ? (urgent ? "alert" : "status") : "group"}
      aria-live={model.announce ? (urgent ? "assertive" : "polite") : undefined}
      aria-atomic="true"
    >
      <header className="vf-engineer-radio-header">
        <span className="vf-engineer-radio-signal" aria-hidden="true">
          <i /><i /><i />
        </span>
        <span className="vf-engineer-radio-speaker">{model.speaker}</span>
        {model.category ? <span className="vf-engineer-radio-category">{model.category}</span> : null}
      </header>
      <p className="vf-engineer-radio-message">{model.text}</p>
      {model.preview ? <span className="vf-engineer-radio-preview">PREVIEW</span> : null}
    </section>
  );
}
