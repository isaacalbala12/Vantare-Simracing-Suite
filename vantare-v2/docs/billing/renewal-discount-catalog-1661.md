# Catálogo de renovaciones · VANTA-83 / VANTA-39

Preparación desde nightly 1cb2f66d3 (#1661 y #1593/#1673 integrados).
Isaac aplicó el catálogo inicial (10 escrituras); su recibo es
C:/VantareServer/evidence/polar-auditoria/catalogo-1661-result-r5.json.
No volver a ejecutar el sincronizador de productos para este encargo.

El script supabase/functions/scripts/polar-renewal-discounts.ts solo crea los
cupones ausentes; nunca cambia productos, precios, cupones existentes ni
suscripciones. Por defecto plan offline; --online solo GET; --apply explícito
por operador y --confirm-production. API-only: code=null, sin fechas ni cupos.
[Contrato oficial de Polar](https://github.com/polarsource/polar/blob/main/server/polar/discount/schemas.py).
El porcentaje y duraciones base proceden de polar-launch-prices.json.

## Ofertas y reconocimiento

| Familia | Duración repeating | Alcance | Metadata vantare_offer_key |
| --- | --- | --- | --- |
| Creador 20 % mensual | 11 meses | Pro y Pro Plus mensuales normales | creator:CODIGO:renewals-v4 |
| Creador 20 % anual | 12 meses | Pro y Pro Plus anuales normales | creator:CODIGO:annual-renewals-v4 |
| Remanentes 20 % | 1..10 meses, por producto | Un producto mensual normal | creator:CODIGO:remainder:CLAVE:Nm-v1 |
| Informes Pro 2 EUR | 1/3/6 meses | Pro mensual normal | reports:pro_monthly:Nm-v1 |
| Informes Plus 3 EUR | 1/3/6 meses | Pro Plus mensual normal | reports:pro_plus_monthly:Nm-v1 |

Nombres visibles en español: Vantare CODIGO · 20 % renovaciones mensuales/anuales;
Vantare CODIGO · 20 % Pro/Pro Plus · remanente N meses;
Vantare Pro/Pro Plus · informes 2/3 € · N meses.
Cada cupón incluye vantare_environment, vantare_catalog_version y vantare_family;
creador/remanentes además vantare_creator_id; remanentes también
vantare_original_offer_key. Las claves de creador respetan native-admin/creator-code.ts.
Son **22 cupones por creador** (2 base +20 remanentes), más seis de informes
compartidos. No se incluye Founders, Launch ni productos anuales en informes.
No se asocia ningún descuento a una suscripción al crear el catálogo.

Metadata sirve para descubrir/reconciliar creación, nunca atribuye por sí sola.
El backend necesita:
- POLAR_PRODUCT_MAP.creator_discounts y creator_annual_discounts por código.
- El vínculo de ambos UUID al creador real en private.admin_creators,
  entorno y código coincidentes. Owner debe haberlo aprobado/registrado; el
  script no inventa personas ni habilita códigos. El SQL generado lo comprueba
  y aborta sin sustituir vínculos históricos. El flujo Owner actual es sandbox;
  la preparación de producción requiere al operador, no esa RPC de sandbox.
- private.report_promotion_catalog: launch_discount es el repeating **1 de
  informes** (nombre de columna histórico), reward3/reward6 son 3/6. No confundir
  con el once de lanzamiento, registrado en private.billing_launch_offers.
- private.report_creator_remainders: entorno, producto mensual, UUID original
  mensual del creador, duración, UUID del remanente y validated_at.

## Preparar y ejecutar

Entrada --map: JSON canónico, no el recibo entero. Se ha extraído map del recibo
aplicado a POLAR_PRODUCT_MAP.production.applied.json, sin cambiar sus IDs/historia.
Entrada --creators: lista [{"code":"CODIGO","id":"UUID_INTERNO_REAL"}], códigos
mayúsculos de 3–32 caracteres alfanuméricos. El mapa recibido no contiene creadores;
creators.production.json queda [] hasta que Isaac facilite la lista. No se
inventan UUID ni códigos. El plan online marca creator_roster_required y ready=false.
Un apply vacío falla antes de HTTP; --reports-only permite limitar conscientemente
a los seis informes. Añadir un creador después reutiliza esos seis sin duplicar.

Deno instalado en Mac. Bundle conservado en
/Users/isaacalbala/orq/polar-auditoria/cupones-1661, artefactos y comando completo
en C:/VantareServer/evidence/polar-auditoria/aplicar-descuentos.txt.
Las opciones --environment production --map ... --creators ... --output ...
son obligatorias. Añadir --online para plan vivo o --apply --confirm-production
para el operador. Token únicamente POLAR_ACCESS_TOKEN, jamás argumento/archivo
copiado al Mac. El token de auditoría autorizado es solo lectura; apply necesita
discounts write + descuentos/productos/organización read.

Validación previa: mapa, cuatro productos normales/precios/intervalos y toda la
paginación de descuentos. Coincidencia exacta de organización, tipo, porcentaje o
importe, meses, alcance, metadata y ausencia de código/fechas/cupos. Duplicidad,
deriva o respuesta incompleta abortan antes de POST. No se exige inventario de
clientes vacío: no se cambia ningún recurso que ellos usen; solo se crean
cupones sin código y sin asociarlos. No se modifica el catálogo inicial aplicado.

## Salida, recuperación y carga en Supabase

No existen UUID de cupones futuros antes de crearlos: planes usan null. Tras
apply, resultado-descuentos.json contiene map completo y operator_sql. El wrapper
aplicar-descuentos.zsh extrae POLAR_PRODUCT_MAP.production.complete.json y
registrar-descuentos.production.sql con creación exclusiva. El mapa conserva
productos/precios/once/lectura histórica, añade códigos de creador y
renewal_discount_catalog con todos los IDs; este último es inventario documental,
el loader Edge ignora ese campo. La autoridad para informes/remanentes es SQL.
No cargar el recibo con envoltorio como POLAR_PRODUCT_MAP.

Salidas exclusivas y journal fsync tras cada creación confirmada. Si hay fallo,
conservar el recibo y repetir con salida nueva: GET descubre la oferta por
metadata y no vuelve a crearla, también tras perder respuesta del POST. No
sobrescribir recursos en deriva. No ejecutar en paralelo dos operadores sobre
el mismo catálogo; la API no ofrece unicidad de metadata. Revisar duplicados
antes de reintentar, no eliminar ninguno automáticamente.

Cargar solo el JSON no basta: revisar la prueba de validación viva, registrar
cupones de cada creador aprobado mediante operador, aplicar el SQL como operador
de migraciones y comprobar ambas tablas/códigos contra el manifiesto. Todo el
registro generado es transaccional y aborta deriva, sin rotación silenciosa;
replay conserva validación. Incluye proyección once de #1673. No ejecuta SQL,
configura secretos, despliega Edge ni activa campañas. Informes sigue apagado:
REPORT_PROMOTION_ENABLED, política SQL y fechas solo tras el anuncio de Isaac.
Sandbox O2, IVA/renovaciones y vuelta de informes al remanente siguen pendientes.
