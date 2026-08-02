# ISA-75 / BIL-10 — Informe de implementación

## Resultado

Se añadió observabilidad operativa sin proveedor nuevo:

- señales estructuradas y sanitizadas en el webhook;
- correlation IDs irreversibles en lugar de provider event IDs;
- snapshot agregado server-only para inbox, reconciliación y grants;
- partición durable del inbox por entorno, conservando históricos como
  `unclassified` en vez de atribuirlos sin evidencia;
- evaluación y deduplicación determinista de alertas;
- runbook con owner, umbral, recuperación, rollback y autorización.

## Decisiones

1. No incorporar Sentry, OpenTelemetry ni una red adicional en este corte.
2. El observador nunca puede cambiar una respuesta o efecto comercial.
3. No persistir alertas nuevas: el inbox y las tablas comerciales ya son la
   evidencia durable; el sink solo proyecta señales sanitizadas.
4. Exponer únicamente contadores agregados mediante un RPC exclusivo de
   `service_role`.
5. Replay, apply, reparación y producción conservan autorización humana.

## Evidencia

- Deno activo: 20 archivos, 181/181 tests PASS.
- Type-check del entrypoint `billing-webhook`: PASS.
- PostgreSQL desechable: instalación limpia, upgrade y restore PASS; 20/20
  pruebas de observabilidad en cada ruta, además de las suites de Billing y
  concurrencia completas.
- La transición conserva temporalmente la firma RPC anterior como overload
  server-only que escribe `unclassified`; evita pérdida de webhooks entre la
  migración y el deploy Edge y queda obligatoriamente visible para su retirada.
- Formato Deno y deploy surface incluidos en los gates activos: PASS.
- El intento deliberadamente global excluye `_deprecated/stripe-webhook`: ese
  árbol histórico no forma parte del runtime desplegable ni de la suite activa.

## Seguridad

Las señales aceptan códigos cerrados. Texto libre inválido se convierte en
`redacted`; IDs se resumen con SHA-256 y el snapshot SQL no devuelve filas ni
identificadores. Anon y authenticated no pueden ejecutar el RPC. Sandbox y
producción no comparten identidad idempotente ni contadores del inbox.

## Alcance remoto

No hubo deploy, consulta remota, replay, pago, refund, secreto ni mutación de
Polar/Supabase. Venta pública sigue **NO-GO**.
