# Handoff vivo — Strategy Planner

## Resultado

Un único producto que crea, compara, guarda, ejecuta y adapta planes para
minimizar tiempo total esperado y mostrar riesgos/alternativas. Product A/B/C
son fases históricas.

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Este handoff y la issue de GitHub activa. Linear fue retirado el 2026-08-20;
  las referencias posteriores a Linear se conservan solo como historial.
- `docs/superpowers/specs/2026-07-13-strategy-planner-product-b-design.md` y
  `strategy-base.html` son referencias históricas que deben reauditarse.
- El próximo informe de rescate y plan unificado sustituirán los planes PB.

## Estado

Actualización ISA-831 / consumo por clima (2026-08-24, implementada en rama de issue):

- El contrato TypeScript de `StrategyInputProjection v2` ya conserva y valida
  `byClimateBucket` para Fuel y VE. Su omisión sigue siendo compatible con
  documentos v2 antiguos, pero el consumidor la trata como dato ausente.
- La ficha pide combustible con el mismo bucket de la fila que ya usaba el
  ritmo. Un bucket ausente conserva `missing`, muestra una causa traducida y
  nunca cae a `meanPerLap` ni al dato de otro clima. La función común aplica el
  mismo aislamiento a VE.
- Regresiones de unidad y wiring cubren valor propio, ausencia visible y el
  caso seco `3.538` sin lluvia. Pasan 253 tests focales, typecheck real y build;
  queda pendiente la verificación de Isaac en la app real.

Actualización ISA-830 / ficha y procedencia efectiva (2026-08-24, implementada en rama de issue):

- La ficha de cada piloto renderiza ritmo y consumo desde la misma vista
  efectiva que aporta presencia, procedencia y confianza. Con proyección Spa
  LMGT3 muestra `2:22.004` y `3.54 L/v`, no los manuales persistidos.
- Se corrigieron otros ocho puntos de presentación: seis chips junto a campos
  manuales editables y los dos resúmenes de depósito/boxes. Los campos de
  edición declaran ahora `manual`; los resúmenes, timeline de parada y
  combustible de salida consumen el valor efectivo.
- La regresión enlaza lo visible con los valores `142.004` y `3.538` presentes
  en `planningInputs` del comando `calculate_orbit`. Suite focal, typecheck
  real y build pasan; la prueba Wails/LMU real queda para Isaac tras integrar.

Actualización ISA-825 / cálculo acotado (2026-08-24, implementada en rama de issue):

- La reproducción con los dos modelos autorizados de Spa confirmó que la
  curva `missing` no se recorría. Fuel derivado (3,538 L/vuelta) y VE derivada
  (4,866 %/vuelta) multiplicaban la frontera y `insertNondominated/dominates`
  consumía CPU porque `P95Millis` solo se medía al terminar y las cotas
  declaradas no se aplicaban.
- El subespacio escalar sin beneficio posible por abrir otro stint usa la cota
  de tránsito solo para demostrar el mínimo de stints. Dentro de él enumera sin
  poda longitudes y cantidades discretizadas, con límite de 100.000 nodos y
  retorno a la búsqueda general si lo supera. La paridad aleatorizada de 300
  casos (semilla 825) encontró una divergencia previa en servicio paralelo:
  cargar Fuel adicional puede ser gratis cuando VE domina; ya queda cubierta.
- El evento real termina por este atajo exacto en un candidato, cero
  comparaciones de dominancia, un stint de 18 vueltas y cero paradas; no agota
  presupuesto ni devuelve un plan degradado. El golden largo conserva
  `11+32+32+32+32` y su desempate observable.
- La búsqueda general tiene límites efectivos de candidatos e iteraciones,
  admite `context.Context` y comprueba cancelación dentro de dominancia. Orbit
  comparte un deadline backend de ocho segundos entre variantes y clima; el
  bridge expone `calculation_timeout` antes del timeout de 10 s del cliente.
- `CombinedStintPaceCurve` y `SavingCost` ausentes o vacíos se excluyen con una
  asunción y causa explícitas. No se crean puntos, niveles ni medidas.
- Pendiente: integración y repetición manual del camino ELMS Sprint Trophy /
  Spa (WEC) / LMGT3 / Logitech G Challenge #2:LGC. Sin PR, merge, promoción o
  release.

Actualización ISA-827 / ritmo representativo (2026-08-24, implementada en rama de issue):

- Analysis publica `representativePaceByClimateBucket` en
  `StrategyInputProjection v2`; cada bucket lleva mediana, presencia,
  procedencia, confianza y una causa explícita cuando no es derivable. La
  lectura sigue aceptando documentos v2 anteriores sin el campo, pero todo
  productor nuevo emite los tres buckets.
- El plan y `SolveV2` resuelven `baseLapSeconds` desde el bucket de la variante
  (seco/eco=`dry`, mojado=`wet`) aunque `CombinedStintPaceCurve` esté ausente.
  La curva sigue gobernando solo el coste dentro del stint y un valor
  manual/corregido sigue ganando al derivado. Orbit muestra el chip Derivado
  con muestra/rango o el motivo real
  (`sin vueltas completas`, `sin tiempo fiable`, `sin clima estable` o `sin
  vueltas limpias`) sin aritmética TypeScript.
- Evidencia del defecto en el store real: Spa LMGT3, sesión `e124f80e...`,
  vueltas 2/4/6/7 con 141,55–142,25 s, etiqueta `traffic` e inclusión Fuel/Pace
  verdadera. Un veto posterior y exclusivo de Pace descartaba las cuatro. La
  corrección usa la decisión común de F3-a2; una reparación in-memory permite
  aprovechar modelos `consumption-pace.v1` solo con hechos ya persistidos y no
  modifica el store.
- Verificación real read-only: 336 modelos, 5 sesiones de la combinación, seco
  válido con N=4 y mediana 142,003814697266 s mientras la curva permanece
  missing/0 puntos; hash del fichero sin cambios. El barrido de los 45 buckets
  deja 19 Fuel/Pace válidos, 0 Fuel-válido/Pace-missing y conserva los 26 donde
  ambas familias ya eran no válidas. Analysis+Strategy, vet focal,
  68 tests frontend focales y build pasan. El gate global conserva deuda previa:
  tres avisos `unsafe.Pointer` en vet y una clave i18n huérfana
  `strategy.wizard.fill.autoTip` (2938/2939 tests Vitest verdes), ambas presentes
  en la base. Sin PR, integración, promoción ni release.

Actualización ISA-828 / pantalla Análisis (2026-08-24, implementada en rama de issue):

- Strategy Orbit incorpora una pestaña `Análisis` sin columna de datos
  manuales. Reutiliza `Surface`, `StatRow`/`StatTile`, `HorizontalTimeline`,
  `Chip`, `Note`, `Accordion` y `Button` para ordenar cifras paralelas, carrera,
  multiclase, paradas, tiempos y log de cálculo.
- La UI consume una ampliación aditiva del resultado Go: combustible inicial y
  final, reserva, tiempos, paradas y la decisión D6 exacta de SolverV2. Un modo
  llamado eco no basta para presentarlo como ahorro; `savingApplied` solo se
  activa con stints de ahorro realmente elegidos y su coste entra en el tiempo.
- La ausencia de plan D6, ritmo de las otras clases o desglose legado conserva
  la sección y explica la causa. Cada dato base del log declara procedencia
  derivada, manual o de referencia. La infografía descargable no forma parte de
  este cambio y no se ha empezado.
- Pasan 243 tests Strategy/Orbit, los typechecks solicitado y real, el build y
  el test Go focal. El preview en navegador queda bloqueado antes de Strategy
  por `overlay-frame-v2:invalid-contract:disposed` al ejecutar sin Wails; no se
  presenta como prueba de runtime real.

Actualización ISA-824 / entrada asistida (2026-08-24, implementada en rama de issue):

- La puerta `Automática con telemetría` consulta el catálogo real y solo se
  abre con combinaciones que tengan vueltas clasificadas por clima. Explica por
  separado cero sesiones importadas, catálogo no disponible y ausencia de una
  combinación utilizable; ya no existe el falso bloqueo de ADR 0005.
