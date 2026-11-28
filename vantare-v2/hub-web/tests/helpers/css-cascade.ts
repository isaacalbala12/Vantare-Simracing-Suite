// Cascada CSS mínima para tests de estilos en jsdom (issue 2854).
//
// jsdom no calcula `-webkit-app-region` ni estados como `:hover`, y no hay
// layout. Este módulo lee los CSS reales del Hub, empareja sus selectores con el
// DOM renderizado por los componentes (`Element.matches`) y gana la declaración
// con la prioridad del navegador: `!important`, especificidad y orden. Los
// estados se fuerzan con atributos: `:hover` y `:focus-visible` se reescriben a
// `[data-css-hover]` y `[data-css-focus-visible]`, con la misma especificidad.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Viewport {
  width: number;
  height: number;
}
interface Declaration {
  property: string;
  value: string;
  important: boolean;
}
interface Rule {
  file: string;
  selector: string;
  matcher: string;
  specificity: [number, number, number];
  media: string[];
  declarations: Declaration[];
  order: number;
}
export interface Winner {
  value: string;
  file: string;
  selector: string;
}

const states: Record<string, string> = {
  ":hover": "[data-css-hover]",
  ":focus-visible": "[data-css-focus-visible]",
};

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Divide por `separator` fuera de paréntesis, corchetes y cadenas. */
function splitTop(text: string, separator: string) {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Bloques de primer nivel: `prelude { body }` y sentencias `@x ...;`. */
function blocks(css: string) {
  const out: { prelude: string; body: string | null }[] = [];
  let i = 0;
  while (i < css.length) {
    let j = i;
    let quote = "";
    while (j < css.length) {
      const char = css[j];
      if (quote) {
        if (char === "\\") j++;
        else if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === "{" || char === ";") break;
      j++;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length) {
      if (prelude) throw new Error(`CSS sin cerrar: ${prelude}`);
      break;
    }
    if (css[j] === ";") {
      out.push({ prelude, body: null });
      i = j + 1;
      continue;
    }
    let depth = 1;
    let k = j + 1;
    quote = "";
    for (; k < css.length && depth > 0; k++) {
      const char = css[k];
      if (quote) {
        if (char === "\\") k++;
        else if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === "{") depth++;
      else if (char === "}") depth--;
    }
    out.push({ prelude, body: css.slice(j + 1, k - 1) });
    i = k;
  }
  return out;
}

function declarations(body: string, where: string): Declaration[] {
  if (body.includes("{"))
    throw new Error(`CSS anidado no soportado por el test: ${where}`);
  return splitTop(body, ";").map((text) => {
    const colon = text.indexOf(":");
    const property = text.slice(0, colon).trim();
    let value = text.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, "").trim();
    return { property, value: value.replace(/\s+/g, " "), important };
  });
}

/** Especificidad de un selector complejo (CSS Selectors 4). */
export function specificity(selector: string): [number, number, number] {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  const ident = () => {
    const match = /^-?[_a-zA-Z\u00a0-\uffff-][\w\u00a0-\uffff-]*/.exec(
      selector.slice(i),
    );
    i += match ? match[0].length : 0;
    return match ? match[0] : "";
  };
  const argument = () => {
    let depth = 1;
    const start = i + 1;
    i++;
    while (i < selector.length && depth > 0) {
      if (selector[i] === "(") depth++;
      else if (selector[i] === ")") depth--;
      i++;
    }
    return selector.slice(start, i - 1);
  };
  while (i < selector.length) {
    const char = selector[i];
    if (char === "#") {
      i++;
      ident();
      a++;
    } else if (char === ".") {
      i++;
      ident();
      b++;
    } else if (char === "[") {
      while (i < selector.length && selector[i] !== "]") i++;
      i++;
      b++;
    } else if (char === ":") {
      const element = selector[i + 1] === ":";
      i += element ? 2 : 1;
      const name = ident().toLowerCase();
      const args = selector[i] === "(" ? argument() : null;
      if (element || ["before", "after"].includes(name)) c++;
      else if (name === "where") {
        // Especificidad cero.
      } else if (["is", "not", "has"].includes(name) && args !== null) {
        const best = splitTop(args, ",")
          .map(specificity)
          .sort(compareSpecificity)
          .at(-1) ?? [0, 0, 0];
        a += best[0];
        b += best[1];
        c += best[2];
      } else b++;
    } else if (/[a-zA-Z]/.test(char)) {
      ident();
      c++;
    } else i++;
  }
  return [a, b, c];
}

function compareSpecificity(
  x: [number, number, number],
  y: [number, number, number],
) {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function mediaMatches(condition: string, viewport: Viewport) {
  return condition.split(/\s+and\s+/).every((part) => {
    const feature = /^\(\s*([\w-]+)\s*:\s*([^)]+?)\s*\)$/.exec(part.trim());
    if (!feature) throw new Error(`@media no soportado por el test: ${part}`);
    const [, name, raw] = feature as unknown as [string, string, string];
    if (name === "prefers-reduced-motion") return raw === "no-preference";
    if (name === "prefers-color-scheme") return false;
    const px = /^(\d+(?:\.\d+)?)px$/.exec(raw);
    if (!px) throw new Error(`@media no soportado por el test: ${part}`);
    const limit = Number(px[1]);
    const size = name.endsWith("width") ? viewport.width : viewport.height;
    if (name.startsWith("min-")) return size >= limit;
    if (name.startsWith("max-")) return size <= limit;
    throw new Error(`@media no soportado por el test: ${part}`);
  });
}

const root = resolve(__dirname, "../../src/renderer");

export class Cascade {
  readonly rules: Rule[] = [];

