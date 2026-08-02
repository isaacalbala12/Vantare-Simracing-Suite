# ISA-72 / BIL-03 — hardening de checkout, mapping y portal

Fecha: 2026-08-02

Base: ISA-166 `c6a3ebf2181e6764a1b204e231cab4a348e3ab95`

Rama: `vantareapp/isa-72-bil-03-hardening-de-checkout-mapping-y-portal`

Estado: implementación terminada en rama aislada; pendiente de review. Venta pública **NO-GO**.

## Objetivo

Cerrar BIL-03 sin realizar operaciones comerciales: convertir el catálogo
aprobado en un contrato local verificable, impedir checkouts duplicados por
reintentos, endurecer la frontera con Polar y retirar la return URL arbitraria
del portal.

## Resultado

### Mapping comercial v2

- Entorno obligatorio: `sandbox` o `production`; mapping y runtime deben coincidir.
- `catalog_version` y `organization_id` obligatorios.
- Relaciones bidireccionales exactas para IDs de producto y precio.
- Contratos exactos de capabilities, canales y alcance Launch Edition v1.
- Launch y Pro obligatorios; Pro Plus reconocido pero fail-closed mientras no
  exista un producto/precio aprobado.
- Entradas inactivas/archivadas no se pueden comprar.
- Trial Pro desactivado por defecto. Solo admite siete días y requiere prueba
  explícita de antiabuso del proveedor. No se inventó ningún ID ni configuración.

### Checkout

- El cliente únicamente controla `productKey` y un `attemptId` UUID.
- La cuenta procede de JWT y debe ser un UUID; email, customer, product y price
  enviados por el cliente se rechazan.
- Body máximo de 4096 bytes, incluido contenido sin `Content-Length` fiable.
- `billing_checkout_attempts` reclama `(user_id, attempt_id)` antes de Polar.
  Carreras concurrentes producen como máximo una llamada remota.
- Un intento completado reutiliza la URL; un estado incierto se bloquea para no
  crear otra sesión posiblemente duplicada.
- Metadata de checkout conserva catálogo, capabilities, canales y alcance.
- `allow_trial=false` se envía expresamente cuando el trial no está aprobado.

### Cliente Polar

- Hosts API canónicos y separados por entorno.
- URLs de checkout/portal devueltas por Polar deben pertenecer al entorno.
- Timeout acotado a 8 s por defecto, cancelación y errores de red sanitizados.
- Las respuestas al cliente nunca incluyen body de Polar, metadata, UUID, email
  ni token. En debug solo puede exponerse el status HTTP del proveedor.

### Portal

- La URL por defecto vive en `PORTAL_RETURN_URL`.
- `PORTAL_RETURN_URL_ALLOWLIST` es un array JSON opcional de URLs HTTPS exactas.
- No se admiten credenciales, fragmentos, subdominios parecidos ni query strings
  no configurados exactamente.
- El frontend normal ya no selecciona la return URL.

## Persistencia y seguridad

La migración `20260802000000_billing_checkout_attempts.sql` crea una tabla
server-only con RLS habilitado y privilegios revocados a `anon` y
`authenticated`. No almacena email. La URL de checkout se conserva únicamente
para reutilizar el intento sin repetir la llamada comercial.

## Pruebas ejecutadas

- Deno focal y compatibilidad Billing/Webhook: 55 tests PASS.
- Frontend focal billing: 9 tests PASS.
- Frontend completo: 177 archivos, 1613 tests PASS.
- Frontend build: PASS.
- ESLint focal billing: PASS.
- `go test ./internal/license/...`: PASS.
- `git diff --check`: PASS.

Checks parciales o no completados:

- `supabase test db`: el Docker local tiene una versión de migración ajena
  (`20260802090000`) que no existe en esta base, por lo que no se reparó ni
  reseteó destructivamente. El test pgTAP queda versionado para un entorno limpio.
- `go test ./...`: no produjo fallo funcional, pero superó el timeout de 120 s.
- ESLint global: cuatro errores preexistentes fuera de billing en Calendar y
  `wails-runtime-topbar-mock.ts`; lint focal del cambio pasa.

## Riesgos y siguientes gates

- Pro Plus y trial continúan indisponibles hasta reconciliación real en Polar.
- La migración debe validarse en una base local limpia antes de cualquier deploy.
- BIL-04 debe convertir webhooks en inbox durable y grants por fuente; este corte
  mantiene compatibilidad con el runtime de entitlements existente.
- Hace falta prueba sandbox autorizada posterior, pero esta rama no crea customer,
  checkout real, order, pago, refund ni webhook replay.
- `VITE_BILLING_ENABLED` continúa siendo un gate separado; no se habilitó venta.

## Rollback

Revertir el commit de ISA-72. Antes de cualquier deploy futuro, retirar la Edge
Function antigua o nueva de forma atómica con su mapping compatible. La tabla
aditiva puede permanecer inerte; su eliminación requiere una migración separada
y confirmación explícita, nunca un borrado manual.
