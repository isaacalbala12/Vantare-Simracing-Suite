---
name: orquestacion
description: Reparto de trabajo entre modelos en Vantare (advisors, orquestador, workers Sol y DeepSeek). Úsala al planificar, delegar a subagentes o workers externos, elegir modelo para una tarea, revisar entregas de workers o ahorrar cuota de uso.
---

# Orquestación de modelos en Vantare

Esta skill fija **qué modelo hace qué** y **cómo se delega**. Complementa
`AGENTS.md` (sección "Orquestación y roles de modelos"); si algo choca, manda
`AGENTS.md`.

## 1. Roles

| Rol | Modelos | Para qué | Para qué NO |
|---|---|---|---|
| **Advisor** | Fable 5.1, GPT 6 Astra | Fijar la dirección al inicio de un plan grande. Desbloquear una duda seria cuando lo demás ha fallado. | Ejecutar, revisar entregas rutinarias, consultas "por si acaso". |
| **Orquestador y optimizador** | Opus 5.5 | Planificar, repartir, redactar encargos, revisar **todo** lo que entregan los workers, optimizar (rendimiento, memoria, simplificación) y hacer el **diseño visual nuevo**. | Picar código a gran escala que un ejecutor puede hacer. |
| **Worker para lo difícil** | GPT 6.1 Sol (Codex) | Optimización, código delicado o a gran escala, portes, bancos de medida, **réplicas y paridad visual** de diseños existentes. | Diseño visual nuevo, decisiones de arquitectura. |
| **Worker rápido** | DeepSeek V4.1 Flash (opencode-go) | Lo que pide velocidad o es sencillo: documentación, inventarios, búsquedas, fixtures, tests triviales, cambios mecánicos en serie. | Arquitectura, seguridad, diseño, lógica delicada sin revisión. |

Los workers no son Claude: ni Sonnet ni subagentes `Agent`, salvo que Isaac
pida expresamente un modelo de Claude para una tarea. El orquestador no
escribe documentación: informes, plan, issue y handoff los escribe el worker
de cada tarea, y el orquestador los revisa.

### Nivel de razonamiento por modelo

| Modelo | Razonamiento |
|---|---|
| Fable 5.1 | medio |
| GPT 6 Astra | max |
| Opus 5.5 | medio |
| GPT 6.1 Sol | medio |
| DeepSeek V4.1 Flash | max |

Fíjalo al lanzar cada worker o consulta. Si la vía de invocación no permite
elegir el nivel, dilo en el informe en vez de asumir que se aplicó.

Los advisors se consultan **solo si es estrictamente necesario**. Cada consulta
debe llevar una pregunta concreta, el contexto mínimo y las opciones ya
consideradas. Su respuesta orienta; la decisión la registra el orquestador.

## 2. Cómo elegir modelo

1. ¿Es el arranque de un plan grande o una decisión difícil de revertir y hay
   dudas reales de dirección? → un advisor. Si no, sigue.
2. ¿Es optimizar, revisar, planificar o diseñar algo visual nuevo? → Opus.
3. ¿Es difícil: implementar, optimizar o replicar con volumen o riesgo? → Sol.
4. ¿Pide velocidad o es repetitivo, mecánico o de bajo riesgo? → DeepSeek.
5. ¿Es trivial y más rápido hacerlo que explicarlo? → lo hace el orquestador
   directamente (regla de `AGENTS.md`).

### Modo ahorro de cuota

Cuando quede **menos del 50 % de la cuota de uso del plan** de Claude o
Codex: más trabajo a DeepSeek, Sol solo para lo que DeepSeek haría mal y
los advisors solo para bloqueos.

## 3. Cómo invocar cada modelo

**Única vía: el orquestador de T3 Code** (MCP `t3-code`, herramienta
`delegate_task`). Decisión de Isaac (2026-10-04): **ningún worker se lanza por
CLI** (`codex exec`, `claude`, `opencode run`…) ni con subagentes `Agent`.
Cada encargo se lanza con `delegate_task` en modo `async`, `runtimeMode:
full-access`, un `clientRequestId` estable por ronda y el `taskId` guardado;
se sigue con `task_status` y cada ronda nueva es otro `delegate_task` con el
encargo original, lo hallado y las correcciones.

| Modelo | `target` de `delegate_task` |
|---|---|
| GPT 6.1 Sol (difícil) | `{"providerInstanceId":"codex","model":"gpt-6.1-sol","options":{"reasoningEffort":"medium"}}` |
| DeepSeek V4.1 Flash (rápido) | `{"providerInstanceId":"opencode","model":"opencode-go/deepseek-v4.1-flash","options":{"variant":"max","agent":"build"}}` |
| Opus 5.5 (diseño, si Isaac lo pide) | `{"providerInstanceId":"claudeAgent","model":"claude-opus-5-5","options":{"effort":"medium"}}` |
| Fable 5.1 (análisis/advisor) | `{"providerInstanceId":"claudeAgent","model":"claude-fable-5-1","options":{"effort":"medium"}}` |
| GPT 6 Astra (advisor) | `{"providerInstanceId":"codex","model":"gpt-6-astra","options":{"reasoningEffort":"max"}}` |

El hijo trabaja en el checkout del orquestador: en el encargo indica siempre el
**worktree** exacto (`cd <ruta>` antes de cualquier comando) y la rama.
Los encargos largos van en un fichero (`C:/tmp/...`) y el `task` solo dice
«lee y sigue `<fichero>`», más el contexto de reanudación si lo hay.

Si el MCP `t3-code` no está disponible en la sesión, dilo y pide que se
habilite; no sustituyas en silencio por CLI ni por otro modelo de otro rol.

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
  rápido (por ejemplo, volver a ejecutar el comparador o los tests).

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
  del handoff vivo y de la tarea Notion (ver `AGENTS.md`).
