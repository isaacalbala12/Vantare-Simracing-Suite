import type { DesignSystem } from "./design-system";

/**
 * In-memory registry of design systems. Systems are registered at module load
 * time (B4 will register the built-in systems: `base` and `vantare-crystal`).
 *
 * The registry is a single source of truth: any code that needs to look up a
 * system by id calls `lookupDesignSystem(id)`. The runtime OBS, the hub
 * gallery, and the widget selector all read from here.
 */

const registry = new Map<string, DesignSystem>();

/**
 * Register a design system. Throws if a system with the same id is already
 * registered (this is intentional: duplicate ids usually indicate a bug in
 * the registration code, not a runtime concern).
 */
export function registerDesignSystem(system: DesignSystem): void {
  if (registry.has(system.id)) {
    throw new Error(
      `Design system "${system.id}" is already registered. ` +
        `Use clearDesignSystemRegistry() in tests or choose a unique id.`,
    );
  }
  registry.set(system.id, system);
}

/**
 * Look up a design system by id. Returns `null` if not found or if `id` is
 * undefined/empty. This is the safe default for widgets that need to render
 * without a system (e.g. legacy widgets, tests).
 */
export function lookupDesignSystem(id: string | undefined | null): DesignSystem | null {
  if (!id) return null;
  return registry.get(id) ?? null;
}

/**
 * List all registered design systems. Used by the gallery and the selector
 * UI to enumerate available options.
 */
export function listDesignSystems(): DesignSystem[] {
  return Array.from(registry.values());
}

/**
 * Clear the registry. FOR TESTS ONLY. Do not call in production code.
 */
export function clearDesignSystemRegistry(): void {
  registry.clear();
}
