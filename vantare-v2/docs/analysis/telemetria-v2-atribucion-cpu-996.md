# ISA-996 — atribución CPU directa, 2026-09-06

Diagnóstico previo a E1/E2. Estado posterior y objetivo de seis widgets en
[la ronda de optimización](telemetria-v2-seis-widgets-cpu-996.md).

Petición: localizar el mayor consumo, sin subagentes. Diagnóstico realizado
por main; no cambios productivos, recorte de Hz, build nueva ni experimento
de mejora. Objetivo solicitado: CPU total inferior al 3%, todavía no probado.

## Artefacto y condiciones

Worktree `C:/tmp/vantare-isa996-performance/vantare-v2`, rama
`vantareapp/isa-996-cierre-rendimiento`, HEAD inicial `1c835bc0`.
Se reutiliza la build del informe de medidas reales ISA-996:
SHA256 `329b3f6705282415e1c4dcf95c83b9c9b5b5a7b4c5fa5dd430862f0833541ad6`.
Perfil local `C:/tmp/isa996-redline-two.json`: dos widgets, sin Delta.
LMU existente, sin conducir ni modificar el HUD. Coordinación exclusiva con
ISA-1000; cierre normal de su proceso después de verificar PID/ruta y permiso.

Dos corridas diagnósticas del banco existente, 60 y 90 segundos. No son A/B
ni aceptación: una lleva pprof; otra CDP. Política automática no fijada,
población y foco/DPI no acreditados. No extrapolar porcentajes a otros PCs.

## Procesos: dónde está el consumo

Muestra externa de 15 segundos dentro de la primera corrida, por diferencias
de TotalProcessorTime / tiempo monotónico / 16 procesadores lógicos. Árbol
transitivo del host PID37904, incluyendo auxiliares. Todos los procesos
seleccionados sobrevivieron la muestra; no acredita procesos que nacieran
después de enumerar. Es atribución breve, no baseline de aceptación.

| Proceso | PID | CPU máquina |
|---|---:|---:|
| Go host | 37904 | 2,5014% |
| WebView browser | 35592 | 1,0460% |
| WebView renderer A | 23168 | 0,2274% |
| WebView renderer B | 24444 | 1,5723% |
| WebView GPU process (CPU, no GPU%) | 34784 | 0,1884% |
| WebView utility | 22956 | 0,1299% |
| PresentMon propio, hijo del host | 38740 | 0,0195% |
| Otro utility, crashpad y conhost | 27496/36612/20892 | 0% observado |

Total observado ~5,685%; WebViews ~3,164%. El auxiliar no explica el exceso.
No adjudicar renderer B a una ventana por intuición: el banco mantiene
`renderer-unassigned`. CDP sí identifica la página perfilada `/overlay.html`.
Una muestra previa sobre ISA-1000 no se utiliza: se cerró su proceso antes
de confirmar el fin de la ventana de muestreo.

## Perfil Go: resultados y límite importante

`C:/tmp/isa996-cpu-hotspot-01.pprof`: hook existente, delay30s/duración30s.
`go tool pprof -top -cum` funciona. Reporta 65,28s de muestras en 30s,
57,53s en `runtime.cgocall`; las pilas incluyen ~28,89s de runMainLoop y
~28,20s de lectura del pipe PresentMon. Esto no concuerda con CPU externa
y no permite llamar al sensor consumidor de 43% de CPU. No convertir esos
porcentajes en CPU máquina ni concluir que todas las llamadas nativas son espera.

Pilas concretas observadas, tiempos inclusivos (NO sumables):

- Driver.Run: 3,25s; runtimeBatchSink.WriteBatch: 2,45s.
- publishOverlayV2: 1,68s, de ellos json.Marshal: 1,06s.
- Publisher.PublishSnapshot / publisherPayload: 0,64s dentro del anterior.
- CachedProjector.Project: 0,52s.
- GC gcDrain: 2,09s, sin atribución de allocations a un único productor.

Código confirma doble paso: `telemetry_core_runtime.go:1138` serializa
update, y PublishSnapshot recibe RawMessage; `telemetrytransport/publisher.go:537`
vuelve a json.Marshal y copia. Es un candidato medido, no garantía de ahorro
del 3%: 0,64s/30s/16 equivale aproximadamente a 0,13 puntos de CPU si todo ese
tiempo fuera eliminable, supuesto que no se ha validado.

## Renderer: transporte antes que layout

Perfil CPU 30s guardado en `C:/tmp/isa996-overlay-profile-01.cpuprofile`.
El helper termina exit1 por su gate de nombres minificados; se conserva como
limitación, no PASS. No se reconstruyó otro bundle para fingir equivalencia.
La ubicación exacta de la función dominante se verificó en el bundle original:
`widget-visibility-BAKU6w60.js:6:352179`, función `r_`, corresponde a
`cloneJSONInput` en `overlay-frame-v2-store.ts:619`.

- cloneJSONInput: 559,317ms propios en 30,102s.
- fetch nativo: 432,429ms; encode nativo: 156,670ms.
- `(program)` 2.976ms queda sin atribución fina; no llamarlo React o pintura.
- `overlay-wails-pull.ts:305` hace response.json(), entrega event.data, y el
  store vuelve a JSON.stringify -> TextEncoder -> JSON.parse para copiar y
  validar tamaño. No retirar ownership, límite de bytes ni validación.

Traza independiente de 10s: `C:/tmp/isa996-overlay-trace-01.json` y `.trace.json`.
PASS del helper y rendererProbeRemoved=true, página overlay confirmada.
424 peticiones pull (42,4/s), TaskDuration2,013s, ScriptDuration0,461s,
LayoutDuration0,010s y RecalcStyleDuration0,003s. Paint en eventos agregados
~26ms; los eventos anidados de tracing no se suman como CPU exclusiva.
La mayor función JS propia observada es transporte/validación, no las filas.
Ni esos 559ms ni el doble marshal explican por sí solos todo el coste.

## Decisión y continuidad

Priorizar atribución del puente/pull y procesamiento de payload, no retoques
de CSS, cambios de lenguaje o reducción de cadencias. El mayor conjunto es
WebView y el mayor proceso individual es Go. Parte nativa/browser sigue sin
atribución a funciones: hace falta antes de prometer una reducción del 50%.
WPR está instalado, pero WPA/xperf no encontrados por PATH; no se instaló nada.
Cambios siguientes sólo uno por experimento, manteniendo validación, ownership,
latest-wins, bytes límite y Hz. No hay mejora implementada ni contador de
experimentos de producto consumido en este diagnóstico.

Crudos locales: `C:/tmp/isa996-hotspot-01/`, `C:/tmp/isa996-hotspot-02/` y
perfiles anteriores; no se publican telemetría, nombres, configuración o secretos.
Ambos bancos terminaron exit0 y no quedan procesos Vantare al cierre.
No suites Go/frontend repetidas: no cambia código. Sin commit, push, PR,
CI remoto, merge, promoción ni release nuevos.
