/**
 * Ultima geometria del stage, persistida entre montajes: al volver al Studio
 * el primer render nace con la escala correcta en vez de la ventana
 * cero->medicion (que con las transiciones a cero se ve como un salto). El
 * effecto de medicion verifica contra el DOM real antes del pintado, asi que
 * una cache desfasada nunca llega a verse.
 */
let lastStageGeometry: { width: number; height: number } | null = null;

export function readStageGeometryCache(): { width: number; height: number } | null {
  return lastStageGeometry;
}

export function writeStageGeometryCache(geometry: { width: number; height: number }): void {
  lastStageGeometry = geometry;
}

/** Reserva para tests: la cache de modulo persiste entre renders. */
export function resetStudioStageGeometryCache(): void {
  lastStageGeometry = null;
}