- El bloque inferior lista las carreras LMU por el bridge Calendar existente.
  La identidad de series declara en Go las diez correspondencias de sede y las
  cinco de clase; esas identidades viajan en el mismo payload y un calendario
  publicado no puede sustituirlas. Los valores no declarados se muestran por
  su nombre y conducen a la vía manual.
- El orden es carrera, clase cuando sea multiclase y coche. Si la sede y clase
  seleccionadas tienen varios trazados grabados, aparece antes una elección con
  sus recuentos reales; con uno solo se omite. El trazado nunca se infiere del
  sufijo del calendario. El coche desemboca en el selector F5-a existente, que
  persiste sesiones, refresca `StrategyInputProjection v2` y alimenta Orbit sin
  pedir números ni duplicar la proyección.
- Tests cubren carrera monoclase, multiclase, trazado ambiguo, falta de sesiones,
  catálogo caído e identidades desconocidas. En el corpus local, la identidad
  cubre 10/10 sedes y 5/5 clases; 7/10 sedes tienen sesiones coincidentes y
  5/11 series ofrecen coches con clima clasificado. Los gates pedidos,
  typecheck real, build y `go test ./...` pasan. El lint global conserva 35
  incidencias heredadas (32 errores y 3 warnings), anteriores al bloque nuevo.
  Sin PR, integración, promoción ni release.

Actualización ISA-815 / F5-e (2026-08-23, implementada en rama de issue):

- `LMUImporter` ya no convierte fallos de validez o clasificación en éxito: la
  omisión conserva el error real y nunca llega al store como importada.
- El store rechaza nuevas entradas sin validez o clasificación catalogable,
  pero al abrir mantiene los registros legados para que el catálogo pueda
  aislarlos. La consulta devuelve las combinaciones sanas y una lista separada
  de exclusiones con sesión y causa, sin inventar una combinación incompleta.
- Tests cubren análisis y clasificación, no persistencia, reporte de la omisión
  y reapertura con dos sesiones buenas más una legada defectuosa. La suite
  Analysis+Strategy y el `vet` focal pasan; build global y `vet ./cmd/...`
  quedan bloqueados por el `frontend/dist` ausente, y `vet ./internal/...`
  conserva tres avisos `unsafe.Pointer` previos y ajenos. Entrega local
  committeada; sin PR, integración, promoción ni release.

Actualización ISA-818 / F5-e (2026-08-23, implementada en rama de issue):

- Cancelar la app durante los cuatro imports activos ya no persiste esas
  sesiones como fallidas ni cierra el cold start; el lote queda pendiente y se
  reanuda en el siguiente arranque.
- Reintentar omitidas es ahora una operación explícita de la aplicación y del
  cliente TS. El banner solo la ofrece cuando hay omisiones, limpia sus fallos
  y vuelve a encolarlas antes de continuar la importación.
- Un fallo real sigue persistiendo su locator y motivo. Hay regresiones para
  cancelación/reanudación, reintento y fallo real. Strategy+Analysis, race,
  suite Go completa, 385 archivos/2924 tests frontend, typecheck y build pasan;
  vet focal pasa y el vet global conserva tres avisos `unsafe.Pointer`
  heredados en archivos Launcher/LMU sin cambios. Sin PR, integración,
  promoción ni release.

Actualización ISA-813 / F5-e (2026-08-23, implementada en rama de issue):

- Las familias de validez, consumo/ritmo, curvas y pit declaran sus canales y
  el importador lee su unión de 17, no los 98 disponibles. Validez declara
  además los cuatro relojes de 1 Hz que preservan el borde de cobertura. Un
  guard AST impide que una familia acceda a un canal sin declararlo.
- Las sesiones se importan con 1-4 helpers y 4 por defecto. La persistencia
  sigue ordenada y secuencial; omisiones, reintento y progreso de ISA-810 se
  conservan con errores y `panic` cubiertos por tests.
- En el corpus real, el baseline de #813 era 13m40s/337. La corrida final con
  el runtime firmado es 1m41,090s, 337/337 y cero omisiones; otra corrida con
  cuatro quedó en 2m20,668s. El pico final fue 950.247.424 bytes en Go más
  134.971.392 en cuatro helpers. Con tres fueron 2m52,766s y unos 82 MB menos
  en total: se eligieron cuatro por el margen.
- 65.536 filas por página no son compatibles con el helper firmado; se mantiene
  16.384. Analysis+Strategy pasan. El gate Go global solo falla por la ausencia
  previa de `frontend/dist` para los paquetes embed. Lista para review; sin PR,
  integración, promoción ni release.

Actualización ISA-810 / F5-e (2026-08-23, implementada en rama de issue):

- El banner permanece visible si falla la consulta de estado, explica el fallo
  y deja reintentar. Durante el descubrimiento en segundo plano declara que
  sigue buscando y no presenta cero sesiones como resultado provisional.
- La importación secuencial conserva progreso por sesión y usa un timeout
  específico de 30 minutos por archivo, independiente de los 10 segundos del
  resto de comandos Strategy.
- Error, fallo del store o `panic` de una sesión se registra con motivo y no
  aborta las siguientes. El estado local recuerda importadas y omitidas; el
  resumen permite reintentar explícitamente solo las omitidas.
- #809 sigue siendo la autoridad del defecto de validez: esta rama no toca
  `internal/telemetryanalysis/lapvalidity.go`; la recuperación defensiva vive
  en el servicio de arranque en frío. Strategy+app, 385 archivos/2923 tests
  frontend, typecheck, build y visual Orbit quedan verdes. Pendiente: push,
  review y prueba real del corpus de 337 sesiones. Sin PR o promoción.

Actualización ISA-796 / F5-e (2026-08-22, implementada en rama de issue):

- El consumidor único acepta el fixture firmado TEST sin abrir red por
  defecto. Firma inválida, época desconocida, rollback, vencimiento duro y
  schema incompatible degradan a caché todavía válida o a vacío con aviso;
  nunca generan referencia inventada.
- Orbit muestra perfiles y estrategias en `Referencia`, ambos con etiqueta
  `referencia` y `k>=3`. Al usarlos crea inputs o variantes del documento v2
  con procedencia `reference` visible.
- El banner de primer arranque descubre los DuckDB estables de la ruta LMU,
  importa uno por comando con progreso a un store autorizado que alimenta
  F5-a, o conserva el rechazo. No reaparece tras aceptar/rechazar.
- Hay copy en ES/EN/IT/PT y evidencia automática de degradación, procedencia,
  progreso, persistencia, discovery y UI. La captura dedicada demuestra la
  sección separada sin romper el gate de scroll de Orbit.
- Lista para review en la rama de issue; sin PR, integración, promoción,
  primera publicación ni release.

Actualización ISA-794 / F5-d (2026-08-22, implementada en rama de issue):

- La query `get_validated_examples` resuelve la combinación del evento y
  reproduce cada carrera autorizada con `internal/strategy/backtest`; Strategy
  no abre DuckDB ni duplica sus métricas.
- La salida neutral incluye error total y por stint, agregado y un resumen de
  `ObservedStrategy`. Los resultados se ordenan del más reciente al más
  antiguo y una combinación sin carreras conserva una lista vacía explícita.
- Orbit presenta fecha relativa, estrategia corrida, predicho, real y
  desviación en ES/EN/IT/PT. No presenta aprobado/suspenso mientras #702 siga
  fijando los umbrales definitivos y no usa datos simulados.
- Gates locales verdes: Strategy+app, 382 archivos/2916 tests frontend,
  typecheck, build y visual Orbit. La captura dedicada justifica la nueva
  evidencia predicho/real/desviación sin semáforo provisional. La entrega
  queda lista para review en la rama de issue; sin PR, integración, promoción
  ni release.

Actualización ISA-786 / F5-c (2026-08-22, implementada en rama de issue):

- El evento canónico guarda hasta 16 escenarios ponderados como
  `WeatherScenario v1`, cada uno con sus cinco nodos manuales de lluvia,
  cielo y temperaturas. Cambiar de combinación vuelve a vincular esos
  escenarios para no dejar un documento inválido.
