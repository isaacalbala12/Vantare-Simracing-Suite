// @vitest-environment jsdom
// Issue 2854: barra de título del Hub y cabecera del onboarding.
//
// jsdom no calcula `-webkit-app-region`, `:hover` ni el layout, así que estos
// tests resuelven la cascada de los CSS reales (tests/helpers/css-cascade.ts)
// sobre el DOM que pintan los componentes reales. Son deterministas: no hay
// esperas de reloj. El arrastre real y el clic se comprueban en Electron (P8).

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SectionChrome,
  SectionChromeProvider,
} from "../src/renderer/app/SectionChrome";
import { windowText } from "../src/renderer/i18n/window.es";
import { IconButton } from "../src/renderer/ui/Button";
import { TitleBar } from "../src/renderer/ui/Frame";
import { GateFrame } from "../src/renderer/ui/GateFrame";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { OnboardingFrame } from "../src/renderer/ui/onboarding/Frame";
import { ActionGroup } from "../src/renderer/ui/ShellLayout";
import { WindowButtons } from "../src/renderer/ui/WindowButtons";
import { Cascade, specificity, type Viewport } from "./helpers/css-cascade";

// Orden de carga del Hub: gate.css entra con la primera importación de
// main.tsx, después base.css (con los tokens) y ui.css, y el onboarding llega
// en un chunk diferido.
const files = [
  "ui/gate.css",
  "design/generated/tokens.css",
  "design/base.css",
  "ui/ui.css",
  "ui/onboarding/onboarding.css",
] as const;
const cascade = new Cascade(files);
const viewports: Viewport[] = [
  { width: 1280, height: 720 },
  { width: 1280, height: 900 },
  { width: 1440, height: 1000 },
];
const themes = ["light", "dark"] as const;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-scheme");
});

function windowButtons() {
  return (
    <WindowButtons
      maximized={false}
      disabled={false}
      labels={windowText}
      minimize={() => {}}
      maximize={() => {}}
      close={() => {}}
    />
  );
}
function renderHub(withTabs: boolean) {
  render(
    <TooltipProvider>
      <SectionChromeProvider>
        <TitleBar
          title="Ajustes"
          status="Esperando simulador"
          controls={windowButtons()}
          actions={
            <ActionGroup>
              <IconButton label="Panel lateral" variant="ghost">
                <span />
              </IconButton>
            </ActionGroup>
          }
        />
        <SectionChrome
          title="Ajustes"
          activeTab="general"
          tabs={
            withTabs
              ? [
                  { id: "general", etiqueta: "General", visible: true },
                  { id: "apariencia", etiqueta: "Apariencia", visible: true },
                ]
              : []
          }
        />
      </SectionChromeProvider>
    </TooltipProvider>,
  );
  const bar = document.querySelector(".v-titlebar");
  if (!bar) throw new Error("Sin barra de título");
  return bar;
}
function renderOnboarding(scale: number) {
  render(
    <OnboardingFrame
      step={0}
      message="Preparado"
      art={null}
      canContinue
      reducedMotion
      back={() => {}}
      next={() => {}}
      skip={() => {}}
      windowControls={windowButtons()}
    >
      {null}
    </OnboardingFrame>,
  );
  const frame = screen.getByRole("region", { name: "Configuración inicial" });
  frame.style.setProperty("--ob-s", String(scale));
  return frame;
}
function controlsOf(scope: Element) {
  const controls = scope.querySelector(".v-window-controls");
  if (!controls) throw new Error("Sin botones de ventana");
  return {
    controls,
    buttons: within(controls as HTMLElement).getAllByRole("button"),
    close: within(controls as HTMLElement).getByRole("button", {
      name: windowText.close,
    }),
  };
}
/** Escala del asistente: misma fórmula que Frame.tsx (ancho/1600, alto/900). */
const scaleOf = ({ width, height }: Viewport) =>
  Math.max(0.5, Math.min(width / 1600, height / 900));
function setTheme(scheme: (typeof themes)[number]) {
  document.documentElement.dataset.palette = "vantare";
  document.documentElement.dataset.scheme = scheme;
}
function withState<T>(element: Element, state: string, run: () => T) {
  // El estado de :hover alcanza también a los ancestros, como en el navegador.
  const touched: Element[] = [];
  for (
    let node: Element | null = element;
    node && (state !== "data-css-focus-visible" || node === element);
    node = node.parentElement
  ) {
    node.setAttribute(state, "");
    touched.push(node);
  }
  try {
    return run();
  } finally {
    for (const node of touched) node.removeAttribute(state);
  }
}
const hover = <T,>(element: Element, run: () => T) =>
  withState(element, "data-css-hover", run);
const focusVisible = <T,>(element: Element, run: () => T) =>
  withState(element, "data-css-focus-visible", run);

