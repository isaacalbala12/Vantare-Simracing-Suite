export const testingQuestionnairesText = {
  title: "Cuestionarios por versión",
  empty:
    "No hay cuestionarios cargados. Recarga para consultar las versiones disponibles.",
  answered: "Respondido",
  unanswered: "Sin responder",
  scale: "1 · Muy mala     5 · Muy buena",
  note: "Comentario opcional",
  save: "Guardar respuesta",
  help: "Al pulsar Guardar respuesta se envían la puntuación y el comentario. Dejarlo vacío borra el comentario anterior.",
  noteLimit: (limit: number) => `Máximo ${limit} caracteres.`,
  noteTooLong: (limit: number) =>
    `Acorta el comentario a ${limit} caracteres como máximo.`,
  unsavedTitle: "Respuesta de cuestionario sin guardar",
  unsavedDescription:
    "Guarda la respuesta desde Cuestionarios antes de cerrar, o confirma «Cerrar sin guardar». No se ha enviado automáticamente.",
  keepEditing: "Seguir editando",
  loaded: "Datos confirmados por el servicio",
  openClosed: "Abiertos y cerrados",
  count: "cuestionarios cargados (últimos 10)",
  results: "Resultados",
  resultsHelp:
    "Tus respuestas son privadas; el equipo revisa el feedback de cada versión.",
  scores: [1, 2, 3, 4, 5],
} as const;
