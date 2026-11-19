const durations = new Map<string, number>();

/** Runs one QA check and prints how long it took, so slow growth is visible in CI. */
export async function timed<T>(
  name: string,
  run: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    const seconds = (performance.now() - start) / 1000;
    durations.set(name, (durations.get(name) ?? 0) + seconds);
    console.log(`[tiempo] ${name}: ${seconds.toFixed(1)} s`);
  }
}

/** Checks may overlap, so the wall time is reported next to the per-check sum. */
export function printTimingSummary(wallSeconds: number) {
  const rows = [...durations].sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((total, [, seconds]) => total + seconds, 0);
  console.log("[tiempo] resumen por duración:");
  for (const [name, seconds] of rows)
    console.log(`[tiempo]   ${seconds.toFixed(1).padStart(7)} s  ${name}`);
  console.log(
    `[tiempo] suma de comprobaciones ${sum.toFixed(1)} s, reloj total ${wallSeconds.toFixed(1)} s`,
  );
}

/** Nombres de los checks que ya se han ejecutado (para comprobar el reparto en partes). */
export function timedNames() {
  return [...durations.keys()];
}
