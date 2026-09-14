# ISA-1263 · T14g `save_revision` recuperable

## Resultado local

Strategy custodia el comando completo de `save_revision` antes de guardar la
revisión. La custodia vive en el repositorio privado existente, queda incluida
en su hash y usa el mismo lease, backup y reemplazo atómico. Stage y
reconocimiento no avanzan la generación lógica; el commit recuperable exige la
identidad y el digest exactos todavía presentes bajo su propio lease.

Tras reiniciar, el bridge y el cliente exponen la intención sin ejecutar ningún
efecto. Orbit muestra una decisión explícita: comprobar si ya existe la revisión
inmutable exacta, reintentar el mismo comando o cerrar el aviso. La resolución
busca la revisión construida desde el comando retenido y no depende del borrador
ni de HEAD, por lo que A sigue resolviéndose después de avanzar a B. Una misma
identidad con payload distinto falla cerrada. El reconocimiento exacto es
durable e idempotente.

## Compatibilidad y límites

- `save_revision` sin `recoverable` conserva el comportamiento anterior.
- El campo persistido es aditivo y `omitempty`; un repositorio v2 anterior
  conserva el mismo hash cuando no existe intención pendiente.
- Sólo existe una intención pendiente. No se añadió cola, almacenamiento web,
  reintento automático ni nueva fuente de verdad.
- Una comprobación ausente significa que la revisión exacta no está actualmente
  en el repositorio; no demuestra que nunca se intentara guardar.

## Verificación

Se cubren reinicio, replay exacto, conflicto de payload, generación estable,
commit ligado a la custodia, reconocimiento repetido o ajeno, resolución A tras
B, roundtrip del bridge, validación del cliente y la interacción explícita de
Orbit.

- `go test ./internal/strategy/repository ./internal/strategy/application`: PASS.
- `pnpm --dir frontend test`: 449 archivos y 3845 pruebas PASS.
- `pnpm --dir frontend typecheck`, `lint`, `i18n:audit` y `build`: PASS.
- `go test ./...` después del build embebido: PASS.
- `python -m pytest .github/scripts`: 259 PASS.

Una ejecución global intermedia superó las 448 suites funcionales y falló sólo
el benchmark heredado de Overlay (1,532 ms frente a 1,5 ms). Sin cambiar su
umbral, el benchmark aislado y la repetición global completa pasaron. El build
mantiene el aviso heredado de chunks mayores de 500 kB y la suite conserva el
`AbortError` no fatal de teardown ya conocido.

No se abrió la app ni se ejecutaron Wails, LMU o DuckDB. Tampoco hubo push, PR,
CI remota, integración o release.
