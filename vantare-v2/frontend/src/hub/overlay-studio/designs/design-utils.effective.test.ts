import { describe, expect, it } from "vitest";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { listOfficialDesigns } from "../../../overlay/design-systems/official-designs";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { resolveEffectiveDesign } from "./design-utils";

function standings(): WidgetInstanceV3 {
  return standingsDefinition.createDefault("standings-1");
}

const CATALOGUE = listOfficialDesigns("standings");

/**
 * A3: el `Select` "Diseno" decia "Sin diseno aplicado" en un widget que si
 * llevaba uno. La causa: `isActiveDesign` solo mira `visual.provenance`, que
 * unicamente se escribe al aplicar a mano; un widget recien creado no la tiene
 * pero se pinta con el diseno por defecto de su sistema.
 */
describe("resolveEffectiveDesign", () => {
  it("devuelve el diseno por defecto del sistema cuando no hay procedencia", () => {
    const widget = standings();
    expect(widget.visual.provenance).toBeUndefined();

    const design = resolveEffectiveDesign(widget, CATALOGUE);
    expect(design).not.toBeNull();
    expect(design?.systemId).toBe("vantare-original");
    expect(design?.isDefault).toBe(true);
  });

  it("devuelve el diseno aplicado cuando si hay procedencia", () => {
    const applied = CATALOGUE.find((design) => design.systemId === "vantare-crystal");
    expect(applied).toBeDefined();
    const widget: WidgetInstanceV3 = {
      ...standings(),
      visual: {
        ...standings().visual,
        systemId: "vantare-crystal",
        provenance: {
          designId: applied!.id,
          designName: applied!.name,
          origin: "vantare",
          appliedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };

    expect(resolveEffectiveDesign(widget, CATALOGUE)?.id).toBe(applied!.id);
  });

  it("no inventa un diseno cuando la procedencia apunta fuera del catalogo", () => {
    const widget: WidgetInstanceV3 = {
      ...standings(),
      visual: {
        ...standings().visual,
        provenance: {
          designId: "un-diseno-del-usuario-que-no-esta",
          designName: "Mio",
          origin: "user",
          appliedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };

    expect(resolveEffectiveDesign(widget, CATALOGUE)).toBeNull();
  });

  it("no ofrece el por defecto de otro sistema que el usuario este hojeando", () => {
    const widget = standings();
    const otherSystem = CATALOGUE.filter((design) => design.systemId === "vantare-crystal");
    expect(otherSystem.length).toBeGreaterThan(0);

    expect(resolveEffectiveDesign(widget, otherSystem)).toBeNull();
  });
});
