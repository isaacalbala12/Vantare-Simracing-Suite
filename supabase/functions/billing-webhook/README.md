# billing-webhook (Fase 2 — Polar)

**Estado BIL-02:** inbox durable integrado por ISA-179 — pendiente de review y
deploy. La firma Polar se verifica antes de persistir; el inbox usa leases,
efectos reanudables, quarantine y replay auditado. `license_events` queda como
auditoría, no como claim.

El body no autenticado está limitado a 1 MiB mediante `Content-Length` y conteo
real del stream. El texto UTF-8 aceptado llega sin trim ni reconstrucción a la
verificación de firma; el exceso responde `413` antes de verificar o persistir.

Respuestas HTTP:
- `503` — falta `POLAR_WEBHOOK_SECRET` o mapping inválido
- `403` — firma inválida
- `400` — headers/body inválidos
- `413` — body superior al límite de 1 MiB
- `202` — procesado / duplicado / ignorado / cuarentena conocida
- `503` — worker activo o reintento programado sin scheduler local; devuelve
  `lease_expires_at` o `next_attempt_at` y `Retry-After` para conservar el retry
  del proveedor
- `500` — evento verificado y persistido, pero el procesamiento falló; puede
  reintentarse sin perder efectos completados

## Endpoints relacionados

| Función | Auth | Fase |
|---------|------|------|
| `billing-checkout` | JWT Supabase | 2C checkout real |
| `billing-portal` | JWT Supabase | 2E portal real |
| `billing-webhook` | Firma Polar (sin JWT usuario) | 2D |

## Tablas destino (2D)

`billing_webhook_inbox`, `billing_webhook_effects`,
`billing_webhook_replay_audit`, `billing_customers`, `billing_subscriptions`,
`user_entitlements`, `license_events`

## Tests

```bash
deno test --allow-env supabase/functions/_shared/mapping.test.ts \
  supabase/functions/billing-checkout/index.test.ts \
  supabase/functions/billing-portal/index.test.ts \
  supabase/functions/billing-webhook/inbox.test.ts \
  supabase/functions/billing-webhook/process.test.ts \
  supabase/functions/billing-webhook/index.test.ts
```

La migración y el replay están documentados en
`vantare-v2/docs/billing/bil-02-webhook-inbox-runbook.md`.

## Firma Standard Webhooks (#1767)

Cabeceras: `webhook-id`, `webhook-timestamp` (segundos Unix),
`webhook-signature` (`v1,<base64>`, varias firmas separadas por espacios).
HMAC-SHA256 sobre los bytes UTF-8 exactos de `id.timestamp.cuerpo`, sin volver
a serializar JSON. Tolerancia de 300 segundos hacia pasado y futuro; comparación
mediante `crypto.subtle.verify`, antes de persistir. El ACK correcto es **202**.

`POLAR_WEBHOOK_SECRET_FORMAT=standard` es el valor predeterminado: quitar el
prefijo opcional `whsec_` y decodificar Base64. Para un endpoint antiguo cuyo
GET indique `uses_standard_webhook_signature=false`, configurar explícitamente
`POLAR_WEBHOOK_SECRET_FORMAT=legacy_utf8`: bytes UTF-8 de toda la cadena.
No hay fallback automático ni selección por cabeceras/body. Un valor desconocido
o un secreto inválido responde 503 sin persistir ni mostrar el secreto.
Antes de desplegar en otro entorno, consultar ese booleano del endpoint y
configurar su modo; no deducirlo solo por el prefijo. No rotar secretos para
sortear el problema.

Polar llama `raw` al formato JSON del cuerpo, frente a Discord/Slack. No es un
modo de firma ni requiere cambiar el endpoint. El backend actual selecciona
la derivación por fecha de generación del secreto (corte 08-sep-2026); su SDK JS
consultado aún codifica toda la cadena como UTF-8 y solo cubre el modo legacy.
Clerk ya suministra bytes decodificados y mantiene su contrato.

Fuentes primarias consultadas el 24-oct-2026:
- [Emisor Polar](https://github.com/polarsource/polar/blob/main/server/polar/webhook/tasks.py)
- [Corte y derivación](https://github.com/polarsource/polar/blob/main/server/polar/webhook/constants.py)
- [Metadatos GET del endpoint](https://github.com/polarsource/polar/blob/main/server/polar/webhook/schemas.py)
- [SDK JS Polar](https://github.com/polarsource/polar-js/blob/main/src/webhooks.ts)
- [Especificación Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)
- [Vector público fijo](https://github.com/standard-webhooks/standard-webhooks/blob/main/libraries/javascript/src/webhook.test.ts)
