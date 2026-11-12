export const testingDiscardText = {
  title: "Descartar borrador",
  description:
    "Se eliminará el borrador protegido. Esta acción no se puede deshacer.",
  cancel: "Seguir editando",
  confirm: "Descartar borrador",
} as const;

export const closeUnsavedReportText = {
  title: "Cerrar sin guardar",
  description:
    "Se perderán los cambios que todavía no se han guardado. El borrador protegido anterior se conserva.",
  cancel: "Seguir editando",
  confirm: "Cerrar sin guardar",
} as const;

export const closeReportSaveFailureText = {
  title: "No se pudo guardar el borrador protegido",
  description: "Hay ediciones sin guardar.",
  cancel: "Reintentar",
  confirm: "Cerrar sin guardar",
} as const;
