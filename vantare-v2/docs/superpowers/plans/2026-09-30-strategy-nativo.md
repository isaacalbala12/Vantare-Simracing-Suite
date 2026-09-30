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
