import { resolveEffectiveWidgetPolicy } from "./widget-policy";
import type { WidgetPolicyStore } from "./widget-policy-store";

export const WIDGET_POLICY_SNAPSHOT_EVENT = "widget-policy:snapshot";
export const WIDGET_POLICY_CHANGED_EVENT = "widget-policy:changed";
/** Petición del snapshot inicial sobre el event bridge Wails existente. */
export const WIDGET_POLICY_GET_EVENT = "widget-policy:get";
/** Stream SSE servido por Go para la ventana OBS. */
export const WIDGET_POLICY_STREAM_URL = "/api/widget-policy/stream";

export type WidgetPolicyTransport = { start(): void; stop(): void };

function unwrapEventPayload(event: unknown): unknown {
  if (event && typeof event === "object" && !Array.isArray(event) && "data" in event) {
    const data = (event as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data[0];
    }
    return data;
  }
  return event;
}

/**
 * Transporte Wails sobre el event bridge existente, sin bindings nuevos: se
 * suscribe a `widget-policy:snapshot` y `widget-policy:changed` ANTES de
 * emitir `widget-policy:get`, como exige el contrato nativo. Un solo
 * `start`/`stop` por raíz de app: idempotente ante remontajes.
 */
export function createWailsWidgetPolicyAdapter(input: {
  store: WidgetPolicyStore;
  subscribe(event: string, listener: (data: unknown) => void): () => void;
  emit(event: string, payload?: unknown): void;
}): WidgetPolicyTransport {
  let unsubscribers: Array<() => void> = [];
  let lastHadEffective = false;
  let active = false;
  let generation = 0;
  return {
    start() {
      if (unsubscribers.length > 0) {
        return;
      }
      active = true;
      generation += 1;
      const startedGeneration = generation;
      // Guarda de ciclo de vida: un callback retenido de una generación
      // anterior nunca toca el store tras stop()/restart.
      const isLive = () => active && startedGeneration === generation;
      input.store.resetTransport();
      lastHadEffective = resolveEffectiveWidgetPolicy(input.store.getSnapshot()) !== null;
      unsubscribers = [
        // Al vencer la decisión sin frames nuevos se pide un snapshot fresco
        // a Go en vez de prolongar premium o caer a autoridad legacy.
        input.store.subscribe(() => {
          if (!isLive()) {
            return;
          }
          const has = resolveEffectiveWidgetPolicy(input.store.getSnapshot()) !== null;
          if (lastHadEffective && !has) {
            input.emit(WIDGET_POLICY_GET_EVENT);
          }
          lastHadEffective = has;
        }),
        input.subscribe(WIDGET_POLICY_SNAPSHOT_EVENT, (event) => {
          if (isLive()) {
            input.store.consumeSnapshot(unwrapEventPayload(event));
          }
        }),
        input.subscribe(WIDGET_POLICY_CHANGED_EVENT, (event) => {
          if (isLive()) {
            input.store.consumeChanged(unwrapEventPayload(event));
          }
        }),
      ];
      input.emit(WIDGET_POLICY_GET_EVENT);
    },
    stop() {
      active = false;
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      unsubscribers = [];
    },
  };
}

type EventSourceLike = {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
};

/**
 * Transporte SSE para OBS. El primer evento de cada conexión es el snapshot
 * autoritativo (vale revisión menor tras reinicio); después solo avanzan los
 * `changed`. Ante error se conservan los últimos derechos verificados y se
 * arma el snapshot de la reconexión automática del navegador.
 */
export function createSseWidgetPolicyAdapter(input: {
  store: WidgetPolicyStore;
  eventSourceFactory?: (url: string) => EventSourceLike;
  url?: string;
}): WidgetPolicyTransport {
  let source: EventSourceLike | null = null;
  let unsubscribeStore: (() => void) | null = null;
  let lastHadEffective = false;
  const factory = input.eventSourceFactory ?? ((url) => new EventSource(url));
  const url = input.url ?? WIDGET_POLICY_STREAM_URL;

  function connect(): void {
    const current = factory(url);
    source = current;
    // Guarda de ciclo de vida: tras close()/stop()/reconnect, un callback
    // tardío de una instancia anterior nunca toca el store ni rearma la
    // conexión actual.
    const isCurrent = () => source === current;
    current.addEventListener(WIDGET_POLICY_SNAPSHOT_EVENT, (event) => {
      if (!isCurrent()) {
        return;
      }
      try {
        input.store.consumeSnapshot(JSON.parse(event.data));
      } catch {
        // JSON inválido: se descarta sin sustituir el último snapshot.
      }
    });
    current.addEventListener(WIDGET_POLICY_CHANGED_EVENT, (event) => {
      if (!isCurrent()) {
        return;
      }
      try {
        input.store.consumeChanged(JSON.parse(event.data));
      } catch {
        // JSON inválido: se descarta sin sustituir el último snapshot.
      }
    });
    current.onerror = () => {
      if (!isCurrent()) {
        return;
      }
      input.store.resetTransport();
    };
  }

  return {
    start() {
      if (source) {
        return;
      }
      input.store.resetTransport();
      lastHadEffective = resolveEffectiveWidgetPolicy(input.store.getSnapshot()) !== null;
      unsubscribeStore = input.store.subscribe(() => {
        const has = resolveEffectiveWidgetPolicy(input.store.getSnapshot()) !== null;
        if (lastHadEffective && !has) {
          // Refresco ante caducidad: reconexión limpia para forzar el
          // snapshot autoritativo del servidor en vez de prolongar premium.
          input.store.resetTransport();
          source?.close();
          source = null;
          connect();
        }
        lastHadEffective = has;
      });
      connect();
    },
    stop() {
      unsubscribeStore?.();
      unsubscribeStore = null;
      source?.close();
      source = null;
    },
  };
}
