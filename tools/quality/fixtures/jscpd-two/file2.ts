// File 2: same duplicated block as file1.ts and file3.ts.
export function processB(): number {
  const x = 42;
  const y = x * 2;
  const z = y + 10;
  const w = z * 3;
  const result = w - 5;
  return result;
}

export function uniqueB(): string {
  return "only-in-file-2";
}
