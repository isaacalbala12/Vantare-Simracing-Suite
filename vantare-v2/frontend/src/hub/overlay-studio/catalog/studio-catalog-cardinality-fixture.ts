import { ALL_WIDGET_TYPES } from "../../../overlay/core/profile-document";

/**
 * Final catalog cardinality used by contract tests. It is deliberately not
 * consumed by production catalog derivation until each type has definitions,
 * ViewModels and both visual renderers.
 */
export const FINAL_WIDGET_CATALOG_CARDINALITY = {
  widgetTypes: ALL_WIDGET_TYPES,
  designExceptions: {
    delta: ["delta-simple", "delta-bar"],
    "input-telemetry": ["input-crystal-blade", "input-crystal-capsule", "input-crystal-dense"],
  },
} as const;
