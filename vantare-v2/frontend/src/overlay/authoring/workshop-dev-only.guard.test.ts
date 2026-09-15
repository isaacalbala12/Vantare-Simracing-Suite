/// <reference types="node" />

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ISA-1113 · Guardia de la frontera dev-only del Workshop (/workshop).
//
// La auditoría ISA-1111 midió `dist/assets/tower-reference-*.png` (~1,9 MB) y
// las `tower-*.ttf` (~474 kB) y los atribuyó a OverlayWorkshopDevRoute. Con
// ISA-1101 ya integrado en nightly la realidad es otra: el consumidor es
// `standings-redline-tower.css`, CSS productivo del diseño oficial
// "Endurance Redline Tower · Preview" (opt-in, origin "vantare"), que usa el
// sprite para los emblemas de fabricante y el wordmark y las TTF para la
// tipografía del tower. Retirarlos del build rompería el widget publicado, así
// que este corte no los toca y la guardia fija ese consumo productivo.
//
// Lo que SÍ es dev-only — la ruta completa: OverlayWorkshopDevRoute,
// overlay-workshop.css y el fondo workshop-circuit.png (~2 MB) — ya queda
// fuera del bundle: main.tsx la carga tras `import.meta.env.DEV` y el build la
// elimina por tree-shaking (dist no emite `workshop-circuit` ni código del
// laboratorio). Esta guardia impide que un import productivo futuro la cuele
// al binario Wails.

const SRC = path.resolve(process.cwd(), "src");
const AUTHORING = path.join(SRC, "overlay", "authoring");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const route = path.join(dir, name);
    if (statSync(route).isDirectory()) yield* walk(route);
    else yield route;
  }
}

function read(route: string): string {
  return readFileSync(route, "utf8");
}

// Todo src salvo el propio laboratorio dev, tests/guardias (que sí pueden
// nombrarlo) y main.tsx, cuya referencia queda acotada por el primer test.
function productiveFiles(): string[] {
  return [...walk(SRC)].filter(
    (route) =>
      /\.(ts|tsx|css)$/.test(route) &&
      !route.startsWith(AUTHORING + path.sep) &&
      !/\.(test|guard\.test)\.tsx?$/.test(route) &&
      route !== path.join(SRC, "main.tsx"),
  );
}

describe("frontera dev-only del Workshop", () => {
  it("main.tsx solo carga y monta la ruta tras import.meta.env.DEV", () => {
    const main = read(path.join(SRC, "main.tsx"));
    // Sin estas dos condiciones el lazy import entra al grafo productivo y el
    // build emitiría el laboratorio entero (incluido workshop-circuit.png).
    expect(main).toMatch(/import\.meta\.env\.DEV\s*\?\s*lazy/);
    expect(main).toMatch(/import\.meta\.env\.DEV\s*&&\s*OverlayWorkshopDevRoute/);
  });

  it("ningún módulo productivo fuera de authoring/ referencia la ruta ni sus assets", () => {
    const offenders = productiveFiles().filter((route) =>
      /OverlayWorkshopDevRoute|overlay-workshop\.css|workshop-circuit/.test(
        read(route),
      ),
    );
    expect(
      offenders,
      "un import productivo colaría los ~2 MB dev-only al bundle",
    ).toEqual([]);
  });

  it("los assets tower-assets/ tienen consumidor productivo: el CSS del Redline Tower", () => {
    // Si esta aserción cae, tower-reference.png y las tower-*.ttf quedaron sin
    // consumidor productivo y sí procede rehacer el análisis de la auditoría
    // para sacarlos del build.
    const css = read(
      path.join(
        SRC,
        "overlay",
        "design-systems",
        "vantare-endurance",
        "standings",
        "standings-redline-tower.css",
      ),
    );
    expect(css).toContain("tower-assets/tower-reference.png");
    expect(css).toContain("tower-assets/tower-condensed-400.ttf");
    expect(css).toContain("tower-assets/tower-condensed-600.ttf");
    expect(css).toContain("tower-assets/tower-regular.ttf");
    expect(css).toContain("tower-assets/tower-bold.ttf");
  });
});
