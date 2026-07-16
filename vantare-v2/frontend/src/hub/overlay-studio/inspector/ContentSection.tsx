import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import type { SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { StudioCommand } from "../state/studio-command";

export type ContentSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  dispatch(command: StudioCommand): void;
  disabled?: boolean;
};

export function ContentSection(props: ContentSectionProps): React.ReactElement | null {
  const { widget, session, dispatch, disabled } = props;
  let definition;
  try {
    definition = widgetTypeRegistry.get(widget.type);
  } catch {
    return null;
  }

  const Inspector = definition.inspector.CustomContentInspector;
  if (!Inspector) {
    return null;
  }

  return (
    <Inspector
      widget={widget}
      disabled={disabled}
      onContentChange={(content) =>
        dispatch({
          type: "widget/content",
          session,
          widgetIds: [widget.id],
          content,
        })
      }
    />
  );
}