- Orbit presenta el editor y el plan de cada escenario con la condición
  aplicada por vuelta. La recomendación robusta destaca minimax regret,
  regret máximo y pérdida esperada ponderada; `SolveWeatherScenarios` sigue
  siendo la única autoridad del cálculo.
- Sin escenarios se declara seco manual. La captura LMU permanece
  deshabilitada con copy honesto hasta su validación y no hay datos simulados;
  el overlay ingame sigue fuera de alcance.
- Evidencia final verde: `go test ./internal/strategy/... ./internal/app
  -count=1`, 382 archivos/2913 tests frontend, typecheck, build y
  `visual:orbit-strategy`. La captura nueva del panel justifica el vacío seco
  manual y la futura captura LMU deshabilitada, sin forecast simulado. Sin PR,
  integración, promoción ni release.

Actualización ISA-771 / F5-b2 (2026-08-22, lista para review):

- Los escalares del input F4 llevan valor, procedencia, confianza y rol. Un
  override de usuario gana a la familia derivada; sin override, la derivada
  válida gana al fallback manual/reference. El resultado expone la fuente
  efectiva y los tests cubren Fuel, vida, degradación, pit y ahorro.
- Orbit llama a `SolveV2` y mantiene el ViewModel existente. El golden de 139
  vueltas usa cinco stints `11+32+32+32+32`, cuatro paradas y 14.712 s.
- El gate numérico compara ambos repartos con `ReplayDecisionV2`: sus totales
  difieren solo 12,733 ps y empatan bajo tolerancia relativa `1e-12`. Ranking y
  dominancia usan el mismo orden: menos paradas, vueltas de parada, cantidades
  Fuel/VE e identidad JSON del plan. El golden sigue `11+32+32+32+32` porque,
  a cuatro paradas, la primera vuelta canónica es 11 frente a 28; Go y testdata
  frontend siguen idénticos. El test invierte tanto el ruido de acumulación
  como el orden de inserción y conserva ganador. Con peso real configurado, el
  contrafactual anterior conserva 484 s a favor del elegido.
- Se retiró el evento Wails productivo del solver v1. El código v1 queda para
  tests/paridad histórica, sin consumidores productivos externos.
- Gates locales verdes: solver x100, Strategy+app, frontend (381 archivos /
  2.907 tests), typecheck, build, visual Orbit y compilación de `cmd/vantare`.
- Sin PR, integración, promoción o release; falta review.

Actualización ISA-774 / F6-e (2026-08-22, lista para review):

- El runner PowerShell deja por fecha resumen, informe allowlisted, plantilla
  cerrada y log; después de la decisión de Isaac valida la selección y llama al
  builder sin firma. El dry-run sintético cubre el mismo camino local sin red.
- El LLM solo recibe Markdown de producción con `k>=3`, métricas agregadas y el
  ranking ya calculado. No recibe bundles, JSON técnico, digests, identidades,
  texto de terceros ni herramientas.
- Isaac marca perfiles y rangos visibles. La validación liga la decisión al
  digest exacto del resumen, resuelve los digests técnicos y produce el
  contrato `vantare.catalog.selection.v1` consumido por F6-f.
- Prompt y runbook conservan pendientes los gates del Worker, firma offline y
  primera publicación. Sin PR, integración, promoción ni release; falta review
  de #774.

Actualización ISA-766 / F6-a (2026-08-22, lista para review):

- El exportador construye `CurationBundle v1` desde
  `StrategyInputProjectionV2` y `ObservedStrategyV1`: allowlist cerrada,
  semana ISO, sin sesión, hora exacta, texto libre ni telemetría cruda. El
  sobre administrativo viaja separado del payload analítico.
- El consentimiento guarda versión y timestamp; el primer opt-in genera
  `uploadSecret` y `deleteSecret` distintos en el almacén protegido de Windows.
  La cola JSON atómica sobrevive al reinicio sin contener esos secretos.
- Pausar cancela el envío/reintento que aún no fue aceptado y deja esos items
  pausados; un recibo ya aceptado queda enviado en el historial. Reanudar no
  implica consentir de nuevo. Revocar y pedir borrado remoto son independientes.
- Ajustes > Privacidad muestra el bundle exacto, cola e historial y explica
  explícitamente que los datos son seudónimos, no anónimos. Cliente y pruebas
  hablan el protocolo F6-b solo contra `httptest`; la URL de producción y el
  token de admisión permanecen vacíos, así que no hay envío real por defecto.
- Gates de Strategy/app/cmd y frontend (2.904 tests, typecheck, build e i18n)
  verdes. El barrido Go global tuvo un único timeout no reproducible en SQLite;
  todos los paquetes tocados pasan. Sin PR, integración, promoción ni release;
  falta review de #766.

Actualización ISA-765 / F5-b (2026-08-22, bloqueada antes de review):

- La query de aplicación pide a Analysis una `StrategyInputProjection v2`
  sobre el conjunto exacto de sesiones incluidas por F5-a. Strategy consume el
  puerto público y no toma ownership de modelos históricos ni de DuckDB.
- `StrategyDocumentV2` conserva proyección y overrides juntos. Revertir borra
  solo el override y deja intacto el derivado.
- Orbit presenta nueve datos numéricos con chips Derivado/Manual/Referencia/
  Falta. El tooltip derivado incluye N y rango; Falta explica el motivo. El
  modo sin combinación sigue siendo manual puro y los cuatro idiomas están
  completos.
- Gates de lo implementado verdes: Go focal de Analysis/Strategy, suite frontend completa,
  typecheck, build y `visual:orbit-strategy`. La captura de procedencias queda
  en la evidencia de Orbit.
- Bloqueo de aceptación: Orbit sigue usando `solver.Solve` v1. En F4,
  `SolverInputV2` acepta la proyección con sus tres ejes, pero ritmo base,
  capacidades, pit, vida, Fuel/VE y degradación manuales son escalares sin
  procedencia, y una proyección válida gana al fallback. No existe una forma
  contractual de transportar un override por campo tal cual. Resolverlo exige
  ampliar F4 (y sus fuentes de resultado) o mutar/fabricar una proyección; no
  se hizo ninguna de las dos sin nueva decisión. #765 continúa in-progress,
  sin PR, integración, promoción ni release.

Actualización ISA-758 / F5-a (2026-08-22, lista para review):

- Analysis publica combinaciones y sesiones desde modelos históricos ya
  autorizados usando la clasificación/agrupación existente; Strategy solo
  adapta esa salida y nunca abre DuckDB. Sin fuente autorizada responde con un
  vacío honesto hasta que F5-e conecte la importación inicial.
- Orbit pregunta opcionalmente la combinación al crear o abrir un evento. Se
  puede saltar para seguir en manual puro; el panel Sesiones muestra el motivo
  de inclusión/exclusión y permite cambiarlo sin borrar datos.
- Combinación y toggles se persisten en el documento canónico v2 mediante una
  migración aditiva compatible. Binding, cliente estricto, cuatro idiomas y
  estados vacíos están cubiertos por pruebas, build y captura visual.
- Gates verdes: `go test ./internal/... ./cmd/vantare`, 2.898 pruebas frontend,
  typecheck, build y `visual:orbit-strategy`. Sin banner F5-e, dependencia,
  PR, integración, promoción ni release; falta review de #758.

Actualización ISA-757 / F6-c (2026-08-21, lista para review):

- El nuevo `cmd/vantare-curator` convierte los tres árboles de procedencia en
  un resumen compacto sin mezclar entornos. Valida fail-closed, registra cada
  rechazo con código estable y deduplica por digest del payload normalizado.
- Cada combinación agrega Fuel, Virtual Energy, pits y calidad; pace queda
  explícitamente ausente porque `CurationBundle v1` no lo transporta. Los
  clusters admiten paradas a ±1 vuelta con igual forma/compuestos.
- La cohorte cuenta credenciales administrativas estables distintas y exige
  `k=3`; combinación, perfil y estrategia bajo k quedan no publicables con
  motivo. Ningún hash o identificador administrativo sale en el resumen.
