# Strategy del Hub

`../strategy.rs` mantiene el editor, selección, controles, persistencia y ciclo
cancelable del cálculo. `vantare-strategy` posee `ManualEvent`, documento y solver;
el Hub no adquiere telemetría ni alimenta el widget `ui/src/fuel_strategy`.
El Hub no traduce ediciones a punteros JSON: lo hace `ManualEvent` en el crate.
Las lecturas JSON de solo lectura para presentar el documento permanecen aquí.

- `asistente.rs`: creación de carrera; solo la preparación manual alimenta el cálculo.
- `editor.rs` y `view.rs`: páginas, pestañas y navegación.
- `plan.rs`, `stint.rs` y `parada.rs`: resultado, edición y recálculo del plan.
- `state_tests.rs`: caracterización de estados y protección de ediciones/resultados.

El documento conserva bytes y campos no editados, incluso de importaciones Go.
La validación completa 2.0/2.1 y los oráculos permanecen. El cálculo del Hub usa
un plazo de 2 s; no confundir su certificado con precisión frente a carrera real.

Las capturas no son datos reales. `captura.rs` prepara documentos, resultados y
fragmentos de solo lectura bajo `parity-capture` (los helpers puros también se
compilan en tests). `ViewData`, `PlanData` y sus cuatro structs solo existen con
esa feature. El helper `capture!` elimina sus ramas al compilar sin ella: la
construcción distribuida conserva las entradas editables y no incluye los DTO,
punteros a función ni fixtures de Strategy. El contrato de
Análisis nativo y la recuperación de Automático dependen de VANTA-133 / #1974 y #1980.

VANTA-135 retira Automático, Datos, Revisiones y sus rutas de captura. El catálogo, los PNG
y la fixture de revisión originales se conservan como referencias históricas
inertes, con las huellas fijadas por `native/retirement/manifest.json` intactas.
El paso 6 añade referencias nuevas de
[inicio](../../reference/strategy-vanta135/strategy-v5-asistente-inicio.png) y
[sesiones](../../reference/strategy-vanta135/strategy-v5-asistente-sesiones.png):
reflejan la retirada de Automático y de la preparación con sesiones. Los originales
protegidos quedan intactos y las demás referencias siguen vigentes.

Las 13 escenas nativas se capturaron antes y después de mover la demo y tipar
el formulario: 1672×941, dark, cero píxeles distintos en todas ellas. Evidencia
externa: `D:\VantareServer\evidence\isa-1977\paso67-pixel-comparison.json`,
HEAD previo `d019fb3d7` y posterior `42b808141`. Las dos referencias nuevas
son copias exactas de la tanda posterior; no se retocaron las imágenes.

El único destino habitual es `strategy-v2.json`. Si falta, el importador de
solo lectura verifica v1/v2 y crea el documento nativo una vez. Nunca modifica
`strategy-repository.json`. Abrir un documento dañado usa la cuarentena común;
las versiones futuras y los archivos que no se pueden archivar se protegen.
