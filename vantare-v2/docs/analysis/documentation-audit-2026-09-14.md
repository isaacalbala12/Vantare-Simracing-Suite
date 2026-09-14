# Auditoría y depuración documental — 2026-09-14

Tarea [VAN-725](https://app.notion.com/p/3dbe51695c658147aec0cf0aee3f3bb9), proyecto Plataforma y roadmap. Puente técnico [GitHub #1256](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1256).

## Base, alcance y conclusión

Base `origin/nightly` **60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c**. Rama `vantareapp/isa-1256-documentacion-vigente`, worktree aislado. Las copias de auditorías anteriores y `sources/` del proyecto ChatGPT no se modifican.

El repositorio mezclaba instrucciones reales, contratos retirados y registros históricos. El [índice](../README.md) ahora dirige a las guías actuales; diez documentos sustituidos conservan una entrada breve y enlace a su texto completo en Git por SHA. El inventario cubre los **994 textos iniciales**; revisar la estructura completa no equivale a certificar semánticamente todas sus **266.699 líneas**.

Se corrigen las afirmaciones verificadas de abajo. El resto se conserva con clasificación y nivel de revisión explícitos; planes, investigación, evidencias, fixtures y licencias no se borran por edad o extensión. No se han auditado exhaustivamente precios desplegados, permisos de cuentas, servicios remotos, todas las afirmaciones históricas ni cada contrato especializado. Esa evidencia debe corresponder a la tarea y build que lo use.

## Hallazgos y evidencia

| Problema anterior | Corrección y fuente contrastada |
|---|---|
| Portada centrada en Electron y soporte completado | Aplicación Wails en `vantare-v2`; go.mod, frontend/package.json, cmd/vantare/main.go; disponibilidad por módulo/build |
| README prealpha y plantilla Vite | Entrada única de desarrollo, manifiestos y comandos reales |
| `-live=false` presentado como mock | El flag declara y publica desconectado en cmd/vantare/main.go |
| `go run ./cmd/vantare` presentado como headless | main construye application.App; frontend/embed.go requiere dist; build antes de tests Go |
| Dos editores y guardado manual como contrato actual | StudioRoute/studio-provider y ADR 0093: editor único, autosave serializado e historial |
| OBS LAN mediante `0.0.0.0` | internal/server/server.go::ValidateAddr rechaza direcciones no loopback |
| `/telemetry/stream` y Overlay V1 como transporte actual | server.go registra PublisherProjectionRoute(ProductOverlayV2), y el store TS coincide |
| RFC 7396, sello v1 y límite único de 256 KiB | Overlay V2 tiene Publisher propio y límite 72 KiB; el genérico conserva otro contrato. No afirmar activación ni ahorro de secciones por su mera existencia |
| Cuatro ProjectorV1 y reducer sin wiring | TelemetryEngine y telemetry_core_runtime conectados; proyecciones y ownership actuales |
| Strategy projection compile-only | projectionproducer.go y orbit_calculation.go producen/consumen la proyección histórica |
| Roadmap Engineer y delivery legacy como autoridad única | Referencia histórica/compatibilidad; rework y radio/familias actuales; se conserva rollback |
| SQLite todavía sin dependencia raíz | go.mod y diagnostics_bridge.go; no se infiere recording live ni MCAP integrado |
| ADR 0005 ambiguo | Índice por nombre completo: SQLite, DuckDB y capabilities Engineer tienen ámbitos distintos |
| Producto niega beta pública | Se reconcilia con decisión del 2026-09-11, ya registrada en plan-beta-publica-y-lanzamiento; no se anuncia apertura |
| Tests `visual:overlay-studio` ausentes del manifiesto | Scripts actuales y protocolo de la tarea; no se reciclan resultados de julio |
| Guías de testers excluyen fallos de funciones ya desarrolladas | Reporte por build, sin exclusiones caducadas ni sincronización automática inventada |
| Backlogs y snapshots presentados como continuidad | Notion decide estado; rutas históricas breves remiten a sucesor y revisión inmutable |

## Conservación y retiradas

[Inventario por archivo](documentation-audit-2026-09-14.tsv): ruta, tratamiento, nivel de revisión, motivo, líneas y SHA-256 de la base. [Criterio y recuentos](../documentation-inventory.md).

Se retiran únicamente `vite-output.txt`, `frontend/test_output.txt` (logs generados sin referencias versionadas) y `.agents/skills/vantare-core/SKILL.md` (AGENTS prohíbe usarla). El contenido permanece en Git. Los diez documentos consolidados también preservan todo su contenido por enlace inmutable. No se modifica código, workflows, dependencias, licencias o fixtures.

## Verificación

- Inventario: cobertura única de los 994 archivos y hashes comparables al árbol base.
- Barrido de enlaces Markdown relativos: se reparan destinos existentes mal escritos y se retiran enlaces a rutas ausentes de las entradas consolidadas; AccountSettings del plan histórico se marca como ruta retirada. El barrido final comprueba 914 enlaces locales sin destinos ausentes, frente a 29 en la base. No verifica URLs externas, anclas ni rutas escritas solo entre backticks.
- Revisión independiente de contratos: encontró el orden build/tests y una errata; ambas corregidas y re-revisadas **PASS**. La revisión no certifica otros documentos ni runtime físico.
- `python3 .github/scripts/tests/test_roadmap_digest.py`: **23 tests PASS**.
- `python3 .github/scripts/tests/test_validate_roadmap_contract.py`: **21 tests PASS**.
- Digest generado desde el SHA base y comprobado con `--check`: **PASS**. El hito `milestones:docs-public-reboot` sigue `plan`; solo precisa la diferencia entre depuración interna y documentación pública validada.
- Contrato de la issue real #1256 contra SHA base y candidato: **PASS**, modifica exactamente `milestones:docs-public-reboot`.
- `git diff --check` y revisión de whitespace del diff completo: **PASS**.
- No se ejecutan suites Go/frontend ni builds de producto: solo cambian documentos y el JSON editorial derivado. No se ha probado Windows/LMU/OBS; no se presentan mediciones antiguas como pruebas actuales.

## Archivos revisados y tratamiento

| Archivo | Cambio |
|---|---|
| [README.md](../../../README.md) | Sustituye portada Electron y promesas de soporte por entradas verificables de la suite Wails. |
| [docs/README.md](../../../docs/README.md) | Declara el ámbito histórico completo de la antigua carpeta docs. |
| [docs/V2-MASTER-PLAN.md](../../../docs/V2-MASTER-PLAN.md) | Repara enlace local a destino existente sin alterar contenido histórico. |
| [docs/engineer/audits/parity-final.md](../../../docs/engineer/audits/parity-final.md) | Repara enlace local a destino existente sin alterar contenido histórico. |
| [vantare-repository-context.md](../../../vantare-repository-context.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/README.md](../../README.md) | Retira prealpha fija, preview antiguo y modo mock ficticio; enlaza operaciones. |
| [vantare-v2/docs/README.md](../README.md) | Reduce lectura inicial y deja de recomendar tableros y planes históricos como guías. |
| [vantare-v2/docs/adr/0005-historical-storage-sqlite-mcap.md](../adr/0005-historical-storage-sqlite-mcap.md) | Separa propuesta histórica de dependencia/lectura comprobadas; no inventa recording live. |
| [vantare-v2/docs/adr/README.md](../adr/README.md) | Índice con enlaces exactos sin renumerar ADR históricos. |
| [vantare-v2/docs/alpha-beta-roadmap.md](../alpha-beta-roadmap.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/architecture.md](../architecture.md) | Sustituye arquitectura pre-V3 por fronteras demostradas y autoguardado. |
| [vantare-v2/docs/beta-widget-system-spec.md](../beta-widget-system-spec.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/current-plan.md](../current-plan.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/design-system-authoring-v3.md](../design-system-authoring-v3.md) | Consolida kit antiguo en autoría directa actual y evita scaffolding desautorizado. |
| [vantare-v2/docs/documentation-inventory.md](../documentation-inventory.md) | Inventario completo con criterio, nivel de revisión y conservación histórica. |
| [vantare-v2/docs/domain-model.md](../domain-model.md) | Retira glosario de dos editores y alinea conceptos sin duplicar schemas. |
| [vantare-v2/docs/engineer/delivery-runtime.md](../engineer/delivery-runtime.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/engineer/engineer-beta-roadmap.md](../engineer/engineer-beta-roadmap.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/feature-architecture-map.md](../feature-architecture-map.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/licensing-auth-architecture.md](../licensing-auth-architecture.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/manual-verification.md](../manual-verification.md) | Reemplaza checklist de editores retirados por Studio con autosave; no recicla resultados históricos. |
| [vantare-v2/docs/master-feature-plan.md](../master-feature-plan.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/mock-live-demo-ux.md](../mock-live-demo-ux.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/obs-local-setup.md](../obs-local-setup.md) | Retira receta LAN rechazada por servidor y endpoint V1, actualiza autosave. |
| [vantare-v2/docs/operations.md](../operations.md) | Corrige headless/mocks y orden build; fija requisitos según CI. |
| [vantare-v2/docs/overlays-studio/README.md](../overlays-studio/README.md) | Remite canvas a código productivo y enlaza autosave/Workshop. |
| [vantare-v2/docs/release-02-licensing-auth-handoff.md](../release-02-licensing-auth-handoff.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/release-02-licensing-auth-stage.md](../release-02-licensing-auth-stage.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/release-artifacts.md](../release-artifacts.md) | Actualiza referencia a la guía de testers consolidada. |
| [vantare-v2/docs/release-roadmap-execution-index.md](../release-roadmap-execution-index.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/roadmap-execution-board.md](../roadmap-execution-board.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/roadmap/plan.md](../roadmap/plan.md) | Precisa alcance de depuración interna; hito docs-public-reboot sigue plan. |
| [vantare-v2/docs/strategy-planner/f1-2-contrato-proyeccion-v2.md](../strategy-planner/f1-2-contrato-proyeccion-v2.md) | Corrige compile-only contradicho por productor y cálculo conectados. |
| [vantare-v2/docs/strategy-planner/isa-694-current-state-and-rework-brief.md](../strategy-planner/isa-694-current-state-and-rework-brief.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/strategy-planner/pb-to-str-map.md](../strategy-planner/pb-to-str-map.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/strategy-planner/str-00-audit.md](../strategy-planner/str-00-audit.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/stripe-integration-plan.md](../stripe-integration-plan.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/stripe-licensing-status-audit.md](../stripe-licensing-status-audit.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/stripe-webhook-deployment.md](../stripe-webhook-deployment.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/superpowers/plans/2026-07-09-fase-1-6-billing-licensing-pre-polar.md](../superpowers/plans/2026-07-09-fase-1-6-billing-licensing-pre-polar.md) | Repara enlaces existentes y marca ruta de AccountSettings retirada sin inventar sustituto. |
| [vantare-v2/docs/superpowers/plans/2026-07-09-fase-2-polar-integration.md](../superpowers/plans/2026-07-09-fase-2-polar-integration.md) | Repara enlace local a destino existente sin alterar contenido histórico. |
| [vantare-v2/docs/superpowers/plans/2026-07-12-crystal-luna-execution-index.md](../superpowers/plans/2026-07-12-crystal-luna-execution-index.md) | Repara enlace local a destino existente sin alterar contenido histórico. |
| [vantare-v2/docs/technical-debt.md](../technical-debt.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/telemetry-core/README.md](../telemetry-core/README.md) | Sustituye estado develop/julio y maestro viejo por wiring y maestro actual. |
| [vantare-v2/docs/telemetry-core/current-runtime-baseline.md](../telemetry-core/current-runtime-baseline.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/telemetry-core/overlay-delta-publishing.md](../telemetry-core/overlay-delta-publishing.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/telemetry-core/projection-transport.md](../telemetry-core/projection-transport.md) | Reemplaza APIs retiradas v1/RFC7396 y false no-wiring por transporte V2 actual. |
| [vantare-v2/docs/telemetry-core/runtime-projections.md](../telemetry-core/runtime-projections.md) | Actualiza esquema cuatro ProjectorV1 y mantiene ownership/versionado útil. |
| [vantare-v2/docs/telemetry-core/runtime-reducer.md](../telemetry-core/runtime-reducer.md) | Corrige no-wiring y sitúa reducer bajo commit común. |
| [vantare-v2/docs/telemetry-core/session-coordinator.md](../telemetry-core/session-coordinator.md) | Actualiza coordinator prepare/commit, conserva reglas de identidad y evidencia. |
| [vantare-v2/docs/telemetry-core/typescript-projection-contract.md](../telemetry-core/typescript-projection-contract.md) | Distingue store V2 del transporte genérico y tipos generados; retira RFC7396. |
| [vantare-v2/docs/tester-build-instructions.md](../tester-build-instructions.md) | Retira bienvenida a beta antigua y afirmaciones globales de firma/disponibilidad. |
| [vantare-v2/docs/tester-feedback-process.md](../tester-feedback-process.md) | Retira exclusiones de bugs caducadas, tiers antiguos y sincronización no demostrada. |
| [vantare-v2/docs/tester-known-issues.md](../tester-known-issues.md) | Elimina hotfix futuro caducado y backlog paralelo de errores no revalidados. |
| [vantare-v2/docs/testing-strategy.md](../testing-strategy.md) | Elimina comandos inexistentes, resultados caducados y recetas de widgets legacy. |
| [vantare-v2/docs/vantare-program/product-contract.md](../vantare-program/product-contract.md) | Reconcilia contradicción de beta pública con decisión existente del 11 de septiembre. |
| [vantare-v2/docs/vantare-suite-architecture.md](../vantare-suite-architecture.md) | Consolidado; contenido anterior conservado por SHA inmutable y sucesor enlazado. |
| [vantare-v2/docs/widget-architecture.md](../widget-architecture.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/docs/widget-rendering-preview-contract.md](../widget-rendering-preview-contract.md) | Delimita contenido histórico/compatibilidad y enlaza sucesor específico. |
| [vantare-v2/frontend/README.md](../../frontend/README.md) | Elimina plantilla Vite genérica y documenta los scripts existentes. |

## Continuidad

El [handoff de plataforma](../vantare-program/handoffs/platform-commercial.md) enlaza esta auditoría y la tarea. Los archivos nuevos son el índice histórico raíz, el índice ADR y este informe con su TSV.

## Entrega e integración

La evidencia de commit, PR, CI y canal se registra y relee en la tarea Notion. Este informe describe el candidato documental; no demuestra integración ni publicación. No se hace merge, promoción, release ni anuncio.

Verificación manual: empezar por README raíz, seguir las rutas de uso/desarrollo y comprobar que histórico, propuestas y evidencia tienen ámbito explícito. Para consultar un snapshot consolidado, abrir su enlace inmutable.
