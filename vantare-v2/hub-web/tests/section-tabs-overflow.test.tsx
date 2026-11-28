// @vitest-environment jsdom
// Issue 2896: ninguna pestaña de la barra queda oculta e inalcanzable.
//
// jsdom no tiene layout. Este test simula solo la fila de pestañas: el ancho de
// cada pestaña (medido en Chromium, isa-2896/medidas.md), el hueco de la barra y
// el desplazamiento horizontal de la lista. El espacio entre pestañas y el ancho
// de «⋯» salen de la cascada real de ui.css (tests/helpers/css-cascade.ts). Sin
// esperas de reloj: el ResizeObserver se dispara a mano tras cada render.

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SectionChrome,
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { shellText } from "../src/renderer/i18n/shell.es";
import { Cascade, type Viewport } from "./helpers/css-cascade";

const cascade = new Cascade([
  "ui/gate.css",
  "design/generated/tokens.css",
  "design/base.css",
  "ui/ui.css",
]);
// Las 8 pestañas de Ajustes, con su ancho a zoom 100 % en Chromium.
const AJUSTES = [
  ["account", "Cuenta", 44.1],
  ["general", "General", 47.9],
  ["appearance", "Apariencia", 65.7],
  ["performance", "Rendimiento en pista", 128.1],
  ["shortcuts", "Atajos", 38.1],
  ["updates", "Actualizaciones", 96.9],
  ["privacy", "Privacidad", 64.8],
  ["diagnostics", "Diagnóstico", 72.8],
] as const;
const NAMES = AJUSTES.map(([, name]) => name);
// Hueco medido para las pestañas (`.v-section-tabs-slot`), en px CSS.
const SLOT = {
  "1280": 675.6,
  "1440": 835.6,
  "1280 con la barra lateral abierta": 479.6,
} as const;

/** Fila de pestañas simulada: posiciones, desplazamiento y «⋯». */
class Row {
  scroll = 0;
  readonly callbacks = new Set<() => void>();
  constructor(
    public slot: number,
    readonly widths: readonly number[] = AJUSTES.map(([, , width]) => width),
  ) {}
  private viewport(): Viewport {
    return {
      width: 1280,
      height: 720,
      containers: { "section-tabs": this.slot },
    };
  }
  list() {
    const list = document.querySelector<HTMLElement>(".v-section-tab-list");
    if (!list) throw new Error("Sin lista de pestañas");
    return list;
  }
  more() {
    return document.querySelector<HTMLElement>(".v-section-tabs-more");
  }
  gap() {
    const list = this.list();
    return cascade.px(
      list,
      cascade.value(list, "gap", this.viewport()) ?? "",
      this.viewport(),
    );
  }
  /** Ancho de «⋯» más el espacio que lo separa de la lista. */
  moreWidth() {
    const more = this.more();
    if (!more || more.hidden) return 0;
    const root = this.list().parentElement as Element;
    const width = cascade.value(more, "min-width", this.viewport()) ?? "";
    const gap = cascade.value(root, "gap", this.viewport()) ?? "";
    return (
      cascade.px(more, width, this.viewport()) +
      cascade.px(root, gap, this.viewport())
    );
  }
  offsets() {
    const gap = this.gap();
    let x = 0;
    return this.widths.map((width) => {
      const left = x;
      x += width + gap;
      return left;
    });
  }
  content() {
    const offsets = this.offsets();
    const last = this.widths.length - 1;
    // `padding-inline-end: 1px` de la lista.
    return (offsets[last] ?? 0) + (this.widths[last] ?? 0) + 1;
  }
  listWidth() {
    return Math.min(this.content(), this.slot - this.moreWidth());
  }
  rect(element: Element) {
    const box = (left: number, width: number) =>
      ({
        left,
        right: left + width,
        width,
        top: 0,
        bottom: 52,
        height: 52,
        x: left,
        y: 0,
      }) as DOMRect;
    if (element.matches(".v-section-tab-list")) return box(0, this.listWidth());
    if (element.matches(".v-section-tab-list [role=tab]")) {
      const index = [...this.list().querySelectorAll("[role=tab]")].indexOf(
        element,
      );
      return box(
        (this.offsets()[index] ?? 0) - this.scroll,
        this.widths[index] ?? 0,
      );
    }
    return box(0, 0);
  }
  /** `scrollIntoView({ inline: "nearest" })` dentro de la lista. */
  reveal(element: Element) {
    if (!element.matches(".v-section-tab-list [role=tab]")) return;
    const box = this.rect(element);
    const width = this.listWidth();
    if (box.left < 0) this.scroll += box.left;
    else if (box.right > width) this.scroll += box.right - width;
    this.scroll = Math.max(0, Math.min(this.scroll, this.content() - width));
    this.list().dispatchEvent(new Event("scroll"));
  }
  /** Repite el ResizeObserver hasta que la fila deja de cambiar. */
  settle() {
    for (let round = 0; round < 6; round++) {
      const before = this.state();
      act(() => {
        for (const callback of this.callbacks) callback();
      });
      if (this.state() === before) return;
    }
    throw new Error("La fila de pestañas no se estabiliza");
  }
  private state() {
    return JSON.stringify([this.scroll, this.more()?.hidden, clippedNames()]);
  }
}

