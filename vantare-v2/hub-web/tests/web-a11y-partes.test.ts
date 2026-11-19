import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKS_ANALISIS,
  CHECKS_PAGINAS,
  checksDe,
  comprobarEjecutados,
  leerParte,
} from "../scripts/web-a11y-partes";

const fuente = readFileSync(
  resolve(import.meta.dirname, "../scripts/web-a11y.ts"),
  "utf8",
);
// Fragilidad conocida: la regex lee el código fuente y solo ve llamadas literales
// `timed("nombre"`. Un check con nombre calculado, o llamado de otra forma, no
// se detecta aquí. El respaldo es `comprobarEjecutados` (web-a11y-partes.ts), que
// en cada parte compara los `timed` realmente ejecutados con su lista.
const enElArchivo = new Set(
  [...fuente.matchAll(/timed\(\s*"(\w+)"/g)].map((match) => match[1] ?? ""),
);

describe("partes de web-a11y.ts", () => {
  it("cada check del archivo está en una parte y solo en una", () => {
    expect(enElArchivo.size).toBeGreaterThan(30);
    const paginas = new Set<string>(CHECKS_PAGINAS);
    const analisis = new Set<string>(CHECKS_ANALISIS);
    expect(paginas.size).toBe(CHECKS_PAGINAS.length);
    expect(analisis.size).toBe(CHECKS_ANALISIS.length);
    expect([...paginas].filter((name) => analisis.has(name))).toEqual([]);
    expect(
      [...enElArchivo].filter((n) => !paginas.has(n) && !analisis.has(n)),
    ).toEqual([]);
    expect(
      [...paginas, ...analisis].filter((n) => !enElArchivo.has(n)),
    ).toEqual([]);
  });

  it("la unión de las partes es la línea «todo»", () => {
    expect(new Set(checksDe("todo"))).toEqual(enElArchivo);
  });

  it("detecta checks sobrantes o ausentes y valida el parámetro", () => {
    expect(() =>
      comprobarEjecutados("analisis", CHECKS_ANALISIS),
    ).not.toThrow();
    expect(() =>
      comprobarEjecutados("analisis", ["checkHomeDensity"]),
    ).toThrow();
    expect(() =>
      comprobarEjecutados("paginas", CHECKS_PAGINAS.slice(1)),
    ).toThrow();
    expect(leerParte([])).toBe("todo");
    expect(leerParte(["--parte=paginas"])).toBe("paginas");
    expect(() => leerParte(["--parte=x"])).toThrow();
  });
});
