# Briefing 09 · Telemetría (`?view=telemetria`)

## Objetivo
Portar `TelemetryPage.tsx` a la estructura **mapa → trazas → insights** de Orbit. Hasta que exista la fuente de sesiones (DuckDB, ADR 0005 / TA-02+), la vista muestra un **estado vacío honesto** con la misma estructura y, opcionalmente, un modo demo etiquetado "Datos sintéticos" detrás de flag.

## Estructura (`height:100%`)
- Cabecera: eyebrow "Análisis post-sesión", h2 = sesión (circuito · coche), lead; `Seg` referencia (vs mejor propia / vs mejor sesión / vs referencia Vantare); `SubtleStatus` (Datos sintéticos / sesión real).
- `StatRow`: Vuelta analizada · Delta a referencia (hot) · Sectores (S1/S2/S3 coloreados) · Consistencia (ok).
- Grid `400px | 1fr` × filas `auto | 1fr` (`flex:1; min-height:0`): **Mapa** (col 1, fila 1: `TrackMap` con tramos por curva coloreados, etiquetas T1…, meta, coche; leyenda gana/neutro/pierde) · **Dónde se va el tiempo** (col 1, fila 2: lista de insights ordenados por pérdida `Tn · título · explicación · ±s · m`, scroll interno) · **Trazas** (col 2, filas 1–2: `Trace` Velocidad 150 / Acelerador-Freno 100 / Volante 80 / Delta 110, `Seg` Distancia/Tiempo, cursor con "m · km/h", leyenda).
- Columna contextual: eyebrow "Sesiones" con `ListRow` (circuito · coche, fecha · vueltas · mejor) + hint de fuente.

## Comportamiento
- Hover en trazas mueve cursor + coche en el mapa; clic en tramo/insight enfoca ambos; cambiar referencia reescala deltas e insights.
- Estado vacío: sin sesiones → mapa/trazas/insights vacíos con mensaje "No hay sesiones disponibles · importa archivos locales de LMU cuando el flujo esté disponible".

## Criterios de aceptación
- [ ] Sin scroll de página; insights con scroll interno; trazas con alturas fijas.
- [ ] Sincronía cursor↔mapa↔insights.
- [ ] Modo demo (si se implementa) marcado como sintético en cabecera y en la nota; nunca por defecto en producción.
- [ ] Captura ≈ `evidence/telemetria.png`.

## Referencias
`06 § Telemetría`, `04` (Trace, TrackMap, StatTile), `13.6`, `14 telemetry.*`, `docs/adr/0004`, `docs/adr/0005`.
