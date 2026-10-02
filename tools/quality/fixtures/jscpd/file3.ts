// File 3: THIRD copy of the same duplicated block (the "third site").
// A ratchet must detect this as NEW, not absorb it into the existing pair.
export function processC(): number {
  const x = 42;
  const y = x * 2;
  const z = y + 10;
  const w = z * 3;
  const result = w - 5;
  return result;
}

export function uniqueC(): string {
  return "only-in-file-3";
}
