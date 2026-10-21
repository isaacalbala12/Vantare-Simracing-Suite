# Lectura de catálogo Polar preparada · #1730 / VANTA-96

NO ejecutada: Isaac aún no ha aportado/autorizado el token de catálogo. No se
comprueba ni se lee polar-token-lectura hasta su aviso. Sin POST de checkout.

## Al llegar el aviso

1. Leer polar-token-lectura solo en el entorno/memoria del proceso. GET a
   https://api.polar.sh/v1, con Polar-Version: 2026-10, sin redirects. Cero
   escrituras. Detener ante 401/403, entorno/organización incorrectos o formato
   no entendido; no cambiar código para eludir permisos.
2. GET /products/{id} para las seis checkout_keys del mapa canónico. Comprobar
   identidad/organización, visibility (draft/private/public), is_archived y los
   precios incluidos. No inferir estado remoto de active del mapa.
3. Para los siete IDs de precio del mapa: presencia, producto, is_archived,
   moneda EUR, importe y periodicidad; identificar la tarifa por defecto y
   posibles múltiples precios activos. El standard usa products:[id], no envía
   product_price_id ni importe: importa la selección que hace Polar.
4. GET /discounts/{id} para los cuatro polar_launch_discount_id. Comprobar
   organización/productos, type, duration, importe/porcentaje, moneda, límites
   y usos, starts_at/ends_at. Contrastar ventana 26-oct 19:00 Madrid a 26-nov
   19:00 Madrid (18:00Z ambos extremos). No pedir el código del cupón ni
   registrar códigos privados. Los descuentos de creadores se consultan solo
   si el intento investigado los usa; el 422 registrado era standard sin creador.
5. Tabla de resultado por clave lógica: estado actual, precio, causa compatible
   con 422 y acción propuesta. Separar producto normal/Founders/histórico.
   Si requiere publicar/desarchivar/cambiar tarifa o descuento: presentar la
   lista exacta a Isaac y esperar autorización. No ejecutar por el token de lectura.
6. Contrastar con payload standard y logs antiguos (solo status=422). El body
   antiguo no es recuperable. Si queda sin explicar, proponer al orquestador
   el despliegue del diagnóstico fusionado #1732, su superficie exacta y un
   único intento sin pagar autorizado aparte. No está desplegado por este plan.

## Reconcile es una comprobación distinta

El cron de reconcile ya funciona con el token backend: última muestra local
21-oct 18:07:27Z, HTTP200. Incluye orders/subscriptions/refunds/disputes/checkouts.
La falta de products:read/discounts:read bloquea el catálogo y el diagnóstico de
compra, no ese ciclo de reconcile. No sustituir POLAR_ACCESS_TOKEN de la Edge
por el token de solo lectura: perdería permisos operativos. Mantener observación,
compensación desactivada, marketing apagado y venta cerrada.

Para web-compra sí hará falta un token que reúna checkouts:write,
products:read y discounts:read: ese código usa una única POLAR_ACCESS_TOKEN.
El token backend actual carece de los dos permisos de catálogo; no se cambia aquí.

Evidencia previa con IDs exactos: CATALOGO-1730.md. Fuentes:
[GET producto](https://polar.sh/docs/api-reference/products/get),
[GET descuento](https://polar.sh/docs/api-reference/discounts/get).
