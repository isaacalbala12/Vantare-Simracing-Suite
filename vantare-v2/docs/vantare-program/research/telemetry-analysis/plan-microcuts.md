# Backlog ordenado y microcortes TDD

Estado: propuesta en review. Tras cerrar TA-01, el orquestador crea y ejecuta
los siguientes issues de forma autónoma. Cada corte usa una rama/worktree/issue,
no añade dependencias sin autorización y termina en `In Review`; nunca se
promueve automáticamente a `nightly`.

| Orden | Corte | Objetivo y no tocar | Primero RED / evidencia | Checks y cierre |
|---:|---|---|---|---|
| TA-02 | Corpus y contrato de importación | manifest, discovery metadata y formatos permitidos; no parser de producción ni DuckDB en `internal/telemetry` | tests de dedupe, ruta redacted, hash/cancelación, consentimiento, WAL ausente + ventana de estabilidad y original read-only; muestra LMU sanitizada legal; nunca forzar checkpoint | Go focal, race si hay I/O, fixture audit, diff-check; evidencia automatizada de original intacto |
| TA-03 | Modelo histórico canónico | tipos Session/Lap/Channel/quality/provenance y normalización; catálogo DuckDB por frecuencia/`ts`, no UI ni Core live | golden de continua con eje implícito, evento/discreta con `ts`, frecuencias mixtas, missing/stale/invalid/zero y unidad desconocida para reglas | Go focal + fuzz parser + benchmark corpus; ledger/documentación |
| TA-04 | Progreso/distancia y mapa | contrato de distancia/geometry respaldado por evidencia; no fallback temporal oculto | golden de progreso monotónico, discontinuidad, longitud incompatible y cursor; fixture real validada | tests deterministas, benchmark, captura de mapa; bloquea si LMU no aporta evidencia |
| TA-05 | Índice y galería | biblioteca local, indexar/copia opcional, búsqueda y estados; no sharing remoto | tests de importación cancelada, hash igual, copy atómico, error explicable | Go/Frontend focal, a11y, manual: original no cambia |
| TA-06 | Comparador de dos vueltas | elegibilidad, malla de distancia, delta e intervalos; no recomendación | table tests de condiciones incompatibles, cero, quality, 2+2 trazas y teoría etiquetada | golden+fuzz+bench, no regressión Core |
| TA-07 | Workspace de datos | ViewModels puros, canales, mapa/gráfico/tabla sincronizados; no filesystem/direct readers | tests de selector, cursor/zoom, tabla alternativa, máximo 4 y responsive | frontend test/build/lint focal, Playwright wide/medium/mobile, a11y |
| TA-08 | Reglas y tarjetas deterministas | 3 reglas de conducción explicables; no LLM/causalidad setup | golden por punto de freno, gas y mínima/exit; cada finding exige evidenceRefs/confidence/limit | Go focal+benchmark, snapshot UI, review adversarial de falsos positivos |
| TA-09 | Notas, correcciones y export | overlay no destructivo, CSV y paquete Vantare revisionable; no cloud | tests de no mutación raw, redacción PII, schema/version de paquete y cancelación | security review, tests, manual: abrir paquete y revisar contenido |
| TA-10 | Demo/gating y performance | demo sanitizada, entitlement Pro, medición/observabilidad | no datos propios sin licencia; benchmark de import/consulta/cambio de canal | build, visual, perf budget medido, Isaac valida UX 100% |

## Dependencias y gates

TA-02 puede empezar tras cerrar el review técnico de esta investigación. TA-03
necesita el corpus aceptado. TA-04 está bloqueado por evidencia real de
distancia/geometría o un formato importado que la demuestre. TA-05–TA-08
requieren TA-03; TA-06 también TA-04. TA-09 necesita modelo/índice estable.
TA-10 es posterior al flujo funcional y no habilita promoción a `nightly` ni
release sin los gates humanos descritos en la política de ejecución.

Antes de cada corte, leer `AGENTS.md`, `docs/vantare-program/README.md`, el handoff vivo de Analysis, el microplan anterior y la issue Linear. No tocar `internal/telemetry/drivers/lmu`, parsers legacy, Wails/SSE, Engineer, Strategy, importadores desconocidos o dependencias sin issue explícita. Si la muestra contiene identidad/rutas, detener y sanitizar antes de commit.

## Backlog de riesgos a convertir en issues si persisten

- fixture LMU de boxes/garaje y semántica real de position/progreso;
- derechos/documentación de formatos `UserData\\Telemetry`, MoTeC y archivos de terceros;
- tamaño, latencia y cuota de biblioteca local con corpus real;
- estrategia de migración de `recording/replay` TC-05/06 hacia Analysis;
- revisión de privacidad del paquete Vantare y CSV;
- test de accesibilidad del mapa/series sin ratón y evidencia visual reproducible.

## Definition of done común

El corte incluye contrato/documentación actualizados, tests que prueban
comportamiento observable, benchmark si toca datos/series, `git diff --check`,
evidencia visual si hay UI y una verificación reproducible que no requiera
interpretar código. Un reviewer independiente debe confirmar que no se inventan
valores, no se duplican readers, no se debilitan tests ni se mezcla scope. Los
cortes continúan apilados en ramas de issue; la aprobación de Isaac se exige
antes de promover a `nightly` y de nuevo antes de `master`.
