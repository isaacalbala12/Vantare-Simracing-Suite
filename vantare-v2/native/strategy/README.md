# Strategy nativo — worker #1430

Entrega local **parcial**, pendiente de revisión de Opus. No sustituye aún todo
`internal/strategy/solver` ni el repositorio persistido de Go.

## Documento

`Document` abre documentos canónicos `strategy.v2` / `2.0.0` (hasta 12 MiB).
Conserva los bytes de entrada; al editar reemplaza únicamente los tokens del
campo confirmado. Permanecen intactos los campos desconocidos, JSON en
`overrides`/`tyres`/`rawExtra`, archivos y journal de migración y backups base64.
Un cambio inválido no modifica el documento. Los campos confirmados llevan
evidencia manual nueva, conservando la procedencia del resto.

Valida eventos, variantes, referencias de pilotos, orden/disponibilidad,
inventario documental, provenance/confidence/evidence, escenarios de cinco
nodos y metadatos de migración. La proyección Analysis se conserva y aplica las
reglas Go de selección, fechas UTC a milisegundos, ritmo por clima/clase,
identificabilidad y curvas separables, y ambigüedad de boxes. No se ejecutan
migraciones V1 ni se adquieren proyecciones desde servicios.

El archivo real `strategy-repository.json` es un envelope distinto, con drafts,
revisions, activations, generation y `contentHash`. **No se admite todavía ese
envelope**: fallará por versión, sin escribir nada. Se admiten documentos V2
exportados; no convertir el repositorio del usuario ni retirar Go con esta entrega.

## Cálculo

Búsqueda exacta en el subespacio de entradas escalares manuales de SolveV2:
Fuel y VE separados, pasos de servicio a precisión de 1e-6, degradación lineal,
vida de neumático, servicio paralelo/secuencial, formación, reservas amount /
laps / percent, mínimos/máximos de paradas y ventanas obligatorias. Desempate
por tiempo (tolerancia Go), número de paradas, vuelta y cantidad de servicio.
La salida inicial es el mínimo recurso necesario para la decisión, no un
depósito lleno inventado. Cada parada monta neumáticos nuevos en este subespacio.

Presupuesto de candidatos/iteraciones y deadline; cancelación cooperativa. Si
se agota el presupuesto no se publica un óptimo parcial. El Hub calcula fuera
del hilo GPUI y descarta respuestas de una edición anterior.

**Falta** portar proyecciones derivadas/curvas de stint, peso de combustible,
ahorro, pilotos/perfiles y sus límites, inventario físico/fitment/compuestos,
forecast y buckets climáticos, escenarios robustos, ranking, variantes de riesgo,
sensibilidades y el wire completo `SolverResultV2`. Esas entradas se rechazan
explícitamente. `ResultV2` nativo es una proyección parcial, no el wire Go completo.

## Hub

Sección Strategy y opción `--strategy`: abrir/crear documento, elegir evento y
variante, editar campos esenciales, añadir evento, guardar/guardar como, descartar
y calcular. Guarda con el mismo lock, temporal sincronizado, reemplazo atómico
y comparación de bytes que las otras secciones. El lock coordina escritores del
Hub; un escritor externo que no respete el lock puede competir entre comparación
y rename. No se promete un CAS contra escritores externos no cooperativos.

Para un evento nuevo introduce nombre, duración, depósito y tránsito; aplica
cada campo y añade el evento. Completa las entradas numéricas del cálculo
(también los ceros explícitos), `parallel` o `sequential`, y confirma/calcula.
Los inputs se guardan en la variante bajo `overrides.nativeScalarInput`. No hay
forecast ni telemetría de ejemplo. Los eventos con dimensiones no portadas se
pueden abrir y editar, pero no se calculan ignorándolas.

Editor de texto básico: clic/teclado, borrar, pegar, Enter/Esc. Pendientes IME,
selección de texto convencional, edición de pilotos, reglas, inventario y clima;
paridad visual y prueba física GPUI por el revisor. El Hub no es una réplica
funcional completa de `strategy-orbit`.

## Integración y dependencias

Las rutas autorizadas no incluyen los manifiestos raíz/Hub. El crate tiene
workspace autónomo, y Hub compila **las mismas fuentes**, mediante `#[path]`,
sin copiar el cálculo. El orquestador debe añadir `strategy` al workspace,
conectar `vantare-strategy` como dependencia de Hub, sustituir el módulo `path`
y consolidar el lock antes de integrar. No se han tocado núcleo, widgets ni kit.

Solo se reutilizan serde/serde_json/chrono ya presentes en el workspace. SHA-256
usa `sha2 0.10` únicamente en tests del crate autónomo; ya existe en runtime.
No hay dependencias de producto nuevas ni `unsafe`.

```powershell
# Desde native/strategy, mientras los manifiestos sigan aislados:
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2

# Desde native/:
cargo fmt --all --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
$env:RUST_TEST_THREADS = '2'
cargo test --workspace -j 2
cargo run -p vantare-hub -j 2 -- --strategy --data-dir C:/tmp/strategy-review
```

Los fixtures son contratos sintéticos de prueba ejecutados por Go; no son
telemetría real ni evidencia de rendimiento o captura física de Windows.

## Evidencia del worker

El crate autónomo pasa fmt/clippy y 4 tests unitarios + 1 test de integridad del
corpus: 34 documentos, 125 entradas del solver. El workspace pasa los tests con
`RUST_TEST_THREADS=2`, incluidos los de Hub (23 unitarios + CLI/arquitectura/pipe).
La primera ejecución, con la concurrencia de tests predeterminada, falló en
`storage/tests/process.rs::actual_writer_preserves_acquisition_and_live_matches_durable_replay`
por timeout de cierre. No se modificó storage ni se excluyó ese test; pasó al
repetir el workspace. Los tests que requieren simuladores permanecen ignorados
según sus condiciones originales.

Go: pasan document, solver y tools/strategy-oracle. `go test -p 2 ./...` falla:
ausencia de `frontend/dist` en este worktree y timeout de readiness en
`voiceinput::TestProcessHostOwnsNoncePIDAndJoinsChild`. No se modificó frontend
ni voiceinput. No se presenta la suite Go completa como verde.

Verificación manual pendiente para Opus/Isaac: abrir un documento V2 exportado,
editar nombre y comprobar que el resto de bytes permanece; crear un evento con
todos sus números explícitos y calcular; guardar/reabrir; modificar el archivo
con otro editor y verificar el conflicto sin sobrescritura; comprobar también
una entrada climática que debe conservarse y rechazarse para cálculo escalar.
