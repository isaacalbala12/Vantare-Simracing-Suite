---
name: orquestacion
description: Reparto de trabajo entre modelos en Vantare (advisors, orquestador, ejecutor, workers baratos). Úsala al planificar, delegar a subagentes o workers externos, elegir modelo para una tarea, revisar entregas de workers o ahorrar cuota de uso.
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
| **Ejecutor principal** | Sonnet 5.5 | Código a gran escala: features, portes, refactors acotados, tests, **réplicas y paridad visual** de diseños ya existentes. | Diseño visual nuevo, decisiones de arquitectura. |
| **Worker barato** | DeepSeek V4.1 Flash (DeepSeek Harness / opencode-go); Muse Spark 1.3 (free, y cuando se agote, contributor) | Trabajo repetitivo, sencillo o mecánico: renombrados, fixtures, docs, búsquedas, tests triviales, migraciones en serie. | Arquitectura, seguridad, diseño, lógica delicada sin revisión. |

### Nivel de razonamiento por modelo

| Modelo | Razonamiento |
|---|---|
| Fable 5.1 | medio |
| GPT 6 Astra | max |
| Opus 5.5 | medio |
| Sonnet 5.5 | high |
| DeepSeek V4.1 Flash | max |
| Muse Spark 1.3 | max |

Fíjalo al lanzar cada worker o consulta. Si la vía de invocación no permite
elegir el nivel, dilo en el informe en vez de asumir que se aplicó.

Los advisors se consultan **solo si es estrictamente necesario**. Cada consulta
debe llevar una pregunta concreta, el contexto mínimo y las opciones ya
consideradas. Su respuesta orienta; la decisión la registra el orquestador.

## 2. Cómo elegir modelo

1. ¿Es el arranque de un plan grande o una decisión difícil de revertir y hay
   dudas reales de dirección? → un advisor. Si no, sigue.
2. ¿Es optimizar, revisar, planificar o diseñar algo visual nuevo? → Opus.
3. ¿Es implementar o replicar algo con alcance claro y volumen apreciable? → Sonnet.
4. ¿Es repetitivo, mecánico o de bajo riesgo? → worker barato.
5. ¿Es trivial y más rápido hacerlo que explicarlo? → lo hace el orquestador
   directamente (regla de `AGENTS.md`).

### Modo ahorro de cuota

Cuando quede **menos del 50 % de la cuota de uso del plan** de Claude:

- Todo lo que encaje en "worker barato" va a DeepSeek o Muse Spark, aunque
  normalmente lo haría Sonnet.
- Sonnet se reserva para lo que un worker barato haría mal.
- Los advisors solo para bloqueos.
- Muse Spark: primero la variante free; al agotarse, contributor.

## 3. Cómo invocar cada modelo

| Modelo | Vía |
|---|---|
| Opus 5.5, Sonnet 5.5, Fable 5.1 | Subagente de Claude Code (`Agent`, parámetro `model`: `opus`, `sonnet`, `fable`). |
| GPT 6 Astra | MCP de Codex (o hilo Codex vía T3 Code). |
| DeepSeek V4.1 Flash | MCP de DeepSeek Harness, o provider `opencode-go` en opencode. |
| Muse Spark 1.3 | opencode con provider `opencode-go` (free o contributor). |

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
  del handoff vivo y de la tarea Notion (ver `AGENTS.md`).
