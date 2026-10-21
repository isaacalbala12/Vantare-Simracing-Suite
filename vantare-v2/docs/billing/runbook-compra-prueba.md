# Compra E2E en Polar sandbox · VANTA-96

Decisión de Isaac: ensayo íntegro en sandbox. Descartada la compra real con
reembolso. Este documento propone preparación, despliegue y ejecución; no los
realiza ni autoriza por sí mismo. No se cambia producción ni sus flags.

## Entorno propuesto

Reactivar el proyecto Supabase existente vantare-staging
(rilwmlbnucbbayaulnxw), previa aprobación del orquestador y de su coste de
reactivación. Es un proyecto separado, no una rama Git del backend productivo.
Primero inventariar esquema/datos/secretos de staging, respaldarlo y presentar
las migraciones pendientes. No resetearlo ni borrar datos por arrastre. Si su
estado no es compatible, parar y proponer un proyecto desechable nuevo, con
coste aprobado. El otro proyecto pausado no se necesita.

No elegir una branch automática de producción para este ensayo: una branch
Supabase sí tiene instancia/credenciales propias, pero añadir su integración
con producción y reglas de promoción es innecesario. Un branch Git o desplegar
otras funciones dentro de ombjshwzqgeisazijduq NO aísla los secretos del proyecto.
Nunca cambiar allí POLAR_ENVIRONMENT ni instalar allí credenciales sandbox.

Solo tras autorización de staging: aplicar el canon al proyecto de prueba y
usar --project-ref rilwmlbnucbbayaulnxw en cada comando, con allowlist de ese
ref y rechazo expreso del ref productivo. Sin integración de auto-deploy/merge
hacia producción. Configuración mediante env-file protegido exclusivo:

| Nombre | Solo en staging |
|---|---|
| POLAR_ENVIRONMENT | sandbox |
| POLAR_API_BASE_URL | https://sandbox-api.polar.sh/v1 |
| POLAR_ACCESS_TOKEN | Token de la organización sandbox, nunca el token backend de producción. |
| POLAR_PRODUCT_MAP | schema_version=2, environment=sandbox, organización/IDs sandbox; trial.enabled=false, sin descuentos/campañas de lanzamiento. No copiar el mapa Production. |
| POLAR_WEBHOOK_SECRET | Secreto del endpoint sandbox que apunta únicamente a staging. |
| CHECKOUT_SUCCESS_URL / CHECKOUT_CANCEL_URL | Retorno HTTPS de QA aprobado; no publicar ni modificar vantare.app. |

Las variables SUPABASE_URL/ANON/SERVICE_ROLE deben ser las del proyecto staging.
Generar ES256 y Ed25519 con kids QA nuevos, HMAC Owner y reconcile independientes;
importar/activar ES256 solo en staging y generar la configuración de la app QA
con bridge/URL/anon/pública de licencia de staging. No reutilizar privadas de
licencias ni de bridge productivas. No modificar build-config-production.env.

Reutilizar la cuenta QA Clerk ya existente y el OAuth nativo de custodia como
identidad de la prueba: configurar TPA, issuer y su fila solo en staging, comprobar
ES256 → PostgREST y aislamiento de dos cuentas antes del pago simulado. No crear
un webhook Clerk nuevo ni cambiar la configuración de Clerk Production para este
ensayo; no migrar cuentas reales a staging. Si se exige aislar también Clerk,
preparar antes otra propuesta con instancia Development y su OAuth propio.

Desplegar únicamente en staging la cadena necesaria: native-account-authorize,
native-billing-checkout, billing-webhook, native-license, license-credential y
billing-reconcile, con sus verify_jwt del SHA aprobado. Añadir
owner-alert-receiver solo si se incluye el correo opcional. Revisión de superficie,
migraciones, credenciales y SHA antes de autorizar el despliegue; el diagnóstico
#1732 puede incluirse en el bundle QA autorizado, nunca por ello en producción.
Mantener compensación automática y marketing desactivados. No hace falta cron:
se puede ejecutar reconcile manualmente en staging con su clave de servidor.

