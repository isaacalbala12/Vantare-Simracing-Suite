# Inventario y criterio documental

Corte: 2026-09-14, `origin/nightly` **60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c**. Tarea [VAN-725](https://app.notion.com/p/3dbe51695c658147aec0cf0aee3f3bb9), proyecto Plataforma y roadmap; puente técnico [GitHub #1256](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1256).

## Alcance real de la revisión

Se inventariaron **994 archivos versionados** `.md`, `.mdx`, `.rst` y `.txt` (**266,699 líneas** en la base). El [inventario por archivo](analysis/documentation-audit-2026-09-14.tsv) incluye tratamiento, motivo, nivel de revisión y hash del contenido original. Incluye textos de soporte como fixtures y licencias para evitar borrarlos por extensión.

La cobertura del inventario es completa para esas extensiones. La verificación semántica es focal: portadas, operaciones, Studio, OBS, contratos de transporte, autoridad y hallazgos del informe. **No se han certificado una por una las afirmaciones de las 266.699 líneas**, ni se ha ejecutado LMU/Wails en Windows. HTML de referencia, imágenes, binarios, datos y JSON generados tienen su función propia y no se eliminan como prosa obsoleta. Las fuentes sincronizadas del proyecto ChatGPT no se modifican.

## Dónde leer

El [índice vigente](README.md) conduce a uso, desarrollo y contratos por módulo. [docs de la raíz](../../docs/README.md) y los registros de agentes son historia. Notion contiene tareas y pendientes; no mantener un segundo backlog en `current-plan.md` o `technical-debt.md`.

## Tratamiento del inventario base

| Tratamiento | Archivos |
|---|---:|
| Actualizar | 49 |
| Conservar contrato | 15 |
| Conservar evidencia | 275 |
| Conservar gobierno | 20 |
| Conservar plan/referencia | 188 |
| Conservar referencia | 183 |
| Conservar soporte | 13 |
| Consolidar | 10 |
| Referencia histórica | 238 |
| Retirar | 3 |

**Conservar** no significa **validado como actual**. Los planes y evidencias se consultan cuando una tarea los necesita. Los contratos conservados mantienen su estado y enmiendas; no se archivan solo por antigüedad. Los archivos actualizados y su evidencia concreta se explican en el [informe](analysis/documentation-audit-2026-09-14.md).

## Documentos consolidados

Se conserva la ruta breve para no romper referencias y se enlaza el contenido completo anterior por SHA. Las secciones históricas ya no forman parte de las guías operativas.

- [`current-plan.md`](current-plan.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/current-plan.md).
- [`master-feature-plan.md`](master-feature-plan.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/master-feature-plan.md).
- [`roadmap-execution-board.md`](roadmap-execution-board.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/roadmap-execution-board.md).
- [`release-roadmap-execution-index.md`](release-roadmap-execution-index.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/release-roadmap-execution-index.md).
- [`alpha-beta-roadmap.md`](alpha-beta-roadmap.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/alpha-beta-roadmap.md).
- [`vantare-repository-context.md`](../../vantare-repository-context.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-repository-context.md).
- [`vantare-suite-architecture.md`](vantare-suite-architecture.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/vantare-suite-architecture.md).
- [`mock-live-demo-ux.md`](mock-live-demo-ux.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/mock-live-demo-ux.md).
- [`release-02-licensing-auth-stage.md`](release-02-licensing-auth-stage.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/release-02-licensing-auth-stage.md).
- [`release-02-licensing-auth-handoff.md`](release-02-licensing-auth-handoff.md) → [contenido anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/release-02-licensing-auth-handoff.md).

## Retiradas

- `vite-output.txt` y `frontend/test_output.txt`: salidas generadas sin referencias versionadas; los resultados no describían la build actual.
- `.agents/skills/vantare-core/SKILL.md`: skill explícitamente desautorizada por AGENTS. Se elimina la entrada descubrible; su historia permanece en Git.

No se retiran licencias, fixtures, contratos de rollback, pruebas ni evidencias originales de simulador. El detalle de enlaces y limitaciones está en el informe.

## Mantenimiento

Un documento tiene un propósito y un lugar editable. Enlazar contratos y scripts en vez de copiar estados o comandos. Actualizar documentación junto al comportamiento que describe. Marcar una propuesta como propuesta y fechar una evidencia; no convertir un checklist en una afirmación de pruebas superadas. Usar el inventario como registro de este corte, no como un catálogo que requiera mantenimiento manual en cada PR.
