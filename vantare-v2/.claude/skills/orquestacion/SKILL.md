---
name: orquestacion
description: Reparto de trabajo entre modelos en Vantare (advisors, orquestador, ejecutor, workers baratos). Úsala al planificar, delegar a subagentes o workers externos, elegir modelo para una tarea, revisar entregas de workers o ahorrar cuota de uso.
---

# Orquestación de modelos en Vantare

Esta skill fija **qué modelo hace qué** y **cómo se delega**. Complementa
`AGENTS.md` (sección "Orquestación y roles de modelos"); si algo choca, manda
`AGENTS.md`.

## 1. Roles

Decisión de Isaac del 15-oct-2026 ([#1645](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1645)):
repartir el trabajo entre suscripciones para equilibrar su uso.

| Rol | Modelo | Suscripción | Para qué |
|---|---|---|---|
| **Orquestador** | Opus 5.5 medio | Claude | Planificar, repartir, redactar encargos y decidir sobre las entregas con la revisión general de Codex. |
| **Ejecutor principal** | Codex gpt-6.1-sol high | Codex | Backend, SQL, Rust, features, refactors acotados, arreglos de reviews, tests, réplica de diseños y rendimiento. |
| **Ejecutor visual fino** | Sonnet 5.5 medio | Claude | Solo ajustes visuales finos cuando Codex no llegue y trabajo del calendario. |
| **Diseño visual nuevo** | Opus 5.5 medio | Claude | Crear una dirección visual nueva y fijar la referencia para la implementación. |
| **Revisor de seguridad** | DeepSeek V4.1 Flash en DeepSeek Harness | DeepSeek | Revisiones de cuentas, pagos, login y permisos. |
| **Revisor general** | Codex gpt-6.1-sol high | Codex | Revisar corrección, alcance, simplicidad, rendimiento, tests y evidencia de las entregas. |
| **Consulta difícil** | Fable 5.1 medio | Claude | Resolver una duda seria con una pregunta concreta; nunca en paralelo. |
| **Trabajo mecánico** | DeepSeek V4.1 Flash en DeepSeek Harness | DeepSeek | Renombrados, fixtures, docs, búsquedas y migraciones repetitivas con alcance cerrado. |

La seguridad se asigna a DeepSeek porque Codex rechaza esas revisiones como «posible riesgo de ciberseguridad».

### Nivel de razonamiento por modelo

| Modelo | Razonamiento |
|---|---|
| Codex gpt-6.1-sol | high, siempre explícito: `reasoningEffort=high` |
| Opus 5.5 | medio: `effort=medium` |
| Sonnet 5.5 | medio: `effort=medium` |
| Fable 5.1 | medio: `effort=medium` |
| DeepSeek V4.1 Flash | max; confirmar cómo fijarlo al instalar DeepSeek Harness |

Fíjalo al lanzar cada worker o consulta. Nunca dejes el esfuerzo de Codex por
defecto: es **low**. Si la vía de invocación no permite
elegir el nivel, dilo en el informe en vez de asumir que se aplicó.

Fable se consulta **solo si es estrictamente necesario**, nunca en paralelo
con otros workers o consultas. Cada consulta
debe llevar una pregunta concreta, el contexto mínimo y las opciones ya
consideradas. Su respuesta orienta; la decisión la registra el orquestador.

## 2. Cómo elegir modelo

1. ¿Es planificar, repartir o decidir sobre entregas? → Opus.
2. ¿Es diseño visual nuevo? → Opus; la réplica del diseño va a Codex.
3. ¿Es una consulta difícil que sigue bloqueada? → Fable medio, en serie.
4. ¿Es una revisión de seguridad de cuentas, pagos, login o permisos? → DeepSeek V4.1 Flash en DeepSeek Harness.
5. ¿Es trabajo del calendario o visual fino al que Codex no llega? → Sonnet medio.
6. ¿Es trabajo mecánico con alcance cerrado? → DeepSeek V4.1 Flash en DeepSeek Harness.
7. Implementación, optimización y revisión general → Codex gpt-6.1-sol high.
8. ¿Es trivial y más rápido hacerlo que explicarlo? → lo hace el orquestador
   directamente (regla de `AGENTS.md`).

### Modo ahorro de cuota

Por defecto, todo el trabajo de ejecución y revisión general va a **Codex
gpt-6.1-sol high**, sin esperar a que la cuota de Claude baje del 50 %.
Se mantienen las asignaciones de seguridad y trabajo mecánico a DeepSeek.
Claude se reserva para orquestar con Opus, diseño visual nuevo con Opus,
calendario con Sonnet y consultas difíciles con Fable; Sonnet solo recibe
además el visual fino cuando Codex no llegue.

## 3. Cómo invocar cada modelo

**Vía preferente para delegar: T3 Code**, herramienta `delegate_task`.
Consulta `orchestrator_capabilities` para verificar proveedor, modelo y opciones
disponibles. Cada worker recibe su encargo y worktree propios; no crees
conversaciones de primer nivel para sustituir una delegación.

Ejemplo de ejecución o revisión general con Codex:

```json
{
  "task": "<encargo con worktree, rama, base, rutas y checks>",
  "target": {
    "providerInstanceId": "codex",
    "model": "gpt-6.1-sol",
    "options": { "reasoningEffort": "high" }
  },
  "mode": "async",
  "clientRequestId": "<identificador único del encargo>"
}
```

| Modelo | `target` de `delegate_task` |
|---|---|
| Codex gpt-6.1-sol | `providerInstanceId: "codex"`, `model: "gpt-6.1-sol"`, `options: { "reasoningEffort": "high" }` |
| Opus 5.5 | `providerInstanceId: "claudeAgent"`, `model: "claude-opus-5-5"`, `options: { "effort": "medium" }` |
| Sonnet 5.5 | `providerInstanceId: "claudeAgent"`, `model: "claude-sonnet-5-5"`, `options: { "effort": "medium" }` |
| Fable 5.1 | `providerInstanceId: "claudeAgent"`, `model: "claude-fable-5-1"`, `options: { "effort": "medium" }`; nunca en paralelo |

Conserva el `taskId` devuelto para `task_status` o `task_cancel`. Cada ronda de
revisión usa un nuevo `delegate_task` y un `clientRequestId` distinto, estable
si se reintenta esa misma ronda; incluye el encargo y los hallazgos previos.

**DeepSeek V4.1 Flash: DeepSeek Harness.** **pendiente de instalar en el servidor: completar comando**.
El repo solo conserva como antecedente el MCP `deepseek-harness` y sus nombres
`task_inbox` / `task_result`, sin contrato de argumentos ni comando de lanzamiento
verificado. Ese antecedente limita su uso a **un solo worker a la vez**, bajo
`C:/tmp`; confirmar esas restricciones y el esfuerzo al instalarlo. No inventar
un comando ni usar Opencode como sustituto.

### Vías retiradas e historial útil

- **Opencode / opencode-go y Muse Spark 1.3: retirados** del reparto vigente.
  Antes se usaban `--provider opencode --model opencode-go/deepseek-v4.1-flash --option variant=max --option agent=build`
  y Muse Spark free/contributor. Se conservan como historial.
- GPT 6 Astra figuraba como advisor a esfuerzo max; queda fuera del reparto
  vigente de #1645.
- La vía anterior `t3cli start --stdin --provider <p> --model <m> --option <k>=<v> --worktree <ruta> --title "..."`
  creaba hilos ordinarios; para subagentes se usa `delegate_task`.
- Los subagentes de Claude Code (`Agent`, `model: sonnet|opus|fable`) no permitían
  fijar el esfuerzo. El antiguo MCP `codex` fallaba en Windows por sandbox y
  prompts multilínea truncados; esta limitación histórica no se aplica al
  proveedor `codex` de T3 Code.

Si la vía necesaria no está disponible en la sesión, informa del bloqueo al
orquestador; no sustituyas en silencio por otro modelo o vía retirada.

## 4. Reglas de delegación

- **Un nivel**: el orquestador crea workers; un worker no crea subagentes ni
  delega salvo autorización expresa y acotada.
- **Un worker por worktree y rama.** Para trabajo en paralelo, un worktree por
  worker (`C:\tmp\vantare-<slug>`), creado por el orquestador desde la base
  correcta.
- **Las mediciones de rendimiento no se paralelizan**: los workers construyen y
  verifican; el orquestador mide todo en serie, en las mismas condiciones.
- **Referencias y contratos primero**: si varios workers deben igualar algo
  (diseño, API, formato), el orquestador publica antes la referencia común
  (spec, capturas, fixtures, script de comparación) y los workers la siguen.
- **Decisiones del orquestador**: cuando un worker plantea preguntas, el
  orquestador decide lo que tenga una respuesta razonable, se lo comunica a
  todos los workers afectados y solo escala a Isaac lo que sea suyo.
- **Revisión obligatoria**: nada se da por bueno con el resumen del worker. El
  orquestador revisa diff, evidencia y resultados reproduciéndolos cuando sea
  barato (por ejemplo, volver a ejecutar el comparador o los tests).

## 5. Plantilla de encargo a un worker

Todo encargo incluye:

1. **Dónde**: worktree, rama, base (SHA) y qué rutas puede tocar.
2. **Objetivo** en una frase y contexto mínimo necesario.
3. **Fuentes**: ficheros, specs y referencias a leer (con ruta).
4. **Requisitos** numerados y verificables.
5. **Reglas**: sin push/merge/PR salvo que se pida; sin subagentes; sin
   dependencias nuevas sin justificarlas; no debilitar tests; commits locales
   **por hito** con el trailer de coautoría que corresponda.
6. **Gates**: qué tests, builds o comparaciones debe ejecutar y con qué evidencia.
7. **Qué hacer si se bloquea**: documentar y seguir con lo posible; las
   preguntas abiertas son parte del entregable.
8. **Entregable final**: SHAs y ficheros, resultados con cifras, qué falta,
   riesgos y preguntas.

## 6. Seguimiento

- Vigila los worktrees con un monitor sobre `git log` (commits nuevos) y avisa a
  Isaac de cada hito con una línea: qué cambió y qué significa.
- Revisa por tu cuenta las cifras que importan (diffs, mediciones) en vez de
  repetir las del worker.
- Al terminar cada worker: revisión, decisión sobre sus preguntas, actualización
  del handoff vivo y de la issue GitHub (ver `AGENTS.md`).
