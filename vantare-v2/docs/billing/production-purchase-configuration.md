# Configuración comercial de producción · VANTA-42 R9

Fuente vigente única para los IDs: supabase/functions/scripts/polar-production-map.json.
Se copió el objeto map del resultado aprobado por Isaac:
C:/VantareServer/evidence/polar-auditoria/catalogo-1661-result-r5.json.
SHA256 del resultado original: 04932ce4ccf9e06dd6235c1511f1c3e0103ca33f5805c6afda85b714a0c3478e.
Preflight registrado: 2026-10-16T10:49:26.417Z; writes=10.
El orquestador confirma que ese catálogo ya se aplicó en Polar producción.
Esta entrega no consultó ni modificó Polar real.

## Configurar ambos servidores

El mismo JSON completo es el valor de POLAR_PRODUCT_MAP del backend Supabase
y del Worker de compra web. No copiar UUID sueltos al código o documentación.
POLAR_ENVIRONMENT=production. No cambiar creator_discounts ni
creator_annual_discounts sin el registro verificado de creador: este resultado
no contiene códigos de creador. Founders y Launch mantienen lectura histórica;
Launch active=false y la compra web Founders sigue cerrada por doble llave.

El mapa conserva los precios históricos por ID, junto a los IDs nuevos.
Los importes/fechas se leen de polar-launch-prices.json en backend y de la
fuente común de precios de la web. El servidor comprueba el precio/cupón remoto
antes de crear un checkout. Aplicar catálogo no abre ventas ni despliega código.

## Registrar ofertas SQL antes de habilitar checkout

#1673 exige private.billing_launch_offers para los cuatro planes. La función
pública billing_launch_checkout valida entorno, clave, producto, cupón y fechas;
el rol API no puede escribir ese registro ni invocar la reserva privada.
No usar report_promotion_checkout: fue retirada. El registro vacío cierra la
oferta de forma segura. No conceder permisos extra al Worker para poblarlo.

Desde la raíz del backend, generar sin red ni secretos:

~~~sh
deno run --config supabase/functions/deno.json --cached-only --no-lock \
  --allow-read --allow-write=/ruta/revision \
  supabase/functions/scripts/prepare-launch-offers-sql.ts \
  --map supabase/functions/scripts/polar-production-map.json \
  --environment production --output /ruta/revision/launch-offers.sql
~~~

La salida debe ser un fichero nuevo; si existe no se sobrescribe. Isaac revisa
los cuatro registros, sus ventanas y versión antes de aplicar ese SQL mediante
su canal privado. El generador rechaza drift en vez de rotar cupones.
Preparado en el Mac: ~/evidence/web-compra/r9-production-launch-offers.sql.
No se ejecutó en una base real; falta confirmar despliegue/registro de Supabase.

Secuencia: migraciones de PR1663 con #1673 -> mapa completo en ambos servidores
-> registro SQL revisado -> prueba sandbox/autorización de apertura de Isaac.
Mantener PURCHASE_OPEN y las condiciones comerciales existentes hasta entonces.
Compensación sigue OFF: sandbox net/gross, inventario e inbox y receptor Owner
visible con ACK durable son requisitos separados. JWT/cron/baja D1 y Setup
siguen sus procedimientos. No interpretar production_apply_ready como permiso
para activar reembolsos o ventas desde este worker.

El inventario anterior y founders-production-config.json son snapshots/fragmentos
históricos; no son el mapa completo vigente para desplegar.