- El score usa `backtest.RunRace`, publica versión/hash F4-9 y declara la
  normalización necesaria por falta de ritmo. El golden end-to-end fija los
  bytes y cubre dedupe, clustering, separación y k.
- El gate de #757 sobre CLI+`internal`, vet focal, gofmt y diff-check pasa.
  Sin frontend, dependencia, Worker, PR, merge, promoción ni release; falta
  review del orquestador.

Actualización ISA-755 / F4-9 (2026-08-21, lista para review):

- El paquete nuevo `internal/strategy/backtest` separa los tres gates del spec:
  calibración de la estrategia corrida, factibilidad de la recomendada contra
  datos realizados y ranking por signo más regret interno cero.
- El solver expone replay determinista de una decisión fija y el contrato
  `ObservedStrategy v1` conserva tiempo observado por stint. El backtest no
  usa la carrera observada como verdad de un contrafactual.
- El holdout se corta por combinación+fecha, falla ante leakage o N bajo y
  devuelve resultados por carrera/agregados con intervalos. `<2 %` y paradas
  secas exactas siguen marcados provisionales hasta #702.
- Fixtures versionadas S026/S125/S266/S287 y el flujo
  derivadas→plan→replay→métricas pasan junto con Strategy+Analysis, vet, gofmt
  y diff-check. Sin frontend, dependencias, PR, merge, promoción ni release.
  F4 queda técnicamente completa en esta rama; falta review/aceptación.

Actualizacion ISA-753 / F4-8 (2026-08-21, lista para review):

- Cada candidato de `SolveV2` conserva esperado, caso malo coherente,
  factibilidad y riesgos duros Fuel/VE/neumatico. La poda considera tambien el
  estado pesimista para no perder una alternativa con margen.
- Rapida, equilibrada y conservadora salen de la misma busqueda y ranking; la
  rapida no limita el caso malo y las otras toleran como maximo 5/2 %. La rapida puede avisar de riesgo duro; las
  otras dos lo excluyen. Rangos estrechos convergen en el mismo plan.
- El presupuesto p95 ya es efectivo: limita niveles de servicio y degrada el
  paso por potencias de dos de forma determinista, visible y repetible. El
  resultado consolida consumo y rain chance con las sensibilidades previas.
- Casos de negocio Fuel y vida de neumatico verdes. Gates solver x100,
  Strategy+app, golden Orbit, vet, gofmt y diff-check pasan. El gate Go global
  solo falla setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente; el
  resto pasa. Sin frontend, dependencias, PR, merge, promocion ni release.
  Siguiente: push y review del orquestador de #753.

Actualización ISA-752 / F4-7 (2026-08-21, lista para review):

- Los cinco nodos de `WeatherScenario v1` se convierten en timeline por vuelta
  mediante interpolación lineal. Los umbrales default 20/60 separan
  seco/húmedo/mojado y la salida expone sensibilidad wet a -5/+5 puntos.
- Cada vuelta selecciona `delta_clima`, consumo por bucket de Analysis o
  fallback manual/reference y parámetros/curva de compuesto. Los cruces dentro
  de un stint cambian de condición sin fabricar una frontera de stint.
- Compuestos dry/wet usan el inventario físico F4-5. Las reglas opcionales por
  bucket fuerzan una parada antes de una condición incompatible y conservan
  ventanas, servicio, edad e identidades.
- Se entrega óptimo por escenario y recomendación `minimax_regret`; la pérdida
  esperada ponderada desempata y ambas métricas se publican con replay por
  escenario. NODE_50 monta wets justo antes de la primera vuelta mojada y la
  robusta supera al plan seco cuando la lluvia se adelanta.
- Oráculo exhaustivo por escenario, caso seco degenerado, fail-closed y gates
  solver x100, Strategy+app, vet, gofmt y diff-check verdes. Sin frontend,
  dependencia, PR, merge, promoción ni release. Siguiente gate: review del
  orquestador de #752.

Actualización ISA-751 / F4-6 (2026-08-21, lista para review):

- `SolveV2` elige piloto por stint. Cada piloto usa `PilotProfile v1` o cifras
  manual/reference con procedencia; su ritmo y consumo participan en la
  autonomía, servicio, peso Fuel y tiempo total común de F4-1..5.
- Disponibilidad por vueltas y máximos de conducción continuo/total son duros
  y explicados. El continuo no se reinicia si el mismo piloto sigue tras el
  pit; sí al relevarlo. Min/max de vueltas también quedan ejecutados.
- El caso canónico usa al rápido en stints 3/3 alrededor de una ventana de 2
  vueltas del lento y prueba el coste frente al óptimo de ritmo puro. El
  oráculo amplía el espacio sin poda, conserva paridad y demuestra poda
  efectiva; la salida preserva procedencia y sensibilidad de ritmo por piloto.
- Gates verdes: solver x100, Strategy+app, golden Orbit, vet focal, gofmt y
  diff-check. Sin frontend, dependencia, PR, merge, promoción ni release.
  Siguiente gate: review del orquestador de #751.

Actualización ISA-750 / F4-5 (2026-08-21, lista para review):

- `SolveV2` elige compuesto y juego físico por stint contra el inventario
  canónico de `internal/strategy/tyres`. Los parámetros de curva/delta son
  exclusivamente manual/reference con procedencia mientras D19 no tenga
  mapping semántico real.
- Cambiar o conservar neumáticos forma parte del candidato: conservar mantiene
  identidades y edad y no paga servicio; cambiar exige otro juego compatible y
  usa el coste paralelo/secuencial de F4-1. Remontar un juego usado no restaura
  su vida.
- Ventanas obligatorias, min/max de paradas y compuestos requeridos son
  restricciones duras explicadas. El caso canónico demuestra cuándo gana el
  doble stint duro y cuándo compensa pagar blandos.
- El oráculo exhaustivo incorpora compuestos, juegos y ventanas en tamaños
  pequeños. La poda conserva estado físico/reglas, publica `prunedStates` y la
  sensibilidad expone el impacto de +0,20 s/vuelta por compuesto elegido.
- Gates verdes: solver+tyres x100, Strategy+app, golden Orbit, vet focal,
  gofmt y diff-check. El gate Go global pasa todos los paquetes compilables y
  solo falla el setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente;
  tampoco hay `frontend/node_modules` para regenerarlo. Sin frontend,
  dependencias, PR, merge, promoción ni release. Pendiente: commit documental,
  push y review del orquestador de #750.

Actualización ISA-749 / F4-4 (2026-08-21, lista para review):

- `SolveV2` incorpora el nivel de ahorro Fuel/VE como decisión de cada stint;
  el consumo efectivo cambia autonomía, servicios y peso, y el coste de ritmo
  queda separado en la evaluación.
- Acepta una sola fuente manual/reference o la familia A/B válida de Analysis,
  conserva procedencia/confianza y publica un plan explícito por stint con
  totales y sensibilidad del 20 %.
- D6 prueba ambos lados de la decisión: ahorro barato elimina la parada corta
  y ahorro caro la conserva. El oráculo exhaustivo comparte la dimensión sin
  poda y cubre Fuel, VE, dos niveles y peso activo en carreras pequeñas.
- Gates verdes: solver x100, Strategy+app, Telemetry Analysis, golden Orbit,
  vet focal, gofmt y diff-check. El gate global pasa todo lo compilable y solo
  falla el setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente; no hay
  `frontend/node_modules` para regenerarlo. Sin frontend, dependencias, PR,
  merge, promoción ni release. Pendiente: push y review del orquestador de
  #749.

Actualización ISA-747 / F4-3 (2026-08-21, lista para review):

- `SolveV2` suma por vuelta `litros al inicio * segundos/L` al ritmo base y a
  la curva de stint. El nivel parte de la capacidad, resta consumo tras cada
  vuelta y añade solo los repostajes elegidos por el candidato.
