import type { DesignSystem } from "./design-system";
import { registerDesignSystem } from "./design-system-registry";
import { resolveWidgetDesignSystem } from "../../overlay/widgets/widget-design-system";
import { getDefaultAppearance } from "../../hub/state/style-catalog";
import type { WidgetType } from "../../lib/widget-factory";
import { WIDGET_TYPES } from "../../lib/widget-factory";
import { VantareV3StandingsHeader } from "./_examples/vantare-v3-standings-header";

/**
 * Built-in design systems. Registered at the application entry point
 * (`main.tsx` for the hub, the widget runtime for the overlay). NOT
 * registered via a side-effect import in `index.ts` to avoid contaminating
 * tests (each test imports individual modules and controls its own setup).
 *
 * The token data and per-type defaults are sourced from the existing resolver
 * (`widget-design-system.ts`) and the catalog (`style-catalog.ts`) so we don't
 * duplicate the values here. After B3, the catalog has all `class*Fg` fields
 * for all widget types.
 */

function buildBuiltinSystems(): DesignSystem[] {
  const systems: DesignSystem[] = [];

  // System 1: `base` — solid colors, no cristal effects.
  systems.push({
    id: "base",
    name: "Base",
    description: "Colores planos, sin efectos de cristal.",
    tokens: resolveWidgetDesignSystem("base"),
    perWidgetAppearance: Object.fromEntries(
      WIDGET_TYPES.map((type) => [type as WidgetType, getDefaultAppearance(type, "base")]),
    ) as Partial<Record<WidgetType, ReturnType<typeof getDefaultAppearance>>>,
    components: {},
  });

  // System 2: `vantare-crystal` — dark glass with red Vantare accents.
  systems.push({
    id: "vantare-crystal",
    name: "Vantare Crystal",
    description: "Cristal oscuro, acentos rojos Vantare, fuentes Plus Jakarta / Inter.",
    tokens: resolveWidgetDesignSystem("vantare-crystal"),
    perWidgetAppearance: Object.fromEntries(
      WIDGET_TYPES.map((type) => [type as WidgetType, getDefaultAppearance(type, "vantare-crystal")]),
    ) as Partial<Record<WidgetType, ReturnType<typeof getDefaultAppearance>>>,
    components: {},
  });

  // System 3: `vantare-v3` — example system. Same tokens as vantare-crystal
  // (for now), but contributes a custom Header for Standings via the registry.
  systems.push({
    id: "vantare-v3",
    name: "Vantare v3 (example)",
    description: "Sistema ejemplo: cabecera custom para Standings. Misma base que cristal.",
    tokens: resolveWidgetDesignSystem("vantare-crystal"),
    perWidgetAppearance: Object.fromEntries(
      WIDGET_TYPES.map((type) => [type as WidgetType, getDefaultAppearance(type, "vantare-crystal")]),
    ) as Partial<Record<WidgetType, ReturnType<typeof getDefaultAppearance>>>,
    components: {
      standings: {
        Header: VantareV3StandingsHeader as DesignSystem["components"][WidgetType] extends infer C
          ? C extends { Header?: infer H }
            ? H
            : never
          : never,
      },
    },
  });

  return systems;
}

let registered = false;

/**
 * Register all built-in design systems. Idempotent: safe to call multiple
 * times. Called from the application entry point.
 */
export function registerBuiltinDesignSystems(): void {
  if (registered) return;
  for (const system of buildBuiltinSystems()) {
    try {
      registerDesignSystem(system);
    } catch (e) {
      // If the system is already registered (e.g. after a page reload), skip.
      if (e instanceof Error && e.message.includes("already registered")) {
        continue;
      }
      throw e;
    }
  }
  registered = true;
}

/** Reset the registration flag (for tests only). */
export function _resetBuiltinRegistration(): void {
  registered = false;
}