let row: Row;
beforeEach(() => {
  row = new Row(SLOT["1280"]);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly callback: () => void;
      constructor(callback: () => void) {
        this.callback = () => callback();
        row.callbacks.add(this.callback);
      }
      observe() {}
      disconnect() {
        row.callbacks.delete(this.callback);
      }
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return row.rect(this);
    },
  );
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    row.reveal(this);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: jsdom no define scrollIntoView.
  delete (Element.prototype as any).scrollIntoView;
});

function Screen({
  initial,
  onChange,
  disabled,
}: {
  initial: string;
  onChange?: (id: string) => void;
  disabled?: string;
}) {
  const [tab, setTab] = useState(initial);
  return (
    <SectionChrome
      title="Ajustes"
      tabs={AJUSTES.map(([id, etiqueta]) => ({
        id,
        etiqueta,
        visible: true,
        ariaDisabled: id === disabled || undefined,
      }))}
      activeTab={tab}
      onTabChange={(id) => {
        onChange?.(id);
        setTab(id);
      }}
    />
  );
}
function mount(options: Parameters<typeof Screen>[0]) {
  render(
    <SectionChromeProvider>
      <div className="v-titlebar">
        <SectionTabsSlot />
      </div>
      <Screen {...options} />
    </SectionChromeProvider>,
  );
  row.settle();
}
const tablist = () => screen.getByRole("tablist", { name: "Ajustes" });
const tab = (name: string) => screen.getByRole("tab", { name });
function clippedNames() {
  return [...document.querySelectorAll(".v-section-tab-list [role=tab]")]
    .filter((node) => node.hasAttribute("data-clipped"))
    .map((node) => node.textContent ?? "");
}
const visibleNames = () =>
  NAMES.filter((name) => !clippedNames().includes(name));
const moreButton = () =>
  screen.queryByRole("button", { name: shellText.moreSectionTabs("Ajustes") });

async function menuNames(user: ReturnType<typeof userEvent.setup>) {
  const more = moreButton();
  if (!more) return [];
  expect(more.getAttribute("aria-haspopup")).toBe("menu");
  expect(more.getAttribute("aria-expanded")).toBe("false");
  await user.click(more);
  const menu = await screen.findByRole("menu", {
    name: shellText.moreSectionTabs("Ajustes"),
  });
  expect(more.getAttribute("aria-expanded")).toBe("true");
  const names = within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent ?? "");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(more.getAttribute("aria-expanded")).toBe("false");
  await waitFor(() => expect(document.activeElement).toBe(more));
  return names;
}

describe("A1: espacio entre pestañas", () => {
  it("con menos de 760 px de hueco baja a 16 px; con más sigue en 20 px", () => {
    mount({ initial: "general" });
    expect(row.gap()).toBe(16);
    row.slot = SLOT["1440"];
    expect(row.gap()).toBe(20);
    row.slot = 759.9;
    expect(row.gap()).toBe(16);
    row.slot = 760;
    expect(row.gap()).toBe(20);
  });
});

