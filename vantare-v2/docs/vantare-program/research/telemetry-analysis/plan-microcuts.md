# Backlog ordenado y microcortes TDD

Estado: propuesta en review. Tras cerrar TA-01, el orquestador crea y ejecuta
los siguientes issues de forma autónoma. Cada corte usa una rama/worktree/issue,
no añade dependencias sin autorización y termina en `In Review`; nunca se
promueve automáticamente a `nightly`.

| Orden | Corte | Objetivo y no tocar | Primero RED / evidencia | Checks y cierre |
|---:|---|---|---|---|
| TA-02 | Corpus y contrato de importación | manifest, discovery metadata y formatos permitidos; no parser de producción ni DuckDB en `internal/telemetry` | tests de dedupe, ruta redacted, hash/cancelación, consentimiento, WAL ausente + ventana de estabilidad y original read-only; muestra LMU sanitizada legal; nunca forzar checkpoint | Go focal, race si hay I/O, fixture audit, diff-check; evidencia automatizada de original intacto |
| TA-03 | Modelo histórico canónico | tipos Session/Lap/Channel/quality/provenance y normalización; catálogo DuckDB por frecuencia/`ts`, no UI ni Core live | golden de continua con eje implícito, evento/discreta con `ts`, frecuencias mixtas, missing/stale/invalid/zero y unidad desconocida para reglas | Go focal + fuzz parser + benchmark corpus; ledger/documentación |
| TA-04A | Evidencia espacial y contrato puro | consentimiento, evidencia sanitizada y contrato de progreso/geometría; sin UI, mapa ni captura | GO/NO-GO por límite de vuelta, progreso, ancla temporal, GPS y anchura; RED sintético de monotonicidad/discontinuidad/longitud | tests deterministas, fuzz y benchmark; bloquea si LMU no demuestra cada semántica; `ta04a-spatial-evidence-plan.md` |
| TA-04B | Captura técnica visual | captura estática de geometría ya demostrada; sin UI interactiva, comparador ni ruta de producto | contrato TA-04A aceptado y plan/issue propios | bloqueada; evidencia visual futura no sustituye TA-07 |
| TA-04C | Autoridad semántica espacial | fuentes oficiales para datum y bordes; sin abrir grabaciones ni implementar | documento/SDK LMU versionado o aclaración oficial vinculada a LMU | `NO-GO` para datum y anchura; registrar primero la issue pendiente |
| TA-04E | Reconstrucción local entre recordings | prueba pre-registrada de forma local; sin UI, mapa, código ni reinterpretación de GPS | primer grupo compatible; gates conjuntos de cobertura, longitud, escala, residual rígido y cierre | `NO-GO`: 61,73 % de vueltas cumplió conjuntamente p95 `<= 5 m` y p99 `<= 10 m`, frente a 80 %; `local_shape=unknown`; `ta04e-local-track-reconstruction-evidence.md` |
| TA-04F / F6 | Caracterizar threshold local | investigación independiente sobre variación sensor/piloto/trayectoria; no relajar TA-04E post hoc | F6 congeló `stop_insufficient`: 16 recordings, grupos `1/1/1/3/10`, solo 1 contributor `>=10`; reabrir con `>=3 x >=10` del mismo grupo o protocolo nuevo | freeze local; `valid_laps=0`, selección `0/0`; mantener TA-04B bloqueada hasta un `GO` independiente |
| TA-04F7 | Forma existing-only por cluster de recording | agotar DuckDB previos; recording como unidad primaria; sin grabaciones nuevas, mapa ni UI | 319 candidatos, 186 canónicos, 48 grupos; 3 recordings elegibles en grupos distintos | `analysis_complete`: dos GO local-only (4/5 y 2/2), un NO-GO (0/2), confidence `none`; `local_shape=unknown`, mapa no autorizado y STOP visual humano |
| TA-04F8 | Corte visual descriptivo sanitizado | extraer forma local ya decidida `GO local-only`; sin mapa, capability, frontend ni TA-04B | run único existing-only exit 0 en 597 s, `analysis_complete`, dos salidas publicadas, cleanup `0/0/0` | STOP por condición 1: drift 319→322 candidatos, 186→189 canónicos, 183→186 insuficientes, 3 elegibles igual, 48→49 grupos; sin SVG ni figura; salidas custodiadas como rechazadas; `ta04f8-shape-export-plan.md` |
| TA-04F9 | Control prospectivo de inventario vivo y figura técnica | aceptar sólo crecimiento aditivo bajo C1-C5; una ejecución, sin mapa/capability/frontend/TA-04B | 49 grupos, prefijo 1-48 idéntico, grupo 49 aditivo; deltas `+3/+3/+3/0`; cleanup `0/0/0` | C1-C5 PASS; manifest, shape export y SVG grupos 1/37 congelados; `local_shape=unknown`, mapa no autorizado; `ta04f9-live-inventory-shape-plan.md` |
| TA-05 | Índice y galería | biblioteca local, indexar/copia opcional, búsqueda y estados; no sharing remoto | tests de importación cancelada, hash igual, copy atómico, error explicable | Go/Frontend focal, a11y, manual: original no cambia |
| TA-06 | Comparador de dos vueltas | elegibilidad, malla de distancia, delta e intervalos; no recomendación | table tests de condiciones incompatibles, cero, quality, 2+2 trazas y teoría etiquetada | golden+fuzz+bench, no regressión Core |
| TA-07 | Workspace de datos | ViewModels puros, canales, mapa/gráfico/tabla sincronizados; no filesystem/direct readers | tests de selector, cursor/zoom, tabla alternativa, máximo 4 y responsive | frontend test/build/lint focal, Playwright wide/medium/mobile, a11y |
| TA-08 | Reglas y tarjetas deterministas | 3 reglas de conducción explicables; no LLM/causalidad setup | golden por punto de freno, gas y mínima/exit; cada finding exige evidenceRefs/confidence/limit | Go focal+benchmark, snapshot UI, review adversarial de falsos positivos |
| TA-09 | Notas, correcciones y export | overlay no destructivo, CSV y paquete Vantare revisionable; no cloud | tests de no mutación raw, redacción PII, schema/version de paquete y cancelación | security review, tests, manual: abrir paquete y revisar contenido |
| TA-10 | Demo/gating y performance | demo sanitizada, entitlement Pro, medición/observabilidad | no datos propios sin licencia; benchmark de import/consulta/cambio de canal | build, visual, perf budget medido, Isaac valida UX 100% |

