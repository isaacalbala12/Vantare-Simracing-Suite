# Diagnóstico de checkout Polar (#1730 / VANTA-96)

Solo implementación y pruebas offline. No desplegar ni repetir el checkout
Production hasta avisar al orquestador y recibir su siguiente instrucción.
La investigación del catálogo sigue pendiente del token de lectura.

## Registro privado de la Edge

La línea `polar checkout failed` conserva status, product_key (clave lógica del
mapa, nunca ID/nombre remoto), error/type y detail[]. Cada detalle contiene solo
loc/type/msg. No registra input, ctx, cuerpo de petición/respuesta, email,
customer, nonce, credenciales ni error_description.

El texto del proveedor también puede reflejar PII dentro de msg, type o loc.
Por eso solo se conservan códigos, campos y mensajes técnicos de listas cerradas;
lo desconocido se convierte en `[redacted]`. Se conservan, por ejemplo, las
causas draft/archived de producto o precio. msg se limita a 200 caracteres.
No basta con truncar texto libre: un nombre o email puede estar al principio.
Ampliar las listas exige revisar que la nueva cadena sea técnica y sin valores.

Lectura de diagnóstico: máximo 8192 bytes/250 ms, 20 detalles y 8 segmentos de
ruta. Una respuesta HTML, JSON inválido, desmesurada o interrumpida deja solo
el status y la clave lógica, sin error de parsing en los logs. El rechazo
público sigue siendo polar_checkout_failed/502 y polar_status interno;
la respuesta al cliente no recibe el diagnóstico privado.

## Revisión del payload standard, 21-oct-2026

Contrastado con [CheckoutCreate de Polar API2026-10](https://polar.sh/docs/api-reference/checkouts/create-session).
El test captura el JSON del adaptador real con transporte doble, sin red.

| Campo enviado | Contrato actual |
|---|---|
| products: [ID] | Entrada actual admitida. No cambiarlo por product_price_id. |
| external_customer_id | Admitido; se usa el UUID canónico resuelto por el servidor. |
| customer_email | Opcional. Se omite cuando native-billing-auth devuelve email=null. No se manda customer_name. |
| allow_discount_codes=false | Admitido; impide introducir códigos en Polar. |
| allow_trial=false | Standard del mapa Production comprobado, sin campos trial_interval/count. |
| success_url / return_url | Admitidos; proceden de configuración servidor HTTPS. return_url recibe CHECKOUT_CANCEL_URL. |
| metadata | Objeto admitido; identidad/marcador no concede por sí solo licencia. No se registra en este diagnóstico. |
| discount_id | Omitido en standard anterior a la ventana, sin creador. |

El payload no envía product_id, product_price_id, prices ni amount. No se
detectó un campo obsoleto en este recorrido; eso no demuestra que el producto
remoto o su tarifa por defecto sean comprables.

El [código público de Polar](https://github.com/polarsource/polar/blob/main/server/polar/checkout/service.py)
rechaza productos draft/archived y precios archivados con validación. Es una
hipótesis compatible con el422 observado, pendiente del GET autorizado del
catálogo. La versión default de la organización y su catálogo no se cambian.
El nuevo log solo ayuda a un intento futuro autorizado; no recupera el cuerpo
del rechazo anterior, que no fue registrado.

## Verificación

Regresiones de logging con email/nombre/cuerpo reflejados en el error, rutas
dinámicas, texto libre, mensajes técnicos, JSON inválido, límite de tamaño y
stream detenido; además del contrato real con/sin email. El arnés comercial
incluye la suite en LF/CRLF sin modificar workflows ni checks requeridos.
No hay migración, dependencia nueva, cambios Rust ni acciones productivas.