describe("pestañas de Ajustes que no caben (issue 2896)", () => {
  it.each(["1280", "1440"] as const)(
    "a %s se ven las 8 pestañas y no aparece «⋯»",
    async (width) => {
      row.slot = SLOT[width];
      mount({ initial: "general" });
      expect(visibleNames()).toEqual(NAMES);
      expect(moreButton()).toBeNull();
      expect(await menuNames(userEvent.setup())).toEqual([]);
    },
  );

  it("con la barra lateral abierta, cada pestaña se ve o está en «⋯», nunca en los dos", async () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    mount({ initial: "general" });
    const user = userEvent.setup();
    const hidden = clippedNames();
    expect(hidden.length).toBeGreaterThan(0);
    const menu = await menuNames(user);
    expect(menu).toEqual(hidden);
    for (const name of NAMES)
      expect(menu.includes(name)).not.toBe(visibleNames().includes(name));
    expect(menu).toContain("Diagnóstico");
  });

  it("«⋯» va fuera de la lista: la tablist solo contiene pestañas", () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    mount({ initial: "general" });
    const more = moreButton();
    expect(more).not.toBeNull();
    expect(tablist().contains(more)).toBe(false);
    for (const child of tablist().children)
      expect(child.getAttribute("role")).toBe("tab");
    expect(within(tablist()).queryAllByRole("button")).toHaveLength(0);
  });

  it.each(["Diagnóstico", "Privacidad", "Actualizaciones"])(
    "elegir «%s» en el menú la selecciona, le da el foco y la deja a la vista",
    async (name) => {
      row.slot = SLOT["1280 con la barra lateral abierta"];
      const onChange = vi.fn();
      mount({ initial: "general", onChange });
      const user = userEvent.setup();
      const more = moreButton();
      if (!more) throw new Error("Falta «⋯»");
      await user.click(more);
      await user.click(await screen.findByRole("menuitem", { name }));
      await waitFor(() => expect(document.activeElement).toBe(tab(name)));
      row.settle();
      const id = AJUSTES.find(([, label]) => label === name)?.[0];
      expect(onChange).toHaveBeenCalledWith(id);
      expect(tab(name).getAttribute("aria-selected")).toBe("true");
      expect(clippedNames()).not.toContain(name);
      // Las de la otra punta pasan al menú; ninguna se pierde.
      const menu = await menuNames(user);
      for (const other of NAMES)
        expect(menu.includes(other)).not.toBe(visibleNames().includes(other));
    },
  );

  it("la pestaña seleccionada nunca queda oculta, aunque no tenga el foco", () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    // Diagnóstico seleccionada desde fuera (panel lateral, búsqueda o un cambio de tamaño).
    mount({ initial: "diagnostics" });
    expect(document.activeElement).toBe(document.body);
    expect(clippedNames()).not.toContain("Diagnóstico");
    expect(moreButton()).not.toBeNull();
  });

  it("seleccionada desde fuera (panel lateral, búsqueda) se desplaza a la vista", () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    const tabs = AJUSTES.map(([id, etiqueta]) => ({
      id,
      etiqueta,
      visible: true,
    }));
    const view = render(
      <SectionChromeProvider>
        <div className="v-titlebar">
          <SectionTabsSlot />
        </div>
        <SectionChrome title="Ajustes" tabs={tabs} activeTab="general" />
      </SectionChromeProvider>,
    );
    row.settle();
    expect(clippedNames()).toContain("Diagnóstico");
    view.rerender(
      <SectionChromeProvider>
        <div className="v-titlebar">
          <SectionTabsSlot />
        </div>
        <SectionChrome title="Ajustes" tabs={tabs} activeTab="diagnostics" />
      </SectionChromeProvider>,
    );
    row.settle();
    expect(document.activeElement).toBe(document.body);
    expect(clippedNames()).not.toContain("Diagnóstico");
  });

  it("al estrechar la fila (ventana o barra lateral), la seleccionada sigue a la vista", () => {
    mount({ initial: "diagnostics" });
    expect(clippedNames()).toEqual([]);
    row.slot = SLOT["1280 con la barra lateral abierta"];
    row.settle();
    expect(clippedNames().length).toBeGreaterThan(0);
    expect(clippedNames()).not.toContain("Diagnóstico");
  });

  it("desplazar la lista a mano llega a otra pestaña: no vuelve a la seleccionada", () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    mount({ initial: "diagnostics" });
    expect(clippedNames()).toContain("Cuenta");
    // Como Playwright o un panel táctil antes de pulsar «Cuenta».
    act(() => row.reveal(tab("Cuenta")));
    row.settle();
    expect(clippedNames()).not.toContain("Cuenta");
    expect(clippedNames()).toContain("Diagnóstico");
  });

  it("una pestaña desactivada sale desactivada en el menú y no se elige", async () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    const onChange = vi.fn();
    mount({ initial: "general", onChange, disabled: "diagnostics" });
    const user = userEvent.setup();
    const more = moreButton();
    if (!more) throw new Error("Falta «⋯»");
    await user.click(more);
    const item = await screen.findByRole("menuitem", { name: "Diagnóstico" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    await user.click(item);
    expect(onChange).not.toHaveBeenCalled();
    expect(tab("General").getAttribute("aria-selected")).toBe("true");
  });

  it("teclado: Fin y Inicio recorren las 8 pestañas y la enfocada se ve", async () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    mount({ initial: "general" });
    const user = userEvent.setup();
    tab("General").focus();
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tab("Diagnóstico"));
    row.settle();
    expect(clippedNames()).not.toContain("Diagnóstico");
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tab("Cuenta"));
    row.settle();
    expect(clippedNames()).not.toContain("Cuenta");
  });
});

describe("tolerancia del recorte con zoom fraccionario", () => {
  // Al 90 % el desplazamiento se ajusta al píxel físico: se midió 0,47 px.
  // Apariencia seleccionada: General no está protegida por estar seleccionada.
  it.each([0.47, 0.99])(
    "General %s px fuera por la izquierda sigue a la vista",
    (out) => {
      row.slot = SLOT["1280 con la barra lateral abierta"];
      mount({ initial: "appearance" });
      row.scroll = 44.1 + row.gap() + out;
      act(() => row.list().dispatchEvent(new Event("scroll")));
      expect(clippedNames()).not.toContain("General");
      expect(clippedNames()).toContain("Cuenta");
    },
  );

  it("más de 1 px fuera sí se marca como oculta", () => {
    row.slot = SLOT["1280 con la barra lateral abierta"];
    mount({ initial: "appearance" });
    row.scroll = 44.1 + row.gap() + 1.5;
    act(() => row.list().dispatchEvent(new Event("scroll")));
    expect(clippedNames()).toContain("General");
  });
});
