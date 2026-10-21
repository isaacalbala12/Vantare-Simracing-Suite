# Cloudflare: inventario y configuración pendiente · VANTA-96

Verificado 21-oct-2026 18:09 UTC por Management API de Cloudflare, sin mutaciones.
Cuenta de producción ya autorizada; el token permite listar Workers y Pages.
Fuentes: master web d9f040ae584e8db52caf13ccc713da6c8d589f36 y web-compra
33e27b2ffaa5bdc9f0bdf6ec6ad13aad16041c81. No se leen valores de configuración remota.

| Superficie | Nombres presentes | Qué falta para el código vigente |
|---|---|---|
| beta, sirve vantare.app | ASSETS (assets), WAITLIST_DB (D1); cero secretos | Nada con waitlist/venta cerradas. WAITLIST_OPEN ausente mantiene cierre; WAITLIST_RATE_SALT solo hace falta al abrir waitlist. |
| vantare-simracing-suite-web | Sin bindings ni secretos; sin dominio propio asociado en la cuenta | No hay una ruta de compra vigente que configurar. La descarga del script no expone código; no afirmar equivalencia con beta. |
| Pages | API responde con cero proyectos | Nada que configurar en esta cuenta. |

El bundle de beta lee únicamente ASSETS, WAITLIST_DB, WAITLIST_OPEN y
WAITLIST_RATE_SALT. La extracción inicial no reconoció las partes MIME;
se corrigió incluyendo MIME-Version y se confirmó una parte JavaScript.
No confundir un fallo de extracción con ausencia de requisitos.
El otro Worker devuelve contenido vacío; su inventario de bindings sí es legible.

Resultado: cero secretos obligatorios ausentes del código que sirve vantare.app;
cero valores cargados y cero deploys. No se añaden claves de compra a una landing
que no las usa. Deployment de beta sigue siendo d14e7efe-aeec-455e-b81f-e69850f14606,
versión 186d24e0-0640-4697-86a3-b4c82166c66c, 15-oct. Sin flags modificados.

## Preparación de web-compra (todavía no publicada)

Estos nombres faltan en beta para la rama futura, pero no bloquean la landing.

| Nombre | Custodia / dependencia |
|---|---|
| CLERK_SECRET_KEY | Disponible en supabase-prod-secrets.env. |
| SUPABASE_SERVICE_ROLE_KEY | Disponible en custodia protegida de claves legacy. Solo servidor. |
| POLAR_ACCESS_TOKEN | polar-token-backend disponible; insuficiente para el código web: también necesita products:read y discounts:read además de checkouts:write. Un token de lectura separado permite diagnosticar, pero no crear checkout con este código que usa una sola variable. |
| POLAR_PRODUCT_MAP | Archivo canónico del repo; tratar como configuración privada completa. |
| PURCHASE_RATE_SALT | Generable criptográficamente en la fase autorizada; no requiere valor de Isaac. |
| PURCHASE_ERASURE_SALT | Custodia interna existente; no rotar. |
| PURCHASE_ERASURE_ACK_SECRET | Custodia interna existente; debe coincidir con la prueba SQL. |
| D1_ERASURE_JWT | Generable con la clave ES256 custodiada y claims mínimos; dura como máximo 1 h. Requiere renovación cada 30 min; no precargar un JWT que caducará antes de publicar. |

Variables públicas futuras: CLERK_DOMAIN, CLERK_PUBLISHABLE_KEY, SUPABASE_URL,
SUPABASE_PUBLIC_KEY, POLAR_ENVIRONMENT, CHECKOUT_SUCCESS_URL,
CHECKOUT_CANCEL_URL y PURCHASE_OPEN (cerrado). Sus fuentes/configuración ya
existen; no requieren secretos nuevos de Isaac. ASSETS y WAITLIST_DB ya existen.
VANTARE_PURCHASE es configuración de compilación, no secreto Worker: seguir closed.
El D1 futuro requiere migraciones 0003/0004/0005 y cron/rotación aprobados;
no se aplican en este encargo.

Cloudflare documenta que secret put/bulk normal crea versión y despliega:
https://developers.cloudflare.com/workers/configuration/secrets/
versions secret permite preparar sin desplegar, pero crearía una versión de la
landing, con privilegios que no consume, y no resolvería catálogo/D1/JWT.
Se reserva para la publicación autorizada de web-compra. No es un bloqueo por
contraseña/token de Cloudflare: la custodia actual funciona.
