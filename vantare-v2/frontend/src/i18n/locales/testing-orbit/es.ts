/** Catálogo `testing.*` de Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`). */
export const testingOrbitEs: Record<string, string> = {
  "testing.title": "Testing Center",
  "testing.lead": "Reporta un comportamiento reproducible o valida una corrección asignada.",
  "testing.unavailable": "Testing Center no está disponible en Stable",

  "testing.channel.nightly": "Nightly",
  "testing.channel.testers": "Testers",
  "testing.channel.stable": "Stable",

  "testing.draft.local": "Borrador local",
  "testing.draft.saving": "Guardando el borrador…",
  "testing.draft.saved": "Borrador guardado",
  "testing.draft.error": "El borrador no se pudo guardar",

  "testing.form.title": "Reporte",
  "testing.form.privacy": "Solo se envía lo que escribes aquí y lo que marques en Consentimiento.",
  "testing.field.module": "Módulo",
  "testing.field.didWhat": "Qué hiciste",
  "testing.field.expected": "Qué esperabas",
  "testing.field.observed": "Qué ocurrió",
  "testing.field.context": "Contexto adicional · opcional",
  "testing.module.unknown": "Sin determinar",

  "testing.consent.eyebrow": "Consentimiento",
  "testing.consent.title": "Datos adjuntos",
  "testing.consent.lead": "Nada se adjunta sin selección explícita y vista previa.",
  "testing.consent.diagnostic": "Diagnóstico preparado",
  "testing.consent.diagnosticHelp": "Genera una vista previa antes de enviar.",
  "testing.consent.replay": "Replay de telemetría",
  "testing.consent.replayUnavailable": "No disponible en este flujo.",
  "testing.consent.logs": "Logs de producto",
  "testing.consent.logsUnavailable": "No hay búfer de logs disponible.",

  "testing.preview.loading": "Preparando el diagnóstico…",
  "testing.preview.ready": "Vista previa lista · {{bytes}} B · {{digest}}",
  "testing.preview.error": "El diagnóstico no se pudo preparar; el reporte se enviará sin él.",

  "testing.send": "Enviar reporte",
  "testing.sending": "Enviando…",
  "testing.discard": "Descartar borrador",
  "testing.discard.warning": "El borrador no se pudo borrar del disco.",
  "testing.retry.safe": "Reintentar es seguro: el reporte no se duplica.",
  "testing.offline": "Sin conexión: el envío se reanuda al volver.",

  "testing.validation.required": "Hacen falta al menos tres caracteres.",
  "testing.validation.too_long": "El texto es demasiado largo.",

  "testing.success.title": "Reporte enviado",
  "testing.success.description": "Guarda el identificador por si hace falta seguirlo.",

  "testing.error.permission": "Tu cuenta no tiene permiso para enviar reportes.",
  "testing.error.auth": "Inicia sesión otra vez para enviar el reporte.",
  "testing.error.conflict": "Ese reporte ya se había enviado.",
  "testing.error.generic": "El reporte no se pudo enviar.",
};
