# VANTA-117 / ISA-1680 · 16-oct-2026

`creator-renewal-sandbox.json` conserva una proyección de respuestas reales de
`sandbox-api.polar.sh`, sin cliente, pago, checkout ni metadata:

- `launch`: `raw.json events[103]`, GET activo, amount399 y precio base599.
- `creator`: `events[106]`, respuesta PATCH con amount479, mismo precio base.
- `normal`: `events[168]`, GET activo de la compra de control sin descuento,599.

Origen saneado: `C:/VantareServer/evidence/polar-sandbox/raw.json` e `INFORME.md`.
Los UUID pertenecen solo a recursos propios de prueba, no son credenciales.
Los tests normalizan el ID de la suscripción de control para reproducir el flujo
sin red. Los casos anuales usan la misma forma capturada con intervalo year y
los importes reales de la orden anual (3990 final /5999 base); la respuesta de
suscripción anual y el posterior4799 son construidos, no observados en Polar.

La validación usa `subscription.prices`, no los precios disponibles en `product`.
También cubre la forma actual sin los campos legacy `price_id` e intervalo del
precio. Referencia primaria: [Get Subscription](https://polar.sh/docs/api-reference/2026-10/subscriptions/get-subscription).
No se utiliza `amount` para reconstruir el IVA ni para calcular comisiones.
