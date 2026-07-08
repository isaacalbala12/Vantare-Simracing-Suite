export type {
  DesignSystem,
  WidgetComponent,
  WidgetComponentProps,
  WidgetComponents,
} from "./design-system";
export {
  registerDesignSystem,
  lookupDesignSystem,
  listDesignSystems,
  clearDesignSystemRegistry,
} from "./design-system-registry";
export {
  resolveWidgetComponents,
  useWidgetComponents,
} from "./widget-components";
