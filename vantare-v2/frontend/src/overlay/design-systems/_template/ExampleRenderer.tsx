import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { WidgetViewModelBase } from "../../core/widget-definition";

export function ExampleRenderer({ model, settings, renderMode }: WidgetRendererProps<WidgetViewModelBase>) {
  return (
    <section
      data-widget-system="example-system"
      data-status={model.status}
      data-render-mode={renderMode}
      className="example-system-widget"
    >
      <strong>Example widget</strong>
      <span>{model.statusMessage ?? "Ready"}</span>
      <small>{String(settings.label ?? "default")}</small>
    </section>
  );
}
