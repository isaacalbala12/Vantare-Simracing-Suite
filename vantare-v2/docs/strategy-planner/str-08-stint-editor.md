# STR-08 — Editor de stints y neumáticos físicos

## Resultado

ISA-143 convierte el workspace visual de STR-07 en un editor local real. El
usuario puede añadir, insertar, duplicar, eliminar y reordenar stints; asignar
neumáticos individuales a FL/FR/RL/RR; deshacer y rehacer; guardar; cerrar y
recuperar exactamente el documento persistido.

El editor no calcula estrategias, desgaste, combustible ni telemetría. Su
payload versionado `strategy.editor.v1` es el documento de edición que viaja por
la fachada de STR-04 y se guarda exclusivamente en el repositorio de STR-03.
No existe una segunda persistencia productiva. El `localStorage` del runtime
mock pertenece únicamente al harness de navegador.

## Contrato del documento

- cada stint tiene identidad estable, vueltas, combustible, ritmo y cuatro
  asignaciones explícitas;
- cada neumático representa una unidad física con ID, compuesto, condición y
  esquina persistente;
- la primera asignación de un neumático libre fija su esquina;
- quitarlo de un stint no elimina esa identidad;
- un neumático no puede ocupar dos esquinas del mismo stint ni cambiar de
  esquina después del primer uso;
- el último stint no puede eliminarse;
- IDs duplicados, referencias inexistentes y documentos corruptos se rechazan,
  nunca se reparan silenciosamente;
- rangos de vueltas y número de usos se derivan del documento.

Estas son invariantes estructurales del editor. El dominio Go de STR-06 sigue
siendo la autoridad para selección, disponibilidad, incertidumbre y futuras
decisiones de neumáticos; STR-08 no duplica su solver.

## Interacción

- Las acciones de stint son operaciones pequeñas e inmutables y generan una
  única entrada de historial.
- El drag and drop HTML nativo funciona con ratón y touchpad.
- La ruta accesible permite seleccionar un neumático y activar una esquina con
  teclado.
- `Escape` cancela drag o selección sin ensuciar el documento.
- Las regiones publican nombres accesibles, estado seleccionado y anuncios
  `aria-live`.
- Los errores de esquina permanecen visibles y no alteran el documento.
- Undo/redo usa el store canónico de STR-04; no hay historial React paralelo.

## Persistencia y runtime

`cmd/vantare` abre el repositorio canónico en `data/strategy` y conecta el
evento `strategy:application:command` al `JSONBridge` de STR-04. Los resultados
y errores conservan el `commandId`; los errores públicos usan una lista cerrada
de códigos y mensajes sanitizados. Rutas, secretos o mensajes internos nunca se
reenvían a la UI.

El editor abre el draft estable `strategy-default-draft` al entrar en el
workspace y lo crea solo cuando no existe. La galería no abre el repositorio de
forma prematura. Un fallo muestra un estado recuperable y `Reintentar` crea una
petición nueva. El runtime soporta el replay de efectos de React StrictMode sin
doble apertura, listeners huérfanos ni uso de un cliente ya cerrado.

Los timestamps se generan mediante `canonicalStrategyTimestamp`: RFC3339 UTC
con precisión canónica, sin los ceros finales que el contrato rechaza. Esto
elimina el fallo intermitente que podía dejar una edición sin aplicar.

## Harness y evidencia

`pnpm --dir frontend visual:strategy-planner` ejecuta Chrome real y valida:

1. galería, entrada, revisión y workspace;
2. añadir, insertar, duplicar, reordenar y eliminar;
3. undo y redo;
4. cancelación con `Escape` sin mutación;
5. DnD de un neumático libre;
6. asignación accesible por teclado;
7. rechazo al intentar cambiar su esquina persistente;
8. guardado, recarga completa y documento limpio recuperado;
9. wide, medium y compact sin overflow global;
10. consola y errores de página en cero.

Evidencia visual: `docs/strategy-planner/evidence/str-08/`.

## Pruebas

- Modelo puro, contrato, store y UI focal: `48/48` PASS.
- Incluye identidad estable de snapshots para `useSyncExternalStore`, lifecycle
  StrictMode, reintento tras error sanitizado y regresiones de DnD/teclado.
- Go focal de `cmd/vantare` y todos los paquetes `internal/strategy`: PASS.
- Suite frontend completa: `303/303` archivos y `2072/2072` tests PASS en
  102,25 s. Happy DOM imprimió dos `AbortError` al cancelar fetches durante su
  teardown después del resultado verde; el proceso terminó con código cero y
  no pertenecen al runtime Strategy.
- Suite Go global `go test ./...`: PASS en 249,5 s.
- Build frontend: PASS; conserva el warning heredado del chunk principal.
- ESLint focal: PASS; conserva el warning heredado de `.eslintignore`.
- Playwright real: PASS; overflow, consola y page errors en cero.

## Exclusiones

- Sin solver, Monte Carlo, estrategia óptima o replanning live.
- Sin parser de telemetría o cálculo de desgaste.
- Sin tabla avanzada, fuel-save productivo o edición masiva.
- Sin nueva dependencia.
- Sin merge ni promoción.

## Rollback

El documento se encuentra tras la fachada versionada existente. Revertir el
commit elimina editor, wiring y harness sin migrar otros datos. El repositorio
conserva sus garantías de backup y recuperación de STR-03.
