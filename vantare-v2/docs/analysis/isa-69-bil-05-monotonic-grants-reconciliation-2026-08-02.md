# ISA-69 / BIL-05 — orden monótono, grants y reconciliación Polar

Fecha: 2026-08-02
Base exacta: `edcaffa098b7e705456406f11b6bb74e37256a68`
Estado: candidato implementado en rama aislada; sin deploy ni mutación remota.

## Objetivo y resultado

BIL-05 elimina el último writer comercial colapsado. Cada order, subscription o
benefit grant conserva identidad, versión y grants propios. Polar sigue siendo
la autoridad comercial; Supabase conserva una proyección operacional y
`user_entitlements` queda exclusivamente como read-model compatible derivado.

El webhook durable de BIL-02 no cambia de responsabilidad: recibe antes de
efectos, reclama con lease, reintenta solo efectos pendientes, mantiene
quarantine/replay y completa también los eventos antiguos como no-op auditado.
`billing_subscriptions` se conserva como read-model compatible, pero solo se
sincroniza después de que la proyección monótona acepte `apply` o `duplicate`.

## Contrato de versión por recurso

La clave es `(provider, environment, resource_type, resource_id)` y la versión
es `(modified_at, snapshot_hash)`:

| Comparación | Resultado | Escritura comercial |
| --- | --- | --- |
| Recurso inexistente | `apply` | Crea recurso y grants |
| Timestamp más reciente | `apply` | Actualiza únicamente esa fuente |
| Mismo timestamp y mismo hash | `duplicate` | Cero escrituras de recurso/grants |
| Timestamp anterior | `stale_noop` | Solo incrementa auditoría stale |
| Mismo timestamp y hash distinto | `version_conflict` | Quarantine; no cambia grants |

El hash SHA-256 se calcula sobre un snapshot canónico que incluye usuario,
entorno, tipo/id, estado y grants ordenados. Un refund de una compra no puede
revocar otra compra ni una subscription independiente.

## Grants y read-models

`billing_access_grants` guarda cada capability por fuente. Una fuente ausente
en un snapshot nuevo se revoca solo dentro de esa misma fuente. La migración
preserva los entitlements anteriores como fuente `legacy/unknown_source`:
Customer State no enumera orders lifetime y su ausencia nunca se interpreta
como revocación.

`billing_refresh_entitlement_read_model` deriva la fila `bundle` de
`user_entitlements` únicamente desde capabilities raíz activas:
`vantare.plan.pro` o `vantare.edition.launch_v1`. Un canal, benefit o capability
auxiliar aislado nunca amplía acceso a toda la suite. La tabla rechaza nuevas
filas activas que no sean el bundle derivado. Los rows legacy se convierten en
grants equivalentes y sus antiguos rows quedan revocados, evitando dos
autoridades paralelas. No existe un writer TypeScript alternativo.
`billing_subscriptions` sigue siendo compatible para consumidores existentes,
marcado `metadata.derived=true`.

## Reconciliación con Customer State

La implementación usa el endpoint oficial
`GET /v1/customers/external/{external_id}/state`. Polar documenta que Customer
State contiene subscriptions activas y benefits concedidos, pero no el ledger
de orders. Por eso:

- una subscription remota activa crea/renueva sus grants;
- una subscription local activa ausente se proyecta como revocada usando la
  observación más reciente;
- un benefit local ausente revoca únicamente las capabilities ya conocidas de
  ese benefit; nunca afecta a otra fuente;
- orders y fuentes legacy se preservan sin inferir revocación;
- benefits solo se aplican si existe mapping explícito benefit → capabilities;
- producto o benefit desconocido pone el plan completo en quarantine;
- el plan se ordena y hashea antes de aplicar;
- el RPC aplica el plan en una transacción, con prevalidación de conflictos;
- repetir el mismo snapshot+plan devuelve `unchanged` sin duplicar auditoría.

Customer State se normaliza antes de hashearlo: subscriptions, benefits y
capabilities se ordenan de forma estable. El RPC y la tabla de auditoría
comparten un único límite de 256 KiB; un plan mayor se rechaza antes de tocar
recursos o grants.

