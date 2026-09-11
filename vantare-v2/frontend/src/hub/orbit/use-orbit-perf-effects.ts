import { useEffect } from "react";
import { Events } from "@wailsio/runtime";
import type { OverlayPerformanceV2 } from "../../generated/telemetry";

/**
 * Publica en `:root[data-orbit-perf-effects]` el presupuesto de efectos que
 * Go emite en `performance:level` (`OverlayPerformanceV2.effects`: "full",
 * "noBlur" o "flat"), para que la CSS de la shell apague el frosting —y en
 * "flat" también las animaciones infinitas y las sombras grandes— cuando el
 * nivel de rendimiento lo pide (ISA-1150).
 *
 * Mismo patrón que `data-orbit-resizing`: atributo imperativo sobre
 * `documentElement`, así lo heredan también los portales (paleta, cajón,
 * confirmación) y ningún cambio de nivel re-renderiza React. Los widgets del
 * overlay viven en otra ventana/documento y siguen su propia política.
 */
export function useOrbitPerfEffects(): void {
  useEffect(() => {
    const root = document.documentElement;
    const unsubscribe = Events.On(
      "performance:level",
      (event: { data?: OverlayPerformanceV2 }) => {
        const effects = event.data?.effects;
        if (effects === "full" || effects === "noBlur" || effects === "flat") {
          root.dataset.orbitPerfEffects = effects;
        }
      },
    );
    // Go solo publica `performance:level` cuando algo lo provoca: `settings:get`
    // responde además con la política vigente, así que sin esta llamada la
    // shell arrancaría sin atributo hasta el primer cambio de nivel. Emitirlo
    // más de una vez es inofensivo (mismo contrato que `useOverlayState`).
    Events.Emit("settings:get");
    return () => {
      unsubscribe?.();
      delete root.dataset.orbitPerfEffects;
    };
  }, []);
}
