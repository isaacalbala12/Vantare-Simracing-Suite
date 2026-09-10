# ISA-1104 — clasificación registrada: evidencia de Hd, I, J1 y J2

Inicio: 2026-09-10; actualización J2: 2026-09-11.
Rama `vantareapp/isa-1104-recorded-classification`,
base `7f757135445439851180fc503da45f7eb9e557e7`.
Código Hd `e583fe30925d7e8bd162fcc7a7f324509289e204`;
código I `6c568769cb966e7230b1771fd64457a6118838c1`;
código J1 `f6fcc09dadec655d2bde0d87993e4c8d3ba5bc25`;
código J2 `0a4f079fe3b9e02784670cb0a657699e3a2e27bf`.
Worktree `C:/tmp/vantare-isa1104/vantare-v2`. Orquestador: planes y revisión
personal. Ejecutor: Muse Spark1.3 Contributor, OpenCode, xhigh, sin subdelegación.

## Alcance comprobado

Hd presenta las decisiones del snapshot consultado en Revisiones, cuenta los
tres grupos y conserva los valores/motivo/manual de esa revisión. El helper
de disponibilidad evita mostrar valores guardados de campos no verificables;
no usa cabeza ni propuestas como historial. Compatibilidad v1/v2 comprobada.

I extiende el banco existente, sólo con dos paths de test. Secuencia real:
original → WeatherConditions manual opaca → tipo de sesión distinto,
conservando clima → retirada explícita como revisión v1 → replay/Resolve
del primer comando con cabeza avanzada → cerrar/reabrir y comparar
Load/Project históricos completos. El helper devuelve handle y cabeza nuevos
para continuar el banco familiar existente. No modifica código productivo.

Se comparan íntegramente las proyecciones y trece grupos físicos: validez,
Fuel, VE, ritmo por clima, ClassPace, curva de stint combinada, curvas
separadas de fuel/neumáticos, degradación, pit, SavingCost, clima y tiempo.
Sólo se normalizan GeneratedAt y referencias comprobadas por separado;
los cambios intencionales de tipo/clima/elegibilidad se comprueban antes.
No se elimina una familia para obtener PASS. Igualdad de ausencia significa
preservación de ausencia, no que exista una señal útil.

## Gates

| Gate | Resultado literal | Log bajo frontend/.tmp/ |
|---|---|---|
| Hd focal final | 64 PASS, 5.96s, EXIT0 | isa1104-t12hd-focal-r2.log |
| Hd frontend completo | 444 archivos,3680 PASS,224.02s,EXIT0 | isa1104-t12hd-frontend-all.log |
| Hd build | 1086 módulos,1.56s,EXIT0 | isa1104-t12hd-build.log |
| Hd tipos/lint/i18n | EXIT0; paridadOK,ausentes0,huérfanas0 | isa1104-t12hd-{typecheck,lint,lint-r2,audit-list-r2}.log |
| I focal app | 0.178s,EXIT0 | isa1104-t12i-focal-app-r3.log |
| I focal Analysis | 0.184s,EXIT0 | isa1104-t12i-focal-analysis-r3.log |
| I banco sin opt-in | SKIP,0.045s,EXIT0; no PASS real | isa1104-t12i-focal-bank-r3.log |
| I global Go | 126 paquetes ok,cero FAIL,EXIT0 | isa1104-t12i-global.log |
| I vet de alcance | sin salida,EXIT0 | isa1104-t12i-vet.log |
| I Imola real | PASS14.03s,paquete14.083s,EXIT0 | isa1104-t12i-imola.log |
| I Monza real | PASS19.73s,paquete19.778s,EXIT0 | isa1104-t12i-monza.log |

Gofmt/diff limpios. Avisos anteriores de AbortError en teardown happy-dom y
chunks mayores de500kB permanecen en sus logs; no se han ocultado.

## Fuentes y revisiones

Fuentes nombradas bajo `C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Telemetry`:

- Imola: `Autodromo Enzo e Dino Ferrari_R_2026-06-06T19_28_21Z.duckdb`.
  SHA256 antes/después: `35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0`.
- Monza: `Autodromo Nazionale Monza_R_2026-05-02T18_05_21Z.duckdb`.
  SHA256 antes/después: `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`.

Ambas abren98canales. El banco familiar conserva independencia y restauración
sobre la vuelta3 de Imola y63 de Monza; no se reinterpretan como incidentes.

