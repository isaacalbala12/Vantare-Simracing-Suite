# Cuenta, licencias y operación Billing

Entrada contrastada con el código de nightly del 2026-09-14. [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192) mantiene alcance y estado; el [handoff de plataforma](../vantare-program/handoffs/platform-commercial.md) conserva evidencia de los cortes. Esta revisión no comprueba deploys, cuentas, pagos ni configuración remota.

## Autoridades y código

- El [contrato de producto](../vantare-program/product-contract.md) fija Polar como autoridad comercial. Los grants comerciales y las asignaciones operativas son fuentes distintas; un rol de tester/owner no es una compra.
- En este checkout, la cuenta sigue conectada a Supabase: [LoginScreen](../../frontend/src/hub/auth/LoginScreen.tsx), [proveedor de licencia](../../frontend/src/lib/license-provider.tsx), [cliente Go](../../internal/license/supabase_client.go). Una propuesta de migración de identidad no demuestra que este código haya cambiado.
- [Service](../../internal/license/service.go) y [credential.go](../../internal/license/credential.go) realizan validación, caché y credenciales firmadas. El contrato actual no es la antigua caché editable con gracia genérica de 24 horas de Release 02.
- [billing-webhook](../../../supabase/functions/billing-webhook/) y [migraciones](../../../supabase/migrations/) realizan la proyección comercial. Los scripts bajo `_deprecated` son historia, no superficie de despliegue.

## Elegir procedimiento

| Necesidad | Runbook |
|---|---|
| Webhook pendiente, lease, retry o replay | [Inbox durable](bil-02-webhook-inbox-runbook.md) |
| Diferencia entre Polar y proyección local | [Reconciliación](bil-05-reconciliation-runbook.md) |
| Suscripción vencida o recuperación | [Lifecycle](bil-06-subscription-recovery-runbook.md) |
| Compra one-time o refund atribuible | [Ledger](bil-07-order-refund-ledger-runbook.md) |
| Credencial offline, reloj y claves | [Credenciales](bil-08-offline-credential-runbook.md) |
| Aceptación comercial | [Matriz sandbox](bil-09-lifecycle-matrix.md) |
| Métricas, errores y diagnóstico | [Observabilidad](bil-10-observability-runbook.md) |
| Tester, Nightly Tester, Owner o retiro legacy | [Acceso operativo](bil-10c-operational-access-runbook.md) |

Los estados «no desplegado», resultados y recuentos BIL pertenecen a sus cortes originales; releer tarea, SHA y evidencia de despliegue antes de operar. Los comandos Deno/SQL se ejecutan desde la raíz Git; `go run ./cmd/vantare-admin` desde `vantare-v2/`. Las matrices PostgreSQL requieren el entorno Docker/PowerShell declarado por su runner. Dry-run no significa offline: puede leer servicios remotos y necesita el entorno administrativo autorizado.

## Reparación y aceptación

Los comandos legacy `vantare-admin grant`/`revoke` son bocetos no operativos en este checkout: sus helpers devuelven `not implemented in this version`. No reparan la fuente comercial de Polar. Para una discrepancia usar reconciliación y diagnosticar la fuente. Para acceso operativo usar el subcomando auditado, con preview y autorización cuando corresponda. No convertir una incidencia de compra en un grant manual.

Guardar evidencia sanitizada en Notion: código/SHA, entorno, resultado y conteos. No copiar tokens, PII ni material privado. No hay venta pública habilitada por mantener estos runbooks: hacen falta la matriz comercial, el estado verificado y la aceptación aplicable.
