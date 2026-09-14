# ISA-894 R7b/D2 — definitions core/status sin autoridad V1

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base D2 `fd52f2f2`.

## TDD y cambio

- `fe29411c`: RED. El guard enumeró las seis definitions que todavía
  contenían `buildViewModel`: `standings`, `relative`, `delta`,
  `fuel-strategy`, `pedals-telemetry` e `input-telemetry`.
- `caebb5e8`: GREEN. Las seis definitions dejan de importar y publicar el
  builder V1. `WidgetTypeDefinition.buildViewModel` pasa a ser opcional y el
  registro ya no lo exige como condición de completitud.
- `5139b09c`: el test de contrato de perfiles deja de invocar directamente el
  builder V1 y prueba el renderer real mediante el runtime V2.

El `makeFrame` manual de `WidgetVisualHost.v2.test.tsx` incorpora
`requiredFuel`, `history` y `sessionLaps` como `missing`, cerrando el fallo
heredado del contrato Fuel A2 sin inventar valores.

## Límite de los oráculos

Los ficheros `*-view-model.ts` de D2 no se borran todavía: además de funciones
V1 contienen los tipos consumidos por los renderers, y sus builders siguen
siendo la mitad legacy del comparador E4. Borrarlos en D2 rompería el oráculo
que el microplan ordena conservar hasta E4.

Para desacoplarlos de las definitions sin crear otro registro, los dos únicos
oráculos legacy llaman a los builders D2 de forma directa y explícita:

- `authoring-fixtures.ts`, pendiente de E1;
- `overlay-shadow-comparator.ts`, pendiente de E4.

Las rutas fallan explícitamente si una familia diferida carece de builder; no
hay fallback silencioso. D3/D4 conservan por ahora su propiedad legacy y el
comparador/sanitizador no cambian semántica.

## Evidencia

- RED: 16/17 PASS; un único fallo que enumera exactamente las seis anclas D2.
- Focal ampliado D2 + Host + guard + registry + harness + comparador:
  223/223 PASS.
- Revalidación tras retirar la aserción de perfiles: 75/75 PASS.
- `pnpm --dir frontend typecheck`: PASS.
- ESLint focal: PASS.
- `pnpm --dir frontend build`: PASS; solo aviso de chunks preexistente.
- `git diff --check`: PASS.
- Escaneo de las seis definitions: cero `buildViewModel`.
- Suite frontend completa final: 3412/3418 PASS, 6 fallos heredados fuera del
  comportamiento D2: cuatro de `telemetry-transport` por nombres de evento
  retirados, uno i18n por comentario español previo de Studio y uno de gaps
  Fuel previo. El primer intento sí detectó una aserción legacy de perfiles
  introducida en el alcance D2; se corrigió en `5139b09c` antes de esta
  ejecución final.

Diff de código y tests D2 antes de esta evidencia: 14 ficheros, 75 inserciones
y 33 borrados. El incremento es temporal y pertenece exclusivamente a la
conservación explícita de los dos oráculos; E1/E4 lo eliminan.

## Estado

Implementado en rama y pendiente de revisión adversarial. Sin push, PR,
merge, promoción, release, apps ni LMU.
