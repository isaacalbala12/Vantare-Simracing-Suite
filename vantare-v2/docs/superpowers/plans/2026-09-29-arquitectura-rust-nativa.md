# Plan — Arquitectura Rust nativa por fases

Issue: [#1419](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1419).
Decisión: [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md).
Estado: **aceptado por Isaac el 2026-09-29** (consenso Opus 5.5 ↔ GPT-6 Astra).

## Estrategia: destino fijo, crecimiento desde un esqueleto andante

Las **fronteras** de la ADR 0099 se fijan desde el inicio: responsabilidades y
dirección de dependencias (adaptador → núcleo → flujos → proyecciones →
widgets; procesos). Los tipos y la semántica evolucionan con evidencia, sobre
todo la del segundo simulador. Dentro de esas fronteras se construye primero
un **esqueleto andante**, el camino completo más pequeño posible de un replay
real a un widget en pantalla, y cada fase lo amplía sin cambiar su forma. Cada
fase termina con algo que funciona y se puede medir.

## Prioridades

1. **Dentro de presupuestos de producto aceptados, manda la mantenibilidad a
   largo plazo;** una mejora marginal no justifica complejidad adicional.
2. **Rendimiento en carrera:** CPU total, memoria y frame time del juego,
   siempre dentro de presupuesto.

## Reglas comunes a todas las fases

- **Coexistencia.** La aplicación nativa vive en `native/` dentro del
  repositorio. El producto Wails sigue siendo el distribuido hasta el corte.
- **Issue y rama por fase** (`vantareapp/isa-N-slug`), worktree aislado y
  delegación según la skill de orquestación: Sonnet ejecuta, Opus revisa y
  diseña lo visual nuevo, DeepSeek/Muse para inventarios y trabajo mecánico,
  Astra solo en decisiones de dirección.
- **Código mínimo y Rust idiomático.** Todo worker que escriba Rust aplica
  `ponytail` (la solución más simple que funciona; nunca recorta validación en
  fronteras de confianza, manejo de errores que evite pérdida de datos,
  seguridad ni accesibilidad) y las guías instaladas: `rust-skills`,
  `rust-pragmatic-guidelines`, `rust-m*` y `rust-unsafe-checker`. `clippy` con
  avisos como error y `rustfmt` en cada commit.
- **Tests de arquitectura en CI desde la fase 0:** `domain` y `ui` no dependen
  (ni transitivamente) de adaptadores; fronteras públicas comprobadas; ningún
  widget contiene lógica por simulador.
- **Indicadores de mantenibilidad como tendencia, no como objetivo:** cada
  fase reporta líneas añadidas y eliminadas separando producción, tests y
  generado; dependencias nuevas con justificación; tiempo de compilación
  incremental de `ui` medido en el mismo equipo, perfil, caché y cambio; y
  acoplamiento: cuántos módulos hay que tocar para añadir una señal o una
  variante visual.
- **Presupuestos antes de comparar.** Tras caracterizar la referencia se
  acuerdan presupuestos **relativos y absolutos**, con método, hashes de
  binarios y corpus fijados antes de ejecutar. Los crudos se versionan. Una
  regresión no se oculta ajustando corpus o consumidores.
- **Latencia honesta.** Se mide por tramos (muestra del simulador → commit del
  núcleo → presentación). El tramo del simulador solo cuenta si su timestamp
  es observable y correlacionable; si no, la medida empieza en la lectura y la
  edad previa se declara desconocida.
- **Las mediciones las hace el orquestador,** en serie y en las mismas
  condiciones.
- **Paridad visual** por capturas contra referencias congeladas, con el
  comparador de píxeles de `isa-1410`.
- **Nada se da por bueno por el informe del autor:** revisión de diff,
  evidencia y reproducción de las cifras clave.
- **Tests que no pueden pasar en vacío:** un test que depende de un corpus
  falla si el corpus no está.
- **Controles de regresión** de rendimiento y paridad activos durante todas las
  fases, no solo al final.

## Fase 0 — Esqueleto andante y decisión de topología

**Objetivo.** Recorrer todo el camino con lo mínimo y decidir la topología.

**Incluye.**
- Workspace `native/` con `domain`, `runtime`, `ipc` y `ui`.
- Modelo común inicial (sesión, coches, posiciones, tiempos, banderas,
  calidad) y formateador puro.
- Adaptador LMU sobre replay del corpus real, reutilizando tras revisión
  independiente el parser/admisión, las reglas de calidad y el reducer de
  ISA-1403; batería de conformidad con corpus obligatorio.
- Núcleo mínimo con el flujo de foto, proceso de overlays GPUI con Standings,
  radar y pedales mínimos, IPC con DTO serde en JSON.
- Ciclo de vida: propietario de arranque y cierre, instancia única,
  cancelación con plazos, configuración sin bloquear la adquisición. La
  reconexión de un consumidor conserva época y cursor mientras sean válidos;
  reiniciar o reinicializar el productor establece una época nueva.
- Launcher mínimo y Workshop mínimo (recompilar y reabrir conservando la
  escena) sobre el renderer productivo.

**Medición.**
1. Referencia del producto Wails: la línea base ya medida en
   `docs/analysis/huella-minima-baseline-2026-08-29.md` (protocolo
   `huella-minima-protocolo.md`, banco `scripts/bench/huella.ps1`): con overlay
   activo, 555 MiB privados y ≈1,14 núcleos. Su frame time quedó no
   concluyente, así que el frame time del juego se mide con el protocolo
   mejorado (A0/A1 intercalados en la misma escena). Como aquel perfil usaba el
   diseño Endurance, se repite el mismo banco con el perfil equivalente en
   Eficiencia antes de fijar presupuestos. Ruido A/A de cada brazo.
2. Fijar presupuestos relativos y absolutos antes de comparar.
3. Campaña intercalada B (por defecto) frente a A (overlays dentro del núcleo)
   con 1, 4 y 22 ventanas: CPU total atribuible (núcleo, overlays, driver,
   DWM), memoria privada y VRAM, latencia por tramos y, con LMU en pista, frame
   time del juego (p99 y p99,9) con PresentMon, también con OBS capturando.
4. Pruebas de caída, bloqueo y reconexión de la UI y del núcleo.
5. DPI mixto, multimonitor, OBS por captura de ventana, sin foco, ventanas
   ocultas.

**Aceptación.** B cumple presupuestos y contiene fallos, o se documenta por
qué A; la variante no seleccionada se retira del código. Standings con paridad visual dentro del
umbral de `isa-1410`. Tests de arquitectura verdes.

## Fase 1 — LMU en vivo, núcleo para overlays y pruebas de frontera

**Incluye.** Shared Memory y REST en vivo; identidad, fusión y derivaciones
(gaps, deltas, combustible, stints); capacidades en tres niveles; banderas
combinables con ámbito; multiclase; estados de fuente y frescura con la
semántica de Overlay V2 (revisión única y creciente).

**Pruebas de frontera antes de multiplicar consumidores:**
- Un evento persistido y recuperado, y un bloque temporal reproducible.
- Un corte vertical de un **segundo adaptador real: Assetto Corsa** (shared
  memory), con capturas reales. Si no es posible, un suplente de otra fuente real sirve como validación
  **parcial**: debe aportar semánticas distintas (identidad, tiempo, unidades,
  capacidades ausentes o estructura de sesión); convertir una captura LMU a
  otro formato no vale, y un fichero histórico no demuestra ciclo de vida ni
  frescura live. Las limitaciones se registran.

**Aceptación.** Paridad de valores contra el corpus real con oráculo
congelado por hash; menú, boxes, cambio de sesión, REST caído y cierre del
juego probados con capturas propias del revisor; sin fuga de tipos de
simulador.

**Capturas físicas aplazadas (decisión de Isaac, 2026-09-29):** las capturas
propias de LMU (menú, boxes, cambio de sesión, REST caído, cierre, bandera) y
de ACC conduciendo se hacen justo antes de la fase 8; las grabadoras
`vantare-grabar-lmu` y `vantare-grabar-acc` ya existen. Hasta entonces la
fase 1 se da por cerrada con fixtures, corpus reales y oráculo.

## Fase 2 — Todos los widgets

**Alcance visual.** Solo el sistema de diseño **Eficiencia**
(`vantare-functional`). Crystal, Endurance, iRacing y Original no se portan;
siguen en el producto Wails hasta el corte. Desde el inicio de esta fase el
producto Wails queda congelado en funcionalidades (solo correcciones); las
correcciones semánticas se trazan para incorporarlas también al nativo.

**Puerta previa.** Dos widgets sobre el kit común antes del porte masivo.

**Incluye.** Los 22 tipos de widget en Eficiencia,
portados por familia en paralelo (Sonnet, un worktree por familia) sobre el
kit común (tipografía, filas, cabeceras, animaciones, sombras). ViewModels,
formato, estado y primitivas compartidos; composiciones distintas solo cuando
cambie la geometría.

**Aceptación.** Paridad por capturas de cada widget y diseño contra
referencias congeladas; revisión visual de Opus; recursos dentro de
presupuesto con el conjunto típico de widgets.

## Fase 3 — Eventos y Engineer

**Incluye.** Flujo de eventos con la semántica de la ADR (memoria con recording
desactivado, durable tras persistencia con recording activado); Engineer/Spotter
y voz como worker que consume foto y eventos.

**Aceptación.** Reinicio de Engineer recuperando desde su cursor. Tras reiniciar
el núcleo, el modo volátil declara el hueco y reconstruye desde snapshot sin
deducir hechos a través de él; con recording activo se comprueba la
recuperación de todos los eventos cuya durabilidad se confirmó. Retención
agotada con hueco declarado; activación y desactivación de recording;
disco lleno con degradación explícita; consumidor lento.

## Fase 4 — Series, grabación y análisis

**Incluye.** Series por vuelta en bloques; worker de almacenamiento con DuckDB
de propietario único; análisis histórico y después análisis en directo sobre
el mismo esquema.

**Aceptación.** Grabación manteniendo adquisición, latencia y frame time dentro
de los presupuestos aceptados; análisis
live y reproducción de la misma sesión dan los mismos resultados. Presupuestos
ratificados de nuevo con journal y series activos.

## Fase 5 — Hub, Overlay Studio y Workshop completo

**Incluye.** Proceso Hub en GPUI; Studio (layout, contenido, comportamiento,
apariencia) sobre los mismos renderizadores; Workshop completo; cuenta,
licencias, calendario, notificaciones y planes de Strategy.

**Aceptación.** Paridad funcional con el Hub actual por lista de
comprobación; el Hub se cierra por completo y libera su memoria al entrar al
juego.

## Fase 6 — Segundo simulador completo: Assetto Corsa

**Aceptación.** Ningún cambio en núcleo, proyecciones ni widgets salvo
extensiones del modelo común justificadas; si hace falta un `if simulador`
fuera del adaptador, se revisa el modelo antes de seguir. Es la validación
completa de neutralidad antes del corte.

## Fase 7 — Candidato empaquetado y reversible

**Incluye.** Empaquetado, instalador, portable, actualizador con rollback,
migración reversible de datos y perfiles, **matriz de paridad de servicios**
(incluido Testing Center), actualización interrumpida, sesión prolongada y
prueba en otra GPU. Red remota y 3D quedan como extensiones explícitas, no
como requisitos de la sustitución.

## Fase 8 — Tandas de optimización del pipeline completo

**Método.** Rondas cortas y medidas: perfilar, elegir una causa, cambiarla con
test de paridad, repetir el banco con los mismos binarios de referencia y
conservar también los resultados que empeoran. Cada ronda mantiene o mejora la
mantenibilidad; una optimización que complique el código sin ganancia medible
y relevante se descarta. El cambio de codec IPC, si procede, se decide aquí o
antes cuando un perfil representativo lo justifique.

**Aceptación.** Mejora reproducible frente a la ronda anterior o cierre
explícito de la tanda.

**Rondas obligatorias además del rendimiento (decisión de Isaac).** Cada tanda
alterna cuatro tipos de ronda sobre todo el código nativo, y ninguna se cierra
sin la revisión del orquestador:
1. **Simplificación:** quitar capas, parámetros y casos que no aportan (skills
   `ponytail-review`/`ponytail-audit` y `simplify`).
2. **Reducción extensa de código:** borrar código muerto, duplicado o
   especulativo; medir líneas de producción antes y después.
3. **Optimización:** perfilar y atacar una causa por ronda, con banco y paridad.
4. **Revisión de mantenibilidad y anti-slop:** legibilidad, nombres, fronteras,
   tests que prueban comportamiento y no detalles, comentarios útiles, sin
   abstracciones de un solo uso ni código generado sin entender
   (`code-review`, guías Rust instaladas).
El criterio de éxito es menos código igual de correcto o más legible; una
ronda que no reduzca ni aclare nada se registra como tal.

**Primera candidata (decisión de Isaac): demanda desde los widgets.** Hoy el
núcleo deriva todo en cada tick y el IPC envía la foto completa. En esta fase:
los widgets del layout activo declaran sus señales (columnas y huecos del pie
incluidos), el núcleo solo deriva lo demandado, el IPC solo envía lo demandado
con cadencia por señal, y lo no pedido se marca como no pedido (no como no
disponible) para no confundir a un widget que se active después.

## Fase 9 — Corte

**Incluye.** Retirada del producto Go/Wails y de las reglas de `AGENTS.md`
ligadas a él, soak y sesión física LMU + OBS sobre el SHA final, banco final
frente al producto actual y promoción de canal con autorización de Isaac.

## Tratamiento de ISA-1403

Pausada en `3ced668f` (PR draft #1415). No se revisa de forma exhaustiva lo
que se abandona. Las piezas reutilizables se revisan al portarlas en las fases
0 y 1; los defectos ya confirmados (contadores de revisión, bloqueo en la
actualización de configuración, facts sin garantía, proyecciones acopladas a
LMU, tests que pasan sin corpus) se tratan como requisitos de diseño de la
arquitectura nueva, no como parches sobre la anterior.

## Decisiones de Isaac (2026-09-29)

0. **Agrupación de ventanas:** una sola ventana transparente por monitor con
   todos los widgets (se retira el modo de una ventana por widget). Medido en
   fase 0: con datos quietos, 22 ventanas cuestan el doble de CPU que una sola
   porque cada ventana recibe un aviso de pintado por refresco.

**Resultado de la fase 0** (`docs/analysis/fase0-medicion-2026-09-29.md`):
topología **B** (núcleo y overlays en procesos separados); la variante A se
retiró. Nativo B con 4 widgets y LMU en vivo: 107 MiB privados y ~12 % de un
núcleo, frente a 555 MiB y ~114 % de la referencia Wails. El frame time del
juego queda pendiente de una campaña con consola elevada.

1. El producto Wails se congela en funcionalidades al empezar la fase 2.
2. Segundo simulador: **Assetto Corsa**, si es posible.
3. Solo se porta el sistema de diseño **Eficiencia**.
4. La salida remota para análisis live queda **fuera de este plan**, mucho
   después del corte.

## Estado a 2026-09-30 (desarrollo autónomo nocturno)

Integración única en `vantareapp/isa-1427-fase2` (fases 2–7 fusionadas; ramas
por fase con su microplan en `docs/superpowers/plans/2026-09-30-fase-*.md`).
Workers Codex gpt-6.1-sol; decisiones de contrato consultadas con Astra y Fable.

- **Fase 2 (#1427):** 18 widgets Eficiencia portados; DTO v4 (relative, volante,
  historial de combustible, estado de la fuente), ajustes tipados por widget,
  `layout.json` aplicado en caliente reutilizando ventanas, trazas en el widget
  con escenas en secuencia. Pendientes: variantes de ajustes solo persistidas,
  residuo de rasterización de texto de GPUI (controles privados; decisión de
  Isaac si se parchea GPUI) y widgets aún por encima del 4 %.
- **Fase 3 (#1428):** journal con recording on/off, hechos productivos del
  núcleo, Engineer como proceso con cursor/checkpoint, radio y clips locales.
  Voces: caché Kokoro del producto reutilizada; visto bueno de Isaac para alpha (2026-09-30). Pendientes: clips de bandera amarilla/azul; señales para Spotter
  (velocidad de rivales), sanciones y servicio de boxes.
- **Fase 4 (#1429):** series por vuelta, codec, análisis puro live/replay,
  `vantare-storage` con DuckDB bundled (propietario único, WAL, recuperación).
  Pendiente: presupuesto físico con LMU/OBS.
- **Fase 5 (#1430):** Hub GPUI con kit visual Orbit, Studio sobre el layout
  común, Workshop, calendario, notificaciones, cierre por flanco Live.
  En curso: Engineer, análisis, Workshop completo y Ajustes, Launcher,
  Strategy. Bloqueado por Isaac: cuenta, licencias, roadmap y envío del
  Testing Center (servicios Supabase/credenciales).
- **Fase 6 (#1431):** ACC completo sobre corpus; estado de fuente declarado
  por el adaptador; pendientes capturas físicas.
- **Fase 7 (#1432):** candidato local instalable/portable con actualización y
  rollback probados. En curso: todos los binarios e importación V4 → layout.
  Bloqueado por Isaac: firma, publicación y pruebas en otra GPU.
- **Fase 8:** no iniciada; espera las capturas físicas (decisión de Isaac).
- **Fase 9:** requiere autorización de Isaac.
