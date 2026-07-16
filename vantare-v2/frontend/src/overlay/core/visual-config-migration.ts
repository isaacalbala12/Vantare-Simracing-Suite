import { DesignSystemResolutionError } from "./design-system-definition";
import {
  designSystemRegistry,
  migrateConfigSettings,
  migrateSystemSettings,
} from "./design-system-registry";
import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";

export type ProfileVisualUpgradeResult = {
  document: ProfileDocumentV3;
  migratedWidgetIds: string[];
};

function cloneDocument(document: ProfileDocumentV3): ProfileDocumentV3 {
  return structuredClone(document);
}

function migrateWidgetVisual(widget: WidgetInstanceV3): {
  widget: WidgetInstanceV3;
  migrated: boolean;
} {
  widgetTypeRegistry.get(widget.type);

  const targetDefinition = designSystemRegistry.resolve(
    widget.visual.systemId,
    1,
    widget.type,
  );
  const targetSystemVersion = targetDefinition.systemVersion;
  const targetConfigVersion = targetDefinition.configVersion;
  const definition = designSystemRegistry.get(widget.visual.systemId, targetSystemVersion);
  const registration = definition.widgets.find((entry) => entry.widgetType === widget.type);
  if (!registration) {
    throw new DesignSystemResolutionError(
      widget.visual.systemId,
      targetSystemVersion,
      widget.type,
      `unsupported widget type for design system: ${widget.visual.systemId}@${targetSystemVersion}/${widget.type}`,
    );
  }

  if (
    widget.visual.systemVersion === targetSystemVersion &&
    widget.visual.configVersion === targetConfigVersion
  ) {
    return { widget, migrated: false };
  }

  const migratedBaseSettings = migrateSystemSettings(
    definition,
    widget.type,
    widget.visual.systemVersion,
    targetSystemVersion,
    widget.visual.baseSettings,
  );
  const migratedConfigSettings = migrateConfigSettings(
    registration,
    widget.visual.configVersion,
    targetConfigVersion,
    migratedBaseSettings,
    widget.visual.systemId,
  );

  return {
    widget: {
      ...widget,
      visual: {
        ...widget.visual,
        systemVersion: targetSystemVersion,
        configVersion: targetConfigVersion,
        baseSettings: migratedConfigSettings,
      },
    },
    migrated: true,
  };
}

function upgradeLayoutWidgets(widgets: WidgetInstanceV3[]): {
  widgets: WidgetInstanceV3[];
  migratedWidgetIds: string[];
} {
  const migratedWidgetIds: string[] = [];
  const nextWidgets = widgets.map((widget) => {
    try {
      const result = migrateWidgetVisual(widget);
      if (result.migrated) {
        migratedWidgetIds.push(widget.id);
      }
      return result.widget;
    } catch (error) {
      if (error instanceof Error && /not registered/i.test(error.message)) {
        return widget;
      }
      throw error;
    }
  });
  return { widgets: nextWidgets, migratedWidgetIds };
}

export function upgradeProfileVisualConfigs(document: ProfileDocumentV3): ProfileVisualUpgradeResult {
  let migratedWidgetIds: string[] = [];
  let documentChanged = false;
  const nextDocument = cloneDocument(document);

  for (const layoutType of Object.keys(nextDocument.layouts) as SessionLayoutType[]) {
    const layout = nextDocument.layouts[layoutType];
    if (!layout) {
      continue;
    }
    const upgraded = upgradeLayoutWidgets(layout.widgets);
    if (upgraded.migratedWidgetIds.length > 0) {
      documentChanged = true;
      migratedWidgetIds = [...migratedWidgetIds, ...upgraded.migratedWidgetIds];
      layout.widgets = upgraded.widgets;
    }
  }

  if (!documentChanged) {
    return { document, migratedWidgetIds: [] };
  }

  return { document: nextDocument, migratedWidgetIds };
}