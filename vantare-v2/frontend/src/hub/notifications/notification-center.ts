import { Events } from "@wailsio/runtime";

/**
 * Centro de notificaciones (ISA-901 / issue #901).
 *
 * El backend es la fuente de verdad: guarda un store acotado y publica el
 * snapshot completo en `notifications:center` tras cada mutación. Un webview
 * que se reconecta pide `notifications:center:get` una vez y queda al día;
 * `revision` ordena los snapshots para descartar entregas viejas.
 *
 * El Spotter no puede aparecer aquí por construcción: su salida de carrera es
 * overlay/subtítulos/audio y no existe una fuente "spotter" en la matriz de
 * canales del contrato.
 */

export type NotificationSource = "updater" | "launcher" | "system";
export type NotificationSeverity = "info" | "warning" | "error";

export type NotificationAction = {
  kind: "navigate";
  target: string;
};

export type CenterRecord = {
  v: number;
  id: string;
  source: NotificationSource;
  severity: NotificationSeverity;
  occurredAt: number;
  dedupeKey: string;
  titleKey: string;
  textKey?: string;
  params?: Record<string, string>;
  concreteCause?: string;
  action?: NotificationAction;
  unread: boolean;
};

export type CenterSnapshot = {
  v: number;
  revision: number;
  records: CenterRecord[];
  unread: number;
};

export type Unsubscribe = () => void;

const EMPTY: CenterSnapshot = { v: 0, revision: 0, records: [], unread: 0 };

let snapshot: CenterSnapshot = EMPTY;
const listeners = new Set<() => void>();
let wailsCenterUnsubscribe: Unsubscribe | null = null;

function applySnapshot(incoming: unknown): void {
  const data = (incoming as { data?: CenterSnapshot } | undefined)?.data;
  if (!data || typeof data !== "object" || !Array.isArray(data.records)) return;
  if (typeof data.revision === "number" && data.revision < snapshot.revision) return;
  snapshot = data;
  listeners.forEach((listener) => listener());
}

function ensureCenterListener(): void {
  if (wailsCenterUnsubscribe) return;
  wailsCenterUnsubscribe = Events.On("notifications:center", applySnapshot);
}

export function subscribeCenter(listener: () => void): Unsubscribe {
  ensureCenterListener();
  listeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    listeners.delete(listener);
    if (listeners.size === 0) {
      wailsCenterUnsubscribe?.();
      wailsCenterUnsubscribe = null;
    }
  };
}

export function getCenterSnapshot(): CenterSnapshot {
  return snapshot;
}

/** Solo con suscriptores vivos: pedir sin nadie que reciba la respuesta
 *  dejaría la suscripción Wails huérfana. El componente suscribe en el mount
 *  antes de que corra su efecto, así que la petición siempre tiene oyente. */
export function requestCenter(): void {
  if (listeners.size === 0) return;
  Events.Emit("notifications:center:get");
}

export function markCenterRead(id: string): void {
  Events.Emit("notifications:center:read", { id });
}

export function clearCenter(): void {
  Events.Emit("notifications:center:clear");
}

/** La acción la resuelve y valida el backend; aquí solo viaja el id. */
export function activateCenterRecord(id: string): void {
  Events.Emit("notifications:center:action", { id });
}

export type CenterNavigateListener = (target: string) => void;

export function subscribeCenterNavigate(listener: CenterNavigateListener): Unsubscribe {
  return Events.On("notifications:center:navigate", (event: unknown) => {
    const target = (event as { data?: { target?: unknown } } | undefined)?.data?.target;
    if (typeof target === "string" && target) listener(target);
  });
}
