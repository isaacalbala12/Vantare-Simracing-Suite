import type { WidgetViewModelBase } from "../../core/widget-definition";
export type DeltaAdvancedAvailability = { best: boolean; sector: boolean; theoretical: boolean; last: boolean };
export type DeltaAdvancedViewModel = WidgetViewModelBase & { type: "delta-advanced"; best?: number; sector?: number; theoretical?: number; last?: number; availability: DeltaAdvancedAvailability; showUnavailableFields: boolean };
