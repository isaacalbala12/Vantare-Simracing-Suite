# Avisos operativos por correo (#1725 / VANTA-96)

Receptor propuesto para `BILLING_OWNER_ALERT_URL`. No se despliega ni se envía
correo real en este PR. Isaac revisa antes de configurar y probarlo.

## Contrato

`owner-alert-receiver` recibe el POST exacto de `deliverCheckoutOwnerAlerts`:
HMAC SHA-256 sobre `timestamp.rawBody`, firma hexadecimal en
`X-Vantare-Signature: sha256=...`, timestamp Unix en `X-Vantare-Timestamp`,
ventana máxima de cinco minutos hacia ambos lados, e ID coincidente en
`X-Vantare-Alert-Id`. Verifica con WebCrypto antes de JSON/SQL. Rechaza cuerpos
de más de 2048 bytes, campos adicionales y tipos/códigos fuera del contrato.
El gateway declara `verify_jwt=false`: la autenticación es HMAC, no JWT público.

Solo persiste entorno, tipo, correlación hash y código cerrado, además del estado
de entrega. No recibe email de compradores, pedido, cuenta ni payload Polar.
La clave única incluye entorno/tipo/hash: distintos tipos pueden compartir hash.
Conserva el primer código recibido; los reintentos no cambian el contenido.

La RPC de claim confirma la fila privada antes del correo. Su lease de 60 s
solo permite un remitente; otros intentos obtienen 503 y el emisor reintenta.
El proveedor tiene timeout de 2,5 s, por debajo de los 5 s del emisor.
Brevo 201 con messageId y el ACK SQL cercado por lease son necesarios para 200.
Fallo de configuración, proveedor o persistencia: 503, sin perder la outbox.
Un 200 perdido se reintenta sin reenviar el correo ya marcado como enviado.
No se registra el cuerpo, secretos ni respuesta privada del proveedor.

RLS y ACL cierran la tabla incluso a service_role. Solo las dos RPC acotadas
son ejecutables por service_role; anon/authenticated no pueden acceder a ellas.
La fila no pertenece a una cuenta de cliente y no necesita FK/account_id.
Un claim purga como máximo 100 avisos enviados hace más de 30 días;
los pendientes nunca caducan automáticamente.

## Límite de entrega

Brevo recibe un UUID idempotente persistido por aviso en `headers.idempotencyKey`.
Su [documentación](https://developers.brevo.com/docs/heterogenous-versions-batch-emails)
describe una ventana de 30 minutos; no se usa como deduplicación durable.
No se interpreta un error genérico `duplicate_parameter` como ACK.
Si Brevo aceptó un correo y se perdió su respuesta o falló el ACK SQL, se
reintenta con el mismo UUID. Puede haber correo duplicado después de la ventana
del proveedor. La entrega es al menos una vez, no exactamente una vez;
prioriza no perder avisos. El hash permite reconocer el mismo incidente.
201 significa aceptación de Brevo, no que Isaac ya haya leído el email.

## Activación posterior a la revisión

1. Aplicar solo la migración nueva aceptada; desplegar únicamente
   `owner-alert-receiver` con `--no-verify-jwt`.
2. Generar secreto HMAC independiente fuerte y custodiarlo en archivo protegido.
   Configurar con env-file `BILLING_OWNER_ALERT_SECRET` y
   `BILLING_OWNER_ALERT_EMAIL=isaacalbala12@gmail.com`.
   Reutiliza `BREVO_API_KEY` y `BREVO_MARKETING_SENDER` (correo verificado).
   No añade contactos, listas ni consentimiento de marketing.
3. Configurar `BILLING_OWNER_ALERT_URL` con la URL HTTPS de la Edge del proyecto.
   El emisor y receptor usan el mismo secreto de proyecto; no imprimirlo.
4. Con autorización posterior del orquestador, enviar un único aviso firmado
   de prueba sin compradores, comprobar fila durable, 200, reintento sin envío
   duplicado y recepción de Isaac. Retirar el fixture por procedimiento revisado.
5. Mantener marketing, venta y compensación apagados. Este cambio no autoriza
   abrir venta ni ejecutar refunds. Ante un fallo retirar URL del emisor:
   conserva su outbox y las filas del receptor; no borrar avisos pendientes.

Pruebas: HMAC real del emisor, manipulación/timestamp/payload, proveedor fallido,
pérdida de ACK, concurrencia; pgTAP ACL/leases/dedupe y dos sesiones PostgreSQL.
El arnés comercial ejecuta estas regresiones en LF y CRLF sin cambiar workflows.
