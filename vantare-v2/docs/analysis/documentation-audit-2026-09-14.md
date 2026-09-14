# Auditoría y depuración documental — 2026-09-14

Tarea [VAN-725](https://app.notion.com/p/3dbe51695c658147aec0cf0aee3f3bb9), proyecto Plataforma y roadmap; puente técnico [GitHub #1256](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1256). [PR draft #1258](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1258).

## Base y alcance

Base nightly **60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c**, rama `vantareapp/isa-1256-documentacion-vigente`. Se conserva el worktree aislado; las copias de auditorías previas y `sources/` del proyecto ChatGPT no se modifican.

El inventario cubre los **994 textos iniciales y 266.699 líneas**. Las pasadas contrastan las entradas vigentes y sus contratos con código, scripts y tests. No certifican cada afirmación histórica, despliegues remotos ni pruebas físicas de Windows/LMU/OBS. Las propuestas conservan su condición y la evidencia mantiene su fecha.

## Resultado de las pasadas

| Tema | Corrección y evidencia |
|---|---|
| Entrada y arquitectura | Wails, editor único Studio, autoguardado y WidgetVisualHost; README, main.go, studio-provider y ADR 0093 |
| Operaciones y pruebas | Build frontend previo a tests Go que embeben assets; scripts reales de package.json; live=false es desconexión, no mock |
| OBS | Solo loopback según ValidateAddr; transporte Overlay V2; Engineer publica engineer-stream y usa presentación/engineer-radio |
| Telemetry Core | Engine y coordinator conectados, commit común, Publisher Overlay V2 con límite propio de 72 KiB; tipos genéricos no prueban rutas activas |
| Autoridad LMU | Matriz v6 más unión REST de temperaturas, bandera y números de coche con TTL/calidad y límite de sesión; no infiere capabilities Engineer |
| Strategy | Documento persistido con PlanningInputs.Projection V2, mutaciones e importación Orbit implementadas; live V1 opcional, desactivado por defecto en la composición |
| Analysis | Backend histórico que alimenta Strategy distinguido de la pantalla Telemetría cuya fuente aún devuelve una lista vacía |
| Engineer | Fases y estados F0 antiguos fechados; temperatura existente en Core diferenciada de su proyección Engineer; contrato SSE actual |
| Launcher | Asset MoTeC incorporado; servidor y Chromium previos al smoke; resultados antiguos no eximen gates actuales |
| Workshop y diseño | Fixtures V2 existentes, catálogo sin recuentos duplicados, radio en Crystal/Functional; fuentes únicas Orbit/Workshop y diseño anterior conservado |
| Cuenta y Billing | Supabase en este checkout, Polar comercial y acceso operativo separado; credenciales firmadas; comandos legacy grant/revoke sin implementar, no receta de reparación |
| Release | Notas por manifiesto/fragmentos; precheck antes del build de pre-releases y validación antes de publicar tags estables; sin fallback de changelog; ejemplos sin versiones caducadas |
| Versionado y aceptación | Fuentes exactas de versión y gates centralizados; checklist Studio V3/Polar/manifest; resultados manuales pendientes explícitos |
| Autoridad y continuidad | Notion para tareas/estado; GitHub para código, PR, CI y canal; mapa sin cola histórica de issues; decisión de beta pública reconciliada |

Las revisiones independientes detectaron y motivaron correcciones de orden build/tests, proyección Strategy, temperatura Engineer, Launcher, fixtures Workshop, raíces del generador, autoridad REST, timing de validación de releases y stubs administrativos. La revisión independiente final es **PASS documental acotado**, sin hallazgos accionables en el diff examinado; verificó 204 enlaces locales y 35 referencias históricas por SHA. No certifica el producto ni levanta el bloqueo de CI.

## Consolidación y conservación

**21 documentos** sustituidos se reducen a referencias actuales con enlace al original completo por SHA. No se pierde el historial: el [inventario](../documentation-inventory.md) enumera cada documento y sucesor; el [TSV por archivo](documentation-audit-2026-09-14.tsv) conserva tratamiento, motivo, nivel de revisión y hash de la base.

Solo se retiran dos logs generados sin referencias (`vite-output.txt`, `frontend/test_output.txt`) y la skill `vantare-core` explícitamente desautorizada por AGENTS. No se elimina código, licencias, fixtures, contratos de rollback ni evidencia original. No cambian workflows, dependencias ni gates; el único JSON modificado es el roadmap editorial derivado.

## Validación reproducida

- Inventario: **994 rutas únicas**, cobertura exacta y **994 SHA-256** comprobados contra el árbol base.
- Barrido de Markdown de los textos actuales: destinos relativos y anclas de encabezados comprobados; **1.099 enlaces locales y 126 anclas, cero destinos ausentes**. Se excluyen ejemplos dentro de fences y código inline de este barrido, y se revisan aparte las rutas de código relevantes. No se verifica disponibilidad HTTP de URLs externas ni el contenido semántico de todos los snapshots.
- Rutas literales actuales de las guías editadas y referencias históricas por commit/ruta contrastadas. Outputs, endpoints, placeholders y ejemplos históricos no se tratan como archivos de código obligatorios.
- `python3 .github/scripts/tests/test_roadmap_digest.py`: **23 tests PASS**.
- `python3 .github/scripts/tests/test_validate_roadmap_contract.py`: **21 tests PASS**.
- `python3 .github/scripts/tests/test_release_notes.py`: **26 tests PASS**. Incluye casos negativos de manifiestos ausentes; sus errores esperados no son fallos de la suite.
- `python3 .github/scripts/roadmap_digest.py --repo . --ref 60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c --check`: **PASS**.
- `python3 .github/scripts/release_notes.py --tag v0.1.0.7-nightly.15 --check`: **PASS**, manifiesto y dos fragmentos. No publica nada.
- Contrato de issue #1256 contra base/candidato: exige exactamente `milestones:docs-public-reboot`; permanece plan porque las guías públicas y su validación con testers siguen siendo otro gate.
- `git diff --check`: **PASS**.

En la primera revisión había **29 destinos locales ausentes**. El barrido final amplía la comprobación a anclas y archivos nuevos; no equiparar inventario a validación integral del producto.

## CI y límites de aceptación

La CI del primer commit documental `2efbd2ee6dbd2baed351614c1231213e17500320` pasó promoción de rama y GitGuardian, pero el job de gates falló en `TestRuntimeRoutesActionsButKeepsThemDisabled`, paquete `internal/engineer/voiceinput`, tras 30 s sin publicar el resultado esperado. [Ejecución](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34893873333). El código y test afectados son idénticos a la base; la auditoría no determina aquí su causa ni lo declara resuelto. Este fallo bloquea integración hasta aclararlo y pasar los gates aplicables.

No se ejecutan localmente suites completas/builds de producto ni Windows/LMU/OBS para este cambio documental. CI sí ejecutó tests de producto, con el fallo descrito. Las guías manuales son procedimientos de aceptación, no resultados simulados. La revisión documental no habilita venta ni una release.

## Criterio de cierre y mantenimiento

La revisión cierra cuando las entradas consultadas ofrecen un camino claro, los contratos contrastados no conservan contradicciones conocidas, las instrucciones remiten a fuentes existentes y cada resultado declara build/fecha y límites. Los planes y evidencias solo se adoptan con la tarea vigente; no se reejecutan por una lista antigua.

Actualizar la documentación junto al comportamiento que describe, enlazar manifiestos/código en vez de copiar versiones, recuentos o estados y mantener un único lugar editable por tema. El inventario describe este corte y no requiere editar 994 filas en cada PR.

Para verificar manualmente: comenzar en el [índice](../README.md), seguir la ruta de uso o desarrollo y abrir un histórico por su enlace inmutable. El [handoff plataforma](../vantare-program/handoffs/platform-commercial.md) enlaza esta evidencia. Notion conserva commit, PR, checks, revisión y nivel de promoción observados. No se ha hecho merge, promoción, release ni anuncio.
