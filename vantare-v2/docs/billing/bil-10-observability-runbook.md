# BIL-10 — Observabilidad y operación de Billing

## Contrato

Billing genera dos niveles de evidencia sin PII:

1. señales inmediatas del webhook (`billing-operational-signal`), con código,
   severidad, entorno, tipo de evento sanitizado y un correlation ID SHA-256
   truncado; nunca incluye el ID original, payload, email o error libre;
2. snapshot agregado `billing_observability_snapshot(environment, now)`,
   accesible solo a `service_role`, sin usuarios ni recursos individuales.

El inbox queda particionado desde la recepción por `sandbox` o `production`.
Los recibos anteriores a BIL-10 no se atribuyen retroactivamente: conservan el
estado explícito `unclassified`, aparecen en su contador propio y nunca se
mezclan con el lag o los estados de un entorno conocido.

Orden de despliegue seguro futuro: aplicar primero la migración; el runtime
anterior seguirá recibiendo mediante el overload server-only y marcará esas
entregas como `unclassified`. Desplegar después la función Edge nueva y
confirmar que el contador deja de crecer. Retirar el overload legado únicamente
en un corte posterior, tras comprobar tráfico cero. Invertir el orden no está
autorizado.

Una caída del sink de señales no cambia la respuesta del webhook ni el estado
comercial. No se añadió una plataforma de observabilidad ni una dependencia.

## Ownership y objetivos

| Área | Owner operativo | Escalado |
|---|---|---|
| Webhook, inbox y replay | Backend/Billing | Isaac ante quarantine o replay |
| Reconciliación y grants | Backend/Billing | Isaac ante drift o reparación |
| Supabase, backup y restore | Backend/Plataforma | Proveedor + Isaac |
| Catálogo Polar | Billing/Producto | Isaac; nunca corregir silenciosamente |

- RPO provisional: 24 horas. Cinco minutos solo después de demostrar PITR remoto.
- RTO objetivo: 4 horas, pendiente del drill remoto autorizado.
- Diagnóstico sanitizado local: máximo 7 días. Las señales en la plataforma que
  se elija después deben respetar su política aprobada antes de desplegarse.

## Snapshot agregado

Ejecutar únicamente con una sesión administrativa autorizada y empezar siempre
por `sandbox`:

```sql
select public.billing_observability_snapshot('sandbox', now());
```

El resultado contiene:

- inbox: received, processing, failed, quarantined, retries vencidos, leases
  huérfanos, redeliveries duplicadas, lag más antiguo, replays en 24 h y
  recibos legacy sin clasificar;
- reconciliación: ejecuciones, quarantines, cambios y edad del último éxito;
- proyección: recursos con conflictos, eventos stale e incoherencias de grants.

El módulo `observability.ts` convierte el snapshot en alertas y las deduplica
durante 15 minutos. Una escalada de warning a critical rompe el cooldown.

## Runbooks

### BIL10-ENDPOINT-DISABLED — endpoint sin configuración

- Señal: `endpoint_disabled`, critical.
- Acción: confirmar variables públicas/secretos por nombre y presencia, nunca
  imprimir su valor; mantener checkout deshabilitado.
- Recuperación: corregir configuración mediante cambio autorizado, ejecutar
  tests y un webhook firmado de sandbox.
- Rollback: volver a la configuración anterior; no crear un secreto improvisado.

### BIL10-SIGNATURE — firmas inválidas

- Señal: `signature_invalid`, warning.
- Alerta: agrupar por entorno y ventana; nunca por ID original.
- Acción: distinguir reloj, secreto equivocado y tráfico no autorizado. No
  registrar headers o body.
- Escalado: volumen sostenido o aparición tras una rotación.

### BIL10-MAPPING — catálogo desconocido

- Señal: `mapping_invalid`, critical.
- Acción: detener checkout y procesamiento del producto afectado, comparar el
  mapping versionado con Polar mediante inventario read-only.
- Rollback: restaurar la última versión aprobada. Nunca mapear por precio o
  nombre “parecido”.

### BIL10-WEBHOOK-LAG — oldest pending > 300 s

- Acción: comprobar disponibilidad de Supabase y worker, tasa de entrada y
  leases. Preservar inbox; no descartar eventos.
- Recuperación: reanudar worker y observar que lag y cola descienden.
- Escalado: si crece durante 15 minutos o afecta producción.

### BIL10-WEBHOOK-ORPHAN — lease vencido en processing

- Acción: confirmar que el worker original terminó y que el lease está vencido.
  Permitir el claim normal; no editar la fila.
- Rollback: desactivar temporalmente el worker nuevo si aparecen dos dueños.

### BIL10-INBOX-UNCLASSIFIED — recibos legacy sin entorno

- Acción: no reproducir ni atribuir automáticamente. Revisar la procedencia con
  evidencia de configuración y el replay auditado.
- Escalado: cualquier fila impide afirmar que el inbox histórico está separado
  por entorno.
- Rollback: conservar `unclassified`; nunca adivinar sandbox o producción.

### BIL10-RETRY — más de 10 retries vencidos

- Acción: agrupar por `last_error_code` sanitizado y comprobar red/proveedor.
- El retry normal conserva efectos completados. No reiniciar contadores.

### BIL10-QUARANTINE — cualquier quarantine

- Acción: revisar código, event type, hash/correlation y mapping sin abrir el
  payload completo salvo autorización explícita.
- Replay: requiere issue, actor, motivo y aprobación de Isaac. Primero reproducir
  en sandbox; después usar el replay auditado existente.
- Rollback: si reaparece, detener; nunca forzar grants manualmente.

### BIL10-RECONCILIATION — plan quarantined

- Ejecutar primero un Customer State read-only y construir dry-run.
- Dry-run y apply requieren issue/autorización separadas; el dry-run escribe cero.
- Si el plan contiene unknown product/benefit o conflicto, no aplicar.

### BIL10-PROJECTION-DRIFT — conflicto de versión

- Acción: conservar la versión remota más nueva, comparar hashes y evento
  atribuido. No rebajar monotonicidad ni editar timestamps.
- Reparación: mediante reconciliación autorizada, nunca SQL ad hoc.

### BIL10-GRANT-INCOHERENT — grant activo vencido o sin límite

- Acción: deshabilitar venta, capturar snapshot agregado y localizar el recurso
  en una sesión administrativa controlada.
- Reparación: reconciliación Customer State; si no converge, rollback de runtime
  y mantener NO-GO.

### BIL10-NETWORK — Supabase o Polar no disponibles

- El webhook ya verificado permanece retryable; no se afirma éxito si falta la
  persistencia requerida.
- No abrir circuitos que concedan acceso. La app conserva únicamente el
  entitlement firmado hasta su expiración real.

## Simulación y validación

```powershell
deno test --allow-env --allow-read --no-lock --no-check `
  supabase/functions/billing-webhook/observability.test.ts `
  supabase/functions/billing-webhook/index.test.ts

./supabase/tests/run-supabase-hardening-postgres.ps1
```

La simulación debe demostrar sanitización, fallo de sink no bloqueante,
umbrales, cooldown, separación sandbox/production, legado sin clasificar,
instalación limpia, upgrade y restore. No ejecuta replay, deploy, pago, refund
ni consulta productiva.
