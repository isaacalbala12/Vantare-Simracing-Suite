# VANTA-42 / #1663 · Integración nightly R8

Base integrada:9e48eb86f8d2cfc43b64010d2b1ac1c58768826a.
Backend: vantareapp/isa-1620-checkout-web. Web: vantareapp/web-compra.
El merge conserva los contratos de #1661/#1593/#1672 y enlaza la compra web,
el guard con dispatch/binding, compensación apagada y baja D1 automática.

## Comprobación local

- Mac:83 migraciones completas,682 comprobaciones pgTAP y15 carreras reales,
  tanto en instalación limpia como actualizando un esquema con nightly aplicado.
  Rol postgres NOSUPERUSER BYPASSRLS durante suites/carreras. Incluye Founders,
  creador/informes y auditoría del rol web_purchase_erasure tras las nuevas RPC.
- Control RED: omitir solo la migración de integración reproduce el bloqueo
  promotion_checkout_pending tras rechazo cierto. Con ella el intento nuevo
  obtiene la oferta, mientras una prueba de reemplazo antigua no gana el CAS.
- Edge:726 PASS,0 fallos,2 ignorados de integración preexistentes. Caché local,
  import map de las versiones fijadas; sin permiso de red.
- Web:81 tests Node/SQLite reales;8 recorridos por el webhook actual con dobles
  de RPC/Polar y control sin binding;48 capturas Chrome con toda red interceptada.
- Deno fmt7 y lint5 de producción PASS (se excluye solo no-import-prefix de
  Deno2.9 por imports HTTPS preexistentes). Quality456 y deploy surface PASS.
- Incidencias de integración resueltas: fixtures anteriores sin begin,
  superusuario del runner y protocolo guard del mock; ajustados al contrato real.
  El runner completo final pasa. El arnés E2E usa Deno porque el webhook nuevo
  importa módulos HTTPS; no altera ni sustituye el código del webhook.

## Gates Rust Windows

PASS: fmt, check workspace/all-targets, Clippy workspace/all-targets con
-D warnings, Nextest1801/1801, lifecycle sin fallos y telemetría25/25.
Nextest registra14 saltados por su perfil; se ejecutan además los gates
separados lifecycle/telemetría, sin modificar filtros ni configuración.
Evidencia conservada y copiada al Mac. El target exclusivo queda en el servidor:
la revisión automática rechazó su borrado con blocked by policy, sin motivo más
concreto. No se cambió de herramienta para forzar el borrado.
No hubo repetición sin caché: ningún gate Rust falló.
Árbol nativo del merge idéntico a nightly:
36cf87011d750968a1b57a5a4793410dbba294d3.
Worktree aislado C:/VantareServer/wt/checkout-web-integration.
Logs C:/VantareServer/evidence/checkout-web-r8; compilar.ps1, target propio,
jobs de la máquina, una invocación cada vez. No se toca checkout de integración.

La observación de compensación reconoce también el derecho canónico Founders;
solo pedidos con binding/marcador propio. El test confirma que observarlo no
resuelve su webhook ni permite refund con la política apagada.

## Límites y operación

Compensación APAGADA, enabled=false y amount_basis=NULL. Antes de habilitar:
sandbox net/gross + inventario de pedidos/bindings/inbox + receptor privado
Owner visible con ACK durable, por entorno y con decisión de Isaac.
No se envían pagos/refunds, no se modifica Polar/Clerk/Supabase real ni se
despliega. Los precios de Polar y las pruebas de factura/IVA son del operador.
La web conserva Founders cerrado por doble llave y versión de descarga pendiente.

Si la oferta inicial mostrada ya se consumió, web devuelve offer_changed sin
crear checkout ni cobrar un precio superior; fuera de campaña usa precio normal.
La reserva de creador falla como una unidad si la atribución no es válida.
El resultado de la conciliación financiera nunca activa una licencia desde metadata.
Procesamiento/inbox de #1593 conserva su cursor cuando necesita reintentar;
observación de compensación aislada puede avanzar tras persistir su incidencia.

Entrega al orquestador mediante bares del Mac. PR #1663 y Plane VANTA-42:
publicación, CI y eventual merge a nightly pendientes del orquestador.