- El coeficiente acepta `manual` o `reference` con presencia, procedencia y
  confianza. Solo acepta `derived` desde la curva que Analysis materializa
  tras `identifiability=separable`; dos autoridades fallan cerradas. El
  resultado conserva la fuente, la declara en asunciones y expone coste y
  sensibilidad del 20 %.
- La poda exige el mismo fuel cuando el peso está activo y el oráculo exhaustivo
  usa el mismo término. El test de negocio cambia el óptimo de una parada
  llenando a dos repostajes splash.
- Gates verdes: solver x100, Strategy+app, Telemetry Analysis, golden Orbit,
  vet focal, gofmt y diff-check. Golden Orbit invariante; no se tocó frontend.
  Sin dependencia, PR, merge, promoción ni release. Pendiente: review del
  orquestador de #747.

Actualización ISA-746 / F4-2 (2026-08-21, lista para review):

- `SolveV2` usa la curva combinada `valid/combined_only` producida por Analysis
  como coste por edad de vuelta y conserva procedencia/confianza en el
  resultado. La pendiente manual sigue siendo el caso lineal y queda marcada
  como `manual`.
- Interpola linealmente entre puntos y extrapola el tail con la mayor pendiente
  entre el último tramo no negativo y rango/sqrt(N). La sensibilidad del 20 %
  perturba todos los puntos y el rango; el oráculo exhaustivo evalúa el mismo
  modelo por tramos.
- El caso canónico de cliff tardío cambia el óptimo desde cero paradas con la
  aproximación lineal a una parada en vuelta 4. Los costes acumulados mantienen
  O(1) por stint.
- Gates verdes: solver x100, Strategy+app, golden Orbit, vet focal, gofmt y
  diff-check. La suite Go global pasa todo lo compilable y solo falla el setup
  de `frontend`/`cmd/vantare` por `frontend/dist` ausente; tampoco existe
  `frontend/node_modules` para regenerarlo en este worktree. Sin frontend,
  dependencia, PR, merge, promoción ni release. Siguiente: push y review del
  orquestador de #746.

Actualización ISA-745 / F4-1 (2026-08-21, lista para review):

- `SolveV2` deja ejecutable el primer corte del vector F1.3: posiciones de pit
  arbitrarias y cantidades Fuel/VE discretizadas, con coste por tránsito,
  repostaje, recarga VE y neumáticos en modo paralelo/secuencial delegado al
  modelo `manual` existente.
- La poda por dominancia conserva el óptimo y se compara con enumeración total
  del mismo espacio pequeño. Hay ranking estable, desglose por parada, binding,
  min/max de paradas y candidatos inviables explicados. La discretización y
  los dos fallos corregidos del contrato compile-only están documentados en
  `f1-3-contrato-solver.md`.
- Gates locales: solver+manual x100, Strategy+app, golden Orbit, vet focal,
  gofmt y diff-check verdes. El golden permanece en 139 vueltas,
  28/28/28/28/27, cuatro paradas y 14.712 s; Orbit aún consume el solver v1
  escalar porque no dispone de inputs de servicios y no se inventaron.
- Commits de producto/prueba: `429649da`, `26a1db11`, `fa37dbe8` y
  `632903e0`. Sin cambio
  frontend, dependencia, PR, merge, promoción ni release. Siguiente: review
  del orquestador de #745; después F4-2, no antes.

Actualización ISA-735 / F2(e) (2026-08-21, lista para review):

- Orbit guarda el plan visible como revisión inmutable del lifecycle canónico
  y enseña su identidad; activación y exportación usan exactamente esa
  referencia. El `ActivePlan` mostrado procede del backend, mientras que
  seleccionar una tarjeta se etiqueta honestamente como selección local.
- Los fallos de guardado, activación y apertura muestran mensaje, código y
  campo tipados. Las respuestas obsoletas se descartan. Exportar una revisión
  concreta atraviesa application/packaging y su import/re-export es idéntico.
- El mock Wails persiste draft, revisiones y activación; una recreación del
  cliente/runtime demuestra que sobreviven a la recarga. Las caracterizaciones
  de los tres flujos silenciosos se invirtieron con pruebas de comportamiento.
- Gates: Go Strategy+app, frontend 377/2.896, typecheck, build, ESLint focal,
  diff-check y visual Orbit verdes. Se actualizaron 12 capturas porque la
  cabecera y las tarjetas muestran los nuevos verbos; no cambió CSS ni se
  añadieron dependencias.
- Commits `946c341e`, `b8f577c7`, `706039d7` y `de2f04fb`. Sin PR, merge,
  promoción o release. Siguiente acción: review del orquestador de #735;
  después F2(f).

Actualización ISA-734 / F2(d) (2026-08-21, lista para review):

- Orbit ya no calcula planes en TypeScript: la página pide todas las variantes
  a `strategy:application:calculate_orbit`, que compone el cálculo manual y el
  solver Go existentes. El frontend se limita a validar el wire y formar los
  ViewModels de presentación.
- El ciclo asíncrono muestra carga, oculta cifras antiguas, descarta respuestas
  obsoletas y expone el error tipado con código/campo y reintento. Referencias a
  pilotos inexistentes fallan como `calculation_invalid`, sin fallback.
- El golden compartido entre Go y el test de página demuestra 139 vueltas,
  cinco stints 28/28/28/28/27 y 4:05:12 desde el motor real. La caracterización
  de cálculo/piloto colgante queda invertida; persistencia, activación y export
  siguen en F2(e), y la eliminación de datos sintéticos en F2(f).
- Gates: Go Strategy+app, frontend 375/2.888, typecheck, build, diff-check y
  visual Orbit verdes. El harness visual espera el recálculo asíncrono; no hay
  cambios CSS ni capturas nuevas. Sin dependencia, PR, merge o promoción.
- Commits de producto/prueba: `bddccd4c`, `0ae806eb`, `d90c7f13` y
  `32ab7b69`. Siguiente acción: review del orquestador de #734; después F2(e).

Actualización ISA-732 / F2(c) (2026-08-21, lista para review):

- El motor Go importa las dos claves localStorage mediante un journal durable
  de dos commits: backup raw antes de parsear y publicación canónica después
  de confirmar el fingerprint. Los siete fixtures golden atraviesan el flujo
  completo; una property de 32 casos prueba `dos veces = una`, y el crash
  simulado entre commits se recupera sin duplicar.
- Las 28 filas de la matriz tienen política explícita y comprobada. Corruptos,
  colisiones, shapes parciales y referencias colgantes se conservan en
  cuarentena; defaults sintéticos llevan `legacy_synthetic_default` y nunca se
  materializa `startAt=now`. Documento detallado:
  `docs/strategy-planner/isa-732-migracion-localstorage.md`.
- Rollback restaura el snapshot canónico anterior y archiva el documento
  posterior. No toca el lifecycle v1. Orbit aporta diálogo accesible de
  preview/confirmación/resultado/rollback; tras éxito el store legacy queda
  read-only, pero la página sigue leyéndolo hasta F2(d).
- Gates: Go Strategy+app, frontend 375/2.899, typecheck, build y diff-check
  verdes. Sin dependencia nueva. El smoke visual browser no es evidencia
  Wails: la app completa fuera de Wails activó un error runtime preexistente y
  T3 Preview no devolvió snapshot. El localStorage real de Isaac se reserva al
  gate F2.
- Sin PR, merge, promoción ni release. Siguiente acción: review del
  orquestador de #732; después continúa F2(d), no antes.

Actualización ISA-730 / F2(b) (2026-08-21, lista para review):

- `internal/app.StrategyApplicationBridge` posee el binding Wails
  `strategy:application:*`; el composition root solo lo registra. La capa
  prueba encode/decode, correlación, sanitización y propagación de errores
  tipados, incluidos `event_*`, `driver_*` y `variant_*`.
- `strategy-orbit-bridge` es la fachada de Orbit sobre el cliente TS fino. La
  unión cubre las 23 operaciones de la API de aplicación existente y decodifica
  el documento v2 ampliado, listas, comparación, lifecycle y activaciones.
  Los errores llegan con código, campo y mensaje y las respuestas mal formadas
  se rechazan; no hay cálculo ni decisiones de dominio en TS.
