// Medidas reales del renderer Eficiencia en px (tokens.css): padding
// vertical 20 + filas de ~24px con gap 3. El marco crece con rowCount —
// la fila nunca cambia de alto.
export const FUNCTIONAL_MULTICLASS_ROW_PX = 27;
export const FUNCTIONAL_MULTICLASS_PADDING_Y = 20;

/** Alto del contenido en px: padding + filas configuradas. */
export function resolveFunctionalMulticlassHeight(rowCount: number): number {
  return FUNCTIONAL_MULTICLASS_PADDING_Y + rowCount * FUNCTIONAL_MULTICLASS_ROW_PX;
}