## Producto, precio y cuenta

Propuesta concreta: pro_monthly, 5,99 EUR/mes (599 céntimos), sin trial ni descuento,
pago simulado con tarjeta de prueba de Polar/Stripe. No tarjeta real. El importe
positivo permite probar la validación del ledger sin cambiar net_amount=0.
Es el precio normal Pro del contrato canónico, no el precio de lanzamiento.

El mapa histórico sandbox contiene producto 41cffd72-bd41-4904-a0e4-9083243d26d7,
precio e6674b3a-5d30-434d-88b4-827167f462c3 y organización
71f1b902-c29a-421b-aeb7-7861d8bbc08d. Son candidatos, no catálogo confirmado.
GET sandbox al producto el 21-oct devuelve 403 con el token custodiado; no se
conoce su precio/estado actual. No afirmar que hay que crear todo desde cero.
Con token adecuado, verificar primero: producto publicado/comprable, no archivado,
precio fijo EUR 599 mensual activo y sin trial por defecto. Si coincide, reutilizar.
Si no existe o no coincide, pedir aprobación para crear/ajustar únicamente un
producto sandbox QA a 5,99 EUR/mes y actualizar sus mapas directos/inversos de QA.
El mapa histórico habilita trial de siete días: no usarlo sin esa adaptación local.

Cuenta: la QA existente, identificadores/correo en custodia, con perfil únicamente
de prueba en staging. Otra cuenta QA debe seguir sin Pro. Sin campaña ni creador;
no se necesita cupón del 100 %, ni tocar la ventana de lanzamiento.

## Ejecución futura y evidencia

1. Preflight: ref staging, API sandbox, organización e IDs sandbox, tarjeta de
   prueba y URL alojada en sandbox.polar.sh; detenerse si cualquier elemento
   apunta al proyecto/backend/checkout de producción. Comprobar sin trial y
   total positivo antes de confirmar. Anotar neto/impuesto/total de QA, sin PII.
2. App QA → native-billing-checkout de staging: un attemptId nuevo y duradero,
   productKey pro_monthly; URL hospedada sandbox, sin secretos ni URL en logs.
3. Completar el pago simulado (tarjeta de prueba 4242 4242 4242 4242, fecha futura,
   CVC de prueba). Verificar el total esperado y el net_amount positivo.
4. Webhook sandbox → billing-webhook de staging: firma válida, inbox durable,
   correlación canónica, evento procesado una vez; reentrega desde el panel
   sandbox no duplica ledger, derechos ni efectos. No fabricar firmas/eventos.
5. Ledger: pedido sandbox paid, net_amount>0, moneda EUR y cliente/cuenta
   canónicos; comprobar suscripción Pro, sin quarantine ni enlace a Production.
6. Licencia: native-license/credencial QA conceden Pro a esa cuenta; firma
   Ed25519 verifica con la pública QA, segunda cuenta aislada. No distribuir
   la build QA como instalador de producción.
7. Owner opcional: un pago correcto no produce aviso Owner con el contrato
   actual. No añadir esa feature ni inventar un fallo. Si se quiere probar el
   canal en este ensayo, autorizar un único aviso sintético tipo checkout_review,
   código sandbox_e2e_test, al receptor de staging con HMAC nuevo. Reutilizar
   Brevo y destinatario custodiados solo con aprobación del correo real; asunto
   sandbox, fila sent y replay sin reenvío. No usar el receptor productivo.
8. Refund exclusivamente sandbox: primero GET del pedido/refunds para confirmar
   saldo restante; un reembolso completo de ese pedido simulado desde el panel
   sandbox o el controlador QA (refunds:write), sin habilitar compensación.
   No asumir fórmula net/gross: contrastar importe/tax del pedido con contrato
   vigente de Polar y comprobar refunded_amount/refunded_tax_amount. Observar
   refund.created/updated y order.refunded firmados, ledger y retirada/restricción
   de acceso según contrato; reconcile QA no duplica refund ni efectos.
