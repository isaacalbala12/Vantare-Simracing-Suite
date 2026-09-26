// File 1: contains a duplicated block (same as file2.ts and file3.ts).
export function processA(): number {
  const x = 42;
  const y = x * 2;
  const z = y + 10;
  const w = z * 3;
  const result = w - 5;
  return result;
}

export function uniqueA(): string {
  return "only-in-file-1";
}