describe("zona de arrastre de la barra (-webkit-app-region)", () => {
  it.each(viewports)(
    "Hub $width×$height: el hueco arrastra; pestañas, acciones y botones reciben el clic",
    (viewport) => {
      const bar = renderHub(true);
      const region = (element: Element) => cascade.appRegion(element, viewport);
      const slot = bar.querySelector(".v-section-tabs-slot");
      expect(slot, "el hueco central de la barra debe existir").not.toBeNull();
      expect(region(bar)).toBe("drag");
      expect(region(slot as Element)).toBe("drag");
      expect(region(bar.querySelector(".v-section-title") as Element)).toBe(
        "drag",
      );
      // Los huecos entre pestañas pertenecen a la lista, que hereda del hueco.
      expect(region(bar.querySelector(".v-section-tab-list") as Element)).toBe(
        "drag",
      );
      const tabs = within(bar as HTMLElement).getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      for (const tab of tabs) expect(region(tab)).toBe("no-drag");
      const { controls, buttons } = controlsOf(bar);
      expect(region(controls)).toBe("no-drag");
      expect(buttons).toHaveLength(3);
      for (const button of buttons) expect(region(button)).toBe("no-drag");
      const actions = bar.querySelector(".v-titlebar-actions") as Element;
      expect(region(actions)).toBe("no-drag");
      expect(region(within(actions as HTMLElement).getByRole("button"))).toBe(
        "no-drag",
      );
    },
  );

  it("Inicio, sin pestañas: el hueco vacío también arrastra", () => {
    const bar = renderHub(false);
    expect(within(bar as HTMLElement).queryAllByRole("tab")).toHaveLength(0);
    const slot = bar.querySelector(".v-section-tabs-slot") as Element;
    expect(cascade.appRegion(slot, viewports[0] as Viewport)).toBe("drag");
  });

  it.each(viewports)(
    "onboarding $width×$height: la cabecera arrastra; «Saltar» y los botones no",
    (viewport) => {
      const frame = renderOnboarding(scaleOf(viewport));
      const header = frame.querySelector(".v-ob-header") as Element;
      expect(cascade.appRegion(header, viewport)).toBe("drag");
      expect(
        cascade.appRegion(
          within(header as HTMLElement).getByRole("button", { name: "Saltar" }),
          viewport,
        ),
      ).toBe("no-drag");
      const { controls, buttons } = controlsOf(frame);
      expect(cascade.appRegion(controls, viewport)).toBe("no-drag");
      for (const button of buttons)
        expect(cascade.appRegion(button, viewport)).toBe("no-drag");
    },
  );

  it("solo los CSS cargados por este test declaran -webkit-app-region", () => {
    // Si otro CSS empieza a decidir el arrastre, este test debe cargarlo.
    const root = resolve(__dirname, "../src/renderer");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : entry.name.endsWith(".css")
            ? [join(dir, entry.name)]
            : [],
      );
    const declaring = walk(root)
      .filter((path) => readFileSync(path, "utf8").includes("app-region"))
      .map((path) => relative(root, path).replaceAll("\\", "/"))
      .sort();
    expect(
      declaring.every((path) => (files as readonly string[]).includes(path)),
    ).toBe(true);
  });
});

describe("altura de los botones de ventana", () => {
  /** Centro vertical de la caja de contenido de una barra flex con borde inferior. */
  function contentCenter(bar: Element, viewport: Viewport) {
    const height = cascade.px(
      bar,
      cascade.value(bar, "height", viewport) ?? "",
      viewport,
    );
    const border = cascade.value(bar, "border-bottom", viewport) ?? "";
    const borderPx = Number.parseFloat(
      /(\d+(?:\.\d+)?)px/.exec(border)?.[1] ?? "0",
    );
    return {
      height,
      center: (height - borderPx) / 2,
      inner: height - borderPx,
    };
  }

  it.each(viewports)(
    "Hub $width×$height: los símbolos quedan a la altura del título y las acciones",
    (viewport) => {
      const bar = renderHub(true);
      const { controls, buttons } = controlsOf(bar);
      expect(cascade.value(bar, "align-items", viewport)).toBe("center");
      const { height, center } = contentCenter(bar, viewport);
      expect(height).toBe(52);
      // Los botones llenan la barra (sin su línea inferior): su centro es el de la barra.
      expect(cascade.value(controls, "align-self", viewport)).toBe("stretch");
      expect(cascade.value(controls, "height", viewport)).toBe("auto");
      for (const button of buttons) {
        expect(cascade.value(button, "height", viewport)).toBe("100%");
        expect(cascade.value(button, "min-height", viewport)).toBe("0");
      }
      expect(center).toBe(25.5);
    },
  );

  it.each(viewports)(
    "onboarding $width×$height: los símbolos quedan a la altura de «Saltar» (0 px)",
    (viewport) => {
      const frame = renderOnboarding(scaleOf(viewport));
      const header = frame.querySelector(".v-ob-header") as Element;
      expect(cascade.value(header, "align-items", viewport)).toBe("center");
      const { center, inner } = contentCenter(header, viewport);
      const { controls, buttons } = controlsOf(frame);
      expect(cascade.value(controls, "position", viewport)).toBe("absolute");
      const top = cascade.px(
        controls,
        cascade.value(controls, "top", viewport) ?? "",
        viewport,
      );
      const height = cascade.px(
        controls,
        cascade.value(controls, "height", viewport) ?? "",
        viewport,
      );
      expect(top).toBe(0);
      expect(height).toBeCloseTo(inner, 6);
      for (const button of buttons)
        expect(cascade.value(button, "height", viewport)).toBe("100%");
      expect(top + height / 2 - center).toBeCloseTo(0, 6);
    },
  );

  it("la puerta de Acceso conserva su barra de 36 px", () => {
    const viewport = viewports[0] as Viewport;
    render(<GateFrame controls={windowButtons()}>{null}</GateFrame>);
    const bar = document.querySelector(".v-gate-titlebar") as Element;
    const { controls, buttons } = controlsOf(bar);
    expect(cascade.value(bar, "height", viewport)).toBe("36px");
    expect(cascade.value(controls, "height", viewport)).toBe("36px");
    for (const button of buttons)
      expect(cascade.value(button, "height", viewport)).toBe("36px");
  });
});

