# Microplan Strategy nativo — #1430

Worker Codex; revisión íntegra por Claude Opus 5.5. Base `a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`, rama `vantareapp/isa-1430-w-strategy`.
Isaac autoriza excepcionalmente trabajar con GitHub porque Notion no está disponible. No se declara seguimiento Notion actualizado. Sin subagentes, push, PR ni merge.

1. Congelar oráculo generado por los paquetes Go actuales: documento V2 y SolveV2, fuente e inputs/salidas con SHA-256. Incluir casos normales, reservas, servicios Fuel/VE y errores. No son capturas de telemetría real.
2. Crate puro `native/strategy`: preservar documento JSON completo y bytes originales cuando no hay cambios, validar fronteras, editar valores con evidencia manual. Portar cálculo determinista contrastado con el oráculo; rechazar dimensiones todavía no portadas en vez de ignorarlas.
3. Sección GPUI Strategy: abrir/crear/guardar, conflicto por bytes y escritura atómica reutilizando `hub::files`; editar evento/variante e inputs manuales explícitos; mostrar resultado, procedencia y límites. Sin lectura privada de Analysis ni forecast inventado.
4. Tests de paridad por campo, conservación de datos, errores y conflicto. Gates de cada hito: fmt, clippy workspace/all-targets y test workspace, máximo `-j 2`. Commits locales en español y coautoría solicitada.

Límite de ownership: `native/Cargo.toml`, `native/Cargo.lock` y `native/hub/Cargo.toml` están fuera del encargo. El crate tendrá manifiesto autónomo; la shell podrá compilar el mismo módulo fuente mediante `#[path]` hasta que el orquestador conecte la dependencia de workspace. No se duplica el motor. No se tocarán núcleo, widgets ni kit.

Aceptación: registrar cobertura comprobada y dimensiones pendientes con precisión. Paridad de una selección de casos no demuestra paridad completa de SolveV2, rendimiento ni runtime físico GPUI. La revisión y conexión final de manifiestos pertenecen al orquestador.

## Hito 1 — base pura y oráculo (entrega parcial)

- Documento V2: edición por tokens, conservación de campos/bytes ajenos,
  evidencia manual, eventos/variantes, clima y migración; validación de la
  proyección Analysis consumida por el documento, sin adquirirla.
- Solver: subespacio escalar manual Fuel/VE, neumático lineal, servicios,
  formación, reservas y reglas/ventanas; incluye el fast path Go de Fuel
  único para carreras largas. No produce el wire completo ni resuelve pilotos,
  inventario físico, ahorro, curvas derivadas, clima robusto, riesgos o ranking.
- Corpus Go congelado por SHA-256: 34 documentos y 125 entradas del solver
  (116 óptimos, 3 inviables, 6 errores). Salida completa Go comprimida y
  comparación campo a campo de la proyección escalar expresamente documentada.
- Gates: fmt/clippy sin warnings; workspace test pasa con
  `RUST_TEST_THREADS=2` y `-j 2`; crate autónomo 4 unitarios + 1 integridad pasan.
  La primera ejecución global tuvo timeout de cierre en storage y pasó al
  repetir, sin modificar/excluir ese test. Go focal pasa; Go global falla por
  `frontend/dist` ausente y readiness de voiceinput, fuera de ownership.

Bloqueo de integración: los manifiestos de workspace/Hub pertenecen al
orquestador. La sección consume provisionalmente las mismas fuentes vía path.
Pendientes de aceptación de #1430: envelope `strategy-repository.json`, port
completo del solver y de la UI, conexión definitiva de manifests y prueba
visual/interactiva GPUI. El oráculo actual no demuestra esas dimensiones.

## Hito 2 — sección local del Hub (entrega parcial)

Hito 1 conservado en `c2e02984910cfc146c03d02c31422af4c948867b`.
`--strategy` y navegación existente abren la sección. Permite crear/abrir
documentos V2 exportados, seleccionar evento/variante, editar campos esenciales
con procedencia visible, añadir evento y confirmar inputs escalares manuales.
El cálculo es cancelable y asíncrono; las ediciones invalidan resultados antiguos.
Guardar usa temporal sincronizado y conflicto por los bytes observados, sin
sobrescribir destinos no observados. Guarda/descarta antes de cambiar documento
y comprueba también las ediciones realizadas mientras el selector estaba abierto.

Tests: guardado/reinicio, conflicto con escritor externo, fallo de apertura sin
perder el documento y números explícitos; CLI incluye selección/rechazo de flags.
Revisión visual/interactiva pendiente. El editor de texto es básico y no promete
IME ni selección convencional. No hay adquisición de telemetría ni forecast,
edición completa de pilotos/inventario/clima o equivalencia completa con Orbit.

Entrega exclusivamente local, sin push/PR/merge/release. Notion continúa
inaccesible bajo la excepción explícita del encargo; #1430 no se declara cerrado.
Los límites y la receta de revisión viven también en `native/strategy/README.md`.

Gates repetidos antes del commit de Hub: `cargo fmt --all --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
`cargo test --workspace -j 2` con `RUST_TEST_THREADS=2`, todos exit 0.
`go vet -p 2 ./tools/strategy-oracle` también exit 0.
