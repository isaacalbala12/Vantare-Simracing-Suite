// Package strategyprojection publica los contratos que Telemetry Analysis
// produce y Strategy Planner consume.
//
// Owner: Telemetry Analysis (ISA-694 F1.2). Strategy solo consume este
// paquete publico; Analysis nunca importa dominio privado de Strategy
// (internal/strategy/*). Esta frontera se verifica con tests de arquitectura.
//
// Ubicacion elegida: internal/telemetryanalysis/strategyprojection
//
// Justificacion:
//   - internal/telemetryanalysis ya es el dueno historico de discovery,
//     staging y del modelo HistoricalSession. Anidar el contrato como
//     subpaquete mantiene cohesion de ownership y evita crear un top-level
//     nuevo (p. ej. internal/strategyprojection) que sugeriria neutralidad.
//   - Al vivir bajo telemetryanalysis, el paquete no puede acceder a
//     storage privado (staging, duckdbadapter, buckets) sin import explicito,
//     lo que hace trivial el guard "Analysis no abre storage privado de Strategy"
//     y su dual.
//   - Es `internal` (no publica fuera del modulo) pero es el API publico
//     dentro del repo, igual que internal/strategy/contract lo es para Strategy.
//   - Alternativas descartadas: crear github.com/vantare/overlays/v2/strategyprojection
//     en la raiz rompe cohesion; reusar internal/telemetryanalysis plano
//     mezcla contratos versionados con parser DuckDB.
//
// Contratos versionados aqui:
//   - StrategyInputProjection v2 (familias degradadas D19)
//   - ObservedStrategy v1
//   - Segmentos temporales v1 (ContinuousSegment, LapBoundary, StintBoundary, TrackLocation)
//
// Cada dato derivado viaja con tres ejes independientes:
//
//	presencia/calidad (Presence), procedencia (ProvenanceKind + reference),
//	y confianza (Confidence: muestra/rango/varianza/version).
package strategyprojection
