import { useSyncExternalStore } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetInstanceV3 } from "./profile-document";
import { createWidgetPolicyStore, type WidgetPolicyStore } from "./widget-policy-store";
import { isWidgetTypeAllowed, resolveWidgetBrandVisible } from "./widget-policy";

afterEach(() => cleanup());

function standingsCrystal(showBrand: boolean): WidgetInstanceV3 {
  return {
    id: "standings-main",
    type: "standings",
    layout: { x: 0, y: 0, w: 300, h: 300, zIndex: 0, aspectLocked: false },
    behavior: { enabled: true, updateHz: 4 },
    content: {},
    visual: {
      systemId: "vantare-crystal",
      systemVersion: 1,
      configVersion: 1,
      baseSettings: {},
      appearanceOverrides: { showBrand },
    },
  };
}

function Probe({ store, widget }: { store: WidgetPolicyStore; widget: WidgetInstanceV3 }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <div
      data-testid="probe"
      data-delta-allowed={isWidgetTypeAllowed(snapshot, "delta")}
      data-brand-visible={resolveWidgetBrandVisible(snapshot, widget)}
    />
  );
}

describe("widget policy expiry in a real subscriber", () => {
  it("shows the block and restores the mandatory brand in DOM without new frames or events", () => {
    vi.useFakeTimers();
    try {
      const store = createWidgetPolicyStore();
      // Opt-out explícito: con pago la marca se oculta; al vencer debe
      // restaurarse la obligatoria junto con el bloqueo premium.
      const widget = standingsCrystal(false);
      const view = render(<Probe store={store} widget={widget} />);
      const probe = () => view.getByTestId("probe") as HTMLElement;

      // Sin snapshot: fail-safe visible desde el primer render.
      expect(probe().dataset.deltaAllowed).toBe("false");
      expect(probe().dataset.brandVisible).toBe("true");

      // Snapshot paid con caducidad: delta abierto y marca oculta por opt-out.
      act(() => {
        store.consumeSnapshot({
          revision: 2,
          overlaysBasic: true,
          overlaysAdvanced: true,
          engineerAI: false,
          brandCrystal: "optional",
          brandEfficiency: "optional",
          brandOriginal: "none",
          validUntil: new Date(Date.now() + 5_000).toISOString(),
        });
      });
      expect(probe().dataset.deltaAllowed).toBe("true");
      expect(probe().dataset.brandVisible).toBe("false");

      // Vence sin ningún consume/evento/frame nuevo: el DOM vuelve a
      // bloqueo premium y restaura la marca obligatoria solo con la
      // notificación del store.
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(probe().dataset.deltaAllowed).toBe("false");
      expect(probe().dataset.brandVisible).toBe("true");
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