La migración legacy trata `past_due` de forma fail-closed. Solo conserva acceso
si existe `expires_at` verificable y lo limita a `min(expires_at, updated_at +
3 días)`. Sin `expires_at` crea un grant revocado y convierte inmediatamente el
bundle compatible al read-model derivado; nunca fabrica acceso indefinido.

El motor soporta `manual` y `scheduled`. El comando operativo es dry-run por
defecto; `--apply` debe ser explícito. La paginación local usa lotes acotados y
cursores, detecta cursores repetidos y respeta cancelación. El cliente Polar
limita timeout y reintentos y reconoce `Retry-After` en segundos o fecha HTTP.
La documentación oficial indica 500 peticiones/minuto en production y 100 en
sandbox.

Referencias oficiales:

- https://polar.sh/docs/api-reference/customers/get-customer-state-by-external-id
- https://polar.sh/docs/integrate/customer-state
- https://polar.sh/docs/api-reference/introduction#rate-limits

## Matriz de estados de este corte

| Evento | Recurso | Estado de grants BIL-05 |
| --- | --- | --- |
| `order.paid` Launch | order | activos, lifetime |
| `order.refunded` Launch | order | revocados para esa order |
| `subscription.created/active/updated` | subscription | activos hasta `current_period_end` |
| `subscription.canceled` | subscription | activo solo si cancel-at-period-end conserva periodo; en otro caso revocado |
| `subscription.past_due` | subscription | no concede acceso nuevo en BIL-05 |
| `subscription.revoked` | subscription | revocado |

La ventana exacta de recuperación de pago, `paidThrough` y transiciones
past-due pertenecen a BIL-06. Refund parcial, chargeback y ledger completo
pertenecen a BIL-07. Este corte no anticipa esas políticas.

## Seguridad y privacidad

- Tablas y RPC nuevos tienen RLS y no son accesibles a `anon` o
  `authenticated`; solo `service_role` puede aplicar.
- Customer State se solicita server-side con OAT; nunca desde el cliente.
- No se persisten emails ni cuerpos completos de Polar en la reconciliación.
- El comando imprime únicamente contadores agregados, no IDs de usuario.
- El dry-run no llama al RPC de escritura y produce cero filas de auditoría.
- No se ejecutó el comando contra sandbox o production en esta tarea.

## Evidencia

- Deno focal: 45/45 PASS en webhook, proyección, reconciliación y cliente
  Polar. Suite activa adicional: 101/101 PASS, incluido firmado del webhook.
- PostgreSQL 17 desechable: clean install, upgrade y restore PASS con 48
  hardening + 53 inbox + 43 proyección + 17 reconciliación pgTAP; upgrade
  legacy adicional 11/11 para `past_due` con/sin evidencia y retiro de la
  autoridad paralela.
- Carreras de inbox/dispositivo y reconciliación continúan fail-closed. Dos
  reconciliaciones idénticas se serializan por cuenta: exactamente una devuelve
  `applied`, otra `unchanged`, existe una auditoría y ningún error.
- Restore truncado/corrupto continúa fail-closed.
- Casos específicos: orden inverso, timestamp igual/hash igual sin escrituras,
  timestamp igual/hash distinto en quarantine, grants independientes, lifetime
  desconocido preservado, dry-run cero escrituras, apply repetible,
  channel-only sin bundle, roots Pro/Launch válidas, revocación del último root,
  límite de plan antes de escrituras, migración `past_due` acotada,
  paginación, cancelación, timeout y ambas formas de Retry-After.

## Riesgos y límites

- El catálogo remoto todavía no tiene Pro Plus, benefits ni trial aprobados;
  un benefit desconocido se bloquea deliberadamente.
- No se añadió `customer.state_changed` al webhook remoto: es una operación de
  proveedor posterior y autorizada por separado.
- No se hizo smoke con datos comerciales reales, deploy ni migración remota.
- BIL-06 y BIL-07 deben completar recovery/refunds antes de vender.
- Venta pública sigue **NO-GO**.

## Rollback

Revertir el commit retira el nuevo writer y la migración antes de deploy. Si una
migración futura ya se aplicó, no se deben borrar tablas con datos: se desactiva
el caller, se conserva auditoría y se prepara una migración forward-only. No se
ejecutaron acciones que requieran rollback remoto en este corte.
