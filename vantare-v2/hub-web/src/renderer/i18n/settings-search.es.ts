// Índice de Page::matches del GPUI congelado (native/hub/src/settings/mod.rs).
// Se suma a los rótulos visibles: buscar un sinónimo no cambia ningún ajuste.
export const settingsSearchTerms: Readonly<Record<string, string>> = {
  account:
    "perfil piloto nombre público foto descripción país bandera simuladores coche equipo favorito sesión plan",
  general:
    "aplicación zoom idioma densidad inicio windows minimizado avisos notificaciones widgets unidades métrico imperial overlays ocultar fuera de pista garaje boxes pausa replay",
  appearance:
    "paleta grafito carmín harness noche le mans piedra cálida contraste opacidad cristal fuentes",
  performance:
    "máximo alto equilibrado ahorro mínimo personalizado cadencia widgets hz frecuencia",
  updates: "versión instalada canal novedades stable testers nightly rollback",
  shortcuts:
    "perfil launcher globales ctrl guardar deshacer rehacer duplicar borrar flechas combinaciones",
  privacy: "fallos uso diagnóstico posthog consentimiento envíos política",
  diagnostics:
    "telemetry core overlay datos registros fuentes eventos errores informe",
};