## Dependencias y gates

TA-02 puede empezar tras cerrar el review técnico de esta investigación. TA-03
necesita el corpus aceptado. TA-04A está bloqueado por consentimiento,
retención definida y evidencia real de distancia/geometría o un formato
importado que la demuestre. TA-04C y TA-04E cerraron localmente en `NO-GO`;
al recuperar Linear se registra primero TA-04C y después TA-04E vinculada.
TA-04F6 terminó en freeze `STOP insuficiente`. Solo puede reevaluar la
resolución con `>= 3` recordings del mismo grupo y `>= 10` vueltas preliminares
cada uno, o con un protocolo nuevo explícito; no se seleccionan subconjuntos ni
se relajan thresholds. TA-04B requiere un GO explícito independiente. TA-05–TA-08
requieren TA-03; TA-06 también TA-04A. TA-09 necesita modelo/índice estable.
TA-04F7 ya ejecutó el protocolo nuevo sobre todos los históricos: sus dos GO
son local-only con un solo recording y no autorizan TA-04B ni mapa de producto.
TA-04F8 consumió la autorización visual humana y cerró en STOP sin figura: el
run fue válido, pero la regla de igualdad congelada frente al freeze-v2 no se
cumple contra un directorio vivo. No queda gate abierto en ese corte y su par de
SHA no se reejecuta. Aceptar un inventario vivo aditivo requiere primero una
decisión humana separada y después un protocolo nuevo explícito; ninguno de los
dos existía en TA-04F8. TA-04F9 hizo ambas cosas prospectivamente, pasó C1-C5 y
congeló una figura técnica de grupos 1/37; no es mapa ni capability y TA-04B
sigue bloqueada.
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
