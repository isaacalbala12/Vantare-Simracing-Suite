export const localDiagnosticText = {
  privacy:
    "El informe de diagnóstico no incluye el texto privado y no se adjunta automáticamente al envío.",
  prepare: "Preparar diagnóstico",
  preparing: "Preparando…",
  export: "Exportar JSON local",
  title: "Informe de diagnóstico",
  empty:
    "Prepara el diagnóstico para ver la lista blanca de datos exportables.",
  initialStatus:
    "Diagnóstico local; el borrador se guarda protegido en Services.",
  prepared: "Diagnóstico preparado en memoria. Revisa antes de exportar.",
  prepareFirst: "Prepara y revisa el diagnóstico antes de exportar",
  saved:
    "JSON local exportado. Puedes adjuntarlo a mano; no se ha enviado nada.",
  failed: "No se pudo preparar o exportar el diagnóstico local",
  conflict:
    "El archivo ya existe. Prepara de nuevo y elige otro nombre para conservarlo.",
  core: "Núcleo",
  links: {
    connected: "Conectado",
    unavailable: "No disponible",
    incompatible: "Versión incompatible",
  },
  binaryStates: {
    present: "Presente",
    missing: "No encontrado",
    unreadable: "No legible",
    unavailable: "No disponible",
  },
  unavailable: "No disponible",
  uninstrumented:
    "Studio y Análisis: error no instrumentado. Ausencia de error no demuestra que una sección funcione.",
  payload: "Contenido del JSON exportable",
} as const;
