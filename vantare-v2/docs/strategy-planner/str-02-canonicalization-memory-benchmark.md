# STR-02 — Benchmark manual de canonicalización cerca del límite

ISA-137 conserva un test de regresión que canonicaliza un array JSON válido de
1.000.000 de números. Su representación binaria mide `9.000.005` bytes
(aproximadamente 9 MiB), dentro del máximo contractual de 16 MiB.

No se aserta heap, RSS ni una duración máxima: esas medidas varían con el
runtime de Node, el GC, la arquitectura y la carga de la máquina. La regresión
protege el tamaño canónico exacto y el hash hexadecimal; el benchmark manual
sirve para comparar el perfil de memoria/tiempo de una revisión concreta.

Desde `frontend`, ejecutar tres veces de forma serial y conservar la salida:

```powershell
1..3 | ForEach-Object {
  Measure-Command {
    corepack pnpm exec vitest run src/strategy/strategy-contract-v1.test.ts `
      -t "hashes one million canonical numbers" --maxWorkers=1 --no-file-parallelism
  } | Select-Object TotalMilliseconds
}
```

Para comparar directamente las dos conversiones, usar Node con GC expuesto. El
payload simula exactamente los `9.000.005` bytes canónicos de esa regresión;
ejecutar el bloque tres veces y guardar cada par `legacy`/`bounded`.

```powershell
node --expose-gc -e '
const bytes = new Uint8Array(9_000_005);
const legacy = (value) => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const bounded = (value) => {
  const hex = new Uint8Array(value.byteLength * 2);
  const digits = "0123456789abcdef";
  for (let index = 0; index < value.byteLength; index += 1) {
    const byte = value[index];
    hex[index * 2] = digits.charCodeAt(byte >>> 4);
    hex[index * 2 + 1] = digits.charCodeAt(byte & 15);
  }
  return new TextDecoder().decode(hex);
};
for (const [name, encode] of [["legacy", legacy], ["bounded", bounded]]) {
  global.gc(); const before = process.memoryUsage(); const start = performance.now();
  const hex = encode(bytes); const after = process.memoryUsage();
  console.log(name, { ms: performance.now() - start, hexLength: hex.length, heapDelta: after.heapUsed - before.heapUsed, rssDelta: after.rss - before.rss });
}
'
```

La evidencia válida para una nueva review es: commit o árbol evaluado, versión
de Node, tres pares de medidas, el resultado PASS del test de un millón y el
hex de igual longitud. No convertir una variación de tiempo o RSS por sí sola
en un umbral contractual.

## Evidencia WIP 2026-08-02

Node `v24.14.1`, mismo payload de `9.000.005` bytes y GC expuesto antes de cada
pasada. Ambos algoritmos produjeron `18.000.010` caracteres hexadecimales.

| Pasada | `legacy` ms / heap delta / RSS delta | `bounded` ms / heap delta / RSS delta |
| --- | --- | --- |
| 1 | 2370,7 / 322.433.808 B / 470.777.856 B | 88,9 / 21.872 B / 36.405.248 B |
| 2 | 1959,0 / 322.362.944 B / 93.011.968 B | 64,2 / 16.968 B / 35.610.624 B |
| 3 | 2109,4 / 321.550.344 B / 89.595.904 B | 74,7 / 16.920 B / 35.688.448 B |

Las cifras son evidencia comparativa de este entorno, no un presupuesto ni un
umbral portable. El delta de RSS depende especialmente de la política de GC y
del asignador de Node.
