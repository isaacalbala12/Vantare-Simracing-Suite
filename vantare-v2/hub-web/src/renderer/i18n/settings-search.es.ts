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
  privacy:
    "fallos uso diagnóstico posthog consentimiento envíos política grabar grabación vueltas telemetría",
  diagnostics:
    "telemetry core overlay datos registros fuentes eventos errores informe",
};

// Page::subtitle también forma parte del índice aunque la ayuda visible evolucione.
export const settingsSearchSubtitles: Readonly<Record<string, string>> = {
  account: "Tu perfil de piloto",
  general: "Interfaz y sistema",
  appearance: "Colores, contraste y fuentes",
  performance: "Nivel y frecuencia de tus widgets",
  shortcuts: "Combinaciones globales",
  updates: "Versión, canal y novedades",
  privacy: "Fallos y uso opcional",
  diagnostics: "Fuentes, datos y registros",
};
