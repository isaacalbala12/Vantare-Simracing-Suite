# Archivo local de intento nativo — #1542

**VANTA-42 R4:** los pagos a medias se verifican y, si hay cobro sin licencia,
se reembolsan automáticamente. Soporte no recupera/vincula esos pagos.
Las instrucciones de archivo siguientes solo cubren corrupción/lectura local;
no autorizan reset del hold remoto ni otro cobro. Véase
[procedimiento del servidor](checkout-web-shared.md).

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
   producto y el entorno con el estado comercial autoritativo. Si hubo cobro sin licencia, esperar el reembolso automático; no
   fabricar ni recuperar derechos para ese pago. Si el resultado sigue incierto, conservar
   el bloqueo: no usar otra cuenta, producto, entorno ni clave como evasión.
4. Solo tras confirmar que el intento previo no puede producir una compra
   adicional (expirado/terminal, sin operación pendiente) y la decisión
   explícita de recuperar, un responsable puede apartar **solo ese intento**
   en una copia privada única, sin borrar evidencia anterior. La siguiente
   acción Comprar explícita crea el nuevo UUID. No archivar por antigüedad sola.

El worker de #1542 prueba únicamente fixtures/HTTP loopback. No realiza estos
pasos sobre datos reales, no consulta Polar/Clerk/Supabase y no acredita una
reconciliación comercial real. Un estado remoto incierto se conserva hasta verificación automática; si hubo
cobro sin licencia corresponde devolución automática.

## Intento del servidor compartido con la web (VANTA-42 / #1620)

Recuperar el archivo local no elimina el intento remoto. El guard compartido
bloquea también otros periodos/canales de la misma familia. La caducidad
automática libera solo intentos no enviados o terminales sin pago confirmado. Completar la [reconciliación del servidor](checkout-web-shared.md)
antes de retirar el intento transitorio concreto; conservar binding y ledger.
