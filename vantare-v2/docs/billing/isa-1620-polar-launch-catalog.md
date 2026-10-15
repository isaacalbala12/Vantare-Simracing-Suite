# Catálogo Polar de beta pública · VANTA-83 / #1661

Sustituye el modelo de productos separados de #1620. No ejecutado contra Polar
real. El plan offline es una preparación revisable, no apertura comercial.

| Plan | Producto normal/renovación | Primer periodo | Descuento `fixed` / `once` |
|---|---:|---:|---:|
| Pro mensual | 599 céntimos | 399 | 200 |
| Pro anual | 5999 céntimos | 3990 | 2009 |
| Pro Plus mensual | 999 céntimos | 699 | 300 |
| Pro Plus anual | 9990 céntimos | 6990 | 3000 |

Tabla y fechas únicas por entorno: `supabase/functions/scripts/polar-launch-prices.json`.
Producción abre el 26-oct-2026 19:00 y cierra el 26-nov-2026 19:00 Madrid,
18:00 UTC ambos días. Cada descuento tiene `duration: once`, `amounts.eur`,
`starts_at`, `ends_at`, y scope de un producto normal. Sin código público.
No hay `duration_in_months` en un descuento `once` ni productos de lanzamiento nuevos.
Los productos ausentes se crean draft; su publicación requiere revisión de Isaac.
Los precios previos siguen en el mapa para histórico; no se borran IDs ni compras.
Launch Edition queda fuera de venta; Isaac archivará su producto existente.
Founders conserva pago único 50 EUR y venta sin fecha final. Su precio puede
tener IVA no especificado: validación manual de neto/IVA/total en sandbox antes de abrir.

Creador opcional `--creator ISAAC`: descuento distinto de -20 %, repeating dos
meses, sobre productos normales. No se crean checkout links que eludan el servidor.
El checkout de la app/web selecciona un único descuento, desactiva trial al
aplicarlo y rechaza combinar creador con campaña. Códigos exactos de servidor,
no IDs del cliente. El portal debe tener cambio de plan deshabilitado antes de
configurar creador; mantener bloqueo administrativo/programado de cambios de
producto mientras siga su descuento, pues Polar puede conservarlo al cambiar plan.
Contabilidad: 30 % primer mes, 10 % meses 2–12 sobre lo pagado, luego renegociar;
sin pagos automáticos. Informes desde el segundo mes.

## Entrada, salida y seguridad

`--map` debe contener el `POLAR_PRODUCT_MAP` completo de producción, con
schema_version 2, entorno/organización correctos, IDs históricos y la entrada de
Founders documentada en `scripts/founders-production-config.json`. No usar .env.
El prefijo e61e9161 comunicado para el precio Pro actual no es un ID completo;
Isaac debe aportar el mapa real completo, sin inventar el resto.
El script lista todas las páginas y verifica organización, ownership, intervalos,
trials, duplicados, historia de precios y scope/duración/importe/fechas de descuentos
antes de escribir. Conserva IDs observados; si falta registrar un precio antes de
sustituirlo, se detiene. No convierte descuentos viejos/combinados silenciosamente.
Reintentos buscan metadata propia; una ejecución ya reconciliada hace cero escrituras.
La salida exclusiva no sobreescribe entrada ni un fichero existente, ni imprime token.

El resultado incluye `polar_launch_discount_id` por plan y `creator_discounts`
si se solicitó creador. Revisar e incorporar el mapa resultante al backend;
crear descuentos por sí solo no configura el checkout ni despliega Edge.
Inventario comunicado por Isaac (no consultado aquí): Pro mensual 4,99 EUR,
Launch histórica 30 EUR y Founders 50 EUR; cero descuentos/links/clientes/pedidos.
Pro anual y Plus todavía no existen. Eventos refund.created/updated y
subscription.uncanceled confirmados; localización checkout activada.

## Plan offline y aplicación por Isaac

Plan completo solicitado en servidor:
`C:\VantareServer\evidence\polar-auditoria\plan-catalogo.txt`.
Se genera en Mac con `env -u POLAR_ACCESS_TOKEN -u POLAR_ENVIRONMENT deno run
--no-config scripts/polar-launch-catalog.ts --environment production`, sin permiso
para leer entorno, token, HTTP ni `--apply`.

El comando completo, con rutas absolutas de bundle/map/output, queda en
`C:\VantareServer\evidence\polar-auditoria\aplicar-catalogo.txt`.
Bundle en Mac: `/Users/isaacalbala/orq/polar-auditoria/isa-1661`.
Antes de ejecutarlo: Isaac prepara el mapa completo, configura el token solo en
su entorno, confirma precios/IVA, comprueba que output no existe y revisa el plan.
`--confirm-production` es obligatorio para cualquier aplicación en producción.
Esta entrega no ejecuta ese comando ni modifica productos reales.

## Acabado de seguridad · ronda 3

La herramienta oficial del corte es `polar-launch-catalog.ts`; no ejecutar a la
vez `polar-pro-prices.ts`. En producción, antes de la primera escritura consulta
el inventario **en vivo**: exige cero clientes en la organización (el endpoint de
clientes no filtra por producto), y cero suscripciones activas/pedidos en cada
producto existente afectado, incluido Founders si se va a gestionar. Es una guarda
conservadora del catálogo inicial: clientes de otros productos también bloquean.
Datos incompletos, errores de consulta o inventario distinto de cero abortan sin
escrituras. No usa como autorización el inventario histórico comunicado por Isaac.
La comprobación refleja ese instante: mantener ventas cerradas durante el corte;
Polar no ofrece aquí una transacción que congele altas entre consulta y escritura.

`production_model_ready` deriva de precios, modelo y ventana válidos.
`production_apply_ready` exige además la verificación en vivo vacía; por eso el
plan **offline** devuelve false y `live_inventory_not_checked`, aunque el modelo
sea válido. Una aplicación autorizada registra `production_preflight` con fecha y
productos comprobados y solo devuelve ready=true si superó la guarda. Tests usan
HTTP simulado; el worker no consulta ni modifica producción.

Los códigos de creador se consultan con `Object.hasOwn` y UUID validado. Nombres
heredados como `constructor` se rechazan antes de reclamar un intento.
