# ISA-116 / TC-09D — hardening, rendimiento y observabilidad

Estado: implementación y revisión técnica completadas en rama de issue, sin
merge ni promoción.

## Objetivo y límites

Este corte endurece el único pipeline productivo de Telemetry Core después de
retirar los backends y transportes legacy en ISA-114 e ISA-115. No cambia el
schema canónico, las proyecciones de producto, el diseño de Overlay Studio ni
la semántica del Engineer.

Incluye:

- fuzzing de Shared Memory, REST, fusión, recording y transport envelopes;
- validación de que observabilidad no contiene payload ni identidad personal;
- límites visibles de suscriptores, payload y cola de recording;
- soak lógico reproducible con Overlay, Engineer y recorder simultáneos;
- benchmarks por etapa y del pipeline combinado;
- optimización del cuello de botella demostrado en el transporte.

No incluye:

- nuevos transports o dependencias;
- cambios de contrato;
- optimizaciones no respaldadas por perfil;
- promoción a `nightly`, `testers` o `master`;
- sustitución del gate final con LMU real de TC-09F.

## Fronteras hostiles verificadas

Los siguientes fuzzers se ejecutaron durante cinco segundos cada uno, con 16
workers en Windows:

| Frontera | Fuzzer | Resultado |
|---|---|---|
| Shared Memory | `FuzzParseNeverPanics` | PASS, 13.691 ejecuciones |
| Sanitización de buffers | `FuzzFrameSanitizerNeverPanicsOrLeaksUnknownBytes` | PASS, 11.821 ejecuciones |
| REST local LMU | `FuzzRESTDecodersDoNotPanic` | PASS, 191.119 ejecuciones |
| Fusión SHM/REST | `FuzzFusionNeverPanics` | PASS, 311.980 ejecuciones |
| Recording snapshot | `FuzzDecodePayloadV1` | PASS, 265.701 ejecuciones |
| Recording fact | `FuzzDecodeFactV1` | PASS, 709.679 ejecuciones |
| Envelope de transporte | `FuzzTransportEnvelopeValidationNeverPanics` | PASS, 776.620 ejecuciones |

El nuevo fuzzer de facts exige que cualquier decode aceptado produzca un fact
que también supere su validación semántica. El fuzzer de transporte recalcula
el sello privado y ataca el límite real; no prueba únicamente un helper
desconectado.

## Validación de payloads

El transporte continúa aceptando únicamente un objeto JSON válido, dentro del
límite configurado, y rechaza en cualquier profundidad las claves internas:
`raw`, `source`, `clock`, `observed`, `derived`, `finalState` y
`canonicalVersion`.

La validación anterior deserializaba recursivamente cada valor y repetía
trabajo para arrays y objetos anidados. El perfil demostró que dominaba el
tiempo y las asignaciones del hot path. La implementación actual:

1. valida una sola vez la estructura JSON completa;
2. exige objeto en la raíz;
3. recorre únicamente nombres de miembros;
4. decodifica escapes solo cuando la clave los contiene;
5. distingue una clave prohibida de un valor textual con el mismo nombre.

Las regresiones cubren objetos y arrays anidados, mayúsculas/minúsculas,
`r\u0061w`, valores `"raw"`/`"derived"`, JSON inválido y payloads sobredimensionados.

## Observabilidad sin datos personales

`TelemetryCoreRuntime.Metrics()` y `Hub.Metrics()` exponen únicamente
contadores y límites:

- observaciones recibidas/rechazadas;
- lotes aplicados y proyecciones publicadas;
- entregas y fallos aislados de Engineer;
- suscriptores actuales y máximos;
- límite de payload;
- publicaciones, reemplazos y deltas retenidos.

No exponen snapshots, facts, nombres, IDs, circuito, rutas, errores arbitrarios
ni payload JSON. Las lecturas son copias de valor y los contadores del runtime
son atómicos. Una regresión serializa las métricas después de procesar nombres
e IDs deliberadamente personales y prueba que ninguno aparece.

## Límites y soak reproducible

`TestTelemetryCoreTwoHourLogicalSoakIsBoundedAndPayloadFree` ejecuta:

- 121 muestras separadas por un minuto lógico: dos horas exactas;
- 64 vehículos por muestra;
- seis consumidores de transporte simultáneos, por encima del mínimo de cinco;
- Overlay Projection v1 mediante el runtime real;
- entrada canónica de Engineer en cada muestra;
- mapper, coordinator y SQLite reales para recording;
- consumo de cada snapshot para impedir que un consumidor lento quede oculto;
- teardown de recorder y de todos los suscriptores.

Resultado repetido:

- 121 lotes aceptados y 121 committed;
- cola final `0/1024` y cero rechazos;
- 121 proyecciones y 121 observaciones Engineer;
- cero fallos Engineer;
- seis suscriptores durante el soak y cero tras teardown;
- métricas sin nombres ni IDs;
- tiempo real aproximado de 6–7 segundos en el host de desarrollo.

El test frontend `overlay-performance.test.tsx` verifica además que un perfil
de 20 widgets comparte buckets de frecuencia y no multiplica listeners por
widget. No se presenta como una sesión LMU real ni como prueba perceptual: ese
gate pertenece a ISA-117.

## Benchmarks

Host: Windows amd64, AMD Ryzen 7 3700X, tres repeticiones por benchmark.

### Cuello de botella corregido

| Benchmark | Baseline histórico TC-05B | ISA-116 |
|---|---:|---:|
| Hub full, 64 vehículos | 258–303 µs/op | 47,2–50,5 µs/op |
| Memoria por operación | ~128,7 KiB | 12.631 B |
| Allocations | 1.964–1.965 | 357 |

El resultado representa aproximadamente 5,1–6,4 veces menos tiempo, 89 %
menos bytes y 82 % menos allocations, sin reducir validaciones ni límites.

### Cadena y etapas

| Etapa | Resultado observado |
|---|---:|
| Parse fixture track | 39,9–41,7 µs/op |
| Parse ObjectOut, 44 vehículos | 39,8–43,7 µs/op |
| Copia estable + parse | 60,2–63,5 µs/op |
| REST decode | 4,9–5,1 µs/op |
| Fusión | 3,6–3,7 µs/op |
| Reducer, 64 vehículos | 17,4–19,6 µs/op |
| Session coordinator, 64 vehículos | 27,1–27,7 µs/op |
| Derivaciones, 64 vehículos | 53,4–61,4 µs/op |
| Fan-out snapshot, 64 vehículos | 8,3–11,3 µs/op |
| SQLite append, 64 vehículos | 3,0–3,1 ms/op |
| Runtime combinado, 64 vehículos | 3,83–4,79 ms/op |

El benchmark combinado incluye reducer, coordinación, derivaciones,
proyección, validación/sello del transporte y entrada de Engineer. SQLite se
mide por separado y también participa en el soak simultáneo.

## Gates ejecutados

- `go test ./internal/app/telemetrytransport ./internal/app ./internal/telemetry/recording -count=1`: PASS.
- `go test ./internal/telemetry/... -count=1`: PASS.
- `go test ./... -count=1`: PASS.
- fuzzers de las siete fronteras: PASS.
- benchmarks de driver, REST, fusión, core, derivaciones, fan-out, transporte,
  recording y pipeline combinado: PASS.
- `pnpm --dir frontend exec vitest run src/overlay-harness/overlay-performance.test.tsx`: 2/2 PASS.
- `pnpm --dir frontend test:telemetry-cutover-runtimes`: PASS.
- `pnpm --dir frontend test`: 298 archivos, 2.016 tests PASS.
- `pnpm --dir frontend build`: PASS.
- `git diff --check`: PASS.

## Checks no completables y avisos heredados

- `go test -race` no es ejecutable en este host: CGO está desactivado y, al
  activarlo, no existe `gcc` en `PATH`. No se declara como PASS.
- `go vet ./internal/app/... ./internal/telemetry/...` conserva tres avisos
  heredados de `unsafe.Pointer` en `reader_windows.go`, `version_windows.go` e
  `icon_windows.go`. Ningún archivo está modificado por ISA-116.
- Vitest imprime dos `AbortError` de teardown de Happy DOM después de reportar
  2.016/2.016 PASS; el proceso sale con código cero.
- Vite conserva el aviso heredado de chunk principal superior a 500 kB.

## Revisión de cinco ejes

- Correctitud: métricas exactas, fallos Engineer aislados, claves anidadas y
  escapadas cubiertas, soak con teardown completo.
- Simplicidad: se eliminó la deserialización recursiva y no se añadió ninguna
  dependencia o capa arquitectónica.
- Arquitectura: observabilidad permanece en runtime/transporte y no atraviesa
  los payloads de producto.
- Seguridad: entradas externas validadas; cero payload personal en métricas;
  fuzzing de fronteras reales.
- Rendimiento: perfil antes de optimizar y mejora cuantificada del cuello de
  botella; no se tocaron etapas sin evidencia.

Veredicto: `APPROVE`, P0/P1/P2/P3 conocidos atribuibles al corte = 0.

## Riesgos y siguiente corte

ISA-116 no reemplaza la observación real de Wails, handles/goroutines ni el
teardown completo del proceso. ISA-87 / TC-09E debe añadir ese harness sobre
esta rama. ISA-117 / TC-09F realizará después la sesión real, evidencias
finales y rollback. La reversión de ISA-116 es el revert de su único commit;
no hay migración de datos ni cambio de schema.
