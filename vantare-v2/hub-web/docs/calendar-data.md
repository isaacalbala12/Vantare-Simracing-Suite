# Datos de Calendario · VANTA-138

Esta capa prepara los DTO del módulo `calendar` para sus vistas. No registra
pantallas ni añade métodos, eventos, documentos o dependencias. Depende del
contrato de preferencias de #2088: usa sus tipos generados y errores cerrados.

- `schedule.ts`: recurrencias UTC ancladas en el calendario gregoriano del GPUI,
  salidas únicas y ordenadas, fin de publicación exclusivo y expansión acotada.
  Si se supera el límite del llamador se omite esa expansión completa, como los
  llamadores de `native/hub/src/calendar/model.rs` (límite nativo de 10.000).
- `rows.ts` y `days.ts`: favoritas, próxima carrera, avisos de franjas/tandas y
  agrupación de Mis carreras. Las franjas siempre usan hora local del sistema;
  elegir UTC cambia la presentación. La primera salida conserva la aritmética
  `medianoche + minutos` del GPUI, también durante un cambio de hora.
- `calendarDate.ts`: días civiles por fecha, nunca añadiendo 24 horas para avanzar
  un día local. La semana publicada conserva sus fechas UTC al presentarla en
  zonas occidentales. Tests con Node iniciado en Europe/Madrid y Los_Angeles.
- `CalendarState.ts`: lectura local antes de refrescar, permiso del núcleo,
  sondeo de 5 min los lunes antes de las 12 UTC y 15 min el resto, un refresco
  en vuelo y descarte de respuestas de una sesión anterior.
- `CalendarPreferences.ts`: acciones CAS serializadas, conflicto visible sin
  sobrescritura automática, reintento y descarte explícitos. Un cambio de cliente
  o derechos invalida las respuestas anteriores y libera el estado ocupado.
  Cada documento expone su estado por separado: protegido o inaccesible implica
  revisión nula y bloquea solo sus propias acciones. Recargar permite recuperar
  un documento reparado. `calendarScheduleUnavailable` explica que todavía no
  hay horario vigente para añadir una serie a favoritas.

Las pruebas solo usan fixtures públicos y dobles locales. La publicación de
referencia de octubre se obtiene del corpus generado por Rust y aplica los
mismos desplazamientos públicos de `native/hub/src/calendar/capture.rs`.

## Agenda efímera de los overlays

El anfitrión publica `session-alerts-feed.json` junto a `Args.layout`, mediante
`vantare_ipc::session_alerts::calendar_path`, igual que el GPUI congelado
(`calendar/feed.rs`). El renderer no recibe ni elige esa ruta. El tick existente
comprueba la capacidad Calendar, verificación, bloqueo y suscripción de derechos
antes de leer las preferencias. Perder cualquiera de esos derechos vacía la agenda.

Usa el horario vigente oficial, completado por respaldo sin sustituir series
oficiales. Nunca usa `previous`. Solo incluye salidas con aviso entre ahora menos
2 segundos y los siguientes 61 minutos; las franjas callan en pista y las tandas
explícitas conservan su comportamiento. El canal En pista apagado vacía el feed.
Las franjas usan la hora local y la aritmética de cambio de hora del GPUI.

Los metadatos evitan analizar los documentos cada tick. Se revisan una vez por
segundo; una transición de derechos o entrada en pista se atiende inmediatamente.
Sin cambios se escribe un heartbeat cada 5 segundos, para el TTL existente de
10 segundos del consumidor. Hay un máximo de 256 avisos y 64 KiB; escritura CAS
con los bytes observados, sin seguir un destino simbólico ni modificar
preferencias. Los errores se registran como categorías cerradas y se reintentan.

No hay hilos, métodos ni temas nuevos. Al cerrarse el anfitrión cesa el heartbeat
y el consumidor aplica su TTL, igual que al cerrarse el GPUI. Esto no introduce
un residente ni promete avisos con el Hub cerrado. Los avisos de Windows, ICS y
el mantenimiento del historial de publicaciones son entregas independientes.
