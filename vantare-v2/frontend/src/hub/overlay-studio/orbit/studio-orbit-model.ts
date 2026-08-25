/**
 * Modelo de presentacion de la disposicion Orbit del Studio (briefing 04).
 *
 * Todo lo que hay aqui es puro: lee un `WidgetInstanceV3` real y devuelve el
 * texto que pintan la lista, la cabecera del inspector y los resumenes de los
 * acordeones. Ninguna de estas funciones muta el documento ni conoce el store:
 * la capa Orbit es presentacion y nada mas.
 */
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { StudioPreviewState } from "../state/studio-store";
import { ORBIT_KEYS, orbitStore } from "../../orbit/orbit-store";

export type Translate = (key: string) => string;

/** Interpolacion `{{clave}}` identica a la de la shell (`hub/orbit/format-message`). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function widgetLabel(widget: WidgetInstanceV3): string {
  return widget.name?.trim() || widget.id;
}

/** Nombre del sistema visual; si el catalogo no lo conoce se usa su id crudo. */
export function systemLabel(widget: WidgetInstanceV3, t: Translate): string {
  const key = `studio.system.${widget.visual.systemId}`;
  const label = t(key);
  return label === key ? widget.visual.systemId : label;
}

/** "Vantare Crystal · Crystal Bar" — el diseno solo aparece si hay procedencia. */
export function designSummary(widget: WidgetInstanceV3, t: Translate): string {
  const design = widget.visual.provenance?.designName?.trim();
  return [systemLabel(widget, t), design].filter(Boolean).join(" · ");
}

/**
 * "15 fps · todas" / "30 fps · solo en pista · 2 sesiones".
 *
 * El resumen vive en una linea de ~180 px junto al titulo del acordeon: con el
 * texto largo ("15 fps · siempre · todas las sesiones") siempre salia cortado
 * con puntos suspensivos y no informaba de nada. Los valores por defecto —el
 * filtro de boxes en "siempre"— no se nombran: solo se nombra lo que restringe.
 */
export function behaviorSummary(widget: WidgetInstanceV3, t: Translate): string {
  const fps = fill(t("studio.summary.fps"), { n: widget.behavior.updateHz });
  const inPit = widget.behavior.visibleWhen?.inPit;
  const pit =
    inPit === undefined
      ? null
      : inPit
        ? t("studio.summary.pit.inPit")
        : t("studio.summary.pit.onTrack");
  const sessionTypes = widget.behavior.visibleWhen?.sessionTypes ?? [];
  const sessions =
    sessionTypes.length === 0
      ? t("studio.summary.sessionsAll")
      : fill(t("studio.summary.sessions"), { n: sessionTypes.length });
  return [fps, pit, sessions].filter(Boolean).join(" · ");
}

/** "por defecto" / "2 cambios": lo que el usuario ha tocado sobre el diseno. */
export function appearanceSummary(widget: WidgetInstanceV3, t: Translate): string {
  const changed = Object.keys(widget.visual.appearanceOverrides ?? {}).length;
  if (changed === 0) {
    return t("studio.summary.appearanceDefault");
  }
  // Sin plurales en el catalogo: la forma de uno es su propia clave, o el
  // resumen decia "1 cambios".
  if (changed === 1) {
    return t("studio.summary.appearanceChangedOne");
  }
  return fill(t("studio.summary.appearanceChanged"), { n: changed });
}

/** "820, 96 · 280 × 96". */
export function layoutSummary(widget: WidgetInstanceV3, t: Translate): string {
  const { x, y, w, h } = widget.layout;
  return fill(t("studio.summary.layout"), {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  });
}

/**
 * Meta de la cabecera del inspector: "diseno · w × h".
 *
 * Solo el nombre del diseno, no `sistema · diseno`: el sistema ya sale en el
 * acordeon de Diseno —plegado, en su resumen; abierto, en el desplegable— y
 * repetirlo aqui hacia que la linea no cupiera y el tamano se perdiera en unos
 * puntos suspensivos. Sin procedencia se cae al nombre del sistema, que es lo
 * unico que se sabe del widget.
 */
export function inspectorMeta(widget: WidgetInstanceV3, t: Translate): string {
  const design = widget.visual.provenance?.designName?.trim() || systemLabel(widget, t);
  return fill(t("studio.inspector.meta"), {
    design,
    w: Math.round(widget.layout.w),
    h: Math.round(widget.layout.h),
  });
}

/**
 * Estado plegado del inspector: manda `?rightDock=closed` de la URL y, sin
 * parametro, la preferencia `vantare.v03orbit.rightDock` (`13.7`).
 */
export function readRightDockClosed(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("rightDock");
  if (raw !== null) {
    const closed = raw === "closed" || raw === "0";
    orbitStore.set(ORBIT_KEYS.rightDock, closed ? "closed" : "open");
    return closed;
  }
  return orbitStore.get(ORBIT_KEYS.rightDock) === "closed";
}

export function writeRightDockClosed(closed: boolean): void {
  orbitStore.set(ORBIT_KEYS.rightDock, closed ? "closed" : "open");
}

/**
 * Ancho **real** de ventana por debajo del cual el inspector se pliega solo
 * (D-R4-4). A 1280x720 el factor de escala es 0.911, o sea 1405 px de
 * maquetacion: descontados el rail y la columna contextual (377 px) y un
 * inspector de 395 px, a la toolbar le quedaban 542 px para 581 px de
 * controles, y lo que sobraba se pintaba encima del inspector.
 *
 * Se lee el viewport real y no el de maquetacion porque es lo que ven tambien
 * las media queries de `orbit-studio.css` (Chromium no las ajusta al `zoom`) y
 * el auto-plegado de la columna de la shell: CSS y JS no pueden contradecirse.
 *
 * El plegado automatico **no** toca la preferencia guardada: al ensanchar la
 * ventana el inspector vuelve como estaba.
 */
export const STUDIO_AUTO_FOLD_INSPECTOR_WIDTH = 1400;

/** Fondos del prototipo mapeados a los ids reales de `canvas-backgrounds`. */
export const ORBIT_BACKGROUND_OPTIONS = [
  { value: "grid", labelKey: "studio.toolbar.background.grid" },
  { value: "gradient", labelKey: "studio.toolbar.background.gradient" },
  { value: "solid-black", labelKey: "studio.toolbar.background.black" },
] as const;

export type OrbitBackgroundId = (typeof ORBIT_BACKGROUND_OPTIONS)[number]["value"];

/** Pasos de zoom del prototipo; "fit" es el primero (`Ajustar`). */
const ZOOM_STEPS: readonly StudioPreviewState["zoom"][] = ["fit", 50, 75, 100, 125, 150];

export function nextZoom(
  current: StudioPreviewState["zoom"],
  direction: -1 | 1,
): StudioPreviewState["zoom"] {
  const index = ZOOM_STEPS.indexOf(current);
  const safeIndex = index === -1 ? ZOOM_STEPS.indexOf(100) : index;
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, safeIndex + direction))];
}
