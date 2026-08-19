import { describe, expect, it } from "vitest";
import { computeContentBox, contentBoxIsFullFrame } from "./widget-content-box";

/**
 * A1: el marco y los ocho tiradores tienen que cenirse a lo que el widget
 * pinta, no a `layout.w × layout.h`. Se comprueba con dos tamanos y dos
 * escalas distintas, que es donde fallaba (un standings 380×540 con la tabla
 * ocupando 380×200 mostraba un marco de 540 de alto).
 */
describe("computeContentBox", () => {
  it("trae la caja pintada al espacio local del marco con escala 1", () => {
    const box = computeContentBox({
      frameRect: { left: 100, top: 50, width: 380, height: 540 },
      frameSize: { width: 380, height: 540 },
      contentRects: [{ left: 100, top: 50, width: 380, height: 200 }],
    });
    expect(box).toEqual({ x: 0, y: 0, w: 380, h: 200 });
  });

  it("divide por la escala real del lienzo (widget grande, stage reducido)", () => {
    // Marco de 380×540 logicos pintado a 0.5: 190×270 en pantalla, con la
    // tabla ocupando solo 100 px de alto en pantalla (200 logicos).
    const box = computeContentBox({
      frameRect: { left: 0, top: 0, width: 190, height: 270 },
      frameSize: { width: 380, height: 540 },
      contentRects: [{ left: 0, top: 0, width: 190, height: 100 }],
    });
    expect(box).toEqual({ x: 0, y: 0, w: 380, h: 200 });
  });

  it("mide otro diseno y otro tamano: pedals 90x100 pintado entero", () => {
    const box = computeContentBox({
      frameRect: { left: 20, top: 20, width: 90, height: 100 },
      frameSize: { width: 90, height: 100 },
      contentRects: [{ left: 20, top: 20, width: 90, height: 100 }],
    });
    expect(box).toEqual({ x: 0, y: 0, w: 90, h: 100 });
    expect(contentBoxIsFullFrame(box!, { width: 90, height: 100 })).toBe(true);
  });

  it("une varios trozos de contenido y respeta el desplazamiento interno", () => {
    const box = computeContentBox({
      frameRect: { left: 0, top: 0, width: 200, height: 200 },
      frameSize: { width: 200, height: 200 },
      contentRects: [
        { left: 10, top: 20, width: 100, height: 30 },
        { left: 10, top: 60, width: 150, height: 40 },
      ],
    });
    expect(box).toEqual({ x: 10, y: 20, w: 150, h: 80 });
  });

  it("recorta lo que sobresale del marco: `__visual` ya lo esconde", () => {
    const box = computeContentBox({
      frameRect: { left: 0, top: 0, width: 100, height: 100 },
      frameSize: { width: 100, height: 100 },
      contentRects: [{ left: -50, top: -20, width: 400, height: 400 }],
    });
    expect(box).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("descarta lo que no pinta y devuelve null cuando no hay contenido", () => {
    expect(
      computeContentBox({
        frameRect: { left: 0, top: 0, width: 100, height: 100 },
        frameSize: { width: 100, height: 100 },
        contentRects: [{ left: 0, top: 0, width: 0, height: 0 }],
      }),
    ).toBeNull();
    expect(
      computeContentBox({
        frameRect: { left: 0, top: 0, width: 100, height: 100 },
        frameSize: { width: 100, height: 100 },
        contentRects: [],
      }),
    ).toBeNull();
  });

  it("devuelve null con un marco sin tamano en vez de dividir por cero", () => {
    expect(
      computeContentBox({
        frameRect: { left: 0, top: 0, width: 0, height: 0 },
        frameSize: { width: 0, height: 0 },
        contentRects: [{ left: 0, top: 0, width: 10, height: 10 }],
      }),
    ).toBeNull();
  });
});

describe("contentBoxIsFullFrame", () => {
  it("distingue un widget que llena su caja de uno que no", () => {
    expect(contentBoxIsFullFrame({ x: 0, y: 0, w: 380, h: 200 }, { width: 380, height: 540 })).toBe(
      false,
    );
    expect(
      contentBoxIsFullFrame({ x: 0.4, y: 0, w: 379.6, h: 540 }, { width: 380, height: 540 }),
    ).toBe(true);
  });
});
