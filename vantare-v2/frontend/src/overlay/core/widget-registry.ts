import type { CoreWidgetType } from "./profile-document";
import type { WidgetTypeDefinition } from "./widget-definition";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";

export class WidgetTypeRegistry {
  private readonly definitions = new Map<CoreWidgetType, WidgetTypeDefinition<Record<string, unknown>>>();

  register<TContent extends Record<string, unknown>>(definition: WidgetTypeDefinition<TContent>): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`widget type already registered: ${definition.type}`);
    }
    this.definitions.set(
      definition.type,
      definition as WidgetTypeDefinition<Record<string, unknown>>,
    );
  }

  get(type: CoreWidgetType): WidgetTypeDefinition<Record<string, unknown>> {
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

export const widgetTypeRegistry = new WidgetTypeRegistry();
widgetTypeRegistry.register(deltaDefinition);
widgetTypeRegistry.register(standingsDefinition);