  /** Rutas relativas a `src/renderer`, en el orden en que el Hub las carga. */
  constructor(files: readonly string[]) {
    for (const file of files) {
      const css = stripComments(readFileSync(resolve(root, file), "utf8"));
      this.collect(file, css, []);
    }
  }

  private collect(file: string, css: string, media: string[]) {
    for (const { prelude, body } of blocks(css)) {
      if (body === null) continue; // @import: el test carga cada archivo explícitamente.
      if (prelude.startsWith("@media")) {
        this.collect(file, body, [...media, prelude.slice(6).trim()]);
        continue;
      }
      if (prelude.startsWith("@")) continue; // @keyframes, @font-face…
      const decls = declarations(body, `${file}: ${prelude}`);
      for (const selector of splitTop(prelude, ",")) {
        // Pseudoelementos y prefijos de motor no afectan al elemento.
        if (/::|:-webkit-|:-moz-/.test(selector)) continue;
        let matcher = selector;
        for (const [state, attribute] of Object.entries(states))
          matcher = matcher.replaceAll(state, attribute);
        this.rules.push({
          file,
          selector,
          matcher,
          specificity: specificity(selector),
          media,
          declarations: decls,
          order: this.rules.length,
        });
      }
    }
  }

  /** Declaración ganadora de `property` en `element`, o `null` si ninguna aplica. */
  winner(
    element: Element,
    property: string,
    viewport: Viewport,
  ): Winner | null {
    let best: {
      winner: Winner;
      important: boolean;
      specificity: [number, number, number];
      order: number;
    } | null = null;
    for (const rule of this.rules) {
      if (!rule.media.every((condition) => mediaMatches(condition, viewport)))
        continue;
      const declaration = rule.declarations.findLast(
        (item) => item.property === property,
      );
      if (!declaration || !element.matches(rule.matcher)) continue;
      const better =
        !best ||
        (declaration.important && !best.important) ||
        (declaration.important === best.important &&
          (compareSpecificity(rule.specificity, best.specificity) > 0 ||
            (compareSpecificity(rule.specificity, best.specificity) === 0 &&
              rule.order > best.order)));
      if (better)
        best = {
          winner: {
            value: declaration.value,
            file: rule.file,
            selector: rule.selector,
          },
          important: declaration.important,
          specificity: rule.specificity,
          order: rule.order,
        };
    }
    const inline =
      element instanceof HTMLElement
        ? element.style.getPropertyValue(property)
        : "";
    if (inline && !best?.important)
      return { value: inline.trim(), file: "style", selector: "[style]" };
    return best?.winner ?? null;
  }

  value(element: Element, property: string, viewport: Viewport) {
    return this.winner(element, property, viewport)?.value ?? null;
  }

  /**
   * Zona de Electron que cubre al elemento: la del propio elemento o la del
   * ancestro más cercano que la declare (la caja del ancestro lo contiene).
   */
  appRegion(element: Element, viewport: Viewport) {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = this.value(node, "-webkit-app-region", viewport);
      if (value) return value;
    }
    return "none";
  }

  /** Valor de una propiedad personalizada, heredada como en el navegador. */
  custom(element: Element, name: string, viewport: Viewport): string {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = this.value(node, name, viewport);
      if (value) return value;
    }
    throw new Error(`${name} no está definida`);
  }

  /** Sustituye `var(--x)` por su valor en el elemento, de forma recursiva. */
  substitute(element: Element, value: string, viewport: Viewport): string {
    const replaced = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) =>
      this.substitute(element, this.custom(element, name, viewport), viewport),
    );
    return replaced;
  }

  /** Longitud en px de un valor con `calc()`, `var()` y px/números. */
  px(element: Element, value: string, viewport: Viewport) {
    return evaluate(this.substitute(element, value, viewport));
  }

  /**
   * ¿Dibuja el elemento un contorno? Combina `outline` y sus longhands como
   * hace la cascada: gana la última declaración con más prioridad.
   */
  outline(element: Element, viewport: Viewport) {
    const candidates = ["outline", "outline-style", "outline-width"]
      .map((property) => ({
        property,
        winner: this.winner(element, property, viewport),
      }))
      .filter((item) => item.winner);
    const visible = candidates.every(({ property, winner }) => {
      const value = winner?.value ?? "";
      if (property === "outline-style") return value !== "none";
      if (property === "outline-width") return !/^0(px)?$/.test(value);
      return !/(^|\s)(none|0|0px)(\s|$)/.test(value);
    });
    const shorthand = candidates.find((item) => item.property === "outline");
    return {
      visible: candidates.length > 0 && visible,
      value: shorthand?.winner?.value ?? null,
    };
  }
}

/** Aritmética de longitudes: números, px, + - * / y paréntesis o `calc()`. */
export function evaluate(expression: string): number {
  const normalized = expression.replace(/calc\(/g, "(").replace(/\s+/g, "");
  const tokens = normalized.match(/\d*\.?\d+(?:px)?|[-+*/()]/g);
  if (!tokens || tokens.join("") !== normalized)
    throw new Error(`Expresión no soportada por el test: ${expression}`);
  let i = 0;
  const primary = (): number => {
    const token = tokens[i++];
    if (token === "(") {
      const value = sum();
      if (tokens[i++] !== ")") throw new Error(`Falta ')' en ${expression}`);
      return value;
    }
    if (token === "-") return -primary();
    if (token === undefined || !/\d/.test(token))
      throw new Error(`Expresión no soportada por el test: ${expression}`);
    return Number.parseFloat(token);
  };
  const product = (): number => {
    let value = primary();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const operator = tokens[i++];
      const right = primary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const operator = tokens[i++];
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  if (i !== tokens.length)
    throw new Error(`Expresión no soportada por el test: ${expression}`);
  return value;
}
