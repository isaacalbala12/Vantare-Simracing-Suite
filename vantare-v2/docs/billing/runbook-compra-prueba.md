# Propuesta de compra de prueba · VANTA-96

Propuesta para aprobación; no ejecutada. Venta pública cerrada; sin deploy,
migración, cupón, compra, refund ni cambio de flags en este encargo.

## Límite comprobado antes de aprobar el ensayo

El ledger actual rechaza net_amount=0 en parseOrderLedgerInput
(supabase/functions/billing-webhook/process.ts, missing_order_net_amount).
Por tanto la sesión gratuita propuesta abajo NO es hoy un E2E completo de
compra/licencia. No se recomienda debilitar esta regla para facilitar QA.
Para el circuito financiero completo, preferir sandbox con cargo simulado al
precio EUR del producto confirmado por GET, tras autorización de reactivación.
Alternativa: compra real de Isaac al precio confirmado y refund aprobados aparte.
No fijar una cifra real mientras el catálogo siga inaccesible. El único importe
cerrado de esta propuesta sin cargo es 0,00 EUR, con los límites indicados.

## Sesión gratuita propuesta y sus límites

- Producto: pro_monthly, producto normal del mapa canónico. No Founders ni
  launch_lifetime, sin creador ni beneficio de lanzamiento. Catálogo remoto
  pendiente de lectura: no publicar/desarchivar un producto automáticamente.
- Cuenta: la cuenta QA existente de Clerk Production usada para el E2E nativo;
  identificadores y correo solo en custodia. Isaac opera su sesión si prefiere
  su cuenta, tras comprobar que no consume una oferta/campaña real.
- Importe a cobrar propuesto: 0,00 EUR, con descuento del 100 % de un solo uso,
  limitado a ese producto y primera factura (once), con ventana corta aprobada.
  Verificar total=0 y que no exige pago antes de completar. No introducir tarjeta
  ni aceptar un cargo o importe distinto. El precio nominal se anotará después
  del GET del catálogo; ahora es desconocido y no se inventa.
- Vía: app → native-billing-checkout → adaptador canónico. No usar un checkout
  manual de Polar como sustituto del flujo de la app. La web actual no compra.

## Condiciones antes de ejecutar

1. Obtener products:read/discounts:read, resolver #1730 solo por GET y presentar
   a Isaac los productos/precios draft/archivados que necesiten autorización.
2. Si hace falta observar otro rechazo, proponer un despliegue separado del
   diagnóstico #1732 (nightly a2e46c0d8 o SHA posterior revisado). **No desplegado**.
   Propuesta mínima para revisión: native-billing-checkout (verify_jwt=false) y
   billing-checkout (verify_jwt=true), los dos que ejecutan createPolarCheckoutSession.
   Verificar SHA, importaciones y config.toml antes de solicitar autorización;
   verify-deploy-surface.ps1 pasa como guardia de nombres, no analiza dependencias
   ni autoriza endpoints. Otros consumidores de polar.ts no crean checkout y no
   necesitan despliegue por este diagnóstico. No desplegar todo por glob.
   P3 DeepSeek en #1733, especialmente los 250 ms dentro del timeout de 8 s.
3. El flujo actual usa allow_discount_codes=false y descuentos elegidos por el
   servidor: el cupón QA del 100 % no tiene una vía implementada y aprobada.
   No basta con crear un cupón: la compra gratuita y sus derechos exigen una
   decisión de producto y cobertura canónica de importe cero, además de una
   vía QA aprobada. No implementarlo solo para esta prueba. Preferir el ensayo
   con pago simulado en sandbox autorizado. No sustituir el descuento de lanzamiento, falsificar
   metadata ni permitir discount_id arbitrario en el cliente.
4. Isaac/orquestador aprueban el cupón concreto, la vía controlada, ejecución y
   limpieza. No se reactiva ninguno de los dos backends pausados sin decisión.

## Qué se verifica, con evidencia sin datos personales

1. Checkout: cuenta canónica, pro_monthly y un único attemptId nuevo; selección
   standard, descuento QA autorizado y total 0. La app recibe URL del mismo
   entorno. Registrar correlación protegida; ninguna URL/token en evidencia.
2. Webhook: completar solo ese checkout gratuito; evento real firmado de Polar,
   inbox durable, procesado una sola vez. Un pedido gratuito no supera hoy la
   validación del ledger: registrar ese límite sin otorgar derechos a mano.
   Observar reentrega legítima si existe;
   no falsificar eventos productivos ni alterar firmas/RLS.
3. Licencia, cuando el escenario de pago esté soportado: native-license refleja Pro de esa cuenta; credencial Ed25519 verifica
   con la pública del instalador. Una segunda cuenta sigue sin esos derechos.
4. Email Owner: el receptor actual es de incidencias (checkout_review, refund
   fallido, etc.), **no envía un aviso por cada pago correcto**. El sintético del
   21-oct ya comprobó el canal. Si se exige correo por cada pago, hace falta otro
   encargo de producto con regresión; no simular una incidencia en la compra ni
   prometer que un pago correcto generará ese correo. Confirmar recepción de
   Isaac sin publicar su dirección. Repetir sintético solo con autorización.
5. Reembolso: con total 0 no hay dinero que devolver; marcar este tramo NO
   VALIDADO. No llamar refunds con amount=0 ni afirmar E2E financiero completo.
   El tramo de refund real se verificará en sandbox si Isaac autoriza reactivarlo,
   o con una compra con cargo real y devolución aprobados aparte. El importe de
   esa segunda prueba será el precio EUR confirmado del producto, anotado y
   aceptado antes del pago; no existe autorización actual para cobrarlo.

## Cierre y reversión de la prueba futura

Tras verificar, cancelar/revocar la suscripción QA con acción aprobada y comprobar
el webhook correspondiente, retirada de derechos según contrato y ausencia de
renovación futura. Una cancelación al final del período no demuestra revocación
inmediata. Retirar la excepción QA y caducar/deshabilitar el cupón aprobado;
conservar inbox y auditoría, sin borrado masivo ni SQL manual para inventar estados.
El pedido gratuito queda en historial como prueba; no se revierte una emisión
borrando filas. Las credenciales offline ya emitidas conservan su límite de validez
contractual: no prometer invalidación offline instantánea. Si hubiera cargo real,
la devolución requiere su autorización y confirmación de Polar antes de cerrar.

Documentación: [Checkout y descuentos gratuitos](https://polar.sh/docs/api-reference/checkouts/get-session),
[descuentos](https://polar.sh/docs/api-reference/discounts/create),
[refund](https://polar.sh/docs/api-reference/refunds/create),
[revocación](https://polar.sh/docs/api-reference/subscriptions/revoke).
