# ISA-1094 — asistente registrado

## T05i / T09 — continuación de montaje y biblioteca nativa

T05j monta StrategyRecordedPage en OrbitShell: entrada de cinco pasos, resumen
y biblioteca nativa. No monta el componente anterior ni sus suscripciones live;
los tests conservados de ese componente son históricos, no aceptación de esta ruta.
Contexto propio sin bloques de carreras/overlay/launcher. Navegación protege
descarte y apertura pendiente. Cinco focales de página/workflow, tipos/lint PASS.
Build inicial PASS; gate general posterior pendiente tras últimos ajustes de UI.
Capture headless real del TSX en harness existente: sin pageerror ni overflow,
grid72/256/1344 a1672x941. C:/tmp/isa1094-route-{start,combination}.png. El harness
usa fixtures existentes: no prueba DuckDB/Wails. Pendiente alinear título,
indicadores y footer con la referencia antes de review visual independiente.
Roadmap actualizado en cuatro idiomas y digest regenerado; entrega parcial
feature, cálculo/operaciones avanzadas/validación final siguen pendientes explícitos.

Base d5fe69da211438b8f01c65fbb1af932b0195ab51 de #1095. Worktree activo
C:/tmp/vantare-isa1094-route, rama vantareapp/isa-1094-recorded-route; la rama
anterior queda como corte histórico, no hay edición paralela sobre esta issue.
useRecordedLibrary reutiliza list/filter/sort y open existentes. Sólo lista
resúmenes de borradores registrados, abre uno por selección y comprueba evento,
plan y variante del payload. Fallo de refresh no expone versión vieja para crear.
14 focales, tipos/lint focal PASS (C:/tmp/isa1094-t05i-*.log).
La biblioteca todavía no está montada. Sigue entrada productiva A4.

Gate heredado #1095 T08h confirmado: 436 archivos/3412 tests frontend PASS,
lint general y build PASS (C:/tmp/isa1095-t08h-{all,lint-all,build}.log).
AbortError de teardown happy-dom y aviso Vite de chunks heredados; no prueba
Wails ni certificación visual/empírica. Sin push/PR/CI remoto/promoción.

Base e95d3bbb72cfd95f06bda84fb6d6d549f5c892ab; rama
vantareapp/isa-1094-recorded-wizard; SDD R03–R05, A03–A05, T05.

## T05a — borrador y selección

Dos paths nuevos, strategy-recorded-wizard.ts y su test. Borrador sólo en memoria:
no persiste, no importa archivos ni calcula. Ausencia de duración, capacidades,
reservas, pilotos y sesiones se conserva. Volver atrás conserva valores.
Cambiar combinación retira las referencias seleccionadas, registra cuántas y
no toca las correcciones de Analysis. Calendario se copia con versión, fecha
de actualización y captura; no se reaplica al refrescar el proveedor.
Compatibilidad usa identidades de simulador, circuito y categoría declaradas.

Siete tests focales PASS. La primera ejecución detectó que la proyección por
IDs podía admitir una fila incompatible si el catálogo repetía ese ID; se
comprueba ahora cada fila con las identidades completas. Typecheck y ESLint
focal PASS. Logs C:/tmp/isa1094-t05a-tests.log, -types.log y -lint.log.
Sin cambios Go. Gates generales se ejecutan al integrar las pantallas.

Pendiente: componentes A4 e integración, controles de evento y pilotos,
descubrimiento automático real, persistencia nativa de configuración incompleta.
No se presenta el borrador como guardado, calculable ni aceptado visualmente.

## T05b — Inicio A4

Componente StrategyRecordedStart, CSS acotado y test de selección explícita;
textos en los cuatro idiomas. Presentacional: el padre recibe el modo, sin
avance, descubrimiento ni importación implícitos. Ocho tests focales (modelo
e Inicio), typecheck y ESLint focal PASS. Logs C:/tmp/isa1094-t05b-*.log.
La ruta anterior todavía no monta este componente; integración después de los
cinco pasos. Suite general y captura de paridad se harán sobre esa integración.

## T05c — Combinación unificada

Componente presentacional con carrera personalizada/calendario, coche y trazado
canónicos en una pantalla. Las opciones proceden de catálogo/proveedor recibidos;
no inventa coches, eventos ni mapas de circuito. Calendario ausente no deshabilita
el catálogo personalizado. Elegir coche limpia la combinación anterior antes de
seleccionar trazado. Buscar sólo emite una acción explícita al padre.
Once tests focales PASS, typecheck y ESLint focal PASS (isa1094-t05c-*.log).
Falta conectar esta pantalla y el descubrimiento inicial sin catálogo; el modelo
actual sólo admite identidades resueltas, no creación libre con IDs inventados.

## T05d — Reglas básicas

