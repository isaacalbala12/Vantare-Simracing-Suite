# ISA-1261 — recuperación de guardado incierto de correcciones

## T14f1 — custodia en el owner

El `CorrectionStore` privado conserva una intención mixta completa antes de que
el servicio ejecute `SaveCorrections`. Los cuatro conjuntos son obligatorios y
distinguen vacío explícito de ausencia; el digest canónico ya usado por Save y
Resolve sella base, comando y payload. Sólo puede existir una intención por base.

La lectura tras reconstruir el store no abre ni autoriza la fuente. Una cabeza
posterior no elimina el pendiente. El reconocimiento exige su `commandId`, es
idempotente y usa el mismo lease, backup validado y commit atómico que el
historial. Un documento manipulado falla cerrado. Si se pierde la confirmación
después de escribir, la reapertura recupera la intención exacta y su reintento
no la duplica ni mueve la cabeza del historial.

Evidencia local: `go test ./internal/telemetryanalysis` PASS. Continúa T14f2
con la operación mínima del servicio/bridge y el cliente TypeScript. No se ha
ejecutado todavía la suite Go global ni frontend, app, Wails, LMU o DuckDB.
