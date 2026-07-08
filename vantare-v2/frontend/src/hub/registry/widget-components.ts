import { useMemo } from "react";
import type { WidgetComponents } from "./design-system";
import { lookupDesignSystem } from "./design-system-registry";

/**
 * Resolve the JSX components (Header, Row, Footer) that a design system
 * provides for a given widget type. Returns an empty object if the system
 * is not registered or doesn't provide components for that type. The widget
 * is responsible for falling back to its built-in implementation.
 *
 * @param type - The widget type (e.g. "standings", "delta").
 * @param themeId - The design system id (typically `widget.style` or
 *   `variant.themeId`).
 */
export function resolveWidgetComponents(
  type: string,
  themeId: string | undefined | null,
): WidgetComponents {
  const system = lookupDesignSystem(themeId);
  if (!system) return {};
  return system.components[type as keyof typeof system.components] ?? {};
}

/**
 * React hook that returns the components a system provides for a widget type.
 *
 * For B2, the registry is in-memory and doesn't change at runtime, so the
 * hook is a thin wrapper over `resolveWidgetComponents` (memoized by
 * `type` and `themeId`). If the registry becomes dynamic (B3+), this hook
 * will subscribe via `useSyncExternalStore`.
 *
 * @example
 * ```tsx
 * function StandingsHeader({ data, appearance }: WidgetComponentProps<...>) {
 *   const { Header: CustomHeader } = useWidgetComponents("standings", "vantare-v3");
 *   if (CustomHeader) return <CustomHeader data={data} appearance={appearance} />;
 *   return <DefaultHeader data={data} appearance={appearance} />;
 * }
 * ```
 */
export function useWidgetComponents(
  type: string,
  themeId: string | undefined | null,
): WidgetComponents {
  return useMemo(
    () => resolveWidgetComponents(type, themeId),
    [type, themeId],
  );
}
