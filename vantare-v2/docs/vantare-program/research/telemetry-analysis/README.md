# Telemetry Analysis — investigación canónica (TA-01)

Estado: investigación canónica en revisión; no es código de producto ni una
autorización de promoción a `nightly`.
Fecha de corte: 2026-07-27. Issue: ISA-122 / TA-01. Base: GOV-01 `67e263392b2192ee11f2ef4ccb161331dda3c735`.

## Objetivo y alcance

Definir, a partir de evidencia primaria y de los contratos existentes, una experiencia post-sesión local-first que responda **«¿cómo puedo ser más rápido?»** en menos de un minuto y permita profundizar en un workspace avanzado. Este paquete investiga productos, fuentes LMU y el repo; no implementa producto, no añade dependencias y no modifica LMU, SimHub ni datos de usuario.

La investigación usa documentación oficial, manuales o políticas de cada
proveedor. Las conclusiones marcadas **Hecho** tienen una fuente; **Inferencia**
conecta evidencia; **Propuesta Vantare** debe cerrarse mediante review y quedar
trazada antes de implementarse. No se ha creado cuenta, usado trial, pagado,
aceptado términos adicionales ni inspeccionado binarios de terceros.

## Índice ejecutable

| Documento | Uso |
|---|---|
| [Fuentes y método](sources.md) | procedencia, licencia y límites clean-room |
| [Matriz competitiva](competitive-matrix.md) | problema, flujo, UI, datos, confianza y huecos |
| [LMU y repo](lmu-repository-findings.md) | evidencia local, canales, fixtures y fronteras |
| [Contrato de producto](product-contract.md) | comportamiento observable del primer producto |
| [Arquitectura](architecture.md) | importación, índice, normalización, comparación y recomendaciones |
| [Caracterización LMU DuckDB](lmu-duckdb-characterization.md) | schema real sanitizado, tiempo, integridad y decisión de dependencia |
| [Decisión del adapter DuckDB](duckdb-adapter-decision.md) | matriz de opciones, spike Windows, seguridad, packaging y recomendación TA-03B |
| [Microplan TA-03C](ta03c-duckdb-adapter-plan.md) | ejecución TDD del helper fuera de proceso tras re-review y aprobación de ADR 0010 |
| [Inventario de licencias DuckDB 1.5.5](evidence/duckdb-1.5.5-windows-amd64-license-inventory.md) | componentes exactos, hashes, obligaciones y conclusión comercial |
| [SBOM SPDX DuckDB 1.5.5](evidence/duckdb-1.5.5-windows-amd64.spdx.json) | SBOM reproducible del runtime Windows amd64 evaluado |
| [Modelo histórico v1](historical-model.md) | contratos compilables de sesión/canal/vuelta/calidad y parser paginado |
| [UI/UX](ui-ux.md) | flujo, accesibilidad, estados y criterios visuales |
| [Plan y microcortes](plan-microcuts.md) | backlog TDD ordenado, dependencias y gates |
| [Referencia HTML](telemetry-analysis-reference.html) | prototipo propio, local y navegable |

## Decisiones consolidadas

La galería reúne archivos LMU, grabaciones Vantare de otros simuladores e importaciones. Se indexa por defecto sin mover el original; copiar a biblioteca es opcional. El resumen muestra mejor vuelta, consistencia y las tres pérdidas más accionables. El workspace avanzado compara dos vueltas primarias, admite hasta cuatro trazas y alinea por distancia; el resto se resume estadísticamente. La referencia HTML usa exclusivamente datos ilustrativos y demuestra navegación/selección, no un parser ni un análisis real.

Todos los canales se conservan con selector, categorías, favoritos y presets. Las derivaciones iniciales son oficiales y versionadas; no se aceptan fórmulas personalizadas en el primer corte. Mapa, trazada, tabla, vuelta teórica etiquetada, notas/correcciones no destructivas, tarjetas de curva, CSV y paquete Vantare están dentro del contrato. Las recomendaciones son deterministas, deben enlazar evidencia y confianza, y un LLM futuro solo puede explicar el resultado: nunca sustituirlo.

## Límites que siguen abiertos

El catálogo actual no demuestra distancia de vuelta, progreso de pista, longitud, sector o coordenadas suficientes para comparación por distancia. Tampoco hay fixtures reales de LMU para boxes y garaje, ni prueba manual nueva de captura. La primera implementación no puede inventar esos datos: debe desbloquearlos con capture sanitizada y contrato versionado o degradar explícitamente las vistas afectadas.

## Cómo revisar

Abra [telemetry-analysis-reference.html](telemetry-analysis-reference.html) en Chromium u otro navegador moderno. Navegue por Galería, Resumen, Workspace y Estados con ratón o teclado; los controles no leen archivos ni envían datos. Revise luego los enlaces de `sources.md`, las trazas de cada decisión y la lista de microcortes antes de autorizar código.
