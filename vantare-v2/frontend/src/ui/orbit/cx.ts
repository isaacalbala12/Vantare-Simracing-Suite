/** Une clases condicionales: `cx("a", ok && "b", extra)`. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