| Etapa | Imola | Monza |
|---|---|---|
| Referencia previa retenida | aa52f44e5cb620c800b6190ff8609a37d2e61db5fd7d5b69e2f58c6d5236e0f8 | eb7acee8cf8fcf03c3be7ac256f2a62c593a48836e4366a6bb8e12d2610cd3e3 |
| Corrección de etiqueta | 477190ec9e3a5ec6f298d7bad531d1645388535fadf03776abf138eb86ddf2c8 | c23b72ba60492bb79e42bd40917279fed5974ffeb9dcc0ca7359c48c93cdacf8 |
| Tipo de sesión | 178fdf08598a350c3ddbb2bd4644586c23fbe27dbc52078d787b59dfd72871f2 | c6b830dcdf228464e8a78ebc195ec7091abef7c516076cf51237aa7d91aa5472 |
| Restauración | a8c71a375c7f5b2c37af9f4de7978fbf1c1532b271754bd8b25a7444cecc00d3 | 18c048ebf1bc099c6abd8628b41ade1d1f6a8e42461aa3beaa5cf5d4d40ff053 |

## Reproducción y límites

El banco requiere ISA1088_REAL_SOURCE con UNA de esas rutas nombradas y
ISA1088_RUNTIME_APP=`C:/tmp/isa1088-runtime-app`; ISA1088_EXPORT_CATALOG
debe quedar vacío. Ejecutar `go test ./internal/app -run '^TestRecordedStrategyRealDuckDB$' -count=1 -v`.
Usa el parser/trust/custodia existentes, discovery restringido, espera real
de estabilidad y carpetas temporales de test. Originales sólo leídos.

El authorizer de licencia es controlado. Es un contraste nativo sobre datos
reales de desarrollo, no login/Wails, paridad visual, validación de incidentes
ni precisión estadística. No se abrió la reserva ni se exportó catálogo.
SessionType y clima son decisiones reversibles de validación, no verdad
física anotada. T12 continúa con identidad canónica, y los gates visuales/
nativos/empíricos siguen pendientes.

Root rechazó debilidades del primer test (restore v3, Included como vuelta
completa, normalización que ocultaba cambios e historial sólo por IDs) y
verificó sus correcciones. El primer focal.log es un resumen reconstruido;
las ejecuciones efectivas originales se verificaron en OpenCode. R2 tuvo
un error de invocación con EXIT0 inválido y su archivo fue sobrescrito;
el fallo queda en la salida de herramienta root, no en un log conservado.
R3 contiene la evidencia cruda válida del código final; no se atribuye RED
de producto a errores de construcción de este banco.

Sin app/LMU, push, PR, CI remota, merge, promoción o release en estos cortes.

## J1 — identidad canónica, preparación pura

Cuatro paths Analysis, +744/-16, revisados personalmente. Target recibido
como dato nativo, referencias y tuple coherentes, precondiciones RAW y
disponibilidad/privacidad del original. No consulta de catálogo ni autorización
probada por el fixture. Constructores antiguos, JSON sin referencia y
precedencia de error de base conservados. No snapshot/store/UI en este corte.

Root exigió target ya recortado ante metadata parcial, reutilizar el helper
original, conservar precedencia y añadir casos del campo corregido privado/
ausente/duplicado, Unicode y frontera de1024bytes. Corregido; no se eliminó
ninguna aserción anterior. Al cerrar review sólo cambiaron dos comentarios.

| Gate | Resultado | Log bajo frontend/.tmp/ |
|---|---|---|
| Canónico R1/R2 | 0.029s/0.068s, EXIT0 | isa1104-t12j1-focal-canonical-r{1,2}.log |
| Clasificación R1 | 0.159s, EXIT0 | isa1104-t12j1-focal-classification-r1.log |
| Global Go | 126 paquetes ok, cero FAIL, EXIT0 | isa1104-t12j1-global.log |
| Vet de alcance | sin salida, EXIT0 | isa1104-t12j1-vet.log |

Gofmt/diff limpios, logs crudos conservados y leídos por root. No RED previo
de producto en esta API nueva. No banco/frontend/Wails repetidos: los últimos
gates de esos ámbitos siguen siendo I/Hd y el bloqueo nativo documentado.
Worker idle antes del commit. Al cerrar J1, J2 sólo estaba planificado;
su implementación y evidencia posterior constan en la siguiente sección.

## J2 — snapshot y documento v4, 2026-09-11

Cuatro paths, +1149/-29: correction_snapshot.go, corrections_document.go
y dos tests nuevos de identidad. Target persistido separado, snapshot/comando
v4, lectura de cadena y restauración a formatos anteriores. Sin target activo
conserva v1/v2/v3. Decoder rechaza presencia null de target en formatos
anteriores, también con otra capitalización aceptada por encoding/json.
No hay consulta de catálogo ni escritura nativa v4 conectada en esta capa.

Root revisó todos los paths y exigió: una sola preparación compartida,
guardas de target inerte, compatibilidad sin Session para clientes escalares,
tests de manipulación independientes, cuota256 con operaciones completas y
distintas, reseal RAW de snapshot/comando/cadena con control válido previo
y casos discordantes. No se borraron ni cambiaron aserciones anteriores.

