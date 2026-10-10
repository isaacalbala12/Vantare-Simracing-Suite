# Recuperación asistida del intento de checkout nativo — #1542

Un UUID inválido, JSON/blob corrupto o error de lectura no demuestra que la
compra anterior haya fallado. El cliente conserva el intento y pide contactar
con soporte; no envía HTTP ni genera una nueva clave de idempotencia.
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
