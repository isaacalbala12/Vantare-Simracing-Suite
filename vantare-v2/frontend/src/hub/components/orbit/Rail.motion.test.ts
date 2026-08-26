import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "styles", "orbit-shell.css"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Falta la regla ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = css.indexOf("{", start) + 1;
  const end = css.indexOf("}", bodyStart);
  expect(end, `La regla ${selector} no está cerrada`).toBeGreaterThan(bodyStart);
  return css.slice(bodyStart, end);
}

describe("movimiento del rail", () => {
  it("da feedback inmediato mientras el botón está pulsado", () => {
    const pressed = rule(".orbit-rail__button:active:not([disabled])");

    expect(pressed).toMatch(/transform:\s*scale\(0\.94\)/);
    expect(pressed).toMatch(/transition-duration:\s*0s/);
  });

  it("no interpola todas las propiedades al seleccionar otra vista", () => {
    const button = rule(".orbit-rail__button");
    const transition = button.match(/transition:\s*([\s\S]*?);/)?.[1] ?? "";

    expect(transition).toMatch(/color\s+80ms/);
    expect(transition).toMatch(/box-shadow\s+80ms/);
    expect(transition).toMatch(/transform\s+60ms/);
    expect(button).not.toMatch(/transition:\s*var\(--orbit-fast\)/);
    expect(transition).not.toMatch(/\bbackground\b/);
  });
});
