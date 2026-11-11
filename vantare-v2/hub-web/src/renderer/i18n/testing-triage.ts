export const testingTriageText = {
  title: "Informe para revisión",
  localTitle: "Título local · no se envía",
  localBody: "Notas locales · no se envían (hasta 1.000 caracteres)",
  choices: {
    system: "Info del PC",
    session: "Errores y rendimiento de esta sesión",
    app_log: "Log de la app",
    telemetry_fragment: "Fragmento de telemetría",
    posthog_session: "Enlazar sesión de analítica",
  },
  help: "El título y las notas son locales y no se envían. Solo se envían los campos estructurados permitidos. PostHog y el fragmento quedan vacíos si no hay datos disponibles.",
  consent:
    "Un asistente de IA externo (DeepSeek vía OpenCode) preclasifica el informe con estos datos; la decisión la toma una persona. Los adjuntos y el resumen se retienen hasta 90 días desde la decisión.",
  prepare: "Ver lo que se envía",
  send: "Enviar este informe",
  preview: "Contenido del informe",
  envelopeHelp:
    "Se envía dentro de un sobre fijo con versión, consentimiento e identificador.",
  waiting: "Acepta el consentimiento e inicia sesión",
} as const;
