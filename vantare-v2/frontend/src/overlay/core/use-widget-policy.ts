import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Events } from "@wailsio/runtime";
import {
  createSseWidgetPolicyAdapter,
  createWailsWidgetPolicyAdapter,
  WIDGET_POLICY_STREAM_URL,
} from "../../overlay/core/widget-policy-transport";
import {
  createWidgetPolicyStore,
  type WidgetPolicyStore,
} from "../../overlay/core/widget-policy-store";
import type { WidgetPolicyWire } from "../../overlay/core/widget-policy";

/**
 * Política nativa de widgets para una raíz de app (ISA-1105). Una única
 * conexión por ventana: Studio/Desktop por Wails, OBS por SSE. Sin snapshot
 * el lector decide fail-safe (Free básica); la caducidad la notifica el
 * store y el adaptador pide un snapshot fresco sin prolongar premium.
 */
export function useWailsWidgetPolicy(): {
  store: WidgetPolicyStore;
  policy: WidgetPolicyWire | null;
} {
  const [store] = useState(() => createWidgetPolicyStore());

  useEffect(() => {
    const adapter = createWailsWidgetPolicyAdapter({
      store,
      subscribe: (event, handler) => {
        const unsubscribe = Events.On(event, (payload: { data: unknown }) => handler(payload));
        return () => unsubscribe?.();
      },
      emit: (event, payload) => {
        Events.Emit(event, payload ?? {});
      },
    });
    adapter.start();
    return () => {
      adapter.stop();
      store.dispose();
    };
  }, [store]);

  const policy = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({ store, policy }), [store, policy]);
}

export function useSseWidgetPolicy(url: string = WIDGET_POLICY_STREAM_URL): {
  store: WidgetPolicyStore;
  policy: WidgetPolicyWire | null;
} {
  const [store] = useState(() => createWidgetPolicyStore());

  useEffect(() => {
    const adapter = createSseWidgetPolicyAdapter({ store, url });
    adapter.start();
    return () => {
      adapter.stop();
      store.dispose();
    };
  }, [store, url]);

  const policy = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({ store, policy }), [store, policy]);
}
