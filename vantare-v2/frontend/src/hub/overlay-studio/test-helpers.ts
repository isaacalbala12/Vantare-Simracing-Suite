import { buildMockTelemetry } from "../../overlay/core/mock-scenarios";
import {
  createTelemetryRateCoordinator,
  type TelemetryRateCoordinator,
} from "../../overlay/core/telemetry-rate-coordinator";

/**
 * El coordinador real reparte los snapshots con un setInterval por frecuencia:
 * el Studio se suscribe a 30 Hz, asi que en produccion cada widget se vuelve a
 * pintar cada 33 ms mientras el lienzo este montado. Eso es lo correcto en la
 * aplicacion y una fuente de ruido en las pruebas: durante toda la duracion de
 * cada test habia un temporizador repintando el lienzo entero sin que nadie se
 * lo pidiera, compitiendo con el sondeo de waitFor. Con la bateria completa y
 * varios workers en paralelo esa competencia convertia una espera de 200 ms en
 * una de mas de cinco segundos, y fallaba un test distinto en cada pasada.
 *
 * Aqui el planificador no arranca ningun temporizador: solo guarda su tick, y
 * publish lo invoca. Los widgets se repintan cuando la prueba publica, que es
 * exactamente lo que las pruebas quieren observar, y en ningun otro momento.
 */
export function createTestTelemetryCoordinator(): TelemetryRateCoordinator {
  const ticks = new Set<() => void>();
  const coordinator = createTelemetryRateCoordinator({
    createScheduler: () => {
      let registered: (() => void) | null = null;
      return {
        start(onTick) {
          registered = onTick;
          ticks.add(onTick);
        },
        stop() {
          if (registered) {
            ticks.delete(registered);
            registered = null;
          }
        },
      };
    },
  });

  const flushing: TelemetryRateCoordinator = {
    ...coordinator,
    publish(snapshot) {
      coordinator.publish(snapshot);
      for (const tick of [...ticks]) {
        tick();
      }
    },
  };

  flushing.publish(
    buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
  );
  return flushing;
}