describe("hover de los botones de ventana", () => {
  it.each(themes)(
    "tema %s: Cerrar se pone rojo con la × blanca en el Hub y el onboarding",
    (scheme) => {
      setTheme(scheme);
      const viewport = viewports[0] as Viewport;
      const bar = renderHub(false);
      const frame = renderOnboarding(0.8);
      for (const scope of [bar, frame]) {
        const { close, buttons } = controlsOf(scope);
        hover(close, () => {
          const background = cascade.winner(close, "background", viewport);
          expect(background?.selector).toContain(".v-window-button--close");
          expect(
            cascade.substitute(close, background?.value ?? "", viewport),
          ).toBe("#e81123");
          const color = cascade.value(close, "color", viewport) ?? "";
          expect(cascade.substitute(close, color, viewport)).toBe("#ffffff");
        });
        // Minimizar y maximizar conservan el gris suave de hover.
        for (const button of buttons.filter((item) => item !== close))
          hover(button, () => {
            const background =
              cascade.value(button, "background", viewport) ?? "";
            expect(cascade.substitute(button, background, viewport)).not.toBe(
              "#e81123",
            );
            expect(background).toBe("var(--hover)");
          });
        // Sin ratón encima, Cerrar es transparente.
        expect(cascade.value(close, "background", viewport)).toBe(
          "transparent",
        );
      }
    },
  );
});

describe("anillos de foco", () => {
  it.each(themes)(
    "tema %s: el asistente no dibuja marco alrededor de la ventana y los botones conservan su anillo",
    (scheme) => {
      setTheme(scheme);
      const viewport = viewports[0] as Viewport;
      const frame = renderOnboarding(0.8);
      focusVisible(frame, () => {
        expect(cascade.outline(frame, viewport).visible).toBe(false);
      });
      const ring = scheme === "light" ? "#8a0000" : "#ff7a82";
      const header = frame.querySelector(".v-ob-header") as HTMLElement;
      for (const target of controlsOf(frame).buttons)
        focusVisible(target, () => {
          const outline = cascade.outline(target, viewport);
          expect(outline.visible, target.outerHTML).toBe(true);
          expect(
            cascade.substitute(target, outline.value ?? "", viewport),
          ).toBe(`2px solid ${ring}`);
        });
      // «Saltar» y «Empezar» usan el anillo propio del asistente.
      for (const target of [
        within(header).getByRole("button", { name: "Saltar" }),
        screen.getByRole("button", { name: "Empezar" }),
      ])
        focusVisible(target, () => {
          const outline = cascade.outline(target, viewport);
          expect(outline.visible, target.outerHTML).toBe(true);
          expect(outline.value).toBe("2px solid var(--ob-c-faf7f7)");
        });
    },
  );

  it("los botones de la barra del Hub y de la puerta de Acceso conservan su anillo", () => {
    setTheme("dark");
    const viewport = viewports[0] as Viewport;
    const bar = renderHub(true);
    render(<GateFrame controls={windowButtons()}>{null}</GateFrame>);
    const gate = document.querySelector(".v-gate-titlebar") as Element;
    const targets = [
      ...controlsOf(bar).buttons,
      ...within(bar as HTMLElement).getAllByRole("tab"),
      ...controlsOf(gate).buttons,
    ];
    for (const target of targets)
      focusVisible(target, () => {
        const outline = cascade.outline(target, viewport);
        expect(outline.visible, target.outerHTML).toBe(true);
        expect(cascade.substitute(target, outline.value ?? "", viewport)).toBe(
          "2px solid #ff7a82",
        );
      });
  });
});

it("el ayudante resuelve la especificidad como el navegador", () => {
  expect(
    specificity(
      '.v-button--ghost:hover:not(:disabled):not([aria-disabled="true"])',
    ),
  ).toEqual([0, 4, 0]);
  expect(
    specificity(
      '.v-window-controls .v-window-button--close:hover:not(:disabled):not([aria-disabled="true"])',
    ),
  ).toEqual([0, 5, 0]);
  expect(specificity(":where(.a, #b) button")).toEqual([0, 0, 1]);
  expect(specificity('.v-titlebar [role="tab"]')).toEqual([0, 2, 0]);
});
