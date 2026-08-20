# Plan (SDD · PLAN): migración gradual del runtime ingame Redline a Qt Quick

Fecha: 2026-08-20. Issue madre:
[#690](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/690)
(`OS-QT-01`). Proyecto: GitHub Project **Vantare**, estado **In Progress**.
Spec aprobada:
`docs/superpowers/specs/2026-08-20-isa-690-qt-redline-runtime-migration-spec.md`.
Rama documental: `vantareapp/isa-690-sdd-migracion-qt-redline`. Base:
`origin/nightly@64a33318a8a852c0e089b221357b8e4e8e3c442c`.

Estado SDD: **PLAN aprobado explícitamente por Isaac el 2026-08-20**. TASKS de
la primera ola P0/P1 están autorizadas para redactarse y ejecutarse sin otra
pausa SDD; no se autoriza promoción, release ni continuar tras un resultado
STOP.

## 1. Resultado que debe producir el programa

El programa añadirá una ruta Qt Quick opcional y reversible para el overlay
ingame desktop de perfiles formados exclusivamente por los seis diseños
oficiales Vantare Endurance Redline:

- Standings;
- Relative Mirror;
- Relative Proximity;
- Relative Traffic;
- Delta;
- Pedals.

Wails/WebView2 seguirá siendo el motor por defecto y el fallback. Studio,
Workshop y OBS seguirán renderizando mediante `WidgetVisualHost` y TSX/CSS.
Qt no se convertirá en una segunda plataforma de autoría ni en un runtime
genérico para todos los diseños.

El resultado válido puede ser uno de estos dos:

1. **GO controlado:** Qt supera todos los gates, entra como opt-in en Nightly,
   pasa Testers y queda listo para una decisión posterior sobre el default.
2. **STOP documentado:** Qt no supera el gate temporal, funcional, de hardware,
   packaging o mantenimiento sin añadir complejidad desproporcionada; Wails
   continúa y se conserva la evidencia del candidate.

## 2. Guardarraíles del PLAN

1. Un perfil activo tiene **un solo proceso y un solo motor de render**.
2. La selección es por perfil completo, nunca por widget.
3. Wails es el default en todo este programa.
4. El fallback no convierte ni modifica el documento del perfil.
5. Qt consume `overlayv2.UpdateV2`; no consume structs de Telemetry Core,
   drivers, stores React ni `TelemetrySnapshot` legacy.
6. La ruta Qt de producto no empieza hasta que #677 cierre la matriz Redline de
   Overlay v2.
7. TSX/CSS productivo sigue siendo la autoridad visual. QML es un porte manual,
   pequeño y solo ingame.
8. El protocolo inicial tiene tres mensajes (`init`, `frame`, `shutdown`), JSON
   UTF-8 enmarcado con longitud de 4 bytes y un máximo de 1 MiB.
9. No se introduce shared memory, protobuf, gRPC, CEF nuevo, codegen visual,
   DSL, plugin system, hot reload productivo ni auto-selector de rendimiento.
10. No se borra ni depreca Wails dentro de #690.
11. Cada issue se implementa en una rama y worktree aislados. No se desarrolla
    directamente sobre `nightly`.
12. GitHub Issues y GitHub Project Vantare son la autoridad de alcance y estado;
    Linear no participa en este programa.

## 3. Decisiones de arquitectura

### 3.1 Frontera de proceso

Qt será un sidecar Windows x64 supervisado por Go. El proceso principal conserva
la propiedad del lifecycle y decide qué motor crear antes de abrir una ventana.
No se carga Qt dentro del proceso Wails ni se añade cgo.

```text
App Go
  |
  +-- OverlayController (una sesión activa)
       |
       +-- selector efectivo: wails | qt-redline
             |
             +-- Wails OverlayWindow (camino actual, default/fallback)
             |
             +-- QtRedlineWindow
                  +-- supervisor de proceso
                  +-- pipe local enmarcado
                  +-- sidecar Qt Quick x64
                        +-- modelos keyed
                        +-- QML Redline
```

### 3.2 Punto de selección

La selección ocurre en la composition root, antes de que
`OverlayController.Start` reciba la ventana efectiva. El controlador debe
conservar su semántica de “una ventana activa”; no se convierte en un
orquestador multi-runtime.

La opción preferida es una fábrica de routing pequeña que implemente la misma
frontera de ventana ya usada por `OverlayController`:

```text
requested engine + profile + session capabilities
                 |
                 v
        EvaluateRedlineEligibility
          | eligible       | ineligible/error
          v                v
       Qt factory       Wails factory
```

No se crea un framework genérico de motores. Si la frontera existente exige una
adaptación mínima, esa adaptación se mantiene dentro del área del overlay.

### 3.3 Contrato de datos

Go transforma la actualización pública Overlay v2 en el mensaje de frame. El
sidecar recibe ViewModels/datos de presentación estables, no telemetría cruda.
La matriz de #677 debe demostrar para cada diseño Redline:

- campos presentes y tipos;
- semántica de ausencia, stale y error;
- identidad estable de filas;
- orden y agrupación de Standings;
- referencias de Delta;
- histórico y pico de Pedals;
- gaps, clases, posición relativa y amenaza de las tres variantes Relative;
- metadatos de sesión necesarios para motion y estados especiales.

La codificación wire será manual, explícita y versionada. No se genera una
segunda jerarquía de dominio.

### 3.4 Autoridad visual

La autoridad observable continúa en:

- `WidgetVisualHost`;
- renderers TSX productivos de Vantare Endurance Redline;
- tokens/CSS productivos;
- fixtures y escenas de animación productivas.

El candidate QML se mantiene en un árbol aislado y no será importado por
Studio, Workshop u OBS. Un ADR nuevo documentará esta excepción estrecha a ADR
0003 y sus límites.

### 3.5 Preferencia y fallback

La preferencia persistida tendrá inicialmente dos valores visibles:

- `wails` — default;
- `qt-redline` — experimental.

No habrá `auto` en este programa. El diagnóstico separará siempre:

- motor solicitado;
- motor efectivo;
- motivo de fallback;
- versión/hash del sidecar;
- perfil y revisión evaluados.

## 4. Camino crítico y grafo de dependencias

```text
SPECIFY aprobado
  |
  v
P0 ADR + contratos + corpus portable
  |
  v
P1 Gate fail-fast de Standings (candidate, sin producto)
  | PASS                         | FAIL
  v                              v
P2 Elegibilidad pura           STOP documentado
  |
  +----> P3 Protocolo + supervisor con sidecar falso
  |                 |
  |                 v
  +-----------> P4 Sidecar Qt standalone
                     |
          #677 cierra matriz Redline Overlay v2
                     |
                     v
             P5 Delta + Pedals live
                     |
                     v
             P6 Relative live (3 variantes)
                     |
                     v
             P7 Standings live + motion
                     |
                     v
             P8 Perfil completo + lifecycle/fallback
                     |
                     v
             P9 Packaging + diagnósticos + toggle
                     |
                     v
             P10 Gates físicos/perf/hardware/soak
                     |
                     v
             P11 Nightly opt-in
                     |
                     v
             P12 Testers + decisión posterior
```

Camino crítico: **P0 → P1 → P3 → P4 → #677 → P5 → P6 → P7 → P8 → P9 →
P10 → P11 → P12**.

P2 puede avanzar en paralelo con P3 después de P1, siempre en worktrees y
archivos distintos. #677 es una dependencia externa: P0–P4 pueden avanzar con
fixtures congelados; P5 y posteriores no pueden afirmar integración de producto
hasta que la issue esté cerrada y verificada en `nightly`.

## 5. Estrategia de cortes verticales

El programa no se ejecutará por capas horizontales gigantes. Cada corte debe
dejar algo ejecutable, medible y reversible:

| Corte | Resultado observable | Sin incluir todavía |
| --- | --- | --- |
| V0 | candidate portable reproduce corpus Redline desde su propio paquete | App productiva, supervisor |
| V1 | Standings cumple presupuesto de update y motion con replay | telemetría live |
| V2 | selector puro explica Qt/Wails y todos los fallbacks | proceso Qt |
| V3 | Go inicia, alimenta y detiene un sidecar falso; crash vuelve a Wails | QML real |
| V4 | sidecar Qt real abre y reproduce corpus por pipe | Overlay v2 live |
| V5 | Delta + Pedals reciben Overlay v2 live y se ven en la ventana ingame | Relative/Standings live |
| V6 | Relative Mirror/Proximity/Traffic live con motion y estados | Standings live |
| V7 | Standings live completa la familia | packaging final |
| V8 | perfil completo, reinicio, edit mode y fallback funcionan | rollout |
| V9 | instalador/CI/diagnósticos/toggle producen un Nightly auditable | Testers/default |

Delta y Pedals son el primer corte live porque tienen modelos pequeños y
permiten validar la cadena completa sin ocultar el riesgo principal. Standings
no se pospone como riesgo: su gate temporal ya se resuelve en V1 con el corpus
portable antes de construir la ruta de producto.

## 6. Fases del programa

Tamaño orientativo: S = 1 PR, M = 2–3 PRs, L = 3–5 PRs. TASKS descompondrá cada
fase aprobada en cambios atómicos; este PLAN no autoriza esos cambios.

### P0 — Autoridad, ADR y corpus portable (M · riesgo bajo)

**Objetivo:** fijar la excepción arquitectónica y convertir el spike en un
candidate reproducible desde el `nightly` vigente.

**Incluye:**

- ADR 0009 Proposed: runtime Qt Redline ingame, límites y relación con ADR 0003;
- inventario exacto de seis diseños y cuatro tipos de widget;
- manifest de corpus/replay con hashes, cadencia, escena y versión;
- fuente Barlow Semi Condensed con licencia y hash, si la revisión de licencia
  permite redistribuirla;
- candidate Qt portable con build/test propio y sin rutas absolutas;
- baseline de consumo, update y motion capturado con comandos versionados;
- documentación de la deuda temporal conocida de Standings.

**Grupos de archivos previstos:**

- `docs/adr/0009-*.md`;
- `tools/benchmarks/isa370-overlay-renderers/contract/**` y `replay/**` solo si
  el corpus aprobado se conserva allí;
- `native/qt-redline/**` o el nombre definitivo aprobado para el sidecar;
- tests locales del candidate y helper de build Windows.

**Gate de salida:** build Release x64 limpio y autónomo, todos los replays
verificados por hash, seis diseños cargables, cero rutas de checkout embebidas,
licencia Qt/fuente documentada y ADR aceptado por Isaac.

**Rollback/STOP:** conservar candidate y evidencia; no existe ruta de producto
que revertir.

### P1 — Gate fail-fast de Standings (M · riesgo muy alto)

**Objetivo:** resolver o descartar la migración antes de añadir infraestructura
productiva.

**Problema de partida:** el spike midió cerca de 30 ms p95 de actualización QML
en Standings, por encima del hard gate de 8 ms y del presupuesto de frame.

**Trabajo permitido:** optimización pequeña y explicable del modelo/render:

- actualizaciones keyed incrementales;
- evitar resets, recreación del árbol y bindings innecesarios;
- acotar material/efectos costosos solo donde sean visibles;
- medir por tipo de evento y tamaño de parrilla;
- conservar el frame físico inmediato; no esconder el coste con colas o
  `callLater` que aumenten la latencia.

**No permitido sin volver a SPECIFY:** renderer custom C++, scene graph manual,
shared memory, protocolo binario, motor de animación propio o degradar el diseño.

**Gates:**

- update del modelo/QML: p95 objetivo ≤ 5 ms, hard ≤ 8 ms;
- máximo observado por evento ≤ 16,67 ms;
- onset físico frente a Wails dentro de ±16,67 ms;
- duración dentro de `max(16,67 ms, 5 %)`, trayectoria RMSE ≤ 1 px y máximo ≤
  2 px;
- cero pérdida de evento, fila, ghost, crown, battle o tire reveal;
- al menos 10 repeticiones Wails/Wails para ruido y 10 Qt/Wails para paridad.

**Checkpoint A — GO/STOP obligatorio:** si no cierra con una solución simple,
el programa se detiene. No se inicia P2–P12.

### P2 — Selector y elegibilidad fail-closed (S · riesgo medio)

**Objetivo:** decidir el motor sin abrir procesos ni ventanas.

**Entrada:** preferencia, perfil V3, modo activo y capacidades de sesión.

**Salida:** `requested`, `effective`, `eligible` y un motivo tipado. Casos
mínimos:

- todos los widgets/layouts son uno de los seis Redline → Qt elegible;
- cualquier diseño/tipo desconocido → Wails;
- edit mode → Wails;
- capa global no soportada → Wails;
- sidecar no instalado/incompatible → Wails;
- preferencia Wails → Wails;
- perfil inválido o error de lectura → Wails.

**Archivos previstos:** lógica pura cerca de `internal/app` y tests table-driven;
como máximo una estructura de decisión y un catálogo Redline explícito. No se
duplica el registry frontend ni se crea un framework de plugins.

**Gate de salida:** tabla exhaustiva, determinista, sin I/O, y test que prueba
que ninguna configuración desconocida selecciona Qt.

### P3 — Protocolo mínimo y supervisor con sidecar falso (M · riesgo alto)

**Objetivo:** validar lifecycle, backpressure y fallback sin mezclar todavía QML.

**Incluye:**

- codec de longitud + JSON con límite 1 MiB;
- handshake/versionado;
- un solo writer y una sola actualización pendiente (`latest-wins`);
- límites de arranque, ack, shutdown y kill;
- identidad de proceso propia, cleanup y cero proceso residual;
- sidecar falso de test que puede responder, bloquearse, cerrar y corromper un
  frame de forma controlada;
- fallback a Wails antes de hacer visible una ventana Qt;
- crash tras activación: cierre Qt, cambio a Wails y diagnóstico observable.

**Mensajes iniciales:**

| Mensaje | Dirección | Contenido mínimo |
| --- | --- | --- |
| `init` | Go → Qt | versión, perfil, widgets, viewport, DPR, locale, opciones |
| `frame` | Go → Qt | secuencia, capturedAt, revisión y payload Overlay v2 Redline |
| `shutdown` | Go → Qt | razón y deadline |
| `ready` | Qt → Go | versión, renderer, capacidades, HWND |
| `ack` | Qt → Go | última secuencia aplicada y métricas acotadas |
| `error` | Qt → Go | código tipado y contexto sanitizado |

`ready`, `ack` y `error` son respuestas del protocolo; no amplían la semántica
de control más allá de init/frame/shutdown.

**Gate de salida:** tests de framing parcial/múltiple/sobredimensionado, proceso
ausente, versión incompatible, timeout, crash, pipe roto y shutdown. Todos
terminan de forma acotada, sin deadlock ni proceso residual.

### P4 — Sidecar Qt standalone por pipe (M · riesgo alto)

**Objetivo:** sustituir el sidecar falso por el candidate real sin conectarlo aún
a telemetría live.

**Incluye:**

- entrypoint Qt x64 y shell Windows transparente;
- carga de `init`, creación de modelos y aplicación incremental de `frame`;
- alpha por píxel, topmost, no-activate y click-through;
- fuente, QML y assets empaquetados al lado del binario;
- ack después de aplicar/presentar según el contrato acordado;
- reproducción completa del corpus por el pipe real;
- métricas internas acotadas, sin logger por frame.

**Gate de salida:** el proceso Go de prueba inicia el sidecar real, reproduce las
15 escenas congeladas, verifica hashes/eventos, cierra limpiamente y pasa el gate
funcional de ventana en un escritorio físico.

**Checkpoint B — revisión de arquitectura:** Isaac revisa que el resultado sigue
siendo sidecar + protocolo mínimo y no se ha convertido en un segundo framework.

### Dependencia externa D1 — Overlay v2 Redline (#677)

P5 queda bloqueada hasta verificar en `origin/nightly`:

- #677 cerrada e integrada;
- contrato Go/TS actualizado;
- matriz Redline completa;
- goldens y fixtures reales;
- semántica de ausencia/error documentada;
- ninguna lectura legacy necesaria en Qt.

Si #677 cambia el shape respecto a la spec, se actualizan SPEC/PLAN antes de
TASKS de P5. No se adapta Qt directamente a Telemetry Core “temporalmente”.

### P5 — Primer corte live: Delta + Pedals (M · riesgo medio)

**Objetivo:** demostrar la cadena productiva completa con los modelos más
pequeños.

**Flujo:**

```text
Overlay v2 live → adapter wire Go → pipe → modelos Qt → Delta/Pedals QML
```

**Incluye:** estados ready/disconnected/missing/stale/error, referencia BEST,
cross-zero, fill, controles continuos, saturation, brake peak, reduced motion,
configuración de color y fallback.

**Gate de salida:** perfil real solo Delta/Pedals, misma actualización v2 enviada
a una ejecución Wails de control, paridad visual/motion, click-through, restart,
save/reload y crash fallback.

**Checkpoint C — primera vertical live:** validar datos, visual y complejidad
antes de portar Relative y Standings.

### P6 — Relative live: tres variantes (M–L · riesgo alto)

**Objetivo:** portar el modelo compartido una vez y verificar Mirror, Proximity y
Traffic como variantes del mismo contrato.

**Incluye:** identidad keyed, insert/move/remove, ghost rival, player estable,
gaps ausentes, crossing budget máximo tres por lote, approach, seams, traffic
class rail/threat, status y reduced motion.

**Gate de salida:** las tres variantes pasan el corpus y datos live; un cruce que
termina fuera del top 3 conserva el wash; cuatro cruces limitan a los tres
primeros eventos; el player nunca se convierte en ghost; stale/error no arma
motion.

### P7 — Standings live y motion completo (L · riesgo muy alto)

**Objetivo:** conectar al contrato real el widget más complejo sin perder el
presupuesto demostrado en P1.

**Incluye:** clases no contiguas agrupadas por clase, clase del jugador al final,
headers, leader/player/PIT, session-best con empates y formatos de vuelta,
FLIP/enter/retirement, overtake, delta chip, battle RACE-only, pit-out+tire,
crown transfer, final minutes, reduced-motion productivo y estados.

**Gate de salida:** mismos gates temporales de P1 sobre Overlay v2 live, más
paridad de todas las escenas y casos contractuales. El adapter real, no un
helper de test, debe derivar cualquier clase visual que no venga explícita en
Overlay v2.

**Checkpoint D — familia completa:** no se inicia packaging final si cualquiera
de los seis diseños requiere bypass, flag de test o dato inventado.

### P8 — Perfil completo, lifecycle y fallback (M · riesgo alto)

**Objetivo:** convertir los widgets aislados en una sesión de overlay segura.

**Incluye:**

- un único Qt sidecar por perfil;
- múltiples instancias de los seis diseños;
- layouts del perfil y geometría V3;
- start/stop/restart y save del perfil;
- cambio de perfil;
- edit mode → cierre Qt y Wails;
- global layer no soportada → Wails;
- crash/hang/version mismatch → Wails;
- cierre de aplicación y actualización sin residuos;
- protección contra carreras Start/Stop/Start.

**Archivos previstos:** cambios pequeños en `internal/app/overlay_controller.go`,
una implementación Qt de la frontera de ventana y composición en
`cmd/vantare/main.go`. `OverlayController` no gana conocimiento de QML o del
protocolo.

**Gate de salida:** matriz de transiciones de estado completa, exactamente una
ventana visible, exactamente un engine efectivo y cero procesos/handles
residuales.

### P9 — Packaging, preferencia, diagnósticos y CI (M–L · riesgo alto)

**Objetivo:** hacer que el opt-in sea instalable, auditable y reversible.

**Incluye:**

- sidecar, Qt runtime, QML, fuente y licencias en build Windows;
- verificación de arquitectura x64, hashes y presencia de archivos;
- firma del binario y compatibilidad con updater/installer;
- preferencia experimental `wails | qt-redline`;
- UI pequeña en el área de diagnóstico/experimental existente, sin rediseñar
  Settings;
- estado solicitado/efectivo y fallback en diagnóstico;
- CI de build/test Qt separado, sin hacer Qt dependencia del desarrollo web;
- smoke instalado desde ruta con espacios y usuario no administrador.

**Decisión de licencia bloqueante:** confirmar versión, forma de distribución y
obligaciones de Qt y Barlow antes de crear un artefacto Nightly. Si exige una
arquitectura o coste no aprobados, STOP.

**Checkpoint E — autorización previa a Nightly:** revisión humana de tamaño,
licencias, instalador, diagnósticos y rollback.

### P10 — Gates físicos, rendimiento, hardware y soak (L · riesgo muy alto)

**Objetivo:** demostrar que el candidate productivo supera a Wails en escenarios
reales, no solo en fixtures.

**Matriz mínima:**

- GPU dedicada, iGPU e híbrida;
- 1080p, QHD, 4K y ultrawide;
- 100 %, 125 %, 150 % y 200 % DPI;
- monitor primario/secundario y coordenadas negativas;
- OBS Game Capture y Window Capture;
- juego normal y entorno con anti-cheat;
- sesión idle, parrilla grande, stress de motion y reconexión;
- soak de 4 h y un ciclo largo acordado antes de Testers.

**Gates funcionales:** alpha, click-through real, topmost, no-focus, DPI,
multimonitor, captura OBS, lifecycle y residual cero.

**Gates de paridad:**

- estático: mismatch ≤ 8 %, mean RGB ≤ 5 y geometría ≤ 1 px;
- motion: onset/first physical ±16,67 ms, duración
  `max(16,67 ms, 5 %)`, trayectoria RMSE ≤ 1 px y máximo ≤ 2 px;
- eventos exactos y completos.

**Gates de rendimiento:**

- RAM privada Qt mejora ≥ 35 % frente a Wails;
- CPU y GPU no empeoran en la mediana del mismo escenario;
- p95 de update Qt ≤ 8 ms y máximo ≤ 16,67 ms;
- arranque, shutdown y fallback dentro de los límites de la spec;
- memoria, handles y procesos sin crecimiento sostenido en soak.

Las comparaciones usan binarios, perfiles, replays y capturas custodiados por
hash. Ausencia de callback WGC durante un frame estático no cuenta como drop; el
pacing de presents usa una fuente apropiada.

### P11 — Nightly opt-in (M · riesgo alto)

**Objetivo:** exponer Qt solo a una cohorte controlada y conservar rollback
inmediato.

**Condiciones de entrada:** P0–P10 verdes, CI oficial verde, artefacto instalado
probado y autorización explícita de Isaac para promocionar a `nightly`.

**Operación:**

- Wails sigue default;
- toggle marcado experimental;
- al menos dos ciclos Nightly;
- métricas y fallback sanitizados;
- formulario/checklist visual para los seis diseños;
- cualquier P0/P1 funcional desactiva el opt-in en la siguiente build y vuelve
  a Wails.

### P12 — Testers y decisión separada (M · riesgo alto)

**Objetivo:** validar el conjunto corregido en la cohorte Testers y cerrar el
programa con una recomendación, no cambiar el default automáticamente.

**Condiciones:** autorización explícita para promover de Nightly a Testers,
incidencias Nightly cerradas y nueva matriz de regresión.

**Salida:** informe GO/STOP con consumo, paridad, estabilidad, hardware,
mantenimiento, fallbacks y deuda. Hacer Qt default, ampliar diseños o retirar
Wails requiere una issue y aprobación nuevas.

## 7. Presupuesto de complejidad

El diseño se considera demasiado complejo y vuelve a PLAN si supera cualquiera
de estos límites sin una causa medida:

- más de un proceso Qt por perfil;
- más de un transporte o más de tres comandos de control;
- más de una actualización pendiente en el pipe;
- más de una fuente visual Redline editable;
- un registry dinámico para seis diseños cerrados;
- una interfaz genérica de motores que no sea necesaria para Wails/Qt;
- un adapter distinto por cada instancia cuando puede existir uno por tipo;
- lógica de telemetría o dominio en QML;
- un nuevo sistema de preferencias en vez de ampliar el existente;
- un nuevo sistema de observabilidad en vez de usar diagnóstico/métricas
  existentes;
- una dependencia nueva que no sea Qt y sus assets aprobados.

Presupuesto inicial de superficie productiva:

- un subárbol sidecar Qt;
- un paquete Go pequeño para elegibilidad/protocolo/supervisión;
- una implementación de la frontera `OverlayWindow`;
- cambios de composition root y settings acotados;
- packaging/CI Windows;
- documentación, tests y evidencia.

TASKS debe revisar este presupuesto antes de cada fase L.

## 8. Propiedad de archivos y carriles

| Carril | Propiedad principal | No debe tocar |
| --- | --- | --- |
| A — arquitectura/docs | ADR 0009, spec/plan, current-plan, handoff | producto salvo cambios documentales aprobados |
| B — candidate Qt | `native/qt-redline/**`, QML, modelos, tests Qt | Telemetry Core, frontend productivo |
| C — selector/supervisor Go | paquete de runtime Qt y tests, adapter wire | QML y contratos #677 |
| D — Overlay v2 | permanece en #677 y sus issues | sidecar Qt salvo fixtures acordados |
| E — integración app | `overlay_controller.go`, composition root, settings | modelos QML internos |
| F — packaging/gates | build Windows, installer, workflows, harnesses | lógica de dominio |

Reglas:

- un solo propietario por archivo y worktree;
- no ejecutar dos agentes sobre el mismo worktree;
- cambios compartidos de contrato se integran antes de que otro carril los
  consuma;
- los carriles B y C pueden avanzar en paralelo después de P1, pero P5–P8 son
  secuenciales porque comparten modelos, adapters y lifecycle;
- packaging empieza cuando las rutas del sidecar estén estables;
- pruebas físicas se ejecutan en serie para evitar contaminación de ventanas,
  captura y GPU.

## 9. Mapa propuesto de GitHub Issues

Las issues hijas se crean solo después de aprobar este PLAN. Los números se
asignan en GitHub; #690 conserva la coordinación SDD y el estado global.

| Orden | Título propuesto | Fase | Tamaño | Dependencias |
| ---: | --- | --- | --- | --- |
| 1 | ADR 0009 y contrato de autoridad visual del runtime Qt Redline | P0 | S | #690 PLAN aprobado |
| 2 | Candidate Qt Redline portable, corpus y fuente custodiados | P0 | M | 1 |
| 3 | Gate fail-fast de Standings: update y primera respuesta física | P1 | M | 2 |
| 4 | Selector de motor y elegibilidad fail-closed por perfil | P2 | S | 3 PASS |
| 5 | Protocolo enmarcado y supervisor Go con sidecar falso | P3 | M | 3 PASS |
| 6 | Sidecar Qt real standalone por pipe | P4 | M | 2, 5 |
| 7 | Overlay v2 Redline: matriz estable para Qt | D1 | externa | #677 |
| 8 | Vertical live Qt: Delta + Pedals | P5 | M | 6, 7 |
| 9 | Vertical live Qt: Relative Mirror/Proximity/Traffic | P6 | M–L | 8 |
| 10 | Vertical live Qt: Standings y motion completo | P7 | L | 9 |
| 11 | Runtime Qt por perfil: lifecycle, edit fallback y crash recovery | P8 | M | 10 |
| 12 | Packaging, licencias, diagnósticos y toggle experimental | P9 | M–L | 11 |
| 13 | Matriz física, rendimiento, hardware y soak | P10 | L | 12 |
| 14 | Rollout Nightly opt-in | P11 | M | 13 + autorización |
| 15 | Cohorte Testers e informe GO/STOP | P12 | M | 14 + autorización |

Cada issue tendrá su rama `vantareapp/<issue>-<slug>`, worktree aislado,
criterios de aceptación, evidencia y actualización del Project Vantare. No se
abren todas de una vez: solo la siguiente fase desbloqueada y, como máximo, los
carriles paralelos explícitos.

## 10. Secuencia de ramas, PRs y promoción

1. issue hija → rama/worktree aislado desde el `origin/nightly` vigente;
2. cambio pequeño, tests, build y revisión adversarial;
3. commit local y revisión de Isaac;
4. push/PR draft solo cuando se autorice o forme parte de la issue aprobada;
5. CI oficial;
6. merge a `nightly` solo con autorización explícita;
7. P11 acumula y corrige en Nightly;
8. promoción a `testers` solo con autorización explícita;
9. `master` queda fuera de #690 salvo decisión posterior expresa.

No se acumula una rama gigante con todo el programa. Cada fase debe poder
revertirse sin deshacer las anteriores que ya sean útiles.

## 11. Matriz de verificación

### 11.1 Checks por cambio Go

- `gofmt` en archivos modificados;
- tests focales del selector/protocolo/supervisor;
- `go test ./internal/app/...` cuando aplique;
- `go test ./...` tras cambios compartidos;
- `go vet` focal para proceso/IPC;
- tests de race/cancelación cuando el entorno permita CGO/race aplicable;
- proceso, ventana, handles y temporales residuales = 0.

### 11.2 Checks por cambio Qt/QML

- fresh configure y build Release x64 con `/W4 /WX`;
- QtTest/CTest en Qt 6.10.2;
- `qmllint --max-warnings 0`;
- carga/instanciación de cada root;
- replay completo y hashes;
- offscreen para lógica y escritorio físico para shell/alpha/click-through;
- ningún path absoluto ni dependencia del checkout en binario/manifest.

### 11.3 Checks por integración

- Wails unchanged cuando la preferencia es Wails;
- perfil no elegible → Wails;
- Qt ausente/version mismatch/crash/hang → Wails;
- edit mode → Wails;
- save/restart/cambio de perfil;
- una sola ventana y un solo proceso efectivo;
- Overlay v2 live sin lectura legacy;
- build frontend y tests si se toca Settings/diagnóstico;
- build Windows e instalador cuando se toca packaging.

### 11.4 Checks visuales y motion

- corpus Wails y Qt generado desde la misma escena/estado;
- capturas alpha y color custodiadas;
- comparación estática por región, geometría y texto;
- eventos con identidad, onset, duración, curva y trayectoria;
- controles negativos causales;
- evidencia generada con herramientas versionadas y validación canónica;
- no promover artefactos que dependan de binarios o envelopes ausentes.

### 11.5 Checks documentales

- `git diff --check`;
- roadmap digest generado, nunca editado a mano;
- current-plan, handoff, issue y Project reflejan el mismo estado;
- ADR/spec/plan apuntan a base, commit y evidencia reales;
- ninguna afirmación de PR, CI, integración o release sin comprobarla.

## 12. Métricas y diagnóstico

Nombres finales se fijan en TASKS siguiendo las convenciones existentes. La
semántica mínima es:

- sesiones solicitadas y efectivas por engine;
- fallbacks por motivo tipado;
- sidecar starts, ready, crashes, timeouts y forced kills;
- bytes/frame y frames reemplazados por latest-wins;
- tiempo encode/write/read/apply/present;
- secuencia publicada, aplicada y presentada;
- frame age y backlog;
- RAM privada, working set, CPU, GPU 3D y handles por proceso;
- hash/version del sidecar y contrato;
- perfil/revisión sanitizados, sin datos personales ni telemetría cruda en logs.

No se escribe una línea de log por frame. Los detalles de alto volumen viven en
un modo de benchmark explícito y acotado.

## 13. Riesgos y respuesta

| Riesgo | Señal temprana | Mitigación mínima | STOP / reevaluación |
| --- | --- | --- | --- |
| Standings no entra en 16,67 ms | p95 > 8 ms tras updates keyed | P1 antes de integración | requiere scene graph custom o degradar diseño |
| Overlay v2 cambia por Telemetry Core | #677 modifica tipos/semántica | bloquear P5 y actualizar spec | adapter temporal a legacy |
| Doble motor visible | dos HWND/procesos durante fallback | selector antes de crear, transición serial | no puede garantizarse atomicidad operacional |
| Sidecar cuelga app | shutdown/pipe bloqueante | deadlines, cancelación, proceso hijo aislado | requiere thread/process manager complejo |
| QML deriva del TSX/CSS | gate visual/motion falla | corpus compartido y review por widget | requiere doble autoría frecuente |
| Qt aumenta demasiado el instalador | tamaño/licencia/firma fuera de presupuesto | medir en P9, módulos mínimos | coste/licencia no aprobados |
| Anti-cheat/OBS rechaza Qt | captura o juego no funciona | gate antes de Nightly | no hay solución simple y soportable |
| Hardware híbrido diverge | GPU/alpha/DPI inconsistente | matriz P10 | fallback no fiable en hardware objetivo |
| Camino dual se eterniza | issues sin fecha/gate | checkpoints y salida GO/STOP | no hay avance tras dos ciclos Nightly |
| Tests visuales falsamente verdes | artifact autofirmado o input stale | recomputación desde bytes físicos | evidencia no reproducible |
| Primary checkout sucio se mezcla | cambios ajenos aparecen en diff | worktree por issue | conflicto de ownership/base |

## 14. Rollback por fase

| Fase | Rollback |
| --- | --- |
| P0–P1 | archivar candidate/evidencia; cero producto afectado |
| P2 | revertir selector puro |
| P3–P4 | desactivar ruta Qt; Wails factory permanece |
| P5–P7 | revertir adapter/widget de la fase; preferencia Qt sigue no disponible |
| P8 | forzar fábrica Wails en composition root |
| P9 | ocultar toggle y omitir sidecar del siguiente artefacto |
| P10 | marcar STOP sin rollout |
| P11 | desactivar opt-in Nightly y publicar corrección Wails-only autorizada |
| P12 | no promover; Testers vuelve a Wails |

El rollback no modifica perfiles ni necesita una migración de datos.

## 15. Checkpoints humanos

1. **A — después de P1:** GO/STOP por rendimiento y motion de Standings.
2. **B — después de P4:** aceptar que arquitectura/protocolo siguen siendo
   mínimos.
3. **C — después de P5:** aceptar la primera vertical live y el contrato #677.
4. **D — después de P7:** aceptar paridad de la familia completa.
5. **E — después de P9:** autorizar o negar la entrada a gates instalados y
   preparación Nightly.
6. **F — después de P10:** autorizar o negar promoción opt-in a Nightly.
7. **G — después de P11:** autorizar o negar promoción a Testers.
8. **H — después de P12:** decisión separada sobre default, ampliación o STOP.

PLAN, TASKS, implementación, Nightly, Testers y cualquier decisión de default
son aprobaciones distintas.

## 16. Definición de terminado del programa

El programa termina cuando existe un informe GO o STOP y se cumplen los puntos
aplicables:

- seis diseños Redline completos en la ruta Qt;
- ninguna ruta Qt para diseños fuera de alcance;
- contrato Overlay v2 estable y sin lectura legacy;
- una ventana/un proceso por perfil;
- fallback Wails probado para todas las causas;
- gates visuales, motion, funcionales, performance, hardware y soak;
- sidecar instalable, firmado, licenciado y diagnosticable;
- Wails/Studio/Workshop/OBS sin regresión;
- documentación viva, ADR, GitHub Issues/Project y evidencia coherentes;
- al menos dos ciclos Nightly y cohorte Testers si el resultado es GO;
- ningún proceso, handle, temporal o artefacto sin custodia;
- decisión explícita de Isaac sobre el siguiente paso.

No significa “terminado” que el candidate compile, que una PR esté verde o que
una captura se vea parecida.

## 17. Conversión posterior a TASKS

Tras aprobar este PLAN, TASKS debe:

1. crear solo las issues de P0 y P1 inicialmente;
2. fijar archivos exactos y propietario por tarea;
3. definir RED y GREEN observables por cambio;
4. limitar cada tarea a un cambio pequeño y revisable;
5. incluir comandos concretos, rollback y evidencia;
6. registrar qué tareas pueden ejecutarse en paralelo;
7. detenerse de nuevo para aprobación antes de implementar.

TASKS no puede adelantar P5 mientras #677 siga abierta ni rebajar el gate P1
para “hacer avanzar” el programa.

## 18. Decisiones solicitadas para aprobar PLAN

Se recomienda aprobar conjuntamente:

1. el orden fail-fast P0 → P1 antes de tocar integración productiva;
2. Delta + Pedals como primera vertical live, después Relative y por último
   Standings live;
3. el bloqueo duro de P5 por #677 integrada en `nightly`;
4. el presupuesto de complejidad de §7;
5. las issues y checkpoints de §§9 y 15;
6. Wails default y fallback hasta una decisión posterior a Testers;
7. STOP como resultado correcto si el candidate exige arquitectura especial o
   no cumple hardware/motion/packaging;
8. una nueva pausa después de TASKS antes de cualquier implementación.

PLAN aprobado. La primera ola se descompone en
`docs/superpowers/plans/2026-08-20-isa-690-qt-redline-runtime-migration-tasks.md`.
Solo se crean inicialmente las issues P0-A, P0-B y P1; P2+ sigue bloqueado por
el checkpoint GO/STOP.
