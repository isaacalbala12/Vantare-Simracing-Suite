# Documentación del proyecto Vantare Overlays

> **Referencia histórica; no usar como workflow vigente.** Para iniciar trabajo
> leer [la transición a Notion](../../vantare-v2/docs/vantare-program/notion-transition.md) y el expediente canónico
> de `vantare-v2/docs/vantare-program/`. Se conservan las decisiones y evidencias
> fechadas de abajo; sus órdenes de ejecución, tracker y prioridades no prevalecen
> sobre esas fuentes actuales.


> **Carpeta canónica** para entender qué es el producto, cómo está construido, en qué fase vamos y cómo continuar el desarrollo.  
> **Última actualización:** 2026-06-11

---

## Para quién es esta documentación

- **Isaac (product owner)** — visión, prioridades y validación visual.
- **Orquestador (Cursor / agente principal)** — planifica fases, revisa código, delega al ejecutor externo.
- **Agente ejecutor** — implementa miniplanes concretos siguiendo referencias de diseño y tests.

Si abres una sesión nueva, empieza por **[PROMPT-ORQUESTADOR.md](./PROMPT-ORQUESTADOR.md)** (copiar/pegar al chat).

---

## Mapa de documentos

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [Visión y producto](./01-VISION-Y-PRODUCTO.md) | Qué es Vantare, público, competencia, modelo freemium |
| 02 | [Arquitectura v2](./02-ARQUITECTURA-V2.md) | Capas Go/Wails/React, ventanas, flujo de datos |
| 03 | [v1 vs v2](./03-V1-VS-V2.md) | Monorepo Electron legado vs reinicio activo |
| 04 | [Estado actual](./04-ESTADO-ACTUAL.md) | Fases completadas, pendientes, fixes recientes |
| 05 | [Plan maestro y futuro](./05-PLAN-MAESTRO-FASES.md) | Fases 0–9, criterios de cierre, backlog |
| 06 | [Diseño UI](./06-DISENO-UI.md) | hub_main_v5, tokens, reglas “no improvisar” |
| 07 | [Telemetría LMU](./07-TELEMETRIA-LMU.md) | mmap, parser, pipeline, frecuencias |
| 08 | [Perfiles y layout](./08-PERFILES-Y-LAYOUT.md) | JSON, modos racing/edit, CRUD hub |
| 09 | [Eventos e IPC](./09-EVENTOS-IPC.md) | hub:*, profile:loaded, telemetría |
| 10 | [Workflow de desarrollo](./10-WORKFLOW-DESARROLLO.md) | Orquestador + ejecutor, miniplanes, evidencia |
| 11 | [Comandos y verificación](./11-COMANDOS-Y-VERIFICACION.md) | Tests, build, flags CLI |
| 12 | [Fuentes de telemetría LMU](./12-FUENTES-TELEMETRIA-LMU.md) | Shared memory, REST local, SSE/Wails, matriz por overlay |
| — | **[Prompt orquestador](./PROMPT-ORQUESTADOR.md)** | **Pegar en nueva sesión de Cursor** |

---

## Documentos externos (repo, fuera de esta carpeta)

| Ruta | Uso |
|------|-----|
| [`docs/V2-MASTER-PLAN.md`](../V2-MASTER-PLAN.md) | Plan maestro oficial con checklists por fase |
| [`docs/V2-STACK-AND-PERFORMANCE.md`](../V2-STACK-AND-PERFORMANCE.md) | Stack, presupuestos RAM/CPU, anti-patrones |
| [`docs/V2-DESIGN-REFERENCE.md`](../V2-DESIGN-REFERENCE.md) | Tokens y layout hub v5 |
| [`hub_main_v5.html`](../../hub_main_v5.html) | Mockup visual interactivo (single source of truth UI hub) |
| [`vantare-v2/README.md`](../../vantare-v2/README.md) | README técnico del scaffold v2 |
| [`docs/superpowers/plans/`](../superpowers/plans/) | Miniplanes detallados por fase (F2–F5) |
| [`.omo/plans/`](../../.omo/plans/) | Miniplanes locales / borradores del orquestador |

---

## Reglas de oro

1. **Código activo = `vantare-v2/`** — El monorepo Electron (`apps/desktop/`) es legado v1; no mezclar sin decisión explícita.
2. **Diseño hub = `hub_main_v5.html`** — No improvisar paleta, tipografía ni layout del dashboard.
3. **Una fase activa a la vez** — Crear miniplan antes de codificar; marcar ✅ al cerrar con evidencia.
4. **Tests antes de declarar hecho** — `go test ./...` + `pnpm --dir frontend test` + build.
5. **Isaac es principiante** — Explicaciones claras; el orquestador coordina, no asume que Isaac conoce Go/Wails.

---

## Estructura rápida del repo

```
Vantare-Overlays/
├── docs/proyecto/          ← ESTÁS AQUÍ (documentación humana + agentes)
├── docs/                   ← docs técnicas v1/v2 (master plan, stack, arquitectura v1)
├── vantare-v2/             ← APP ACTIVA (Go + Wails + React)
├── apps/desktop/           ← v1 Electron (legado)
├── packages/               ← paquetes compartidos v1
├── hub_main_v5.html        ← mockup diseño hub
└── .omo/plans/             ← miniplanes de ejecución
```
