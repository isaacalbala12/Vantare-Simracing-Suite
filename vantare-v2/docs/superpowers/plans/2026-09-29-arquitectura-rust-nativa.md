# Plan — Arquitectura Rust nativa por fases

Issue: [#1419](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1419).
Decisión: [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md).
Estado: propuesta en debate Opus 5.5 ↔ GPT-6 Astra; pendiente de aceptación de Isaac.

## Estrategia: destino fijo, crecimiento desde un esqueleto andante

Las fronteras de la ADR 0099 se fijan desde el inicio y no se mueven entre
fases: adaptador, núcleo neutral, tres flujos, proyecciones, widgets y
procesos. Dentro de ellas se construye primero un **esqueleto andante**: el
camino completo más pequeño posible, de un replay real a un widget en
pantalla. Cada fase lo amplía sin cambiar el esqueleto y termina con algo que
funciona y se puede medir.

## Prioridades

1. **Rendimiento** en carrera: CPU, memoria y frame time del juego.
2. **Mantenibilidad a largo plazo, por encima de todo lo demás:** el mínimo
   código posible, módulos pequeños con una responsabilidad, fronteras
   explícitas, sin abstracciones especulativas ni dependencias sin
   justificar. Ante dos soluciones con rendimiento equivalente gana la más
   simple de mantener.

## Reglas comunes a todas las fases

- **Coexistencia.** La aplicación nativa vive en un workspace Rust propio
  dentro del repositorio (ubicación exacta en la fase 1). El producto Wails
  sigue siendo el distribuido y no se toca salvo correcciones, hasta la fase 8.
- **Issue y rama por fase** (`vantareapp/isa-N-slug`), worktree aislado y
  delegación según la skill de orquestación: Sonnet ejecuta, Opus revisa y
  diseña lo visual nuevo, DeepSeek/Muse para inventarios y trabajo mecánico,
  Astra solo en decisiones de dirección.
- **Código mínimo y Rust idiomático.** Todo worker que escriba Rust aplica
  `ponytail` (la solución más simple que funciona; nunca recorta validación en
  fronteras de confianza, manejo de errores que evite pérdida de datos,
  seguridad ni accesibilidad) y las guías de Rust instaladas: `rust-skills`,
  `rust-pragmatic-guidelines` y las `rust-m*`/`rust-unsafe-checker`. `clippy`
  con avisos como error y `rustfmt` en cada commit.
- **Presupuestos antes de medir.** Cada medición fija presupuesto, método,
  hashes de binarios y corpus antes de ejecutar. Los crudos se versionan. Una
  regresión no se oculta ajustando corpus o consumidores.
- **Mediciones las hace el orquestador,** en serie y en las mismas condiciones.
- **Paridad visual** por capturas contra una referencia congelada, con el
  comparador de píxeles de `isa-1410`.
- **Nada se da por bueno por el informe del autor:** revisión de diff,
  evidencia y reproducción de las cifras clave.
- **Tests que no pueden pasar en vacío:** un test que depende de un corpus
  falla si el corpus no está, en vez de retornar.

## Fase 0 — Arnés A/B de procesos

**Objetivo.** Decidir si los overlays viven dentro del núcleo (A) o en un
proceso propio (B).

**Qué se construye.** Un arnés con núcleo mínimo alimentado por el replay real
LMU (corpus de ISA-1403 con su hash) y los widgets de paridad GPUI existentes
(Standings; radar y pedales en versión mínima), ejecutable en modo A y B, con
1, 4 y 22 ventanas.

**Qué se mide.** CPU total del sistema atribuible (núcleo, overlays, driver,
DWM), memoria privada y VRAM, latencia dato→pantalla, y con LMU en pista el
frame time del juego (p99 y p99,9) con PresentMon; además, con OBS capturando.

**Aceptación.** Presupuestos y criterio escritos antes de ejecutar; A/A previo
para conocer el ruido; al menos cinco bloques intercalados A/B. Resultado
documentado y decisión de procesos cerrada en la ADR.

**Presupuestos iniciales a validar** (tomados de lo medido con Standings 44
coches): overlays con 4 widgets típicos ≤ 120 MiB privados y ≤ 4 % de un núcleo
en carrera; núcleo ≤ 60 MiB privados; latencia dato→pantalla p99 ≤ 1 frame a
60 Hz; frame time del juego sin regresión medible frente a sin overlays más
allá del ruido del A/A.

## Fase 1 — Esqueleto andante

**Objetivo.** Recorrer todo el camino con lo mínimo: replay LMU → adaptador →
núcleo mínimo → foto → proyección Standings → widget GPUI.

**Incluye.** Workspace Rust nativo; modelo común inicial (sesión, coches,
posiciones, tiempos, banderas, calidad); adaptador LMU reutilizando, tras
revisión independiente, el parser/admisión, las reglas de calidad y el reducer
de ISA-1403; formateador común de unidades; capa fina sobre GPUI; batería de
conformidad del adaptador con el corpus real.

**Aceptación.** Standings nativo con paridad visual dentro del umbral de la
prueba `isa-1410`; batería de conformidad verde con corpus obligatorio;
ningún tipo de LMU fuera del adaptador (test de arquitectura); medición de
recursos dentro de presupuesto.

## Fase 2 — LMU en vivo y núcleo completo para overlays

**Incluye.** Shared Memory y REST en vivo; identidad, fusión y derivaciones
(gaps, deltas, combustible, stints); capacidades en tres niveles; banderas
combinables con ámbito; multiclase; estados de fuente y frescura con la
semántica de Overlay V2.

**Aceptación.** Paridad de valores contra el corpus real con oráculo
congelado por hash; estados de menú, boxes, cambio de sesión, REST caído y
cierre del juego probados con capturas propias del revisor; sin fuga de tipos
de simulador.

## Fase 3 — Todos los widgets

**Incluye.** Los 22 tipos de widget y los 5 sistemas de diseño, portados por
familia en paralelo (Sonnet, un worktree por familia) sobre un kit común
(tipografía, filas, cabeceras, animaciones, sombras). Overlays transparentes,
click-through, sin foco, DPI mixto y multimonitor. OBS por captura de ventana.

**Aceptación.** Paridad por capturas de cada widget y diseño contra
referencias congeladas; revisión visual de Opus; recursos dentro de
presupuesto con el conjunto típico de widgets; widgets sin ramas por simulador.

## Fase 4 — Eventos y Engineer

**Incluye.** Flujo de eventos con journal, cursor, ACK y deduplicación;
Engineer/Spotter y voz como worker que consume foto y eventos.

**Aceptación.** Pruebas de fallo antes y después de confirmar en el journal,
reinicio del worker, consumidor lento y huecos explícitos; locuciones
caducadas descartadas sin perder hechos.

## Fase 5 — Series, grabación y análisis

**Incluye.** Series por vuelta en bloques; worker de almacenamiento con DuckDB
de propietario único; análisis histórico y después análisis en directo sobre
el mismo esquema; salida remota opcional si se decide.

**Aceptación.** Grabación sin afectar a adquisición ni frame time; análisis
live y reproducción de la misma sesión dan los mismos resultados.

## Fase 6 — Hub, Overlay Studio y Workshop nuevo

**Incluye.** Proceso Hub en GPUI; Studio (layout, contenido, comportamiento,
apariencia) sobre los mismos renderizadores de widgets; Workshop nuevo para
diseñar en Rust con recarga rápida; cuenta, licencias, calendario,
notificaciones, planes de Strategy.

**Aceptación.** Paridad funcional con el Hub actual por lista de
comprobación; el Hub se cierra por completo y libera su memoria al entrar al
juego.

## Fase 7 — Segundo simulador

**Objetivo.** Validar la neutralidad con un adaptador real distinto de LMU.

**Aceptación.** Ningún cambio en núcleo, proyecciones ni widgets salvo
extensiones del modelo común justificadas; si hace falta un `if simulador`
fuera del adaptador, se revisa el modelo antes de seguir.

## Fase 8 — Corte

**Incluye.** Empaquetado, instalador, portable, actualizador con rollback,
migración de datos y perfiles del usuario, retirada del producto Go/Wails y de
las reglas de `AGENTS.md` ligadas a él, soak y sesión física LMU + OBS.

**Aceptación.** Banco final frente al producto actual con el mismo trabajo;
mejora reproducible o decisión explícita de Isaac; instalación limpia,
actualización interrumpida y rollback probados.

## Fase 9 — Tandas de optimización del pipeline completo

**Objetivo.** Con toda la arquitectura en su sitio, optimizar de punta a punta:
adaptador, núcleo, derivaciones, flujos, proyecciones, render y procesos.

**Método.** Rondas cortas y medidas: perfilar, elegir una causa, cambiarla con
test de paridad, repetir el banco con los mismos binarios de referencia y
conservar también los resultados que empeoran. Cada ronda debe mantener o
mejorar la mantenibilidad; una optimización que complique el código sin una
ganancia medible y relevante se descarta.

**Aceptación.** Mejora reproducible frente a la ronda anterior o cierre
explícito de la tanda.

## Tratamiento de ISA-1403

Pausada en `3ced668f` (PR draft #1415). No se revisa de forma exhaustiva lo
que se abandona. Las piezas reutilizables se revisan al portarlas en las fases
1 y 2; los defectos ya confirmados (contadores de revisión, bloqueo en la
actualización de configuración, facts sin garantía, proyecciones acopladas a
LMU, tests que pasan sin corpus) se tratan como requisitos de diseño de la
arquitectura nueva, no como parches sobre la anterior.

## Preguntas abiertas

1. Ubicación y nombre del workspace Rust nativo.
2. Commit de Zed fijado para GPUI y política de actualización.
3. Segundo simulador de la fase 7 (iRacing, ACC u otro).
4. Si la salida remota para análisis live entra en la fase 5 o después.