Pantalla de configuración: nombre, duración o vueltas (sin convertir una unidad
en otra), propuesta explícita de duración del snapshot, capacidad/inicial/reserva
de combustible, aplicabilidad y cantidades de energía virtual, pérdida total y
límites de paradas. Los vacíos permanecen ausentes; cero explícito no se pierde.
No afirma que estos campos adicionales ya lleguen al solver: T02/T06 pendientes.
Los límites de recursos cruzados y la configuración avanzada faltan por conectar.
16 tests focales, typecheck, lint global y build PASS. Suite general sobre T05d:
426 archivos/3339 tests PASS, 300.57 s (C:/tmp/isa1094-t05d-all.log); no Go
cambiado. No aceptación visual ni Wails. Stderr heredado de teardown happy-dom
AbortError, sin casos fallidos; no se presenta como consola de runtime limpia.

Revisión de persistencia: PlanDraft nativo acepta payload versionado con campos
ausentes y ya dispone de create/edit/open/list. Evaluar reutilizar ese borrador
canónico antes de ampliar el Event estricto o crear otro almacén. El cálculo
deberá seguir recibiendo datos validados y no un payload arbitrario de UI.

## T05e — Pilotos

Pantalla sin pilotos fabricados, edición de nombres y estimación explícita de
relevo respecto al principal. Seleccionar esa referencia propone delta cero,
editable con signo; nunca genera combustible ni desgaste. Quitar la referencia
retira las estimaciones dependientes. Tres tests focales, tipos y lint focal
PASS. Disponibilidad/límites, persistencia y aplicación en optimización T07/T02
siguen pendientes. Logs C:/tmp/isa1094-t05e-*.log.

## T05f — orquestación y validación

StrategyRecordedWizard monta Inicio/Combinación/Reglas/Pilotos y recibe Sesiones
del propietario existente. Cinco pasos, foco/navegación, campos conservados,
validación de valores presentes y entrega explícita al final. Automático pide
descubrimiento al continuar; no importa por seleccionar el modo. El padre recibe
el borrador y debe confirmar persistencia; el componente no afirma guardado.
18 tests focales, tipos y lint focal PASS (C:/tmp/isa1094-t05f-*.log).
La ruta vieja sigue vigente hasta completar persistencia/entrega e integración.
No hay nuevo renderer ni motor: componentes productivos reutilizan el marco A4.

## T05g1 — contrato del borrador persistido

Payload strategy.recorded.draft.v1 para PlanDraft existente, con validación de
forma antes de mostrar datos reabiertos. Conserva vacíos, cero, deltas y referencias
completas; rechaza tipos/versión incompatibles. Snapshot de calendario conserva
campos publicados, clase canónica y versión, independiente del objeto de origen.
17 tests focales PASS; tipos/lint focal PASS antes del último caso adicional.
No persiste aún: siguiente corte adapter create/edit/open y prueba Go de reapertura.

## T05g2 — persistencia nativa comprobada

createRecordedDraft usa create; openRecordedDraft valida el payload reabierto.
saveRecordedDraft usa save_revision para historia de configuración duradera,
sin activate ni resultado calculado. **Corrección de la evaluación anterior:**
edit nativo sólo clona/valida en memoria, no escribe. No se conecta ese comando
como guardado. La versión abierta se conserva para detectar conflictos, sin
reintento que sobrescriba trabajo posterior. No almacenamiento adicional.

Prueba Go de repositorio real create → save_revision → reabrir → open PASS:
mantiene payload/campos ausentes, nueva revisión y ausencia de plan activo.
Primer intento detectó que confidence unknown no admite basis; se retiró esa
base de confianza impropia del adapter y el fixture. Cuatro tests TS focales,
typecheck, lint global y build PASS. Suites generales: frontend 431 archivos /
3381 tests PASS (325.96 s), Go `go test -p 1 ./...` PASS y vet de
app/strategy/telemetryanalysis/cmd PASS. No medición de rendimiento estable.
Logs C:/tmp/isa1094-t05g2-{tests,native,types,lint-all,build,all,go-all,vet}.log.
Todavía no integración de ruta, paridad visual final ni aceptación Wails.

Antes de montar el recorrido se debe separar estado/lifecycle del panel de
sesiones de su vista, reutilizando el componente actual. El cambio entre
Sesiones y editor no puede desmontar el propietario y cerrar handles usados
por la proyección fijada. T05h será esa extracción acotada con tests existentes
y navegación; descubrimiento/bootstrap sin catálogo sigue en T08.

## T05h — propietario de sesiones independiente de la vista

Extraído useRecordedSessions, sin otro lector/store. La API anterior del panel
se conserva y StrategyRecordedSessionsView permite cambiar su ubicación sin
desmontar al propietario. 16 tests focales PASS: anteriores, apertura exacta,
hook y desmontar/remontar la vista conservando handles; el cierre final los
libera. Tipos/lint focal PASS. El propietario se monta por evento/combinación.
Logs C:/tmp/isa1094-t05h-*.log. Suite general posterior pendiente.
