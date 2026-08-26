# Handoff vivo — Telemetry Analysis

## Resultado

Herramienta post-sesión que responde «¿cómo puedo ser más rápido?» con
comparaciones sincronizadas, métricas y recomendaciones explicables. El nombre
visible es `Telemetría`.

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md` y
  `research-policy.md`.
- Este handoff y el proyecto Linear del módulo.
- ADR 0004 y el handoff de Telemetry Core para contratos/recording.
- La futura investigación, spec, HTML y plan aprobados reemplazarán el resumen
  de experiencia cuando aporten más detalle.

## Estado

Actualización ISA-861 (2026-08-27, corte final candidato sobre
`origin/nightly@b1d5b15b`):

- La rama de integración incorpora el servicio backend TA-03E completo, sus
  correcciones de limpieza y límites, y el empaquetado Windows TA-03F con
  verificación fail-closed del runtime firmado.
- También incorpora el acumulado ISA-694: importación LMU autorizada, cold
  start reanudable, paginación acotada, catálogo histórico y proyecciones
  públicas consumidas por Strategy.
- `TelemetryOrbitPage` continúa fuera de este corte: su fuente productiva aún
  devuelve una lista vacía. La integración habilita backend e histórico para
  las pruebas reales, pero no afirma que la pantalla post-sesión ya los lea.
- TA03E/TA03F ya fue promovida mediante PR #866 a `nightly@b1d5b15b`. El
  acumulado de Analysis/Strategy de este segundo corte mantiene push, PR, CI
  y merge pendientes. `testers`, `master` y release quedan fuera.

ISA-816 corrige en su rama aislada la segunda pagina de eventos LMU: el parser
ya no suma la predecesora al limite enviado al runtime, sino que la solicita en
una lectura separada de una fila. La pagina publica sigue admitiendo 16.384
eventos nuevos. Una regresion `duckdb_integration` con adapter real, helper
firmado y 16.385 eventos reproduce el fallo anterior y pasa con el arreglo.
Analysis, la suite real completa, el helper y el vet focal pasan. El gate vet
exacto llega a Go tras restaurar `frontend/dist`, pero conserva tres avisos
`unsafe.Pointer` previos y ajenos en LMU live y Launcher; el mismo gate con ese
analizador desactivado pasa. Commit de producto `3e88d21b`; pendiente review,
sin PR, integracion ni promocion.

ISA-809 / ISA-694 F5-e corrige en su rama aislada el panic al asociar un
incidente posterior a la ultima vuelta. `labelIncidentLaps` valida ambos
limites y una sesion sintetica cubre eventos antes de la primera vuelta y
despues de la ultima. El barrido de los siete `sort.Search` del paquete confirma
que los otros indices derivados se validan antes de acceder, incluida la resta
de `continuousLapEndValues` que puede producir `-1`. Analysis+Strategy PASS; el
corpus real de 337 DuckDB queda para el gate del orquestador. Un aislamiento
general ante panics por sesion queda fuera de este arreglo y necesita una
politica separada. Sin PR, integracion ni promocion.

ISA-744 / ISA-694 F3-a5 está implementada en su rama aislada y cierra el
desarrollo F3a pendiente de review. El pit degradado conserva intervalos de
carril; Fuel/VE solo se asocian con reloj declarado común. Reloj desconocido o
ausencia de subida quedan ambiguos con motivo y jamás producen desglose de
tránsito/servicio. Las tasas observadas agregan N, rango, varianza y versión.

`ObservedStrategy v1` publica stints, vueltas de parada, compuesto raw, cambios
Fuel/neumático/desgaste y resultado observable de cada carrera. El productor
multi-sesión compone F3-a1..a5 en `StrategyInputProjection v2`; todas las
familias llevan presencia, procedencia, confianza y motivo, y las ausentes no
bloquean las demostradas. El contract test cubre wire nuevo→consumidor v2 y
rechazo fail-closed del fixture v1. Gates Analysis/Strategy, race, vet, gofmt y
diff-check PASS; el gate Go global sigue no ejecutable sin el `frontend/dist`
embebido. Sin PR, integración ni promoción.

ISA-743 / ISA-694 F3-a4 está implementada en su rama aislada. La salida
estándar es `CombinedStintPaceCurve`: cero local por mediana de las tres
primeras vueltas limpias del stint y agregación por índice para la misma
combinación+bucket, con rango y N. Un gate documentado exige diseño cruzado,
3 stints, 15 vueltas, tres edades con rango de Fuel >=10 L, correlación máxima
0,80 y varianza residual mínima de 25 % antes de publicar fuel/edad separados.
La fixture cruzada pasa; la fixture sintética tipo corpus real no.

`Tyres Wear` deriva pendiente por rueda/eje y vida al 20 % con rango y
confianza; compuesto sigue `unsupported` por falta de mapping semántico. El
coste del ahorro solo aparece con 5+5 vueltas limpias alternadas por nivel en
el mismo stint, compuesto y clima; cualquier fallo queda `missing` con motivo.
Contrato numérico en `docs/strategy-planner/isa-743-curvas-derivadas.md`.
Suite focal, race, vet, gofmt y diff-check PASS. La suite Go global solo queda
bloqueada en `frontend` y `cmd/vantare` por ausencia de `frontend/dist` en el
worktree. Pendiente: review del orquestador; sin PR ni promoción.

ISA-742 / ISA-694 F3-a3 está implementada en su rama aislada: Fuel y Virtual
Energy por vuelta se calculan como delta entre fronteras válidas dentro del
mismo `ContinuousSegment`, sin cruzar `CoverageGap` ni pit. El ritmo
representativo usa mediana y varianza de vueltas limpias; tráfico conserva su
etiqueta y consumo, pero no entra en ritmo. Los eventos `Minimum Path Wetness`
producen buckets seco/húmedo/mojado; una vuelta que cambia de bucket no se
atribuye entera a ninguno. No se usan `CloudDarkness` ni `OffpathWetness`.

La agregación mezcla solo la misma combinación+bucket, pondera calidad y N, y
calcula el percentil de la sesión actual contra el histórico suministrado del
mismo piloto. Observaciones, familias y percentil llevan presencia,
procedencia `derived` y confianza completas. Fixtures versionadas cubren seco
y llovizna estilo S040. Gates focal, race, vet, gofmt y diff-check pasan; la
suite global pasa salvo los dos paquetes bloqueados por `frontend/dist`
ausente. Pendiente: review del orquestador de #742; no hay PR, integración ni
promoción.

ISA-740 / ISA-694 F3-a2 está implementada en su rama aislada: vueltas y
fronteras se reconcilian desde `Lap` + resets de `Lap Dist` con calidad
explícita; las vueltas incompletas permanecen visibles y las etiquetas
out/in-lap, pit, impacto/offtrack, tráfico y outlier alimentan exclusiones
explicadas por familia. Tráfico es solo etiqueta (D7). Stints aparentes usan
únicamente pit, salto de Fuel o cambio observable de neumático, nunca identidad
de piloto. La salida materializa `ContinuousSegment`, `CoverageGap`,
`LapBoundary` y `StintBoundary` del contrato F1.2.

Las fixtures reales mínimas y sanitizadas S045/S266 reproducen 9/70 vueltas,
10/70 resets, 10/71 eventos, 6/66 tiempos utilizables, 0/3 vueltas de pit y
1/4 stints aparentes; S266 conserva como gap sus 9.985,14 s de delta temporal.
Los gates focal, race, vet, gofmt y diff-check pasan. Pendiente: review del
orquestador de #740; no hay PR, integración ni promoción.

ISA-737 / ISA-694 F3-a1 está implementada en su rama aislada: el modelo
`HistoricalSession` se clasifica por combinación LMU, tipo y clima; las
sesiones sin vuelta completa permanecen identificadas con usabilidad por
familia; y cada carrera se agrupa con las prácticas de la misma combinación.
Las fixtures sanitizadas cubren las seis candidatas de F0-1 y el spot-check
8/8, sin DuckDB, fechas, hashes ni nombres de equipos reales. El gate
`go test ./internal/telemetryanalysis/... -count=1`, vet, gofmt y diff-check
pasa. Pendiente: review del orquestador; no hay PR ni promoción.

TA-01 / ISA-122 completó la investigación documental, competitiva y de código.
TA-02 / ISA-124 está técnicamente cerrada en rama aislada tras review
independiente `ACCEPT` sin P0/P1/P2/P3. Entrega el primer contrato compilable
del producto: discovery metadata-only, estabilidad LMU, manifest sanitizado,
corpus sintético y presupuestos. La aprobación inicial de Isaac se reserva para
promover el conjunto aceptado a `nightly`.
TA-03 / ISA-126 caracterizó DuckDB LMU mediante copia temporal read-only y
añadió el modelo/parser histórico v1. TA-03C cierra su antiguo hueco operativo
con un reader ligado al artefacto autorizado y un adaptador reproducible.
TA-03E tiene una candidata local revisada sobre
`work/ta03e-backend-reader-wiring`: añade la frontera backend no visual que
conecta discovery, autorización, estabilidad/revalidación, staging privado,
reader/parser, catálogo, paginación y teardown. Solo abre IDs opacos emitidos
por el propio servicio; no acepta paths de consumidor. La raíz LMU procede de
la detección nativa Steam, el runtime de `ProductionTrust(applicationDirectory)`
y el staging de la caché backend. Runtime ausente degrada solo el módulo. La
matriz comercial/operativa y la copia defensiva del estado están cubiertas por
tests. Evidencia local: test/vet focal, build frontend, suite Go global con
`CGO_ENABLED=0`, grafo raíz sin DuckDB/CGO y diff-check PASS. Las reviews de
especificación y calidad terminaron `APPROVE` después de cerrar cleanup
reintentable/acotado y bindings Wails accidentales. Race focal TA-03E x5 pasa
con MSYS2 UCRT64; el paquete completo `cmd/vantare` conserva una carrera
heredada en `spyMainEmitter`/`TestHandleProfileRetryFailed`, fuera del corte y
pendiente de issue. Esa rama no hizo Linear, push, PR, promoción ni release.
TA-03F tiene una candidata local verificada sobre
`work/ta03f-windows-runtime-packaging`, base apilada exacta
`559c3753a82071398ef1af3fbcc2d30c4dd3fe52`. Installer y portable empaquetan
como unidad atómica el runtime TA-03C en
`runtime/telemetry/duckdb-v1`; el updater hereda el cambio porque consume el
installer. El pipeline falla antes del artefacto si falta un miembro, cambia
un hash/manifest o aparece un extra. Tras el spec review, NSIS usa marcadores
`pending`/`committed`: rollback reproduce la presencia o ausencia previa de exe
y runtime, mientras una reentrada post-commit solo limpia backups y conserva el
par nuevo. El modelo conductual cubre cuatro estados previos, interrupciones y
fallos de cleanup; NSIS compila en scopes user/machine. Los flags CGO se validan
con compilacion C/C++ real en paths con espacios. El runtime se reconstruyó con
los hashes confiados, smoke x64 pasó y los artefactos locales pasaron
version/layout verify. Pendientes los smokes reales de install/upgrade/rollback/uninstall en
Windows 11 y Windows 10 si continúa soportado. Sin Linear, push, PR, CI remoto,
merge, promoción ni release.

La correccion local posterior de packaging añade un preflight de configuracion
publica como primer comando serial de `release:artifacts`,
`windows:package:all` y `release:portable`. Si falta URL o anon key de Supabase,
falla antes de runtime, pnpm o Go; no imprime valores y no bloquea
`windows:build`/dev/offline. `docs/release-artifacts.md` es la receta unica para
cargar una ruta `.env.local` autorizada sin copiarla, reconstruir con `-f` y
completar el smoke obligatorio de Google OAuth. El harness nuevo pasa 17 casos
en Windows PowerShell 5.1 y PowerShell 7, con `-f` cubierto en los tres targets;
el harness completo TA-03F tambien permanece verde en ambos hosts. La receta
CI esta contrastada directamente con el workflow, `go.mod` y el
`packageManager` actuales.

El 2026-08-12 se reconstruyo un set local con la pareja Supabase autorizada y
sin afirmar validacion de una licencia concreta. La configuracion quedo
presente en frontend y exe segun checks booleanos que no expusieron valores;
installer, portable y exe pasaron hashes, version e inventario DuckDB. El run
descubrio que el hijo PowerShell 5 de `wails3 task` no resolvia el cmdlet
autoloaded `Get-FileHash`, aunque el script directo si. `69a72a3` reemplaza esa
dependencia en el verifier por SHA-256 puro .NET y añade una regresion que
inutiliza deliberadamente el cmdlet. Harness PS5/PS7 y el alias oficial
`release:verify` pasan. En ese punto OAuth, instalacion, upgrade y uninstall
seguian siendo gates manuales; el build por si solo no demostraba paridad de
licencia.

Gate humano del 2026-08-12: con URL, anon key y un registro publico Ed25519
valido embebidos, Isaac instalo/actualizo la candidata y confirmo arranque y
Google OAuth correctos. El exe instalado coincide por SHA-256 con la build
`dd953d08eb4c9d46eacb3559073529ac0e61b7bcb151af4496f5fe53f598e221`; el
runtime instalado conserva el manifest confiado y sus cinco miembros exactos.
Quedan rollback, uninstall y Windows 10 si sigue soportado. No hubo revision
visual ni promocion.

El segundo spec review cerró la ventana de mezcla durante extracción/rollback:
runtime se verifica primero con el producto sin exe, el macro Wails extrae sólo
en `.vantare-install-stage` y un rename atómico publica el exe justo antes del
commit. Rollback retira producto/staging antes de tocar runtime y restaura el exe
viejo al final desde staging; un fallo de runtime conserva exe ausente,
marker/backups y reentrada segura. El modelo corta tras cada operación y sólo
acepta pareja anterior/nueva o exe ausente.
El tercer fix garantiza además que cleanup normal, rollback y reentrada cambian
`OutDir` a `$INSTDIR` antes de cada una de las cinco eliminaciones del staging;
NSIS no intenta ya borrar su directorio de salida actual.
El quality fix posterior restringe `prepare-runtime` al `bin` canónico y bloquea
junctions/reparse points en cada ancestro del destino antes de cualquier
reemplazo; el sentinel externo del test real queda intacto. Los dos checks NSIS
del exe rechazan 0, menos de 1024 y exactamente 1024 bytes.
TA-03B / ISA-135 cerró el corte de decisión tras un primer review
`REQUEST CHANGES`: recomienda un helper local fuera de proceso con
`duckdb-go/v2` y `duckdb.dll` dinámico, descarta el CLI y el CGO dentro de Wails,
documenta seguridad/packaging/rollback y entrega un spike sintético y un SBOM
reproducibles. TA-03C / ISA-168 implementa el adapter productivo fuera de
proceso, staging privado, manifest confiado, Job Object, IPC tipado, rollback y
packaging reproducible. La v1 queda limitada a archivos locales LMU
descubiertos/indexados. No se llama sandbox al proceso/Job Object y los imports
externos o comunitarios quedan bloqueados por ISA-164 / TA-03D.

- Rama/base/SHA: `vantareapp/isa-122-ta-01-investigacion-competitiva-fuentes-lmu-y-producto` sobre GOV-01 `67e263392b2192ee11f2ef4ccb161331dda3c735`.
- Promoción: TA-01…TA-03C integradas para validación Nightly/Pro Plus mediante
  ISA-204 / TA-N01; `testers` y `master` permanecen fuera del alcance.
- Evidencia: fuentes primarias enlazadas con fecha 2026-07-27, auditoría de
  catálogo/fixtures/driver LMU, matriz, contrato propuesto, arquitectura, HTML
  propio y plan TDD. No hubo hands-on autenticado, compra, captura LMU nueva ni
  acceso a archivos personales.
- Rama TA-02/base: `vantareapp/isa-124-ta-02-corpus-sanitizado-y-contrato-de-importacion`
  sobre TA-01 `0d7686b168f60ae9c21d55ffd995ce7837caff40`.
- Contrato TA-02:
  `research/telemetry-analysis/import-contract.md`.
- Evidencia TA-02: corpus puramente sintético validado con la misma política de
  manifest productiva; tests de WAL/ventana/identidad del handle/original
  intacto/dedupe/redacción/cancelación/límites. El acceso exige
  `user_approved`; no existe bypass `vantare_owned`. Parser ID/versión son
  obligatorios (`none@0` cuando no hay parser). No se accedió a
  `UserData\\Telemetry`, LMU, SimHub ni archivos personales.
  Focal x20, vet, race x10, fuzz 10 s (2.186.642 ejecuciones), suite Go global
  y `git diff --check` PASS.
- Rama TA-03/base:
  `vantareapp/isa-126-ta-03-caracterizacion-duckdb-lmu-y-modelo-historico-canonico`
  sobre TA-02 `f59fd3d2e1971944ee6cf2979f5535c7ac8d2a29`.
- Contratos TA-03:
  `research/telemetry-analysis/lmu-duckdb-characterization.md`,
  `research/telemetry-analysis/historical-model.md` y schema sanitizado
  `internal/telemetryanalysis/testdata/lmu-duckdb-schema-v1.json`.
- Evidencia TA-03: 12 claves de metadata, 56 canales continuos, 42 eventos y
  101 tablas. Original/copia con hash coincidente y metadata original intacta;
  la copia se abrió read-only. No se versionó DB, muestra, ruta, valor de
  metadata, nombre o identificador.
- Corrección de review TA-03: parser exige una capability emitida por TA-02 y
  revalida hash/tamaño/mtime/identidad antes y después; catálogo canónico
  determinista y resolución interna por `channelID`; máximo duro y predecesora
  acotada; metadata sensible redacted sin invalidar la sesión; `Lap` no genera
  límites sin evidencia; `DECIMAL` desconocido y duplicados case-insensitive.
- Checks TA-03 previos: focal x20, vet, race x10, fuzz y suite Go global serial
  PASS. Los checks frescos del endurecimiento se registrarán en el cierre del
  commit. La copia temporal read-only se eliminó al finalizar la
  caracterización; no se abrió de nuevo durante la corrección.
- Rama TA-03B/base:
  `vantareapp/isa-135-ta-03b-decision-y-packaging-del-adaptador-duckdb-en-windows`
  sobre TA-03 `dc215665a0060147e1e8f36d23b128339beab241`.
- Contratos TA-03B:
  `research/telemetry-analysis/duckdb-adapter-decision.md`, ADR 0005 propuesta,
  `research/telemetry-analysis/ta03c-duckdb-adapter-plan.md` y
  `research/telemetry-analysis/spikes/ta03b/`.
- Evidencia TA-03B corregida: helper + DLL 44.317.091 bytes; build reproducible
  en dos rutas; apertura read-only, rechazo de escrituras, hash estable,
  cancelación coordinada con `context.Canceled`, tipos/NULL/cero e identificador
  citado PASS sobre 720.000 filas sintéticas. Un SBOM SPDX de 37 componentes se
  regeneró dos veces con SHA
  `959ab3ae08e2a6ff36c28c0773552a81048700c123dc899d2af89d48f1d4bfa5`.
  El enlace estático falló de forma reproducible con GCC 16 por símbolos
  `emutls`; el dinámico oficial 1.5.5 funcionó. No se abrió LMU, base personal o
  Telemetry Core y los módulos/dependencias de producto permanecen intactos.

## Experiencia cerrada

- Galería de archivos LMU, recordings de otros simuladores e importaciones.
- Indexar por defecto; copiar a biblioteca opcionalmente.
- Resumen, mejor vuelta, consistencia y tres pérdidas principales.
- Workspace avanzado único con presentación progresiva.
- Dos vueltas principales, hasta cuatro trazas y estadísticas para más.
- Alineación por distancia; cursor, zoom, tabla y mapa sincronizados.
- Todos los canales con buscador, categorías, favoritos, presets y workspaces.
- Canales derivados oficiales; fórmulas personalizadas fuera del primer corte.
- Curvas/zonas detectadas, nombres verificados y corrección no destructiva.
- Tarjetas con delta, frenada, trail, velocidades, pedales, dirección, marcha,
  referencia, confianza y acción concreta.
- Vuelta teórica etiquetada; notas, correcciones, CSV y paquete Vantare.
- Motor determinista como autoridad; modelo futuro solo amplía explicación.
- Feedback local y comprobación de mejora en la siguiente tanda.
- Demo sanitizada gratuita; archivos propios requieren Pro.

## Fronteras

No habla durante la conducción, no modifica Strategy, no abre readers live y no
borra originales. Setup se compara sin afirmar causalidad.

## Primera entrega

Investigación de Coach Dave Delta, Garage61, Track Titan, trophi.ai, MoTeC i2,
Z1, SRT y alternativas; auditoría del repo; HTML interactivo Vantare;
arquitectura y plan. Después: discovery/import, galería, parser/modelo, dos
vueltas, gráficos/canales/mapa/delta/tabla, tres tarjetas deterministas,
notas/correcciones, CSV/paquete/demo, tests/benchmarks/capturas.

## Riesgos

- **P1:** consejos sin referencia comparable.
- **P1:** copiar código/UX propietaria o infringir licencias.
- **P2:** mezclar formato histórico con pipeline live.
- **P2:** competir con LMU por CPU.
- **P2:** abstraer antes de inventariar canales.
- **P1 técnico:** el catálogo actual no demuestra progreso/longitud de vuelta,
  distancia o geometría suficientes para implementar comparación espacial LMU;
  delta/mapa deben degradar honestamente hasta TA-04 con evidencia real.
- **P2 privacidad, reducido por TA-02/03:** ya existe contrato metadata-first,
  locator/error sanitizados, valores sensibles redacted y un schema real
  sanitizado sin valores. El reader productivo aún debe demostrar que nunca
  expone rutas o metadatos sensibles.
- **P1 integridad, reducido por TA-02/03:** WAL presente bloquea la apertura y se
  revalida antes/después de leer. El gate exige ausencia + ventana estable y la
  lectura verifica que path y handle siguen siendo el mismo archivo regular,
  incluso si un reemplazo conserva tamaño/mtime. La caracterización usó una
  copia autorizada read-only y verificó hash/metadata original antes/después;
  el reader productivo y su empaquetado siguen pendientes.
- **P2 dependencia/licencia, cerrado técnicamente en TA-03B:** el artefacto
  exacto se inventarió con fuentes primarias y SBOM reproducible: cuatro módulos
  Go, cinco extensiones estáticas y 26 componentes C/C++ vendorizados, todos
  bajo opciones permisivas compatibles con uso comercial. Wails y el `go.mod`
  principal permanecen sin DuckDB/CGO. Tras re-review limpia, la implementación
  requiere aprobación humana de dependencia, DLL, ~44,32 MB, VC++ runtime y
  packaging/notices/rollback.
- **P1 toolchain, reducido por TA-03B:** el enlace estático oficial 1.5.5 falló
  con MSYS2 GCC 16 por la transición de `emutls` a TLS nativo. El enlace
  dinámico contra el paquete oficial con SHA publicado sí pasó y es la ruta
  recomendada. CI debe fijar y repetir esa prueba.
- **P1 aislamiento/TOCTOU, acotado por procedencia en TA-03B:** la v1 acepta
  solo LMU local descubierto/indexado y el helper recibe una copia privada
  producida desde el handle autorizado. Job Object, hashes, protocolo sin SQL y
  límites son defensa en profundidad, no un sandbox. Imports externos y
  comunitarios permanecen deshabilitados hasta ISA-164 / TA-03D.
- **P1 temporal, explicitado por TA-03:** el catálogo continuo no declara el
  origen que lo alinea con `ts`. `Lap Dist`, `Total Dist` y GPS aparecen en el
  schema, pero TA-04 debe demostrar su comportamiento antes de mapa/delta.
- **P2 confianza:** AI/marketing de referencias no es autoridad. Las tarjetas
  iniciales han de ser reglas deterministas versionadas con evidencia visible.

## Issues

| Estado | Issue |
|---|---|
| Cerrada técnicamente | TA-01 / ISA-122, investigación competitiva, LMU/repo, contrato y HTML; review independiente `ACCEPT` |
| Cerrada técnicamente | TA-02 / ISA-124, corpus sintético y contrato de importación; review independiente `ACCEPT` |
| Cerrada técnicamente | TA-03 / ISA-126, modelo y capability endurecidos |
| Cerrada técnicamente | TA-03B / ISA-135, decisión, límite LMU local y SBOM reproducible |
| Cerrada técnicamente / In Review | TA-03C / ISA-168, helper/adaptador productivo fuera de proceso; review `APPROVE` |
| Backlog obligatorio antes de imports externos | TA-03D / ISA-164, sandbox real para contenido externo/comunitario |
| Candidata local | TA-03E, cableado backend no visual; identificador Linear pendiente |
| Candidata local | TA-03F, packaging atómico Windows; identificador Linear pendiente |
| Siguiente tras validación | TA-04, progreso/distancia y mapa con evidencia |
| Implementación posterior | TA-05+ según `research/telemetry-analysis/plan-microcuts.md` |

## Siguiente acción exacta

Revisar TA-03E/TA-03F y ejecutar los gates manuales de packaging antes de una
promoción autorizada a Nightly/Pro Plus. Después continuar TA-04 para caracterizar
progreso/distancia y mapa con evidencia real. ISA-164 / TA-03D no bloquea la
lectura LMU local, pero sí cualquier import externo o comunitario. TA-05 publica
la proyección histórica para Strategy sin exponer DuckDB o el almacenamiento.

## Última actualización

2026-08-11, TA-03F candidata local tras reviews de especificación y calidad: runtime TA-03C confiado integrado sin UI en
portable e installer bajo `runtime/telemetry/duckdb-v1`. Build reproducible,
manifest/hashes, smoke Windows x64, tests fail-closed, ZIP real, NSIS real en
scope user/machine y verify local PASS. Upgrade/rollback persiste estados
pending/committed, cubre estados previos parciales y no restaura backups tras
commit; un harness conductual prueba interrupciones, cleanup fallido y reentrada.
El segundo endurecimiento publica y restaura el exe mediante staging+rename sólo
con el runtime ya consistente, y prueba cortes intra-rollback.
El build CGO real pasa con paths temporales con espacios. Updater conserva su
protocolo y consume el installer.
Pendientes instalación/upgrade/rollback/uninstall reales en Windows 11 y el
gate Windows 10 si aplica. Sin push, PR, CI remoto, merge, promoción o release.

2026-08-23, ISA-816 implementada en rama propia: el contexto predecesor de una
pagina de eventos se lee por separado sin superar 16.384 filas por peticion, y
una regresion contra el adapter real cubre 16.385 eventos. Commit de producto
`3e88d21b`; pendiente review, sin PR ni promocion. Analysis, integracion real
y vet focal pasan; el vet exacto conserva tres avisos `unsafe.Pointer` previos
y ajenos.

Historial previo:

2026-08-23, ISA-809 / ISA-694 F5-e implementada en rama propia: el etiquetado
de incidentes valida ambos limites del indice de vuelta y queda cubierto antes
de la primera vuelta y despues de la ultima. Barrido completo de `sort.Search`
y gates Analysis+Strategy PASS; pendiente corpus real y review, sin PR ni
promocion.

2026-08-21, ISA-744 / ISA-694 F3-a5 implementada en rama propia: pit degradado,
`ObservedStrategy v1`, agregación multi-sesión y productor final
`StrategyInputProjection v2`; pendiente review, sin PR ni promoción. Evidencia:
`docs/strategy-planner/isa-744-pit-observed-producer.md`.

2026-08-02, ISA-168 / TA-03C cerrada técnicamente sobre ISA-135. Helper Windows x64
fuera de proceso, módulo DuckDB separado, staging DACL privado, manifest
confiado, Job Object, protocolo tipado sin SQL y bundle reproducible. Parser
end-to-end real, cancel/retry/close por PID y benchmark de 50 páginas PASS
(mediana 27,154 ms/página bajo CPU 93–100 %, 0,5995× frente a TA-03B). Root
Wails conserva `CGO_ENABLED=0` y cero dependencia DuckDB. Review independiente
`APPROVE`, cero P0/P1/P2/P3 razonables. Evidencia completa:
`research/telemetry-analysis/ta03c-duckdb-adapter-evidence.md`. Entrega en
review, sin promoción. Historial TA-03B:

2026-08-01, ISA-135 / TA-03B corregida tras `REQUEST CHANGES`. Recomendación:
helper local corto fuera de proceso, `duckdb-go/v2` + DLL oficial dinámica, app
principal sin CGO, staging desde capability TA-02 y protocolo sin SQL. El spike
ahora prueba cancelación coordinada y revalida cada binario extraído; el SBOM
SPDX exacto cierra la compatibilidad comercial de 37 componentes. Job Object no
es sandbox: la v1 solo acepta LMU local y ISA-164 bloquea contenido externo.
Evidencia fresca: spike de 50 páginas PASS; test y vet focales con enlace
dinámico PASS; cancelación repetida 5/5; extracción manipulada rechazada por
hash; dos SBOM limpios idénticos; suite Go global PASS en 231,4 s;
`git diff --check` PASS. La primera ejecución global agotó el límite externo de
cuatro minutos sin emitir fallo y no se contó; la repetición acotada terminó
correctamente.
La re-review focal posterior dejó un único P2: la allowlist Go solo comprobaba
presencia. La corrección compara ahora bidireccionalmente el conjunto exacto
`módulo@versión` de `go version -m`, rechaza replacements y tiene regresiones
fail-closed para módulo adicional, esperado ausente y versión distinta. El
generador real volvió a producir dos SBOM idénticos con el mismo SHA; spike de
50 páginas, test/vet focales y tamper de extracción siguen PASS. Pendiente una
última re-review focal de esta corrección. Esa revisión detectó además un P3:
PowerShell aceptaba diferencias solo de mayúsculas. La corrección ordinal usa
comparación case-sensitive para ruta y versión, y añade dos regresiones
fail-closed (`github.com/Google/uuid` y `V1.6.0`). Las cinco regresiones pasan
en PowerShell 7 y Windows PowerShell 5.1; el SBOM real conserva 37 componentes y
el SHA aprobado. Pendiente review independiente de este último delta; ISA-135
no se considera aprobada.
Sin dependencias o código de producto, LMU, datos personales, integración ni
promoción. Pendiente re-review; el gate humano de ADR 0005 viene después.