| Gate | Resultado | Log bajo frontend/.tmp/ |
|---|---|---|
| Baseline antes de producción | 0.022s, EXIT0 | isa1104-t12j2-baseline-r1.log |
| Seis vectores fijos tras producción | 0.023s, EXIT0 | isa1104-t12j2-focal-baseline-r2.log |
| Snapshot final | 0.069s, EXIT0 | isa1104-t12j2-focal-snapshot-r4.log |
| Documento final | 0.109s, EXIT0 | isa1104-t12j2-focal-document-r5.log |
| Canonical final | 0.052s, EXIT0 | isa1104-t12j2-focal-canonical-r3.log |
| Clasificación | 0.144s, EXIT0 | isa1104-t12j2-focal-classification-r1.log |
| Global Go | 126 paquetes ok, cero FAIL, EXIT0 | isa1104-t12j2-global.log |
| Vet de alcance | sin salida, EXIT0 | isa1104-t12j2-vet.log |

Gofmt R5/diff limpios. Root leyó logs, contó global y verificó los seis
vectores contra la captura inicial, sin regenerarlos. El filtro Snapshot
no ejecutaba Fixed; baseline R2 cerró ese hueco antes del gate global.
Son vectores puros de hash: baseline-parent no se presenta como comando Save
válido. Vectores inmutables en correction_snapshot_identity_test.go.

R1 document falló por digest de fixture sin su escalar, según diagnóstico
del ejecutor. R2 snapshot/document sí detectaron una regresión introducida
al compartir preparación (Session cero con clasificaciones vacías); se
restituyó la ruta antigua. Canonical R1 tenía un duplicado en vez de dos
referencias discordantes; corregido. Los logs de fallos permanecen.
No se interpreta esta secuencia como RED previo de un bug ya existente.

El conjunto válido256 (254 escalares, familia e identidad) pasa en snapshot
y digest;257 se rechaza con snapshot vacío. Target y prepared inconsistentes
se rechazan incluso con hashes externos recalculados; el mismo reseal sin
alterar datos pasa. Esto no autentica una falsificación local coherente.

Worker idle antes de commit. Sin banco/GUI/Wails, push/PR/CI remota, merge,
promoción o release. J3 cerrado por root; todavía pendiente de implementación.

## T12j3 — custodia canónica aceptada localmente

Código 4d5c3178, dos paths +700/-4: corrections_store.go y nuevo
corrections_store_identity_test.go. Resolver una vez bajo lease tras replay,
cabeza y cuota; historial/Resolve/replay independientes del catálogo actual.
Root revisó el diff antes del relevo; Devin MCP SWE-2 Max cerró revisión
técnica sin cambios. Informe literal local:
frontend/.tmp/isa1104-t12j3-devin-review.md. Los dos paths productivos/test
se mantuvieron; root añadió documentación mientras Devin leía.

Logs isa1104-t12j3-*: IdentityStore12/12 PASS3.640s; store-r2 4.029s,
document-r2 0.123s, canonical-r2 0.067s, todos EXIT0. Global126 paquetes
ok/0FAIL EXIT0 contado por root y Devin; vet EXIT0. No repetidos por Devin
al no encontrar cambios ni fallos. Conservados logs previos y originales.
Prueba t.TempDir de custodia y contrato; no prueba autorización física,
banco DuckDB, Wails, precisión ni paridad visual. Callback no montado aún.
Sin push/PR/CI remota/merge/promoción/release. J4 definido por root antes
de asignación; el relevo a Devin no modifica el alcance de producto.

## T12j4 — vista y proyección canónica aceptadas

Código d9dc43c8; cuatro paths +689/-11. Devin SWE-2 Max implementa y
revisa; root dirige y comprueba diff productivo y evidencia. Cambio sólo
en corrections_view.go: conjunto J1/combiner J2 con target persistido,
integridad completa y copia de metadata. Derivadores existentes intactos.

RED literal isa1104-t12j4-red.log: rechazo de v4 válido antes del cambio,
FAIL3.524s EXIT1, sin error de compilación; tests J3 pasan. Nuevos tests:
vista6PASS0.026s, derivación3PASS0.025s, proyección2PASS0.054s, todos EXIT0.
Global126ok/0FAIL EXIT0 contado por root; vet y gofmt sin salida EXIT0.
Logs locales frontend/.tmp/isa1104-t12j4-*; informe completo
isa1104-t12j4-devin-report.md. Ningún log sobrescrito.

Tuple e ID efectivos, magnitudes físicas comparadas con decisiones
equivalentes, originales intactos, revisión exacta tras restauración y
reapertura, rechazos sin resultado parcial. Fixtures de contrato y store
t.TempDir; no prueba DuckDB real, Wails, precisión ni Adopt. Sin cambios
frontend, app/LMU, push/PR/CI remota/merge/promoción/release. J5 definido.
