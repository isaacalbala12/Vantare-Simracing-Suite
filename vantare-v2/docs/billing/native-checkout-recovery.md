# Recuperación asistida del intento de checkout nativo — #1542

Un UUID inválido, JSON/blob corrupto o error de lectura no demuestra que la
compra anterior haya fallado. El cliente conserva el intento y pide contactar
con soporte; no envía el checkout ni genera una nueva clave de idempotencia.
Esta recuperación es manual: no hay borrado ni reset automático en el Hub.

1. Cerrar la app y services. Conservar el archivo del intento en su namespace
   privado, sin enviarlo por chat ni cambiar sus permisos, contexto o formato.
   Está aislado por issuer/sub verificados, producto y entorno; no confundirlo
   con archivos de cuenta, instalación, autoridad o credenciales.
2. Si fue un fallo de lectura, resolver acceso/bloqueo y reintentar con el
   mismo archivo. Si existe una copia íntegra verificable del intento original,
   restaurar únicamente esa copia en el mismo contexto: conserva el UUID.
3. Sin UUID recuperable, soporte debe reconciliar la identidad interna, el
   producto y el entorno con el estado comercial autoritativo. Si ya hubo una
   compra, recuperar sus derechos. Si el resultado sigue incierto, conservar
   el bloqueo: no usar otra cuenta, producto, entorno ni clave como evasión.
4. Solo tras confirmar que el intento previo no puede producir una compra
   adicional (expirado/terminal, sin operación pendiente) y la decisión
   explícita de recuperar, un responsable puede apartar **solo ese intento**
   en una copia privada única, sin borrar evidencia anterior. La siguiente
   acción Comprar explícita crea el nuevo UUID. No archivar por antigüedad sola.

El worker de #1542 prueba únicamente fixtures/HTTP loopback. No realiza estos
pasos sobre datos reales, no consulta Polar/Clerk/Supabase y no acredita una
reconciliación comercial real. Un estado remoto incierto requiere soporte.


## Esperas de promoción de lanzamiento · #1593 / VANTA-39

Los códigos promotion_checkout_recovery_pending y payment_pending (503)
muestran «Espera» y que se conserva el primer mes. recovery_required (503)
pide reintentar la comprobación y contactar con soporte si persiste.
promotion_checkout_plan_change_pending (409) explica que hay un pago abierto
para otro plan y que hay que esperar su caducidad. Son mensajes locales
allowlisted; no se muestra texto remoto arbitrario.

Estas respuestas conservan el UUID protegido: reintentar no crea otro intento
en el escritorio. La caducidad confirmada checkout_attempt_expired sigue siendo
el único rechazo que retira automáticamente ese UUID para generar uno nuevo.
Los errores de lectura locales mantienen la recuperación asistida anterior.
El plazo remoto para una reserva sin ID lo determina retry_at; el servicio
puede mostrar minutos restantes sin prometer un plazo fijo de treinta minutos.

Prueba Windows de #1593: los cuatro códigos producen el error tipado propio y
su texto, un reintento utiliza idéntico cuerpo/UUID y solo el éxito devuelve una
URL Polar validada. Solo HTTP loopback y almacenamiento DPAPI de fixtures;
la validación visual del Hub y los pagos reales siguen pendientes.
