import { estimateFooterSlotsWidth, FOOTER_SLOT_PAD_PX, FOOTER_SLOT_ROW_PX } from "./footer-slots";
import { functionalLabels } from "./labels";

// Medidas reales del renderer Eficiencia en px sin escalar (tokens.css):
// la barra de meta y la de sesión miden 30px y cada fila 28px fijos.
export const FUNCTIONAL_RELATIVE_META_PX = 30;
export const FUNCTIONAL_RELATIVE_ROW_PX = 28;
export const FUNCTIONAL_RELATIVE_FOOTER_PX = 30;
export const FUNCTIONAL_RELATIVE_PADDING_X = 24;
// Ancho natural del widget: con él la geometría da escala 1 y las filas se
// ven a su tamaño real; una caja más estrecha encoge todo el conjunto.
export const FUNCTIONAL_RELATIVE_BASE_WIDTH = 430;

function footerSlotIds(settings: Readonly<Record<string, unknown>>): string[] {
  const slots = settings.footerSlots;
  return Array.isArray(slots) ? slots.filter((slot): slot is string => typeof slot === "string") : [];
}

/** Ancho de caja para que la fila de fichas quepa sin encogerse. */
export function resolveFunctionalRelativeSlotsWidth(settings: Readonly<Record<string, unknown>>): number {
  const slotIds = footerSlotIds(settings);
  if (slotIds.length === 0) return 0;
  const total = estimateFooterSlotsWidth(slotIds, functionalLabels.en);
  // El renderer encaja la fila a innerWidth = w - padding con margen 0.97.
  return FUNCTIONAL_RELATIVE_PADDING_X + total / 0.97;
}

/** Alto del contenido en px sin escalar: meta + filas fijas + pie o fichas. */
export function resolveFunctionalRelativeBaseHeight(
  rowCount: number,
  settings: Readonly<Record<string, unknown>>,
): number {
  const slotIds = footerSlotIds(settings);
  // Misma regla que el renderer: hasta 5 fichas en una fila; más envuelven.
  const slotRows = slotIds.length === 0 ? 0 : Math.max(1, Math.ceil(slotIds.length / 5));
  const footerBand = slotRows > 0
    ? FOOTER_SLOT_PAD_PX + slotRows * FOOTER_SLOT_ROW_PX
    : FUNCTIONAL_RELATIVE_FOOTER_PX;
  return FUNCTIONAL_RELATIVE_META_PX + rowCount * FUNCTIONAL_RELATIVE_ROW_PX + footerBand;
}
