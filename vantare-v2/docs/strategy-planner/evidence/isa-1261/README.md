# ISA-1261 — recuperación de guardado incierto de correcciones

## Resultado local T14f

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

El servicio ofrece un guardado recuperable sólo para el formato completo actual,
revalida la fuente al cargar o reconocer y conserva compatibilidad con clientes
anteriores. El cliente reconstruye la petición con el nuevo identificador de la
sesión abierta. Strategy la muestra como incierta sin resolver ni reintentar por
su cuenta; una confirmación o resolución sólo limpia el bloqueo después de que
el reconocimiento durable termine.

Evidencia local:

- `go test ./internal/telemetryanalysis`: PASS.
- pruebas focales de servicio/cliente/controller: PASS.
- `pnpm --dir frontend test`: 449 archivos y 3842 pruebas PASS.
- `pnpm --dir frontend typecheck`, `lint`, `i18n:audit` y `build`: PASS.
- `go test ./...` después del build embebido: PASS.
- `python -m pytest .github/scripts`: 259 PASS.

El build mantiene el aviso heredado de chunks mayores de 500 kB y la suite
frontend el `AbortError` no fatal de teardown ya conocido. No se ejecutaron app,
Wails, LMU, DuckDB, push, PR, CI remota, integración ni release. T14 continúa
con T14g, recuperación durable de `save_revision` en Strategy.
