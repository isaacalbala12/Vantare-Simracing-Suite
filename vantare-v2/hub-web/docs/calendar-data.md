# Datos de Calendario Â· VANTA-138

Esta capa prepara los DTO del mÃ³dulo `calendar` para sus vistas. No registra
pantallas ni aÃ±ade mÃ©todos, eventos, documentos o dependencias. Depende del
contrato de preferencias de #2088: usa sus tipos generados y errores cerrados.

- `schedule.ts`: recurrencias UTC ancladas en el calendario gregoriano del GPUI,
  salidas Ãºnicas y ordenadas, fin de publicaciÃ³n exclusivo y expansiÃ³n acotada.
  Si se supera el lÃ­mite del llamador se omite esa expansiÃ³n completa, como los
  llamadores de `native/hub/src/calendar/model.rs` (lÃ­mite nativo de 10.000).
- `rows.ts` y `days.ts`: favoritas, prÃ³xima carrera, avisos de franjas/tandas y
  agrupaciÃ³n de Mis carreras. Las franjas siempre usan hora local del sistema;
  elegir UTC cambia la presentaciÃ³n. La primera salida conserva la aritmÃ©tica
  `medianoche + minutos` del GPUI, tambiÃ©n durante un cambio de hora.
- `calendarDate.ts`: dÃ­as civiles por fecha, nunca aÃ±adiendo 24 horas para avanzar
  un dÃ­a local. La semana publicada conserva sus fechas UTC al presentarla en
  zonas occidentales. Tests con Node iniciado en Europe/Madrid y Los_Angeles.
- `CalendarState.ts`: lectura local antes de refrescar, permiso del nÃºcleo,
  sondeo de 5 min los lunes antes de las 12 UTC y 15 min el resto, un refresco
  en vuelo y descarte de respuestas de una sesiÃ³n anterior.
- `CalendarPreferences.ts`: acciones CAS serializadas, conflicto visible sin
  sobrescritura automÃ¡tica, reintento y descarte explÃ­citos. Un cambio de cliente
  o derechos invalida las respuestas anteriores y libera el estado ocupado.
  Cada documento expone su estado por separado: protegido o inaccesible implica
  revisiÃ³n nula y bloquea solo sus propias acciones. Recargar permite recuperar
  un documento reparado. `calendarScheduleUnavailable` explica que todavÃ­a no
  hay horario vigente para aÃ±adir una serie a favoritas.

Las pruebas solo usan fixtures pÃºblicos y dobles locales. La publicaciÃ³n de
referencia de octubre se obtiene del corpus generado por Rust y aplica los
mismos desplazamientos pÃºblicos de `native/hub/src/calendar/capture.rs`.

## Agenda efÃ­mera de los overlays

El anfitriÃ³n publica `session-alerts-feed.json` junto a `Args.layout`, mediante
`vantare_ipc::session_alerts::calendar_path`, igual que el GPUI congelado
(`calendar/feed.rs`). El renderer no recibe ni elige esa ruta. El tick existente
comprueba la capacidad Calendar, verificaciÃ³n, bloqueo y suscripciÃ³n de derechos
antes de leer las preferencias. Perder cualquiera de esos derechos vacÃ­a la agenda.

Usa el horario vigente oficial, completado por respaldo sin sustituir series
oficiales. Nunca usa `previous`. Solo incluye salidas con aviso entre ahora menos
2 segundos y los siguientes 61 minutos; las franjas callan en pista y las tandas
explÃ­citas conservan su comportamiento. El canal En pista apagado vacÃ­a el feed.
Las franjas usan la hora local y la aritmÃ©tica de cambio de hora del GPUI.

Los metadatos evitan analizar los documentos cada tick. Se revisan una vez por
segundo; una transiciÃ³n de derechos o entrada en pista se atiende inmediatamente.
Sin cambios y con eventos se escribe un heartbeat cada 5 segundos, para el TTL existente de
10 segundos del consumidor. Hay un mÃ¡ximo de 256 avisos y 64 KiB; escritura CAS
con los bytes observados, sin seguir un destino simbÃ³lico ni modificar
preferencias. No crea ni renueva un feed vacÃ­o si ya estÃ¡ vacÃ­o o no existe.
Los fallos de la fuente vacÃ­an la agenda; Busy, Conflict, Io, Protected y TooLarge
al publicar conservan al otro escritor y dejan actuar el TTL. Se registran la
categorÃ­a cerrada del fallo y su recuperaciÃ³n.

No hay hilos, mÃ©todos ni temas nuevos. Al cerrarse el anfitriÃ³n cesa el heartbeat
y el consumidor aplica su TTL, igual que al cerrarse el GPUI. Esto no introduce
un residente ni promete avisos con el Hub cerrado. Los avisos de Windows, ICS y
el mantenimiento del historial de publicaciones son entregas independientes.

La equivalencia se comprueba con `calendar-agenda-gpui.json`, generado por
`cargo run -p vantare-hub --example calendar-agenda -- ../hub-web/fixtures/calendar-agenda-gpui.json`
desde `native/`, siempre mediante la cola. El ejemplo y su test de mantenimiento
`native/hub/tests/calendar_agenda.rs` pertenecen al crate GPUI y usan sus módulos
puros dentro del mismo crate; hub-host solo consume el JSON y nunca enlaza GPUI.
No se modifica el guard de arquitectura ni la aplicación congelada.
Incluye hashes normalizados a LF del modelo, avisos y reloj, el corpus compartido,
la publicación de octubre, franjas First/Each, tandas semanales y desfases sobre
un intervalo de 37 minutos. El test nativo verifica salidas y hashes en cualquier
zona; compara First directamente cuando la zona local coincide con el offset
registrado. Si no coincide, avisa y omite solo esa comparación local de First.
El anfitrión siempre verifica First con el offset inyectado del fixture y cubre
además saltos de medianoche y hora repetida con zonas sintéticas inyectadas.
