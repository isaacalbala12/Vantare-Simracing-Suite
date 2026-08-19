/**
 * Caja real de un widget dentro de su marco (`briefing 04 · A1`).
 *
 * El marco del lienzo se dibuja con `layout.w × layout.h` del documento, pero
 * lo que el widget pinta puede ser menor: `WidgetVisualViewport` escala un
 * plano de ancho base y el contenido —una tabla de 5 filas dentro de una caja
 * de 540 px de alto— ocupa solo lo suyo. El resultado es un marco (y ocho
 * tiradores, y una etiqueta) que no se cine a nada.
 *
 * Aqui se calcula la caja realmente pintada en coordenadas locales del marco:
 * la union de los rectangulos de lo que hay dentro del viewport, traida al
 * espacio sin escalar del marco y recortada a su caja. La medida se toma en
 * `getBoundingClientRect` porque es la unica que ya lleva dentro todas las
 * escalas en juego (la del `scene`, la del zoom y la del propio viewport).
 */

export type ContentBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ContentBoxInput = {
  /** Rectangulo del marco en pixeles de pantalla. */
  frameRect: Rect;
  /** Tamano del marco sin escalar (`offsetWidth`/`offsetHeight`). */
  frameSize: { width: number; height: number };
  /** Rectangulos de lo que pinta el widget, en pixeles de pantalla. */
  contentRects: readonly Rect[];
};

/** Un widget mas pequeno que esto no es contenido: es un residuo de layout. */
const MIN_CONTENT_PX = 4;

function unionOf(rects: readonly Rect[]): Rect | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const rect of rects) {
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) continue;
    if (rect.width < MIN_CONTENT_PX || rect.height < MIN_CONTENT_PX) continue;
    found = true;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.left + rect.width);
    bottom = Math.max(bottom, rect.top + rect.height);
  }

  if (!found) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Caja del contenido en coordenadas locales del marco, o `null` cuando no se
 * puede medir con confianza (marco sin tamano, contenido vacio). El llamante
 * trata `null` como "cinete a la caja del documento", que es el comportamiento
 * historico.
 */
export function computeContentBox(input: ContentBoxInput): ContentBox | null {
  const { frameRect, frameSize, contentRects } = input;
  if (!(frameSize.width > 0) || !(frameSize.height > 0)) return null;
  if (!(frameRect.width > 0) || !(frameRect.height > 0)) return null;

  // Una sola escala: el marco es cuadrado en el plano logico y todas las
  // transformaciones que lo afectan son uniformes, asi que basta el eje X.
  const scale = frameRect.width / frameSize.width;
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const union = unionOf(contentRects);
  if (!union) return null;

  const x = (union.left - frameRect.left) / scale;
  const y = (union.top - frameRect.top) / scale;
  const w = union.width / scale;
  const h = union.height / scale;

  // El contenido nunca sale del marco: `__visual` recorta con `overflow:
  // hidden`, asi que lo que sobresale no se ve y no debe atraer al marco.
  const left = Math.max(0, Math.min(x, frameSize.width));
  const top = Math.max(0, Math.min(y, frameSize.height));
  const right = Math.max(left, Math.min(x + w, frameSize.width));
  const bottom = Math.max(top, Math.min(y + h, frameSize.height));

  const box: ContentBox = {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
  if (box.w < MIN_CONTENT_PX || box.h < MIN_CONTENT_PX) return null;
  return box;
}

/** `true` cuando la caja medida ya es, a efectos practicos, la del documento. */
export function contentBoxIsFullFrame(
  box: ContentBox,
  frameSize: { width: number; height: number },
  tolerance = 1,
): boolean {
  return (
    Math.abs(box.x) <= tolerance
    && Math.abs(box.y) <= tolerance
    && Math.abs(box.w - frameSize.width) <= tolerance
    && Math.abs(box.h - frameSize.height) <= tolerance
  );
}

/** Rectangulos de lo que el widget pinta dentro del marco. */
export function readWidgetContentRects(frame: HTMLElement): Rect[] {
  const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
  if (!viewport) return [];
  const rects: Rect[] = [];
  for (const child of Array.from(viewport.children)) {
    if (!(child instanceof HTMLElement) && !(child instanceof SVGElement)) continue;
    const rect = child.getBoundingClientRect();
    rects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }
  // Un unico hijo que no pinta nada por si mismo (un envoltorio de tamano
  // completo) no dice nada: se mira un nivel mas adentro.
  if (rects.length === 1 && viewport.children[0] instanceof HTMLElement) {
    const only = viewport.children[0];
    const inner: Rect[] = [];
    for (const child of Array.from(only.children)) {
      if (!(child instanceof HTMLElement) && !(child instanceof SVGElement)) continue;
      const rect = child.getBoundingClientRect();
      inner.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
    const outer = unionOf(rects);
    const innerUnion = unionOf(inner);
    if (outer && innerUnion && innerUnion.height < outer.height - 1) {
      return inner;
    }
  }
  return rects;
}

/** Mide la caja real del widget a partir de su elemento de marco. */
export function measureWidgetContentBox(frame: HTMLElement): ContentBox | null {
  const rect = frame.getBoundingClientRect();
  return computeContentBox({
    frameRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    frameSize: { width: frame.offsetWidth, height: frame.offsetHeight },
    contentRects: readWidgetContentRects(frame),
  });
}
