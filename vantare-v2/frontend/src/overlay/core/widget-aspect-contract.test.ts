import { describe, expect, it } from "vitest";
import { widgetTypeRegistry } from "./widget-registry";

describe("contrato de proporcion de los tipos de widget", () => {
  it("el minimo respeta la proporcion natural cuando el tipo la bloquea", () => {
    // supportsAspectUnlock:false significa que el editor ni siquiera ofrece
    // desbloquear la proporcion. Un minimo con otra proporcion se contradice con
    // esa promesa: al arrastrar hasta el limite el widget adopta una forma que
    // el propio tipo declara imposible, y obliga a conformAspectLockedLayout a
    // recalcular. delta declaraba 280x96 (2,92) con minimo 120x48 (2,5).
    const offenders: string[] = [];
    for (const definition of widgetTypeRegistry.list()) {
      const { supportsAspectUnlock, defaultSize, minimumSize } = definition.capabilities;
      if (supportsAspectUnlock) continue;
      const natural = defaultSize.width / defaultSize.height;
      const minimum = minimumSize.width / minimumSize.height;
      // Un pixel de holgura: con dimensiones enteras la proporcion exacta no
      // siempre es alcanzable. El 120x48 anterior de delta se desviaba casi
      // siete, asi que la comprobacion no es complaciente.
      const expectedHeight = minimumSize.width / natural;
      if (Math.abs(minimumSize.height - expectedHeight) > 1) {
        offenders.push(
          `${definition.type}: natural ${defaultSize.width}x${defaultSize.height} (${natural.toFixed(2)}), minimo ${minimumSize.width}x${minimumSize.height} (${minimum.toFixed(2)})`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ningun minimo supera al tamano por defecto", () => {
    for (const definition of widgetTypeRegistry.list()) {
      const { defaultSize, minimumSize } = definition.capabilities;
      expect(minimumSize.width).toBeLessThanOrEqual(defaultSize.width);
      expect(minimumSize.height).toBeLessThanOrEqual(defaultSize.height);
    }
  });
});
