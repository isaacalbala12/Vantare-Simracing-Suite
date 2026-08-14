import { describe, expect, it } from "vitest";
import { conformAspectLockedLayout } from "./profile-layout-conform";
import { widgetTypeRegistry } from "./widget-registry";
import type { WidgetInstanceV3 } from "./profile-document";

function widget(type: string, w: number, h: number): WidgetInstanceV3 {
  const base = widgetTypeRegistry.get(type as WidgetInstanceV3["type"]).createDefault("probe");
  return { ...base, layout: { ...base.layout, w, h } };
}

describe("conformAspectLockedLayout", () => {
  it("conforms the delta geometry that shipped in legacy profiles", () => {
    // Caso real: el perfil heredado guardaba 488x122 -- proporcion 4,0 frente a
    // la natural 2,92 -- y la migracion lo copio tal cual. El alto util caia a
    // 70px cuando la barra de Crystal necesita 92, de ahi el recorte.
    const conformed = conformAspectLockedLayout(widget("delta", 488, 122));
    const { defaultSize } = widgetTypeRegistry.get("delta").capabilities;
    expect(conformed.layout.w).toBe(488);
    expect(conformed.layout.h).toBe(Math.round(488 / (defaultSize.width / defaultSize.height)));
    // Con pixeles enteros la proporcion exacta no es alcanzable: 488/167 da
    // 2,9222 frente a 2,9167. Un pixel de holgura es el limite del redondeo,
    // no una tolerancia elegida a conveniencia.
    expect(
      Math.abs(conformed.layout.h - conformed.layout.w / (defaultSize.width / defaultSize.height)),
    ).toBeLessThanOrEqual(1);
  });

  it("leaves a conforming layout untouched", () => {
    const { defaultSize } = widgetTypeRegistry.get("delta").capabilities;
    const original = widget("delta", defaultSize.width, defaultSize.height);
    expect(conformAspectLockedLayout(original)).toBe(original);
  });

  it("keeps the natural ratio when the minimum height takes over", () => {
    // minimumSize no respeta la proporcion natural (delta declara 120x48, que
    // es 2,5), asi que el ancho debe recalcularse desde el minimo de alto.
    const { defaultSize, minimumSize } = widgetTypeRegistry.get("delta").capabilities;
    const conformed = conformAspectLockedLayout(widget("delta", 10, 10));
    expect(conformed.layout.h).toBeGreaterThanOrEqual(minimumSize.height);
    // Con pixeles enteros la proporcion exacta no es alcanzable: 488/167 da
    // 2,9222 frente a 2,9167. Un pixel de holgura es el limite del redondeo,
    // no una tolerancia elegida a conveniencia.
    expect(
      Math.abs(conformed.layout.h - conformed.layout.w / (defaultSize.width / defaultSize.height)),
    ).toBeLessThanOrEqual(1);
  });

  it("does not touch widget types whose aspect the user may unlock", () => {
    const unlockable = widgetTypeRegistry
      .list()
      .find((definition) => definition.capabilities.supportsAspectUnlock);
    expect(unlockable).toBeDefined();
    const original = widget(unlockable!.type, 777, 111);
    expect(conformAspectLockedLayout(original)).toBe(original);
  });

  it("normalizes legacy broadcast towers to their fixed strip height", () => {
    const legacy = widget("broadcast-tower", 520, 260);
    legacy.layout.aspectLocked = true;

    const conformed = conformAspectLockedLayout(legacy);

    expect(conformed.layout).toMatchObject({ w: 520, h: 71, aspectLocked: false });
  });
});
