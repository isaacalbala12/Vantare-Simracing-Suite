export const canvasText = {
  open: "Editar distribución en el lienzo",
  close: "Volver a la vista de widget",
  layout: "Lienzo",
  widget: "Widget",
  placementHint: "Posición y tamaño: en el lienzo o sobre el juego.",
  moveGroup: "Mover widget",
  title: "Lienzo del diseño",
  unavailable:
    "El anfitrión no ha podido determinar el lienzo. Vuelve a cargar el diseño.",
  readOnly:
    "Solo lectura: no se puede editar con el simulador en pista, sin derechos verificados o con el documento protegido.",
  help: "Arrastra para mover. Flechas: mover · Alt + flechas: tamaño · Mayús: paso mayor · Esc: cancelar el gesto.",
  move: (name: string) => `Mover ${name}`,
  resize: (name: string, handle: string) => `Redimensionar ${name}: ${handle}`,
  handles: [
    "arriba izquierda",
    "arriba",
    "arriba derecha",
    "derecha",
    "abajo derecha",
    "abajo",
    "abajo izquierda",
    "izquierda",
  ],
  outside: "Fuera del lienzo",
  hidden: "Oculto en pista",
  position: (x: number, y: number, w: number, h: number) =>
    `x ${Math.round(x)} · y ${Math.round(y)} · ${Math.round(w)} × ${Math.round(h)}`,
  changed:
    "El diseño ha cambiado; revisa la posición. Se ha descartado el gesto sin reenviarlo.",
  failed:
    "No se pudo guardar el movimiento. Se conserva la posición del anfitrión; puedes iniciar otro gesto.",
  uncertain:
    "Vuelve a cargar el diseño para confirmar su estado antes de editar otra vez.",
  saved: "Posición y tamaño actualizados",
  zoomLess: "Reducir zoom del lienzo",
  zoomMore: "Ampliar zoom del lienzo",
  fit: "Encajar lienzo",
  anchors: "Anclar widget",
  anchor: (row: string, column: string) => `Anclar ${row} ${column}`,
  rows: ["arriba", "al centro", "abajo"],
  columns: ["a la izquierda", "al centro", "a la derecha"],
  nudge: [
    "Mover a la izquierda",
    "Mover arriba",
    "Mover a la derecha",
    "Mover abajo",
  ],
  natural: "Tamaño automático",
  lockAspect: "Bloquear proporción",
};
