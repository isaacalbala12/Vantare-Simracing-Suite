# VANTA-42 / PR #1663 · Integración R9

Base e8aa2077c7c6de0a7733a3f2fc616dc63fdf7456. Misma rama backend
vantareapp/isa-1620-checkout-web;web vantareapp/web-compra.

#1673 envuelve la reserva de oferta con private.billing_launch_offers y elimina
report_promotion_checkout. Se conserva ese contrato. La migración aún pendiente
de PR1663 elige la implementación privada de reserva cuando el validador ya
existe; en orden cronológico el validador se instala después. Nunca se toca
el validador público ni se habilita el helper privado para roles API.
Los tests de ambas rutas comprueban permisos, ofertas inválidas/registro vacío,
rechazo terminal/CAS, vínculo/pago/licencia, bajas y ausencia de doble refund.

Catálogo aplicado por el operador, según resultado proporcionado:
configuración exacta y única en supabase/functions/scripts/polar-production-map.json.
El archivo coincide con map de catalogo-1661-result-r5.json; no hay UUID nuevos
en código ni copia manual en documentación. Se conserva lectura histórica.
La guía production-purchase-configuration.md sustituye el inventario anterior.
Se generó r9-production-launch-offers.sql con la herramienta oficial offline;
falta confirmar su aplicación y configuración de Supabase/Worker por operador.
No se consultó ni modificó Polar real. No hay claves ni archivos env.

## Verificación

- Mac:85migraciones,741pgTAP y15carreras en instalación limpia y actualización
  desde nightly aplicado. PostgreSQL NOSUPERUSER/BYPASSRLS durante pruebas.
- Edge731PASS,2ignorados preexistentes. Configuración oficial de Deno/import map
  fijado, caché local, sin permiso de red. Incluye mapa de producción y generador.
- Node/SQLite83PASS. E2E12 recorridos con webhook real y dobles:8 con/sin código
  y4 con el mapa de producción aprobado;control sin binding sigue en cuarentena.
  Cliente Node no soporta los importsHTTPS;el E2E usa Deno sin permiso de red.
- Chrome48capturas1440/390;red íntegramente interceptada. Quality456PASS,
  lint4/fmt/superficie de deploy/diffcheck PASS.
- Windows:fmt/check/Clippy -Dwarnings/Nextest1801PASS/lifecyclePASS/telemetría25PASS.
  Nextest omite14 del perfil;se ejecutan además lifecycle y corpus por separado.
  Todo por compilar.ps1 actual de nightly,en serie,target propio de R8 reutilizado.
  Código Rust íntegro de nightly;árbol native afb553c158cc20ab1ce2a7d147f55f3d0067934b.
  Logs en C:/VantareServer/evidence/checkout-web-r9 y copia Mac. No fallos Rust
  ni repetición sin caché. No nuevo intento de borrar target tras rechazo R8.

La landing ya no anuncia el descuento por informes aplazado por #1673. Se
retira el párrafo de los cuatro idiomas; la fila con fechas ya se excluía al
generar. Publicación regenerada y regresión de los doce pares fase/idioma.

## Estado y siguientes pasos

Entrega al orquestador en bares;actualizar VANTA42/PR1663 y publicar ramas.
CI remota pendiente de publicación;no se afirma merge a nightly.
Compensación OFF,Founders web cerrado por sus llaves y versión Setup pendiente.
Antes de activar refunds:sandboxnet/gross,inventario/inbox y receptor Owner
visible con ACKdurable. El precio/configuración real Polar ya no figura como
pendiente de crear:se usa el resultado aplicado proporcionado por el orquestador.
Restan configuración/registro del servidor,Clerk/privacidad/JWTcronOwner y apertura
por Isaac. Sin dudas nuevas ni acciones contra SaaS/dinero/datos reales.
