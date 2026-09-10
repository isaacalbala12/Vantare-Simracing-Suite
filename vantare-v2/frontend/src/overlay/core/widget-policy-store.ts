import {
  isWidgetPolicyExpired,
  parseWidgetPolicyWire,
  type WidgetPolicyWire,
} from "./widget-policy";

export type WidgetPolicyStore = {
  getSnapshot(): WidgetPolicyWire | null;
  subscribe(listener: () => void): () => void;
  /** Snapshot autoritativo de Go. Solo acepta revisión menor tras `resetTransport`. */
  consumeSnapshot(data: unknown): boolean;
  /** Incremental: solo acepta revisión estrictamente mayor en la conexión. */
  consumeChanged(data: unknown): boolean;
  /**
   * Reconexión reconocida hacia una autoridad nueva (reinicio de Go,
   * reconexión SSE, remontaje del transporte). Conserva los últimos derechos
   * verificados —no los prolonga: la caducidad se comprueba al leer— y arma
   * el próximo snapshot aunque traiga revisión menor.
   */
  resetTransport(): void;
  /** Libera el temporizador de caducidad y los suscriptores (desmontaje). */
  dispose(): void;
};

/**
 * Única fuente viva de la política nativa en el renderer. Sin snapshot el
 * lector decide fail-safe (Free); la revisión ordena eventos, reconexiones
 * y reinicios sin pisar nunca un `changed` más nuevo con un snapshot
 * retrasado del mismo transporte.
 */
export function createWidgetPolicyStore(): WidgetPolicyStore {
  let snapshot: WidgetPolicyWire | null = null;
  let awaitingAuthoritySnapshot = true;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  /** Tope real de setTimeout (~24,8 días): por encima se rearma por tramos. */
  const MAX_TIMER_DELAY_MS = 2_147_483_647;
  function notify(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function clearExpiryTimer(): void {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  function armExpiryTimer(policy: WidgetPolicyWire): void {
    clearExpiryTimer();
    if (policy.validUntil === undefined) {
      return;
    }
    // Leer Date.now en render no provoca renders por sí solo: el temporizador
    // notifica al vencer para que el runtime remonte en fail-safe aunque no
    // llegue ningún frame nuevo. No concede ni prolonga nada por sí mismo.
    const schedule = (): void => {
      const remaining = Date.parse(policy.validUntil as string) - Date.now();
      if (remaining <= 0) {
        expiryTimer = null;
        expireSnapshot();
        return;
      }
      // setTimeout se satura por encima de 2^31-1 ms (~24,8 días): un
      // paid_through a 30 días se programa por tramos rearmables para no
      // convertirlo en 1 ms y perder la expiración real.
      expiryTimer = setTimeout(() => {
        expiryTimer = null;
        schedule();
      }, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    schedule();
  }

  function expireSnapshot(): void {
    if (!snapshot || !isWidgetPolicyExpired(snapshot)) {
      return;
    }
    // useSyncExternalStore no re-renderiza si getSnapshot devuelve el MISMO
    // objeto: se publica una copia con idéntico contenido para que la
    // caducidad se vea en DOM (bloqueo/marca) sin frames ni eventos nuevos.
    // No inventa derechos: la lectura efectiva ya cae a fail-safe.
    snapshot = { ...snapshot };
    notify();
  }

  function adopt(next: WidgetPolicyWire): void {
    const changed = !snapshot || JSON.stringify(snapshot) !== JSON.stringify(next);
    snapshot = next;
    awaitingAuthoritySnapshot = false;
    armExpiryTimer(next);
    if (changed) {
      notify();
    }
  }

  return {
    getSnapshot(): WidgetPolicyWire | null {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    consumeSnapshot(data: unknown): boolean {
      const parsed = parseWidgetPolicyWire(data);
      if (!parsed) {
        return false;
      }
      if (snapshot && !awaitingAuthoritySnapshot && parsed.revision < snapshot.revision) {
        return false;
      }
      adopt(parsed);
      return true;
    },
    consumeChanged(data: unknown): boolean {
      const parsed = parseWidgetPolicyWire(data);
      if (!parsed) {
        return false;
      }
      if (snapshot && parsed.revision <= snapshot.revision) {
        return false;
      }
      adopt(parsed);
      return true;
    },
    resetTransport(): void {
      awaitingAuthoritySnapshot = true;
    },
    dispose(): void {
      clearExpiryTimer();
      listeners.clear();
    },
  };
}
