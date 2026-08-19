/**
 * Colocacion de la etiqueta de seleccion del lienzo Orbit (`briefing 04 · A2`).
 *
 * La etiqueta vive en el espacio del `stage` (pixeles de pantalla), no dentro
 * del `scene` escalado: asi no necesita contra-escalarse —el truco anterior,
 * `translateY(-100%) scale(1/scale)`, dejaba el desplazamiento vertical a
 * merced de un porcentaje que se resuelve contra la caja SIN escalar y la
 * separaba del widget— y puede recortarse contra los bordes del lienzo.
 *
 * Regla: centrada sobre el borde superior de la caja del widget; si no cabe
 * arriba, debajo; y siempre dentro del lienzo en el eje X.
 */

export type TagAnchor = {
  /** Caja del widget en pixeles del `stage`. */
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TagPlacement = {
  left: number;
  top: number;
  side: "above" | "below";
};

/** Separacion entre la etiqueta y el marco del widget. */
export const TAG_GAP = 8;
/** Margen minimo contra el borde del lienzo. */
export const TAG_EDGE = 6;

export function placeSelectionTag(input: {
  anchor: TagAnchor;
  tag: { width: number; height: number };
  stage: { width: number; height: number };
}): TagPlacement {
  const { anchor, tag, stage } = input;

  const above = anchor.top - TAG_GAP - tag.height;
  const below = anchor.top + anchor.height + TAG_GAP;
  // Arriba salvo que no quepa; si abajo tampoco cabe, se queda arriba y el
  // recorte final la mantiene dentro del lienzo.
  const fitsAbove = above >= TAG_EDGE;
  const fitsBelow = below + tag.height <= stage.height - TAG_EDGE;
  const side: TagPlacement["side"] = fitsAbove || !fitsBelow ? "above" : "below";

  const rawTop = side === "above" ? above : below;
  const maxTop = Math.max(TAG_EDGE, stage.height - TAG_EDGE - tag.height);
  const top = Math.min(Math.max(rawTop, TAG_EDGE), maxTop);

  const rawLeft = anchor.left + anchor.width / 2 - tag.width / 2;
  const maxLeft = Math.max(TAG_EDGE, stage.width - TAG_EDGE - tag.width);
  const left = Math.min(Math.max(rawLeft, TAG_EDGE), maxLeft);

  return { left, top, side };
}
