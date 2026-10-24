# Compra E2E en Polar sandbox · VANTA-96

Estado24-oct: infraestructura preparada y parada **antes de crear checkout**.
La compra simulada y su reembolso siguen pendientes del ensayo supervisado.
No hay compra real con devolución. No se cambian secretos ni flags de Supabase
Production para este ensayo. La apertura de acceso/lista en la web es un encargo
aparte autorizado expresamente el24-oct (PR web#14).

## Entorno y preparación ya ejecutada

Supabase vantare-staging: rilwmlbnucbbayaulnxw, independiente de producción.
Copia completa de esquema/datos/Auth/Storage/historial realizada24-oct;
pg_restore --list y lectura de todos los bloques PASS. SHA256:
5ac0c2dfc483a4d4c485c2f93c0393b99837363b1a77aad01e02597783c14177.
Se reconstruyeron solo objetos propios y el historial tras copia y autorización:
97/97 migraciones del SHA1b732b67d605298f3056c8ca78d692f132217e2d.
Las versiones ajenas20260926153706 (roadmap y RPC publicadora/lectora) y
20260926153853 (ajuste de sus permisos) se exportaron antes de descartarlas.
Sus sentencias originales y las2 filas de roadmap están en la copia protegida.
No se borraron esquemas internos ni se revocó ninguna clave.

Cinco funciones desplegadas desde ese SHA con verify_jwt=false:
native-account-authorize(v1), native-billing-checkout(v1), billing-webhook(v7),
native-license(v1), billing-reconcile(v1). No se desplegó el receptor Owner,
Testing Center, marketing ni otros endpoints. Sin cron QA.

Claves ES256 y Ed25519 QA independientes, HMAC reconcile QA; TPA con issuer
https://clerk.vantare.app y native_data_issuer propio de staging. Se reutiliza
solo identidad QA custodiada; no se cambió configuración de Clerk Production.
Anon/service_role legacy200 antes/después de rotar ES256; bridge200 →
PostgREST200; native-license200, firmas ES256/Ed25519 verificadas con públicas QA.
La fila de issuer se habilitó tras aceptar PostgREST el JWT QA.

Los secretos se cargaron por env-file protegido y se verificó el hash exacto
del mapa JSON y JWK. No se copian privadas de producción. Config de compilación
QA en secrets/sandbox-staging-20261021/build-config-sandbox.env; nunca mezclarla
con build-config-production.env. Incluye Supabase/anon/bridge/licencia de
staging y OAuth Clerk existente. Marketing y promoción apagados;
compensación no activada. No configurar avisos Owner ni enviar correo sintético.

## Catálogo y rutas fijados

- Polar sandbox, base https://sandbox-api.polar.sh/v1, POLAR_ENVIRONMENT=sandbox.
- Producto existente Pro mensual,599céntimos EUR, mes, sin trial, activo/público:
  0d0de79b-30ba-4d00-8429-c9e6cba8ca56.
- Precio7a6d9bc3-4a83-4f16-82f7-c496f67d7d09. Clave lógica pro_monthly.
  El mapa QA solo permite este producto, sin descuentos ni ofertas de lanzamiento.
  El Vantare Pro histórico del mapa antiguo tiene trial7d y no se usa.
- Webhook sandbox8c400972-672b-44b5-9dad-b0eb5e9f6b5a habilitado y dirigido a
  https://rilwmlbnucbbayaulnxw.supabase.co/functions/v1/billing-webhook.
  Secreto en custodia coincide. Evento de catálogo sintético firmado:202 y
  cuarentena missing_product_id; firma incorrecta403. Dos ensayos QA marcados;
  no inventan pedidos ni habilitan licencias de pago. Entrega desde Polar y
  proyección de compra todavía no probadas.
- CHECKOUT_SUCCESS_URL y CHECKOUT_CANCEL_URL: https://sandbox.polar.sh/.
  Retorno técnico HTTPS que no toca vantare.app; no publica una web QA nueva.

## Ejecución supervisada, después de autorizar checkout

1. Compilar/instalar una app QA con el archivo sandbox anterior (todavía no hay
   build QA preparado). Alternativa: sesión OAuth QA controlada que llama al
   mismo native-billing-checkout de staging; presentar esa vía antes de ejecutarla.
   RC6 publicada sigue usando producción y no sirve para esta compra sandbox.
   Login usa /acceso ya abierto; nuevo navegador puede pedir código email.
   Google sigue deshabilitado en Clerk y no es requisito del ensayo.
2. Confirmar project ref, token/catalog sandbox y cuenta QA. Crear **un** checkout
   pro_monthly por la Edge staging, sin descuentos/trial. Comprobar host sandbox
   y precio5,99EUR mensual antes de pagar. No existe URL de checkout hasta esa
   creación, que este worker aún no ha realizado. Anotar los IDs solo en evidencia
   privada y comprobar que net_amount será positivo; no usar cupón100%.
3. Isaac abre ese checkout y usa tarjeta de prueba4242 4242 4242 4242, fecha futura
   y CVC de prueba. Nunca tarjeta real. Comprobar pedido/subscripción sandbox y
   entrega firmada de Polar. Repetir entrega debe ser idempotente: un pedido en
   ledger, sin doble derecho. Validar importe neto positivo, moneda EUR, relación
   cuenta/producto y ausencia de cuarentena/reintentos inesperados. Comprobar RLS
   con una segunda cuenta QA antes de dar por completo el ensayo.
4. Solicitar native-license con el mismo dispositivo QA: credencial sandbox,
   plan Pro y firma verificable con pública QA. Refrescar app y comprobar acceso
   al plan. Correo Owner excluido por Isaac; emails de Polar solo llegan a miembros
   de su organización sandbox, por lo que no afirmar envío a cualquier QA.
5. Reembolsar únicamente el pedido sandbox y cancelar/revocar renovación sandbox;
   verificar webhook, ledger y retirada de Pro/licencia. Conservar auditoría QA.
   Parar si hay dominio/entorno productivo, importe cero o resultado inesperado.

## Reversión y cierre

Apagar la app QA y retirar su configuración; no tocar RC6 productiva.
Exportar evidencia antes de limpiar datos QA. El dump completo de staging permite
restaurar su estado anterior si se decide; no restaurarlo sobre producción.
Para revertir ES256 staging: mover3a416237-ff6e-4723-b53e-9aa534a919ed a standby
con la API y después in_use; no revocar las otras claves. La pública Ed25519 QA
solo corresponde a este build. Si se pausa staging, deshabilitar primero su
webhook sandbox para evitar reintentos; pedir encargo de cierre antes de hacerlo.

## Qué necesita ahora Isaac

No falta token, webhook secret ni contraseña BD: los tres ya funcionan.
Falta elegir/autorizar la creación del checkout y la vía de app QA o sesión
controlada, y completar el pago simulado. Si se usa navegador nuevo, la cuenta
QA debe poder recibir el código email de Clerk. No hace falta token Production,
correo Owner sintético ni cambiar vantare.app para el pago.

Fuentes: [sandbox y tarjeta de prueba](https://polar.sh/docs/integrate/sandbox),
[claves Supabase](https://supabase.com/docs/guides/auth/signing-keys),
[refunds](https://polar.sh/docs/api-reference/refunds/create).
