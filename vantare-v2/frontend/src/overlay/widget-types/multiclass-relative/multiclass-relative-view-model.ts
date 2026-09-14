import type { WidgetViewModelBase } from "../../core/widget-definition";
export type MulticlassRelativeRow = { place: number; classId: string; classColor: string; number: string; name: string; gap?: number; isPlayer: boolean };
export type MulticlassRelativeViewModel = WidgetViewModelBase & { type: "multiclass-relative"; rows: readonly MulticlassRelativeRow[]; rowCount: number; classMode: "all" | "same" | "other"; showClassDivider: boolean };
