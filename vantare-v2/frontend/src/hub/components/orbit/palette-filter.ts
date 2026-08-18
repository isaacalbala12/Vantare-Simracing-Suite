import type { IconName } from "../../../ui/orbit/Icon";

export interface PaletteItem {
  id: string;
  label: string;
  meta?: string;
  icon: IconName;
  /** Motivo del bloqueo ("Requiere <plan>"); si está, `run` no se ejecuta. */
  locked?: string;
  run(): void;
}

/** El filtro mira la etiqueta, el meta y el motivo del bloqueo. */
export function matchesQuery(item: PaletteItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.label} ${item.meta ?? ""} ${item.locked ?? ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}