- Cero cambios en `StrategyOrbitPage` y stores. Commits `31dd0709` y
  `9487fad8`. Go focal, vet, frontend 374/2.894, typecheck, build y ESLint focal
  verdes. Sin dependencia nueva.
- No hay smoke de aplicación Wails viva en F2(b): las pruebas demuestran las
  dos fronteras aisladas, no una sesión instalada. Siguiente acción: review del
  orquestador de #730; después continúa F2(c), no el cutover de UI F2(d-f).

Actualización ISA-729 / F2(a) (2026-08-21, lista para review):

- El repositorio canónico evoluciona a `strategy.repository.v2` y custodia un
  único `StrategyDocumentV2` junto al lifecycle v1 existente. La migración
  valida el hash v1 antes de conservar drafts, revisiones, activaciones y plan
  activo; el documento soporta eventos, pilotos/orden/disponibilidad,
  variantes, inventario y `legacy_synthetic_default`. `RawLegacy` usa
  bytes/base64 para conservar el backup exacto sin compactarlo.
- La fachada de aplicación y el bridge JSON ofrecen `create/edit/list` de
  eventos, pilotos y variantes, `delete_driver` y `compare_variants`, con
  generación optimista, validación estricta y errores tipados visibles.
- Política de borrado: sanea availability/órdenes y renumera; si una variante
  quedaría vacía, `driver_in_use` aborta toda la transacción. Property test de
  64 casos y regresión de lifecycle ampliado verdes.
- Entrega en commits convencionales pequeños. Gates Strategy y vet focal
  completos PASS. Sin frontend, Wails, solver, telemetría, PR, integración,
  promoción ni release.
- El `go test -count=1 ./...` adicional no fue gate verde: faltaba el artefacto
  ignorado `frontend/dist` para `go:embed` y falló el test temporal ajeno de
  SQLite recording; los paquetes Strategy pasaron dentro de esa misma corrida
  y la repetición focal aislada del test SQLite pasó.
- Siguiente acción: review del orquestador de #729; F2(b) solo después de
  aceptar esta API exacta.

Actualización ISA-694 (2026-08-21, auditoría en curso):

- Briefing autocontenido:
  `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`.
- Base auditada: `origin/nightly@2ab9741d`. La rama es
  `vantareapp/isa-694-auditoria-rework-strategy-planner` y no modifica código
  de producto.
- El cálculo manual Go de Fuel y Virtual Energy y el solver determinista pasan
  100 repeticiones. El desgaste manual agrega valores introducidos; no es un
  modelo predictivo histórico.
- Telemetry Analysis puede descubrir, autorizar, copiar y leer DuckDB de forma
  normalizada, pero aún no produce `StrategyInputProjection v1`. ISA-159,
  ISA-145 e ISA-146 siguen en backlog; por tanto DuckDB no alimenta Strategy.
- Command Orbit conserva valor visual, pero usa persistencia y cálculo
  TypeScript paralelos. Activar, guardar y exportar no representan todavía el
  lifecycle canónico completo.
- El motor live existe, pero Nightly no resuelve aún la revisión activa a
  objetivos ejecutables. PR #280 permanece draft y requiere portado sobre la
  base actual.
- Veredicto: bloquear promoción a `testers`; planificar un cutover incremental
  que conserve Orbit y recupere una sola autoridad. No implementar hasta que
  Isaac apruebe el nivel objetivo manual, histórico y live.

Actualización ISA-309 / STR-N02 (2026-08-10):

- La pila acumulativa de Strategy posterior a STR-09 se reconstruyó sobre
  `origin/nightly@08fcfc1` en la rama oficial de ISA-309, sin los seis commits
  ajenos que contaminaban la rama histórica.
- Los 11 commits de producto incluyen saneamiento presentacional, dominio Go
  unificado de neumáticos, solver determinista, variantes, wiring del
  workspace, listado real de planes, paquetes import/export, plan activo
  auditable, reglas de evento versionadas y la regresión de loading/retry.
- Go Strategy, typecheck real, suite frontend completa, build y ESLint focal
  están verdes. `-race` sigue sin verificarse en este entorno Windows sin CGO;
  los bridges continúan sin prueba manual contra una aplicación Wails viva.
- PR draft #192 está abierto hacia `nightly`, mergeable y con todos los gates
  verdes tras un rerun único de un presupuesto temporal heredado de Telemetry
  Core. Strategy no fue la causa del primer fallo.
- Siguiente acción exacta: revisión de Isaac del PR #192. Solo su autorización
  posterior permite promoverlo a `nightly`; STR-15B (ISA-162) no comienza
  hasta que esa base esté realmente integrada.

Actualización ISA-152 / STR-17 (2026-08-14):

- ISA-161 fue aceptada por Isaac e integrada mediante squash del PR #212 en
  `nightly@b2e4067809d31152fdcf374875179e577d483c03`. El gate post-promoción
  31708164123 pasó completo. Linear refleja ISA-161 en `Nightly`.
- ISA-152 se implementó sobre una rama/worktree aislados desde ese squash. Los
  commits fueron `98104b0` (plan), `3f48045` (motor/read model),
  `091f8ba` (adaptador al Hub) y `bf9e9e5` (evidencia LMU). Reviews
  independientes de spec y calidad aprobaron los tres cortes sin findings
  abiertos.
- El motor efímero mantiene cursor, lifecycle, stint, Fuel, desviación solo
  contra objetivos exactos y próxima acción planificada. Duplicados,
  out-of-order, gaps, epochs, reconnect coalescido y backpressure están
  cubiertos. Missing, stale, invalid y unsupported permanecen explícitos.
- El adaptador consume una única suscripción del `StrategyHub()` existente,
  tolera la evolución aditiva de Strategy v1 y no crea goroutines, readers,
  endpoints ni almacenamiento. No está conectado al arranque: `ActivePlan`
  conserva una referencia de revisión, no los stints/objetivos normalizados, y
  STR-17 no autoriza inventar esa fuente.
- `TestStrategyLiveLMUOptIn` pasó con el pipeline productivo completo y un solo
  reader: source live, cursor `1/3`, vuelta completada `0` fresh, Fuel
  `98/115 L` fresh y desviación missing sin objetivo. El log es sanitizado; no
  contiene raw, track, fingerprint, IDs reales ni PII.
