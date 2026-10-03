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

**Vía preferente: T3 Code** (MCP `t3code` o CLI `t3cli`). Permite muchos
workers en paralelo, cada uno con su modelo, esfuerzo y worktree:
`t3cli start --stdin --provider <p> --model <m> --option <k>=<v> --worktree <ruta> --title "..."`,
y `t3cli show|wait|transcript --thread <id>` para seguirlos.

| Modelo | Proveedor T3 Code y opciones |
|---|---|
| Opus 5.5 | `--provider claudeAgent --model claude-opus-5-5 --option effort=medium` |
| Fable 5.1 (advisor) | `--provider claudeAgent --model claude-fable-5-1 --option effort=medium` |
| GPT 6 Astra (advisor) | `--provider codex --model gpt-6-astra --reasoning-effort max` |
| GPT 6.1 Sol (difícil) | CLI directa (T3 interrumpe turnos largos): `cd <worktree>/vantare-v2 && codex exec -m gpt-6.1-sol -c model_reasoning_effort=medium --dangerously-bypass-approvals-and-sandbox -o informe.md - < encargo.md > log 2>&1 &` |
| DeepSeek V4.1 Flash (rápido) | `--provider opencode --model opencode-go/deepseek-v4.1-flash --option variant=max --option agent=build` |

Alternativas: el MCP de T3 Code `delegate_task` con los mismos proveedores, y MCP `deepseek-harness` (`task_inbox` /
`task_result`; **un solo worker a la vez**, solo bajo `C:/tmp`). El MCP
`codex` falla en Windows (sandbox y prompts multilínea truncados): no usarlo.

Si el MCP necesario no está disponible en la sesión, dilo y pide que se
habilite; no sustituyas en silencio por otro modelo de otro rol.

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
