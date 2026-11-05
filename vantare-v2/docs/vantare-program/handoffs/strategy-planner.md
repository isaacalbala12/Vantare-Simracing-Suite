# Handoff vivo — Strategy Planner

Estado del cierre de VANTA-135 / R9. Releer [#1977](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1977) antes de continuar. El seguimiento de la tarea vive en Plane, proyecto VANTA; GitHub y Project Vantare conservan código, ramas, PR y evidencia.

## Resultado y canal real

Strategy conserva un solo recorrido de preparación manual, con `ManualEvent` en el crate y un solo destino habitual, `strategy-v2.json`. El Hub no traduce ediciones a punteros JSON; conserva lecturas de solo lectura para presentar el documento. El solver, sus presupuestos y la cancelación no cambian.

Isaac integró en nightly los pasos 0, 1, 3, 4 y 5: [#1983](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1983), [#1984](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1984), [#1985](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1985) y [#1987](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1987). Sus ramas quedaron congeladas. Base de la última entrega: `ad94ff022e001b3bca98ca502edf80162503ab6a`.

Los pasos 6 y 7 se entregan en el PR draft [#1991](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1991), rama `vantareapp/isa-1977-paso6-7-manual`. Código validado: `b7fc63aa20d90f20d4d37697a24e6948fd8255e8`; el commit posterior de cierre solo actualiza este handoff.. El estado de integración y CI se consulta en el PR; entrega para revisión no significa merge, promoción ni release. El worker no fusionó, publicó ni desplegó.

## Decisiones vigentes

- Automático, correcciones heredadas, Datos y Revisiones retirados. Recuperar Automático depende de Análisis nativo, VANTA-133 / #1974 y [#1980](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1980).
- `import_last_draft` lee v1/v2 y verifica el hash completo. Solo se consulta si falta el documento principal; si este existe, prevalece incluso sobre un borrador antiguo más reciente. `strategy-repository.json` queda intacto, sin escritura ni borrado.
- Apertura mediante cuarentena común y guardado de bytes observados. Archivo dañado: documento vacío con aviso y copia durable; versiones futuras, conflictos y fallos de archivo siguen protegidos. Documentos 2.0/2.1 conservan procedencia, campos desconocidos y bytes no editados, incluida proyección importada que el formulario no calcula.
- `captura.rs`, `ViewData`, `PlanData` y los DTO/callbacks de presentación solo se incluyen con `parity-capture`. La construcción distribuida conserva los controles reales. Una sola lista macro genera los 28 campos y sus accesos; un test fija el orden de las entidades.
- Las referencias de pestañas retiradas son históricas. Los 471 archivos fijados, el manifiesto, el catálogo y la fixture de revisión permanecen intactos. Solo se añadieron referencias de inicio/sesiones fuera del manifiesto; las demás siguen vigentes.
- Se conservaron `solve_v2`, usado por `search_budget`, y los escenarios. Solver extendido, corpus, manifiestos y `ui/src/fuel_strategy` intactos. Paso 8 excluido.

## Validación de la entrega

Fmt, check y Clippy `-D warnings`, all-targets de Hub y Strategy, PASS; Nextest completo 699/699 PASS, cuatro lentos y cuatro omitidos heredados. La corrección posterior solo hace público el módulo QA bajo su feature; la proyección normal coincide byte a byte. Build `parity-capture` y sus dos tests PASS. Las 13 capturas nuevas de este código son idénticas en RGBA a la base nativa d019fb3d7: cero píxeles distintos, 1672×941 dark. Retirement 471 y quality-check PASS. Clippy adicional con la feature mantiene FAIL por los 17 diagnósticos heredados de #1648, sin avisos nuevos ni supresiones. Los gates normales finales se registran también sobre el HEAD del cierre en el PR.

Caracterización antes de cambiar: seis handlers y nueve tests contrastados con la versión aceptada; los cambios de índices a `Field` son mecánicos y mantienen las aserciones. Auditoría independiente de entrada, evidencia, guardas y presupuesto PASS. Se buscaron consumidores de los benchmarks #1458/#1459 antes de retirar APIs.

Evidencia reproducible en `D:\VantareServer\evidence\isa-1977\`: logs, recibos de capturas, comparación RGBA, auditoría de alcance y contadores. La primera tanda que mostraba Próximamente está marcada inválida y no se usa como evidencia. Los targets propios se limpiaron al cerrar sus entregas; no se compartieron ni copiaron caches a evidencia.

## Balance de todo R9

Producción distribuida: **−4.041 líneas**. Producción física total: **−3.128**; tests: **−116**; documentación: **+106**; fixtures de texto: **0**. El balance incluye este único cierre documental. Detalle por PR y bases en `r9-balance-final.json`.

Las cifras suman los diffs propios de los PR frente a sus bases, sin incluir cambios ajenos de nightly. La producción distribuida cuenta líneas de fuente incluidas en Windows release sin tests ni `parity-capture`, con la misma proyección de cfg/helper en ambos lados y las macros contadas completas; no mide tamaño binario. La producción física cuenta también todo Rust de captura. Tests y documentación se miden aparte. Dos PNG nuevos: 298.196 bytes, separados de las líneas.

## Pendiente y siguiente acción

**7b requiere confirmación previa de Isaac y queda fuera de esta tanda cerrada.** `Hub::save` aún corta después de fallar Strategy y los errores de aplicación siguen sin el rework tipado del 7b. La caracterización real `49d7f2a43`, en el worktree aislado `D:\VantareServer\worktrees\isa-1977-paso7b`, reproduce el fallo esperado: Workshop no se guarda tras un conflicto de Strategy. No se corrigió producción ni se abrió PR de 7b.

Paso 9 aplazado: `seed.rs` conserva el límite de 200 ms incluso con `deadline=None`. Deuda conocida, no bloqueante para esta entrega. No relajar aserciones ni aumentar presupuestos como arreglo. Los tests 3 y 7 parciales y la ausencia del 6 en #1983 fueron aceptados por Isaac; no prueban equivalencia entre motores ni resuelven esa deuda.

Isaac revisa #1991 e integra cuando corresponda; el worker espera confirmación antes de 7b. VANTA-135 pasa a Por revisar con este límite explícito. No hay promoción a testers/master, release ni despliegue autorizados por cerrar la tanda.

## Banco, precisión y live

[#1458](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1458), [#1459](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1459) y [#1484](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1484) siguen abiertos. R9 no cambia su alcance ni acredita precisión física: `proven`/`no_solution` se limitan al modelo y discretización certificados; `not_proven` no demuestra inviabilidad. El estratega mínimo live permanece después de la beta.

Se conserva la evidencia histórica de Fuji, fronteras, calibración y holdout: [handoff anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ad94ff022e001b3bca98ca502edf80162503ab6a/vantare-v2/docs/vantare-program/handoffs/strategy-planner.md) e [histórico por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/strategy-planner.md). No se repitieron esas mediciones en R9. El siguiente trabajo de precisión requiere condiciones previas certificadas, holdout independiente y predicción sellada; el de búsqueda debe preservar witness, límites de memoria y fallos bajo carga.

## Ownership y última actualización

[Strategy](../../../native/strategy/README.md) posee documento/importador/solver, sin runtime ni GPUI. [Hub Strategy](../../../native/hub/src/strategy/README.md) presenta controles, persistencia y ciclo cancelable. Análisis posee histórico; Engineer propone y el piloto acepta. No se inventan datos ausentes ni un solver paralelo.

5 de noviembre de 2026 · VANTA-135 / GitHub #1977 · Codex. Una única actualización de este handoff al cerrar la tanda; detalle de cada entrega en las issues y PR.
