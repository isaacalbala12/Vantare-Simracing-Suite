import type { WidgetType } from "./profile-document";
import type { WidgetTypeDefinition } from "./widget-definition";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { pedalsDefinition } from "../widget-types/pedals/pedals-definition";
import { pedalsTelemetryDefinition } from "../widget-types/pedals-telemetry/pedals-telemetry-definition";
import { pedalsTelemetryCompactDefinition } from "../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-definition";
import { racingFlagsDefinition } from "../widget-types/racing-flags/racing-flags-definition";
import { broadcastTowerDefinition } from "../widget-types/broadcast-tower/broadcast-tower-definition";
import { relativeDefinition } from "../widget-types/relative/relative-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";

export class WidgetTypeRegistry {
  private readonly definitions = new Map<WidgetType, WidgetTypeDefinition<Record<string, unknown>>>();

  register<TContent extends Record<string, unknown>>(definition: WidgetTypeDefinition<TContent>): void {
    assertCompleteWidgetDefinition(definition);
    if (this.definitions.has(definition.type)) {
      throw new Error(`widget type already registered: ${definition.type}`);
    }
    this.definitions.set(
      definition.type,
      definition as WidgetTypeDefinition<Record<string, unknown>>,
    );
  }

  get(type: WidgetType): WidgetTypeDefinition<Record<string, unknown>> {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new Error(`widget type not registered: ${type}`);
    }
    return definition;
  }

  list(): readonly WidgetTypeDefinition<Record<string, unknown>>[] {
    return [...this.definitions.values()];
  }
}

function assertCompleteWidgetDefinition<TContent extends Record<string, unknown>>(
  definition: WidgetTypeDefinition<TContent>,
): void {
  const capabilities = definition.capabilities;
  if (
    typeof definition.labelKey !== "string" ||
    definition.labelKey.trim() === "" ||
    typeof definition.createDefault !== "function" ||
    typeof definition.parseContent !== "function" ||
    typeof definition.buildViewModel !== "function" ||
    !definition.inspector ||
    !capabilities ||
    !Array.isArray(capabilities.inspectorSections) ||
    typeof capabilities.requiredFeature !== "string"
  ) {
    throw new Error(`incomplete widget type definition: ${definition.type}`);
  }
}

export const widgetTypeRegistry = new WidgetTypeRegistry();
widgetTypeRegistry.register(deltaDefinition);
widgetTypeRegistry.register(standingsDefinition);
widgetTypeRegistry.register(relativeDefinition);
widgetTypeRegistry.register(pedalsDefinition);
widgetTypeRegistry.register(pedalsTelemetryDefinition);
widgetTypeRegistry.register(pedalsTelemetryCompactDefinition);
widgetTypeRegistry.register(racingFlagsDefinition);
widgetTypeRegistry.register(broadcastTowerDefinition);
