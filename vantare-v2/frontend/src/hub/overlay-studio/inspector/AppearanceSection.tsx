import { designSystemRegistry } from "../../../overlay/core/design-system-registry";
import { writeControlValue } from "../../../overlay/core/inspector-control";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { SessionLayoutType } from "../../../overlay/core/profile-document";
import { mergeVisualSettings, migrateWidgetBaseSettings } from "../../../overlay/core/widget-visual-settings";
import type { StudioCommand } from "../state/studio-command";
import { InspectorControlField } from "./inspector-control-field";

export type AppearanceSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  dispatch(command: StudioCommand): void;
};

export function AppearanceSection(props: AppearanceSectionProps): React.ReactElement {
  const { widget, session, dispatch } = props;
  const registration = designSystemRegistry.resolve(
    widget.visual.systemId,
    widget.visual.systemVersion,
    widget.type,
  );
  const mergedSettings = mergeVisualSettings(
    migrateWidgetBaseSettings(widget),
    widget.visual.appearanceOverrides,
  );

  return (
    <div data-testid="studio-inspector-section-appearance" data-widget-id={widget.id}>
      {registration.inspector.appearance.map((control) => (
        <InspectorControlField
          key={control.id}
          control={control}
          values={mergedSettings}
          onChange={(value) => {
            const appearanceOverrides = writeControlValue(
              structuredClone(widget.visual.appearanceOverrides),
              control.path,
              value,
            );
            dispatch({
              type: "widget/visual",
              session,
              widgetIds: [widget.id],
              visual: {
                ...widget.visual,
                appearanceOverrides,
              },
            });
          }}
        />
      ))}
    </div>
  );
}