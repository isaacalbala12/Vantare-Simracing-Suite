# BIL-05 — runbook de reconciliación Polar

Estado: implementación local; **no desplegada**. Venta pública NO-GO.

## Propósito

Comparar Customer State de Polar con la proyección local sin inferir nunca que
una order lifetime desapareció. El mismo flujo sirve para ejecución manual o
programada y es dry-run por defecto.

## Precondiciones

- BIL-02/03/04 integrados en la base exacta de ISA-179.
- Migración `20260802100000_billing_commercial_projection.sql` aplicada por el
  pipeline autorizado.
- Variables server-side: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `POLAR_ACCESS_TOKEN`, `POLAR_ENVIRONMENT`, `POLAR_PRODUCT_MAP`.
- `POLAR_BENEFIT_CAPABILITIES` solo si existen benefits aprobados; no inventar
  mappings para evitar quarantine.
- Nunca copiar valores secretos a logs, issues o comandos compartidos.

## Dry-run manual

Desde la raíz Git:

```powershell
deno run --allow-env --allow-net supabase/functions/scripts/reconcile-polar-customer-state.ts --environment sandbox --trigger manual
```

El resumen debe indicar `mode=dry-run`. No debe crecer
`billing_reconciliation_runs` ni cambiar resources, grants, entitlements o
subscriptions.

## Apply explícito

Solo después de revisar el dry-run y en el entorno autorizado:

```powershell
deno run --allow-env --allow-net supabase/functions/scripts/reconcile-polar-customer-state.ts --environment sandbox --trigger manual --apply
```

Una tarea programada usa el mismo binario con `--trigger scheduled --apply`.
No mantener dos implementaciones.

## Interpretar el resumen

- `applied`: uno o más recursos aceptaron una versión nueva.
- `unchanged`: plan ya aplicado o sin cambios.
- `quarantined`: producto/benefit desconocido o conflicto; no aplicar a mano.
- `dryRun`: plan seguro calculado sin escribir.

Los resultados solo incluyen contadores. Para investigar una quarantine usar
las tablas server-only y el export sanitizado; no pegar PII en Linear.

## Recuperación

1. Cancelar el proceso; todas las llamadas admiten abort/timeout.
2. Corregir mapping o disponibilidad de Polar, no editar grants directamente.
3. Repetir dry-run.
4. Repetir apply: snapshot+plan idénticos son idempotentes.
5. Si hay conflicto de versión, conservar quarantine y escalar; no aumentar el
   timestamp ni regenerar hashes para forzar el resultado.

## Verificación local

```powershell
deno test --no-lock --no-check --allow-env supabase/functions/_shared/polar.test.ts supabase/functions/billing-webhook/process.test.ts supabase/functions/billing-webhook/commercial-projection.test.ts supabase/functions/billing-webhook/reconciliation.test.ts
supabase/tests/run-supabase-hardening-postgres.ps1
```

El primer comando debe pasar 45 tests. El segundo valida clean/upgrade/restore
con 48 hardening + 53 inbox + 43 proyección + 17 reconciliación pgTAP, once
regresiones adicionales de upgrade legacy, concurrencia y restores fail-closed.
La carrera de reconciliación exige exactamente un `applied`, un `unchanged`,
una fila de auditoría y un recurso final.

El plan transaccional tiene un único máximo de 256 KiB tanto en el RPC como en
la tabla de auditoría. No debe elevarse solo en una de las dos capas.

El bundle compatible solo puede quedar activo por `vantare.plan.pro` o
`vantare.edition.launch_v1`. Un grant de canal o benefit aislado no es una raíz
de producto y no debe añadirse a esta lista sin cambiar antes el catálogo y el
contrato comercial.

## Stop conditions

- benefit o producto no mapeado;
- entorno de mapping/API distinto;
- Customer State incompleto o inválido;
- misma versión remota con hash distinto;
- rate-limit persistente después de reintentos;
- necesidad de tocar refund parcial, recovery o ledger (BIL-06/BIL-07);
- cualquier pago, refund, deploy o mutación productiva no autorizada.
