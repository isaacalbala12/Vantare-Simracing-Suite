# BIL-02 — Inbox durable y replay seguro de webhooks

Estado: integrado por ISA-179 junto con BIL-03 y BIL-04; el candidato conjunto
permanece en review independiente. Este documento no autoriza deploy, pagos,
replay remoto ni activación de Billing.

## Problema cerrado por el corte

El flujo anterior insertaba `license_events` como claim antes de aplicar los
efectos comerciales. Si el proceso fallaba después, la reentrega encontraba el
identificador duplicado y no terminaba los efectos pendientes. El evento podía
quedar perdido aunque Polar lo reenviara.

El flujo nuevo separa cuatro responsabilidades:

1. La entrada se limita a 1 MiB y la firma se verifica sobre el body UTF-8
   original, sin trim ni reconstrucción.
2. La entrega se guarda en `billing_webhook_inbox` antes de mutar estado
   comercial.
3. Un worker obtiene un lease atómico y ejecuta efectos idempotentes con estado
   independiente.
4. El evento solo pasa a `processed` cuando todos los efectos aplicables y la
   auditoría han terminado.

Recibir un webhook nunca concede acceso por sí mismo.

## Estados y garantías

| Estado | Significado |
|---|---|
| `received` | Persistido y disponible para claim. |
| `processing` | Un worker posee un lease temporal. |
| `processed` | Todos los efectos aplicables terminaron. |
| `failed` | Fallo transitorio; espera el siguiente intento. |
| `quarantined` | Requiere revisión: identidad/hash, mapping o reintentos agotados. |

- Identidad: `(provider, provider_event_id)`.
- Integridad: SHA-256 del body verificado. El mismo ID con otro hash se pone en
  cuarentena.
- Concurrencia: el claim se serializa en PostgreSQL; solo un worker obtiene el
  lease vigente.
- Crash: un lease expirado puede reclamarse.
- Efectos: cada efecto tiene su propio estado. En una reanudación se omiten los
  completados y se repiten únicamente los pendientes. Las escrituras actuales
  son upserts deterministas o inserts protegidos por unicidad.
- Retry: backoff exponencial desde 30 segundos, máximo una hora y cinco intentos
  por defecto. Al agotar el límite, el evento se pone en cuarentena.
- Mientras no exista un scheduler local, tanto un lease activo como una entrega
  recibida antes de `next_attempt_at` responden `503` para que Polar conserve su
  redelivery; nunca se confirman con `202` como si hubiera un consumidor
  diferido. La respuesta incluye `lease_expires_at` o `next_attempt_at` y deriva
  `Retry-After` de ese timestamp durable.
- Errores: se persisten códigos sanitizados; nunca mensajes, emails, tokens ni
  bodies en logs de error.

## Datos y acceso

El payload guardado se reduce a los campos que usa el procesador actual y elimina
`customer_email`, `customer.email`, nombre y PII redundante. La proyección de
`billing_customers` conserva identificadores técnicos, no copia el email del
webhook. Las tablas de inbox, efectos y replay tienen RLS sin políticas de
cliente y sus RPC solo se conceden a `service_role`.

Retención operativa:

- Payload de eventos procesados: 30 días.
- Payload de cuarentena: 180 días para investigación.
- La identidad, hash, estados y auditoría pueden conservarse sin el payload.

La función administrativa `billing_purge_webhook_payloads` sustituye el payload
vencido por un marcador no sensible. Debe programarse en el entorno operativo
durante un corte posterior de despliegue; BIL-02 no cambia producción.

## Replay manual

El replay es una acción administrativa, nunca una operación del cliente:

1. Revisar la causa sin copiar PII a Linear o logs.
2. Corregir mapping/configuración si corresponde.
3. Elegir un `actor_id` técnico no personal y un `reason_code` estable.
4. Invocar `billing_replay_webhook` con `service_role` mediante una herramienta
   administrativa aprobada.
5. Ejecutar el procesador sobre el item reencolado.
6. Verificar que solo se ejecutaron efectos pendientes y que el evento terminó
   en `processed` o volvió a una cuarentena explicable.

No usar emails como `actor_id` ni texto libre como motivo. El replay conserva los
efectos completados y registra estado anterior, actor técnico, motivo y fecha.
Un payload ya purgado no puede reencolarse.

## Migración y rollback

Migración forward:

`supabase/migrations/20260802090000_billing_webhook_inbox.sql`

Antes de desplegarla deben pasar las pruebas Deno y `supabase test db` contra una
base local limpia. Después del deploy, el código antiguo sigue pudiendo usar
`license_events`; las tablas nuevas son aditivas.

Rollback de aplicación: volver a la Edge Function anterior. No eliminar tablas
ni filas durante el incidente. Los eventos recibidos en el inbox se conservan
para rescate.

Rollback de esquema, únicamente después de exportar la evidencia y confirmar
consumidores cero:

1. Revocar las nueve RPC operativas y la RPC de purga.
2. Eliminar funciones de inbox/replay.
3. Eliminar primero `billing_webhook_replay_audit` y
   `billing_webhook_effects`.
4. Eliminar `billing_webhook_inbox` al final.

Este rollback destructivo requiere autorización explícita y no forma parte de
ISA-68.

## Validación requerida

- Fallo inmediatamente después del claim: el evento queda recuperable.
- Fallo entre dos efectos: solo se reintenta el pendiente.
- Dos workers: uno procesa, el otro recibe `busy` internamente y HTTP conserva
  el redelivery mediante `503`, `lease_expires_at` y `Retry-After`.
- Dos sesiones PostgreSQL reales: la segunda bloquea en el row lock y, tras el
  commit de la primera, observa `busy`; solo se consume un intento.
- Rollback de una sesión: revierte lease y contador; otra sesión puede reclamar
  y deja `attempt_count = 1`.
- Redelivery procesada: no duplica grants.
- Lease huérfano: se reclama después de expirar.
- Hash diferente con el mismo ID: cuarentena.
- Retry agotado y replay: auditoría sin PII y efectos completados preservados.
- RPC/tablas inaccesibles para `authenticated`.
- La recepción por sí sola no crea `user_entitlements`.

## Fuera de alcance

- Reconciliación con Customer State: BIL-03.
- Grants independientes y política comercial de suscripción/refund: cortes
  posteriores.
- Scheduler, deploy de funciones, configuración Polar, smoke monetario o replay
  en producción.
