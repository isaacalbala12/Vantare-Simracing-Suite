# BIL-06 — runbook de suscripciones y recuperación

Estado: implementación local; **no desplegada**. Venta pública NO-GO.

## Qué protege este corte

- Una suscripción solo concede acceso hasta un límite demostrado por Polar.
- `past_due` abre como máximo una recuperación técnica de 72 horas por ciclo.
- Retry, replay y reconciliación no reinician esa ventana.
- En el instante exacto del límite el acceso ya está vencido.
- Una revocación afecta únicamente a esa fuente; Launch u otra compra siguen
  evaluándose de forma independiente.

## Precondiciones

- BIL-02 a BIL-05 integrados en la base apilada aceptada.
- Migraciones comerciales aplicadas por el pipeline autorizado, incluida
  `20260802110000_billing_subscription_lifecycle.sql`.
- Mapping de catálogo válido para el entorno y capabilities actuales.
- Trial y Pro Plus permanecen bloqueados si Polar no los demuestra.
- Secretos únicamente server-side; nunca pegarlos en logs, issues o comandos.

## Interpretar estados

- `active` / `trialing` / `uncanceled`: requieren fin de periodo válido.
- `canceled` con cancelación al final: conserva solo el periodo pagado.
- `past_due`: no renueva; usa la fuente recovery del mismo ciclo si procede.
- `unpaid`, `revoked`, `incomplete_expired` o cancelación inmediata: revocan la
  suscripción y cierran recovery.
- `quarantined`: falta evidencia, el producto no es subscription, el trial no
  está permitido o existe conflicto de versión. No corregir grants a mano.

## Reconciliación segura

Ejecutar primero el mismo dry-run de BIL-05. Solo aplicar tras revisar que no hay
issues y dentro del entorno autorizado:

```powershell
deno run --allow-env --allow-net supabase/functions/scripts/reconcile-polar-customer-state.ts --environment sandbox --trigger manual
deno run --allow-env --allow-net supabase/functions/scripts/reconcile-polar-customer-state.ts --environment sandbox --trigger manual --apply
```

El dry-run no escribe proyección ni lifecycle. Repetir apply es seguro: una
proyección `unchanged` vuelve a intentar cualquier efecto lifecycle pendiente,
pero nunca prolonga una ventana ya fijada.

## Limpieza de expirados

La autorización ya excluye grants cuando `expires_at <= now()`. Para mantener
la proyección limpia, el scheduler server-side debe ejecutar periódicamente:

```sql
select * from public.billing_expire_subscription_grants(now());
```

El RPC revoca únicamente grants vencidos de subscription/recovery y refresca
solo los usuarios afectados. No es válido otorgar acceso directo para reparar
una incidencia.

## Recuperación de una incidencia

1. Detener el worker si hay conflicto o datos incompletos.
2. Conservar inbox, resource, cycle y auditoría; no borrar evidencia.
3. Corregir mapping o disponibilidad de Polar.
4. Ejecutar dry-run y revisar el estado calculado.
5. Ejecutar apply: el efecto pendiente converge de forma idempotente.
6. Si la versión es igual con hash distinto, mantener quarantine y escalar.
7. Si una capability fue retirada del mapping, confirmar que queda revocada en
   commercial y recovery; nunca reconstruirla desde historial.

## Verificación local

```powershell
$tests = Get-ChildItem supabase/functions -Recurse -Filter *.test.ts |
  Where-Object { $_.FullName -notmatch '[\\/]_deprecated[\\/]' } |
  Sort-Object FullName | ForEach-Object FullName
deno test --node-modules-dir=auto --allow-env --allow-read --no-lock --no-check @tests
supabase/tests/run-supabase-hardening-postgres.ps1
```

Resultado esperado de este corte: 144 tests Deno y todas las matrices
PostgreSQL clean/upgrade/restore, legacy y concurrencia en verde. Las funciones
Stripe bajo `_deprecated` no forman parte de la superficie activa.

## Stop conditions

- periodo obligatorio ausente o inválido;
- producto/benefit/capability no mapeado;
- trial no habilitado por catálogo;
- mismo timestamp con hash diferente;
- necesidad de refund, chargeback o ledger (BIL-07);
- deploy, pago real, refund, mutación productiva o promoción no autorizados.
