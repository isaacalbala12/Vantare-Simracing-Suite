# Strategy del Hub

`../strategy.rs` mantiene el editor, selección, formulario, persistencia y ciclo
cancelable del cálculo. El crate `vantare-strategy` posee documento y solver;
el Hub no adquiere telemetría ni alimenta el widget `ui/src/fuel_strategy`.

- `asistente.rs`: creación de carrera; solo la preparación manual alimenta el cálculo.
- `editor.rs` y `view.rs`: páginas, pestañas y navegación.
- `plan.rs`, `stint.rs` y `parada.rs`: resultado, edición y recálculo del plan.
- `revisiones.rs`: segundo almacén de borradores/revisiones; se sustituirá por importación de una vez.
- `state_tests.rs`: caracterización de estados y protección de ediciones/resultados.

El documento conserva bytes y campos no editados, incluso de importaciones Go.
La validación completa 2.0/2.1 y los oráculos permanecen. El cálculo del Hub usa
un plazo de 2 s; no confundir su certificado con precisión frente a carrera real.

Las capturas no son datos reales. En este estado siguen mezcladas con las vistas;
VANTA-135 las aislará bajo `parity-capture`. El contrato de Análisis nativo y la
recuperación de Automático dependen de VANTA-133 / #1974 y #1980.

VANTA-135 retira Automático, Datos y sus rutas de captura. El catálogo, los PNG
y la fixture de revisión originales se conservan como referencias históricas
inertes, con las huellas fijadas por `native/retirement/manifest.json` intactas.
Las capturas `asistente-inicio` y `asistente-sesiones` se regenerarán en el
paso 6; las demás referencias siguen vigentes.
