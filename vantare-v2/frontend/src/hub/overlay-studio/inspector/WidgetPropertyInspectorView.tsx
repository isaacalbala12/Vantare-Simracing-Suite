import type { AccessContext } from "../../../lib/access-policy";
import type { SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import type { StudioCommand } from "../state/studio-command";
import { getStudioMutationGate, type StudioMutation } from "../access/studio-access";
import { AppearanceSection } from "./AppearanceSection";
import { BehaviorSection } from "./BehaviorSection";
import { ContentSection } from "./ContentSection";

export type WidgetPropertySectionId = "appearance" | "content" | "behavior";

export type WidgetPropertyInspectorViewProps = {
  sectionId: WidgetPropertySectionId;
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  snapshot: TelemetrySnapshot;
  access: AccessContext;
  disabled?: boolean;
  dispatch(command: StudioCommand): void;
};

const SECTION_MUTATION: Record<WidgetPropertySectionId, StudioMutation> = {
  appearance: "visual",
  content: "content",
  behavior: "behavior",
};

/**
 * Vista prop-driven del inspector para las secciones de propiedades
 * (appearance, content, behavior). No consume contexts del Studio, telemetria
 * ni Wails: recibe todo por props y aplica el gate de mutacion por plan.
 * Compartida por StudioInspector (Hub) y el panel flotante del overlay.
 */
export function WidgetPropertyInspectorView(props: WidgetPropertyInspectorViewProps): React.ReactElement {
  const { sectionId, widget, session, snapshot, access, disabled = false, dispatch } = props;
  const mutation = SECTION_MUTATION[sectionId];
  const gate = getStudioMutationGate({ access, mutation, widget });
  const sectionDisabled = disabled || !gate.allowed;

  const dispatchChecked = (command: StudioCommand): void => {
    if (sectionDisabled) {
      return;
    }
    dispatch(command);
  };

  return (
    <div data-testid="widget-property-inspector" data-widget-id={widget.id}>
      <fieldset disabled={sectionDisabled ? true : undefined}>
        {sectionId === "appearance" ? (
          <AppearanceSection widget={widget} session={session} dispatch={dispatchChecked} />
        ) : null}
        {sectionId === "content" ? (
          <ContentSection widget={widget} session={session} dispatch={dispatchChecked} disabled={sectionDisabled} />
        ) : null}
        {sectionId === "behavior" ? (
          <BehaviorSection widget={widget} session={session} snapshot={snapshot} dispatch={dispatchChecked} />
        ) : null}
      </fieldset>
    </div>
  );
}
