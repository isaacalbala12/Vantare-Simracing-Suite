# Catálogo Polar de beta pública · VANTA-83 / #1661

Sustituye el modelo de productos separados de #1620. El orquestador confirma
aplicación en Polar producción el 16-oct-2026. Mapa vigente completo, procedencia
y registro SQL #1673: [configuración de compra](production-purchase-configuration.md).
El worker no ejecutó esa aplicación ni abre ventas. Los planes/inventarios
offline de los apartados siguientes conservan su fecha histórica; no ejecutar
de nuevo el apply por asumir que siguen faltando productos.

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

Creador opcional `--creator ISAAC`: crea dos cupones API-only de -20 %, sin
código Polar público: mensual repeating 11 meses y anual repeating 12 meses,
con scope en sus productos normales de intervalo correspondiente. El primer
checkout solo atribuye la venta y puede llevar la promoción de lanzamiento.
Tras el primer pago confirmado, el backend aplica el cupón de renovación.
Configuración única: `creator_renewals` en la tabla anterior. No hay links que
eludan el servidor. Portal sin cambio de plan; cambios administrativos bloqueados
mientras siga su descuento. Comisión 30 % mes 1 / 10 % meses 2–12, pago manual.
[Contrato de renovación y competencia con informes](creator-renewals-1661.md).

## Entrada, salida y seguridad

`--map` debe contener el `POLAR_PRODUCT_MAP` completo de producción, con
schema_version 2, entorno/organización correctos, IDs históricos y la entrada de
Founders documentada en `scripts/founders-production-config.json`. No usar .env.
Ronda 5 completa los IDs mediante GET de solo lectura: el mapa real observado
está en POLAR_PRODUCT_MAP.production.json junto al plan online. No se inventan
IDs de los productos/precios todavía ausentes.
El script lista todas las páginas y verifica organización, ownership, intervalos,
trials, duplicados, historia de precios y scope/duración/importe/fechas de descuentos
antes de escribir. Conserva IDs observados; si falta registrar un precio antes de
sustituirlo, se detiene. No convierte descuentos viejos/combinados silenciosamente.
Reintentos buscan metadata propia; una ejecución ya reconciliada hace cero escrituras.
La salida exclusiva no sobreescribe entrada ni un fichero existente, ni imprime token.

El resultado incluye `polar_launch_discount_id` por plan y `creator_discounts` / `creator_annual_discounts`
si se solicitó creador. Revisar e incorporar el mapa resultante al backend;
crear descuentos por sí solo no configura el checkout ni despliega Edge.
Inventario histórico anterior a la aplicación (15-oct; no es configuración vigente): Pro mensual 4,99 EUR,
Launch histórica 30 EUR y Founders 50 EUR; cero descuentos/links/clientes/pedidos.
En aquel inventario faltaban Pro anual y Plus; el mapa aprobado R9 ya incluye
sus IDs de aplicación. Eventos refund.created/updated y
subscription.uncanceled confirmados; localización checkout activada.

## Procedimiento previo de plan offline y aplicación por Isaac

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
El token necesita lectura de clientes, suscripciones y pedidos, además de catálogo;
permisos insuficientes también abortan. Datos incompletos, errores de consulta o inventario distinto de cero abortan sin
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

## Ronda 5 · plan online de solo lectura

`--online` es incompatible con `--apply`, requiere --map/--output y token de
lectura. Ejecuta el mismo preflight completo, con transporte que solo permite
GET, y guarda/expone el plan completo, inventario verificado, acciones previstas
y writes=0. No crea ni modifica recursos. La aplicación vuelve a comprobar el
inventario; un plan ready=true no congela altas concurrentes.

Artefactos reales en C:/VantareServer/evidence/polar-auditoria/:
POLAR_PRODUCT_MAP.production.json (todos los productos/precios existentes; no
incluye IDs inventados de anual/Plus), plan-catalogo-online.txt y
live-products-r5.json. El mapa inicial conserva el Pro actual 4,99 sin trial,
Launch retirada active=false con lectura histórica, y Founders 50 EUR con
Stable/Nightly. **Es entrada del script, no configuración del checkout ya lista
para desplegar**: usar el mapa resultante después de aplicar y revisar drafts.

Deno ya está en el Mac; en el servidor no hace falta instalarlo si se usa SSH.
Comando exacto para Isaac, sin ejecutar por el worker, en aplicar-catalogo.txt
junto al plan. Requiere token con permisos de escritura; el token de solo lectura
usado para esta auditoría no sirve para aplicar. Mantener ventas cerradas durante
el corte; publicar los drafts y archivar Launch son pasos humanos separados.
Rotación de cupones: seguir la nota F4 de creator-renewals-1661.md antes de cambiar
IDs con checkouts/facturas en vuelo. No borrar cupones/IDs históricos.