9. Revocar/cancelar inmediatamente la suscripción de prueba que aún siga viva
   (subscriptions:write), comprobar subscription.revoked/updated, sin renovación.
   No confundir cancel_at_period_end con retirada inmediata de derechos.

## Reversión y cierre

Conservar eventos/ledger QA para auditoría; no falsificar estados mediante SQL.
Quitar webhook sandbox, detener invocaciones de reconcile y desactivar secretos
QA cuando se cierre. Pausar de nuevo staging solo con aprobación, después de
recoger evidencia y comprobar que no quedan automatizaciones QA activas.
La app QA vuelve a su configuración normal mediante su archivo separado, nunca
sobrescribiendo el instalador ni la configuración de producción. Una credencial
offline emitida conserva su TTL; no prometer revocación offline instantánea.
No hay dinero real que devolver ni configuración productiva que revertir.

## Mensaje único para Isaac

1. Aprobar reactivar vantare-staging (rilwmlbnucbbayaulnxw), preparar/desplegar
   solo allí y ejecutar compra/refund simulados; incluye coste del proyecto si
   corresponde. No se autoriza ningún cambio de producción ni flags públicos.
2. En sandbox.polar.sh, confirmar organización y facilitar/actualizar token sandbox
   con: products:read, discounts:read, checkouts:read, checkouts:write,
   customers:read, orders:read, subscriptions:read, subscriptions:write,
   refunds:read, refunds:write y disputes:read. Guardarlo protegido en
   C:/VantareServer/secrets/polar-sandbox-token; no enviarlo por chat. Ya existe
   ese archivo, pero su GET de producto da 403: no se necesita un duplicado si
   puede corregirse el token actual. No hacen falta products:write/discounts:write
   si Isaac prepara el catálogo desde el panel; discounts:read permite validar
   que no se aplica descuento y disputes:read el ciclo completo de reconcile.
3. Confirmar el candidato pro_monthly/599 céntimos EUR al mes, sin trial y no
   archivado, o autorizar crear ese único producto/precio sandbox. Los IDs del
   mapa histórico no bastan como confirmación; nosotros podemos inventariar por
   GET al disponer de permiso y devolverle la acción exacta, sin crearlo aún.
4. Una vez staging esté aprobado/preparado, crear o autorizar crear el webhook
   de esa organización sandbox a
   https://rilwmlbnucbbayaulnxw.supabase.co/functions/v1/billing-webhook,
   formato compatible Raw/Standard Webhooks, eventos order.paid, order.refunded,
   refund.created, refund.updated, subscription.created, subscription.active,
   subscription.updated, subscription.canceled, subscription.uncanceled,
   subscription.past_due y subscription.revoked. Custodiar su signing secret como
   secrets/polar-sandbox-webhook-secret. Nunca reutilizar el secret productivo.
5. Contraseña de base de datos de staging si no está ya en custodia, mediante
   archivo protegido secrets/supabase-staging-db-password; no necesitamos la
   contraseña productiva. Dar permiso de gestionar staging con el token Supabase
   actual si su acceso ya lo cubre; nuevo token solo si no tiene permisos.
6. Aprobar el retorno HTTPS QA y, opcionalmente, un correo sintético sandbox al
   Owner. Podemos reutilizar el retorno QA/identidad Clerk/correo/Brevo existentes
   tras validarlos: no se pide otra clave Clerk ni otra API key Brevo por defecto.

Generamos nosotros los secretos internos y pares QA, el mapa validado y la
configuración de app QA. No se pide a Isaac copiar los secretos productivos.
El token de lectura de catálogo Production sigue siendo otra tarea; no es una
dependencia del E2E sandbox. No se activa Cloudflare/web-compra para este ensayo.

Fuentes: [sandbox Polar](https://polar.sh/docs/integrate/sandbox),
[refunds](https://polar.sh/docs/api-reference/refunds/create),
[revocación](https://polar.sh/docs/api-reference/subscriptions/revoke),
[aislamiento de branches Supabase](https://supabase.com/docs/guides/deployment/branching).
