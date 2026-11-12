import { testingText } from "../screens/testing/es";
export const reportText = {
  ...testingText,
  loadDraft: "Cargar borrador",
  pending: "Revisar envío pendiente",
  retryOriginal: "Reintento con contenido original",
  bug: "Algo falla",
  suggestion: "Sugerencia",
  kind: "Tipo de informe",
  kindLimit:
    "No cabe el tipo de informe en el contexto. Reduce el texto antes de cambiarlo.",
  notes:
    "Estas notas se guardan solo en este equipo y no se envían. El envío contiene los campos estructurados permitidos.",
  screenshots: "Capturas",
  screenshotsUnavailable:
    "Las capturas no están disponibles todavía. Quita las capturas anteriores para enviar el informe sin imágenes.",
  removeScreenshot: "Quitar captura",
  screenshot: "Captura",
  logs: "Adjuntar registro · Próximamente",
  logsHelp: "Adjuntar registros estará disponible próximamente.",
  metadataPending: "Versión y equipo disponibles al revisar el informe.",
  metadata: "versión y equipo incluidos en el informe",
} as const;
