# VANTA-117 / ISA-1680 · 16-oct-2026

`creator-renewal-sandbox.json` conserva una proyección de respuestas reales de
`sandbox-api.polar.sh`, sin cliente, pago, checkout ni metadata:

- `launch`: `raw.json events[103]`, GET activo, amount399 y precio base599.
- `creator`: `events[106]`, respuesta PATCH con amount479, mismo precio base.
- `normal`: `events[168]`, GET activo de la compra de control sin descuento,599.
- `annualLaunch`: `events[220]`, GET anual activo con amount3990, precio base5999
  e ID anual `4f5216ce-9b71-438c-ae8b-e78d19be0520`.
- `annualCreator`: `events[226]`, PATCH anual real con amount4799 y creador20 %;
  confirmado por GET en `events[227]`.

Origen saneado: `C:/VantareServer/evidence/polar-sandbox/raw.json` e `INFORME.md`.
Los UUID pertenecen solo a recursos propios de prueba, no son credenciales.
Los tests normalizan el ID de la suscripción de control mensual para reproducir
el flujo sin red. El flujo anual lanzamiento → creador usa su identidad, producto,
precio y descuentos reales. Solo el estado anual sin cupón a5999 se construye
como variación de ese fixture; no se presenta como captura real adicional.

`discount` conserva su ID y definición monetaria, sin metadata ni nombre.
El importe final debe coincidir con esa definición del descuento gestionado:
fijo con `amounts.eur` (fallback legacy amount/currency solo EUR); porcentual
con ahorro redondeado al entero más cercano, medio céntimo hacia arriba, antes
de restarlo. Ejemplo de frontera construido:599 al50 % → ahorro300, final299.
Fuente primaria: [Discount.get_discount_amount](https://github.com/polarsource/polar/blob/main/server/polar/models/discount.py)
y [polar_round](https://github.com/polarsource/polar/blob/main/server/polar/kit/math.py).

La validación usa `subscription.prices`, no los precios disponibles en `product`.
También cubre la forma actual sin los campos legacy `price_id` e intervalo del
precio. Referencia primaria: [Get Subscription](https://polar.sh/docs/api-reference/2026-10/subscriptions/get-subscription).
No se utiliza `amount` para reconstruir el IVA ni para calcular comisiones.
