# Telemetría V2 — cierre de microcortes y rendimiento (ISA-996)

## Base y límites

Base local combinada `210340b8210da14102a4f9e49c5218517e3b37ce`: documentación
#987 y código revisado #994/#995. No es Nightly, no CI remota ni release.
Se mantienen datos, campos/autoridad, frescura, Hz, apariencia y consumidores.
No apps/LMU, secretos ni dependencias nuevas. Isaac conserva las pruebas físicas.

## Trabajo asignado

- #997: Engineer D1 single-flight y D2 boundary/resync, cortes secuenciales.
- #998: S1 verificador duplicado, S2 Strategy sin destino, S3 lectura interna.
- #999: S3 mapper y facts; ownership y rollback antes de quitar clones.
- Main: diffs, integración local, reviews independientes, gates y medidas.

Sesiones Muse xhigh + Ponytail full:
- `997: ses_f8c7ad2e4ffevrOSUIlDOTy8AM`.
- `998: ses_f8c7ace08ffen6bhOy7pSU9MlS`.
- `999: ses_f8c7ac6fbffeSRnI4ECL65gEiQ`.

## Protocolo de medida local fijado antes de medir

Microbenchmarks de caminos productivos con mismo test/input/flags en ambos
candidatos, binarios precompilados, orden A/B alternado, diez muestras por
condición y control A/A inicial. Un solo medidor; sin builds/tests pesados
competidores. Guardar crudos, configuración/hardware y dispersión, no sólo media.
Aceptar reducción determinista de allocations/bytes sin perder equivalencia;
para tiempo exigir mejora superior al ruido A/A y separar hipótesis de prueba.
Sin benchstat disponible no atribuir p-valores ni significación estadística.
No repetir hasta obtener resultado favorable. No sumar porcentajes de cortes.
Shadow puede auto-desactivarse por presupuesto: informar esa limitación y
no inflar ahorro permanente forzando otro presupuesto.

Estas medidas no prueban ahorro de RAM residente, GPU ni FPS frente a LMU.
La comparación final con HUD exige las condiciones y el banco del maestro.

## S3 — medición local inicial

Base `210340b8` con exactamente los dos benchmarks añadidos por #999;
candidato producto `0b6b8139`, benchmarks `5c452ff6` y comentarios finales
`c77036b2`. Go 1.26.4 windows/amd64, Ryzen 7 3700X, CPU=1, 100ms, N=10.
Crudos/configuración/hashes en `telemetria-v2-rendimiento-996/s31-aa`,
`s31-ab`, `s32-aa`, `s32-ab`. Mismo código ejecutable del benchmark en ambos;
los comentarios posteriores no afectan su semántica.

| Camino | Bytes/op base → candidato | Allocs/op | Mediana ns/op A/B |
| --- | --- | --- | --- |
| Primer mapper, fixture LMU de 44 vehículos ya parseado/fusionado | 68.995 → 40.321–40.322 | 100 → 99 | 53.544 → 46.733,5 |
| Engine nuevo + primer Apply, lote mínimo sintético con facts | 6.000 → 5.520 | 14 → 13 | 3.846,5 → 3.487 |

Reducción determinista aproximada: mapper 28.674 B/op (41,6%); Engine
480 B/op (8%). No sumar porcentajes ni extrapolar el primer Apply a cada
frame: la copia de facts sólo asigna cuando hay facts.
A/A mapper medianas 44.357/43.213,5 ns, rangos 39.335–49.594/38.538–51.621;
Engine 3.393/3.369 ns, rangos 3.306–4.021/3.251–3.932. La variabilidad y
deriva entre tandas impiden certificar ahorro temporal sostenido; se acepta
únicamente la reducción reproducida de asignaciones, sujeta a ownership/review.
No son pruebas de CPU/RAM residente/GPU/FPS de Vantare ni del HUD LMU.

## Runtime S1/S2/S3.3 — conjunto medido

Baseline `210340b8`, candidato producto `b71637ab`, mismo benchmark
`cef4b1a7` añadido a ambos. Diez muestras alternadas; Go/CPU/flags iguales
a S3. Lote sintético preconstruido, 2/64 vehículos, secuencia/reloj avanzados;
defaults engine ON, Strategy OFF. No captura física. El runtime y el lote se
crean antes del timer, sin calentamiento explícito; no es la app Wails completa.

| Vehículos | Mediana ns/op base → candidato | B/op base → candidato | Allocs/op |
| --- | --- | --- | --- |
| 2 | 84.087 → 41.626,5 | 58.645–103.581 → 39.258–39.451 | 35–167 → 17 |
| 64 | 218.686 → 167.278 | 212.011–212.720 → 145.565–147.361 | 255–273 → 210 |

Rangos temporales A/B: 2 coches 58.800–125.007 / 38.652–51.615 ns;
64 coches 202.769–276.490 / 145.289–197.386 ns. A/A medianas
90.634/79.894,5 y 238.061,5/234.607,5 ns. Resultado local favorable del
conjunto, sin atribuir porcentajes separados a S1/S2/Peek ni extrapolar a FPS.
El baseline auto-desactiva shadow según presupuesto real de 2ms en muchas
muestras (crudos incluyen disabled=true/false); esto explica parte de su
dispersión y NO permite vender como permanente todo el coste del shadow.
No se alteró ese presupuesto. Crudos/hashes en `runtime-aa` y `runtime-ab`.

## Gates y estado

### Candidato completo medido

