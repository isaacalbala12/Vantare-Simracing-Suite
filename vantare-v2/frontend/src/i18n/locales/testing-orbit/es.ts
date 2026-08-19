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

  "testing.tabs.label": "Vistas de Testing Center",
  "testing.tabs.report": "Reportar",
  "testing.tabs.validate": "Validar",
  "testing.tabs.mine": "Mis reportes",

  "testing.preview.title": "Vista previa del diagnóstico",
  "testing.preview.description":
    "Este es el contenido exacto que se enviará. El SHA-256 identifica esos mismos bytes.",

  "testing.validate.title": "Correcciones pendientes",
  "testing.validate.meta": "una validación por candidato",
  "testing.validate.lead":
    "Prueba una corrección disponible para tu canal y registra un único resultado verificable.",
  "testing.validate.refresh": "Actualizar",
  "testing.validate.loading": "Buscando correcciones disponibles…",
  "testing.validate.unavailable":
    "No se pudieron cargar o guardar las validaciones. Inténtalo de nuevo.",
  "testing.validate.emptyTitle": "Nada que validar",
  "testing.validate.empty": "No hay correcciones pendientes para validar en esta build.",
  "testing.validate.criteria": "Qué debes comprobar",
  "testing.validate.knownFailure": "Fallo reportado",
  "testing.validate.notAllowed":
    "Puedes consultar esta corrección, pero no validarla con esta cuenta.",
  "testing.validate.accept": "Funciona",
  "testing.validate.reject": "Necesita cambios",
  "testing.validate.cannotVerify": "No puedo verificar",
  "testing.validate.state.pending": "Pendiente",
  "testing.validate.state.accepted": "Aceptada",
  "testing.validate.result.accepted": "Corrección aceptada",
  "testing.validate.result.rejected": "Cambios solicitados",
  "testing.validate.result.cannot_verify": "Validación no concluyente",
  "testing.validate.result.correction":
    "El problema vuelve al flujo de corrección para revisión humana.",
  "testing.validate.result.saved": "Tu resultado se ha registrado correctamente.",

  "testing.reject.title": "Explica qué necesita cambiar",
  "testing.reject.help": "completa los cuatro textos para que se reproduzca sin adivinar",
  "testing.reject.category": "Tipo de problema",
  "testing.reject.frequency": "Frecuencia",
  "testing.reject.description": "Descripción breve",
  "testing.reject.steps": "Pasos para reproducirlo",
  "testing.reject.expected": "Resultado esperado",
  "testing.reject.observed": "Resultado observado",
  "testing.reject.options": "Impacto y datos opcionales",
  "testing.reject.blocking": "Este problema bloquea la validación",
  "testing.reject.diagnostics": "Autorizo adjuntar el diagnóstico técnico disponible",
  "testing.reject.logsUnavailable": "Adjuntar logs (todavía no disponible)",
  "testing.reject.incomplete": "Completa los cuatro campos de texto con al menos 3 caracteres.",
  "testing.reject.submitError":
    "No se pudo guardar la validación. Revisa la conexión e inténtalo de nuevo.",
  "testing.reject.submit": "Enviar cambios solicitados",
  "testing.reject.sending": "Enviando…",
  "testing.reject.cancel": "Cancelar",
  "testing.reject.value.issue_persists": "El fallo original continúa",
  "testing.reject.value.new_regression": "Nueva regresión",
  "testing.reject.value.crash": "Cierre o bloqueo",
  "testing.reject.value.different_behavior": "Comportamiento distinto",
  "testing.reject.value.other": "Otro",
  "testing.reject.value.always": "Siempre",
  "testing.reject.value.frequent": "Frecuente",
  "testing.reject.value.once": "Una vez",

  "testing.mine.title": "Mis reportes",
  "testing.mine.meta": "solo esta sesión",
  "testing.mine.emptyTitle": "Sin historial",
  "testing.mine.empty":
    "El servicio de Testing Center no publica el historial de reportes: solo abre, guarda y descarta el borrador en curso. Aquí aparece lo que envíes durante esta sesión.",
};