- Gates locales: focales x20, vet focal, frontend build, `go test ./...` y
  frontend `367/2636` pasan. `-race` no se ejecutó por CGO desactivado y falta
  de GCC. El HEAD de rama `c5f965f` pasó CI completo en 31720701167. Isaac
  autorizó la integración y el PR
  [#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219)
  se integró por squash en
  `nightly@8de4f511972757476d96d6a525b69c8917f4ca56`; el gate post-promoción
  [31748815965](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31748815965)
  pasó completo. Linear refleja `Nightly`. No hubo promoción a
  `testers`/`master` ni release.
- Microplan vigente:
  `docs/superpowers/plans/2026-08-13-isa-152-str-17-live-execution-engine.md`.
  Evidencia detallada:
  `docs/strategy-planner/evidence/isa-152-strategy-live-engine.md`.

Actualización condicionada ISA-161 / TC-10B (2026-08-12; estado histórico):

- Telemetry Core ha implementado en la rama local de ISA-161 el productor
  `StrategyLiveProjection v1` sobre el único pipeline LMU canónico. Incluye
  sesión, progreso, pit y Fuel con calidad explícita; VE, tyres, weather y
  facts permanecen ausentes.
- ISA-161 se construyó originalmente desde ISA-160 en `nightly@8880a88`; su
  primer rebase local fue sobre `origin/nightly@234794d` y su base/merge-base
  actuales son `origin/nightly@b6df494`. La rama está publicada y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN/CLEAN/MERGEABLE hacia `nightly`. El
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  pasó completo para `19dddea`, incluido GitGuardian. Cualquier amend posterior
  requiere checks de su nuevo HEAD; el estado final se consulta en el PR.
  Linear sigue pendiente por reautenticación.
- Esto no implementa el motor live Strategy ni desbloquea todavía ISA-152 /
  STR-17. La dependencia técnica solo será desbloqueable tras la promoción
  aceptada de ISA-161 a `nightly`; no hubo integración, promoción ni release
  de este corte.

STR-00 y STR-01 quedaron aceptados. STR-01 rescata Product A solo como oráculo
histórico aislado; no conecta sus contratos al producto. STR-02 introduce el
primer contrato productivo versionado. STR-03 implementa el repositorio local
canónico de drafts y revisiones. STR-04 añade la fachada de comandos y el store
frontend transitorio. STR-05 añade el motor manual puro de carrera, Fuel,
Virtual Energy y pit. STR-06 añade el inventario físico individual y sus reglas
de condición, estado y esquina persistente. STR-07 añade el shell visual y la
navegación real de la suite. STR-08 conecta el documento editable al repositorio
canónico, añade operaciones de stint y asignación física por DnD/teclado. La UI canónica usa
estrategias a la izquierda, stints al centro e inventario/entrada a la derecha.
STR-09 añade entrada rápida y tabla por vuelta con correcciones no destructivas,
Fuel/Virtual Energy separados, fuel-save determinista y pérdida de boxes por
cada parada real; las tarjetas consumen el resultado Go correlacionado.

Actualización ISA-134 / STR-00:

- Proyecto activo: `Strategy Planner — Race Strategy Suite`.
- Product A/B/C quedan como fases históricas de un único producto.
- Product A auditado: `codex/strategy-product-a@b9f1937`.
- Base aprobada: `ISA-117@170eaeb`.
- Divergencia: 371 commits de la base y 44 de Product A.
- Simulación: 94 paths = 87 auto-merged + 7 conflictos; 6.751 inserciones y 5
  eliminaciones.
- Veredicto: rescate selectivo; prohibido merge/cherry-pick por rango.
- Allowlist STR-01: un fixture exacto + 24 paths del dominio solo por port
  manual; los otros 69 paths están en denylist.
- Las 26 issues PB están `Canceled` como superseded, enlazadas al mapa y sin
  borrar historia. El backlog canónico son 24 cortes: ISA-136..157 más
  ISA-162/163.
- Productores: ISA-159 (Analysis histórico) e ISA-160/161 (Core live).
- STR-01: commit `f85fd31`, push y PR draft #60; sin promoción.
- STR-02: `ACCEPT`, commit `91c16c2`, push y PR draft #66 sobre `f85fd31`.
  Añade activación idempotente
  con historial exacto, decode execution estricto y corpus Go/TS de errores,
  máximo entero compartido `2^53-1`, regresión UTF-8 real y precedencia de
  versiones desconocidas equivalente en Go/TS. El encoder TS limita profundidad
  también al verificar valores ya construidos. La verificación productiva ya no
  materializa el hexadecimal del payload: calcula solo el digest; el hexadecimal
  diagnóstico usa un búfer acotado. La regresión de 1.000.000 de elementos
  canoniza `9.000.005` bytes y el benchmark reproducible está en
  `docs/strategy-planner/str-02-canonicalization-memory-benchmark.md`.
  Permanece sin merge ni promoción. Go focal x50, dos fuzzers, frontend
  completo 299/299 archivos y 2.034/2.034 tests,
  TypeScript, build, lint focal, vet focal y diff-check pasan. Go/vet global no
  se repitieron en la reanudación del 2 de agosto; su última evidencia conserva
  deuda Windows heredada fuera del diff.
- STR-03: implementación local sobre `ISA-137@91c16c2`. API
  `Snapshot`/`Commit(ChangeSet)`, generación optimista, lease cross-process,
  escritura atómica durable, backup/rollback, drafts recuperables, revisiones
  inmutables, límites y borrado sin tocar externos. La review queda corregida:
  solo corrupción/ausencia activa recovery; límites, I/O y versiones futuras
  no mutan el principal; drafts y revisiones atraviesan el gate `strategy.v1`;
  temporales huérfanos se limpian bajo lease sin seguir links/reparse points;
  y un fallo posterior al replace devuelve `ErrCommitUncertain` para reconciliar
  por generación. La segunda re-review queda corregida sin marker: el primer
  commit persiste su misma generación en el backup antes del principal, de modo
  que principal ausente nunca se confunde con gen0 después de inicializar. Los
  fallos antes/después del replace fijan la frontera ordinaria/incierta y un
  writer con versión 0 no puede consolidar pérdida. Migración v1 es no-op
  explícito porque no existe predecesor productivo. Evidencia:
  `docs/strategy-planner/str-03-repository.md`. Lista para review independiente,
  sin promoción. Focal x100, lease cross-process x50, Strategy, vet focal,
  race x10, compilación Linux,
  frontend build y suite Go global sin el único P3 Windows heredado pasan.
- STR-04: implementación sobre `ISA-138@8e151b8`. Protocolo
  `strategy.application.v1`, servicio/bridge estricto, commits idempotentes,
  rechazo optimista de versiones stale y store con dirty derivado, undo/redo
  acotado y observación live aislada. Cerrar el editor conserva plan activo y
  ejecución; duplicar puede capturar cambios locales sin modificar el origen.
  La corrección de review bloquea edit/undo/redo durante save/close, evita
  reemplazar dirty sin descarte, reintenta un save incierto con identidad
  exacta, endurece requeridos/semántica/límites JSON y añade cancel/dispose con
  limpieza ante respuestas tardías o fallos síncronos del transporte.
  Evidencia: `docs/strategy-planner/str-04-application-service.md`. Lista para
  segunda review independiente, sin wiring, merge ni promoción. Go focal x100,
  Strategy, Go global, vet focal, race x10, frontend 301/301 archivos y
  2.052/2.052 tests, 36/36 focales, TypeScript, build y lint focal pasan. Una primera corrida
  frontend bajo carga paralela mostró flakiness heredada del canvas; la corrida
  final aislada quedó completamente verde.
- STR-05: implementación sobre `ISA-139@f60f480`. El paquete puro
  `internal/strategy/manual` calcula carreras por vueltas/tiempo, recursos y
  pit sin wiring. Una carrera por tiempo completa la vuelta en curso mediante
  `ceil` estable y solo añade otra con regla explícita; pit loss sigue siendo
  input manual con procedencia y no crea un fixed-point oculto. Fuel/VE tienen
  resultados incompatibles, reservas explícitas, repostajes/recargas y
  fuel-save que cuenta el inicio real. Pit separa fijo/variable y cuantifica el
  solape Fuel/neumáticos; repair y penalty son opcionales y no se ocultan.
  Cada supuesto publica valor, unidad, procedencia y confianza. Evidencia:
  `docs/strategy-planner/str-05-manual-calculation.md`. Lista para review
  independiente, sin UI, solver, presets LMU, telemetría, persistencia, wiring,
  merge o promoción.
- Corrección STR-05 posterior a review: servicios Fuel/VE se asignan hasta
  cubrir la necesidad sin epsilon ni subasignación; un ruido positivo sobre un
  múltiplo crea conservadoramente otro servicio. Las fronteras de carrera se
  resuelven con aritmética decimal racional: `0.3/0.1` sigue exacto y una media
  vuelta cerca de `2^52` no se borra. Correcciones P1/P2 listas para re-review.
- STR-06: implementación sobre `ISA-140@2d0af85`. El paquete puro
  `internal/strategy/tyres` modela cada neumático físico con identidad,
  Soft/Medium/Hard/Wet, origen, condición con procedencia/confianza, estado,
  stints y esquina. Clasificación sin dato conserva 80–90 % y ausencia general
  40–70 %; ningún estimado se vuelve exacto. El primer uso liga la unidad a una
  esquina, mientras que un montaje aún no usado puede corregirse. La selección
  admite compuestos mixtos, excluye descartados y explica inventario
  insuficiente mediante error tipado. Evidencia:
  `docs/strategy-planner/str-06-tyre-inventory.md`. Lista para review
  independiente, sin UI, persistencia, telemetría, wiring, merge o promoción.
- STR-07: implementación sobre `ISA-141@52d2466`. Registra Strategy en el
  topbar y la access policy, añade galería, entrada, revisión, workspace,
  comparación y guardado honesto de sesión. El harness autocontenido recorre el
  flujo y captura wide/medium/compact con proporción `3/6/3`, overflow global
  cero, consola limpia y modal accesible con foco atrapado/restaurado. La suite
  serial base pasa `2059/2059`; la corrección final añade el cuarto stint para
  sumar 78 vueltas y métricas coherentes por estrategia, con focal `7/7`, build
  y lint focal PASS. Evidencia:
  `docs/strategy-planner/str-07-shell-visual.md`. Sin solver, live,
  persistencia, drag/drop, merge o promoción.
- STR-08: implementación sobre ISA-142 aceptada. Añade `strategy.editor.v1`,
  editor inmutable de stints, neumáticos individuales con esquina persistente,
  DnD y alternativa de teclado, undo/redo, guardado y recarga mediante STR-03/04.
  El bridge Wails sanitiza errores y conserva correlación; apertura lazy,
  reintento y StrictMode tienen regresión. Playwright recorre todas las acciones
  y recupera el documento tras reload con cero errores de navegador. Evidencia:
  `docs/strategy-planner/str-08-stint-editor.md`. Sin solver, telemetría, live,
  merge o promoción.
- STR-09: implementación sobre `ISA-144@53e8158`. Extiende el documento de
  STR-08 con `strategy.manual.v1`, promedios, correcciones dispersas por vuelta,
  unidades y rangos. El bridge Go calcula Fuel/VE, ahorro por vuelta/stint,
  ritmo, desgaste y boxes; cuatro stints equivalen a tres pérdidas por parada.
  La UI neutraliza resultados stale, restaura correcciones individualmente y
  no muestra impactos de ritmo inventados. Playwright valida edición,
  rechazo, guardado/recarga, responsive y navegador limpio. Evidencia:
  `docs/strategy-planner/str-09-manual-inputs.md`. Sin Analysis, solver, live,
  nueva persistencia, merge o promoción.

## Decisiones

- Modos manual, asistido y live.
- Fuentes históricas, recording, live, inputs y reglas.
- Neumáticos individuales con ID, compuesto, desgaste, condición, stints,
  posición, origen y estado.
- Un neumático usado queda ligado a FL/FR/RL/RR; se permiten combinaciones
  mixtas de Soft/Medium/Hard/Wet cuando las reglas del evento lo permitan.
- Clasificación puede dejar 80–90 %; sin datos se usa manual o rango 40–70 %.
- Fuel y Virtual Energy son recursos separados.
- Objetivo: menor tiempo total con incertidumbre; rápida, robusta y conservadora.
- Safety Car/FCY/lluvia/daños/penalizaciones forman parte del producto final.
- Galerías separan Vantare, Comunidad y Mis planes; privado por defecto.
- STR-03/ISA-138 posee en exclusiva repositorio, atomicidad, migraciones,
  drafts, revisiones y recovery. STR-15A/ISA-150 solo posee queries/UI de `Mis
  planes` y paquetes import/export a través de ese repositorio; no duplica
  persistencia.
- Correcciones no destructivas y tabla avanzada.
- Live explica cambio, impacto, propuesta y consecuencia.
- Engineer propone, piloto acepta, Strategy actualiza, Overlays leen.
- El LLM redacta voz/texto; no calcula la estrategia.
- Contrato inicial `strategy.v1`: draft mutable, revisión inmutable/hash,
  activación por referencia exacta, ejecución secuenciada y replan con
  aceptación explícita.
- Fuel y Virtual Energy son tipos incompatibles en Go y TypeScript.
- Go crea y firma lógicamente revisiones; TypeScript las valida contra un
  manifiesto y golden compartidos, sin segundo constructor divergente.
- `sha256:strategy-c14n-v1` fija un encoder binario común Go/TypeScript con
  orden de claves UTF-8, float64 big-endian, límites de recursos y corpus
  adversarial de bytes/hash. Hashes son minúsculos y timestamps son UTC
  RFC3339 canónicos con precisión máxima de milisegundos.
- Replans se decodifican estrictamente y se validan antes/después de aceptar o
  activar. Los estados de ejecución y propuestas aceptadas no conservan aliases
  mutables del input ni de snapshots anteriores.
- Repetir una propuesta ya aplicada devuelve el mismo snapshot activo sin una
  segunda activación, únicamente si candidata, base y revisión anterior
  concuerdan exactamente.
- `LapCount`, `epoch` y `sequence` comparten el máximo entero `2^53-1`; el
  decoder de execution rechaza shape anidado, duplicados, unknown fields,
  trailing data, timestamps y capabilities inválidos con el mismo
  `errorCode/errorField` en Go y TypeScript.
- La segunda corrección fija los 25 nombres del corpus execution, usa paths
  completos para revision/provenance/confidence y valida escalares antes del
  decode Go. Los límites canónicos viven también en el manifiesto compartido;
  strings ya no heredan por error el límite de elementos de un contenedor.
- Una versión explícita desconocida se rechaza antes de interpretar la shape v1;
  la ausencia del campo conserva `invalid_document`. El mismo corpus fija esa
  precedencia para revisión y replan en Go/TypeScript.
- El encoder TypeScript aplica límites de salida, elementos y profundidad por
  sí mismo; no depende de que el input haya atravesado antes el parser JSON.

## Riesgos

- **P1:** escenarios históricos no auditados usados como autoridad.
- **P1:** duplicar Core o el almacenamiento de Analysis.
- **P2:** Monte Carlo opaco o innecesario; determinista es la base.
- **P2:** preservar contratos débiles por evitar un refactor pre-lanzamiento.

## Evidencia e issues

- Auditoría: `docs/strategy-planner/str-00-audit.md`.
- Matriz: `docs/strategy-planner/rescue-matrix.md`.
- Mapa: `docs/strategy-planner/pb-to-str-map.md`.
- ADR: `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- Plan: `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- Ownership: `docs/strategy-planner/projection-ownership.md`.
- Product A exacto: Go focal/vet, 25 tests frontend y build pasan; el smoke
  Playwright histórico se bloquea y debe reemplazarse en STR-07.
- Caracterización STR-01:
  `docs/strategy-planner/str-01-product-a-characterization.md`.
- Paquete histórico: `internal/strategy/producta`; 25/25 paths de la allowlist,
  fixture exacto y 24 blobs Go iguales salvo el namespace.
- Guard de entrega: denylist 69/69, manifiesto versionado del delta y discovery
  de raíz compatible con `-trimpath`.
- Contrato STR-02: `docs/strategy-planner/str-02-contract.md`.
- Issue activa: ISA-144 / STR-09, implementación lista para review independiente
  sobre el commit aceptado de STR-08.

## Rework definitivo (ISA-694)

El producto entero se replanifica bajo ISA-694 mediante SDD. Documentos
canónicos del expediente, que prevalecen sobre las secciones históricas de
este handoff:

- Diagnóstico: `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`.
- Spec (SPECIFY, aprobado por Isaac 2026-08-21):
  `docs/strategy-planner/isa-694-spec.md` — decisiones D1–D18, asunciones
  A1–A6, criterios de éxito del corte A+B.
- Plan técnico (PLAN, rev. 2 tras review adversarial Codex gpt-5.6-sol):
  `docs/strategy-planner/isa-694-plan.md` — fases F0–F7b.

Corte A+B (manual = caso degenerado de asistido; live queda para un corte C
posterior). Strategy permanece bloqueado para `testers` hasta el gate F7a.

## Siguiente acción exacta

Revisar la entrega aislada de ISA-831 con la combinación Spa/LMGT3 del corpus
real: confirmar que Seco mantiene `3.54 L/v` derivado y Lluvia muestra `—` con
causa cuando `byClimateBucket` solo contiene `dry`. Isaac integra por el canal
normal; no abrir PR, integrar ni promover desde esta rama.

## Última actualización

2026-08-24, ISA-831: Fuel/VE transportados y consumidos por bucket climático,
sin fallback cruzado. Pendiente comprobación en la app real por Isaac; sin PR,
integración, promoción ni release.