Producto combinado `db40f76efd10a6c599ecdc6806670f851198f1f1`, base `210340b8`,
incluye D1/D2 y S1/S2/S3; no se alteraron los benchmarks. Control A/A y A/B
nuevos N10 en `final-aa`/`final-ab`, sin builds/tests competidores.
64 coches sintéticos: mediana **214.155→158.577,5 ns/op** (−26% observado),
bytes **211.895–221.697→146.426–147.567 B/op**, allocations **253–304→210**.
2 coches: 94.214→43.146 ns/op, 63.565–103.766→39.364–39.508 B/op,
48–168→17 allocations. Baseline shadow sigue auto-desactivándose, por eso sus
rangos no son constantes. A/A final64 medianas200.258,5/193.959 ns con un
outlier501.545; no p-valores ni garantía de estabilidad larga.
El microbench no conecta Engineer ni UI: D1/D2 se acreditan con regresiones,
no con estos porcentajes. RAM asignada por operación no es RAM residente.

Reducción neta contra `210340b8`: **135 líneas productivas Go menos** en seis
archivos (incluye las protecciones nuevas de Engineer), sin eliminar garantías.
Tests/benchmarks/docs y script de medida se contabilizan aparte; no se declara
reducción del total de líneas del repositorio.

D2 main completó el trabajo del worker detenido, commit `e7c70e2e`,
integrado localmente como `db40f76e`. RED real: gap y overflow dejaban vacío
Health.LastError (dos fallos). GREEN diez repeticiones con servicio real:
notificación en Health/Status, persistencia tras observación y limpieza con
epoch nuevo; wake viejo retirado. No replay, nuevos facts ni retención mayor:
el sufijo completo no cabe tras overflow con retención=capacidad de cola.
La degradación explícita hasta nuevo epoch es la alternativa aprobada de D2;
**no se afirma recuperación automática dentro del mismo epoch**.
Go global final sobre `db40f76e` PASS; build frontend PASS (advertencia heredada
de chunks >500KB, no modificada). Review independiente D2 APPROVE por
`ses_f8c62f6daffeWQT3ZGyTEgAe72` sobre `e7c70e2e`; sin bloqueos. Límites:
la notificación fallida se registra sin reintento y DeclareFactBoundary no
añade contador propio; Health/Status sí muestran la degradación. No se
confunde revisión estática independiente con los tests ejecutados por main.

Benchmarks idénticos base/candidato (SHA256 del archivo): mapper
`DB3E50ACF61D65CD127CCA61018FD564C24C945950F057D5AD9F1B95AA1A489F`, runtime
`DF082FBEDD605F8862073B18F955CC9FE42DAA2FB785ED3BA95D6FFE5096691F`.
Fixture LMU `959C51421529C6157371678D8DB9BCBBDC8AB3780BD5557828F2BC0D2225E5FF`.
Hashes de binarios de cada corrida en sus manifests, fuentes/inputs arriba.

Main: `go test ./... -timeout 120s` sobre producto combinado `400ad28a`
PASS (log local `C:/tmp/isa996-go-combined.log`); después sólo se añadieron
benchmarks `07d799ee`. #997 todavía no incluido en esta prueba.
Review #999 APPROVE por `ses_f8c708fe7ffe3GsdbvZien5nKS`, diff productivo
contra `210340b8`, final `c77036b2`. D1 #997 APPROVE independiente sobre
`49ce9589` por `ses_f8c62f6daffeWQT3ZGyTEgAe72`; incluido local `a4ef39db`.
Límite explícito D1: una callback no cooperativa puede quedar retenida, no
crecen las observaciones en vuelo. `port.Stop(ctx)` observa done/deadline;
`runtime.Stop` conserva su cierre asíncrono, no certifica cancelación forzada.
Review #998 APPROVE por `ses_f8c694f90ffeDwRvDLiJmoRe9x` sobre `0703d0fa`.
Sus dos observaciones de higiene de benchmark (input sintético y setup fuera
del timer) ya estaban corregidas en `cef4b1a7`, comprobado por main antes de
compilar/medir. S1 usa guard estático de ausencia; S2/Peek prueban equivalencia,
no se presenta el guard de texto S1 como evidencia de ejecución productiva.

Frontend global inicial FAIL: 404 archivos/3161 tests PASS, 3 archivos/4 tests
timeout 20s (sin fallos de assertion), 151,55s. Tanda terminó exit1; el intento
de detenerla coincidió con su finalización. Tres archivos visuales aislados
con `vitest run ... --maxWorkers=1`: 8/8 PASS, 18,39s, mismos timeouts/código.
Repetición global `pnpm --dir frontend exec vitest run --maxWorkers=2`:
407 archivos/3165 tests PASS, 322,75s, exit0. `pnpm test --maxWorkers=2`
previo rechazó el argumento de pnpm sin ejecutar tests; se usó exec correctamente.
No se oculta el primer fallo; resultado consistente con saturación de la tanda
paralela, sin afirmar causa demostrada por un perfil. HappyDOM AbortError de
teardown también en salida exit0, conservado. Typecheck real (`tsc -b --noEmit`)
y lint PASS. Logs en `C:/tmp/isa996-*`.

Correcciones/simplificaciones de auditoría cerradas localmente. Bucle experimental
posterior no iniciado; cinco consecutivos sin mejora u ocho horas acumuladas.
Pendiente banco real de Isaac para medir impacto total y comparación HUD.
No se certifica óptimo global. Sin push, PR, CI remota, merge, promoción o release.

Check documental final: roadmap regenerado y `--check` sin cambios;
30 tests de roadmap PASS. `git diff --cached --check` señaló espacios finales
en la línea CPU de los logs crudos de Go: se preservan sin normalizar para
mantener la evidencia original; no se declara ese check completamente limpio.
El generador actualiza también la ventana histórica de entregas de Nightly.
