# Datos de Calendario 路 VANTA-138

Esta capa prepara los DTO del m贸dulo `calendar` para sus vistas. No registra
pantallas ni a帽ade m茅todos, eventos, documentos o dependencias. Depende del
contrato de preferencias de #2088: usa sus tipos generados y errores cerrados.

- `schedule.ts`: recurrencias UTC ancladas en el calendario gregoriano del GPUI,
  salidas 煤nicas y ordenadas, fin de publicaci贸n exclusivo y expansi贸n acotada.
  Si se supera el l铆mite del llamador se omite esa expansi贸n completa, como los
  llamadores de `native/hub/src/calendar/model.rs` (l铆mite nativo de 10.000).
- `rows.ts` y `days.ts`: favoritas, pr贸xima carrera, avisos de franjas/tandas y
  agrupaci贸n de Mis carreras. Las franjas siempre usan hora local del sistema;
  elegir UTC cambia la presentaci贸n. La primera salida conserva la aritm茅tica
  `medianoche + minutos` del GPUI, tambi茅n durante un cambio de hora.
- `calendarDate.ts`: d铆as civiles por fecha, nunca a帽adiendo 24 horas para avanzar
  un d铆a local. La semana publicada conserva sus fechas UTC al presentarla en
  zonas occidentales. Tests con Node iniciado en Europe/Madrid y Los_Angeles.
- `CalendarState.ts`: lectura local antes de refrescar, permiso del n煤cleo,
  sondeo de 5 min los lunes antes de las 12 UTC y 15 min el resto, un refresco
  en vuelo y descarte de respuestas de una sesi贸n anterior.
- `CalendarPreferences.ts`: acciones CAS serializadas, conflicto visible sin
  sobrescritura autom谩tica, reintento y descarte expl铆citos. Un cambio de cliente
  o derechos invalida las respuestas anteriores y libera el estado ocupado.
  Cada documento expone su estado por separado: protegido o inaccesible implica
  revisi髇 nula y bloquea solo sus propias acciones. Recargar permite recuperar
  un documento reparado. `calendarScheduleUnavailable` explica que todav韆 no
  hay horario vigente para a馻dir una serie a favoritas.

Las pruebas solo usan fixtures p煤blicos y dobles locales. La publicaci贸n de
referencia de octubre se obtiene del corpus generado por Rust y aplica los
mismos desplazamientos p煤blicos de `native/hub/src/calendar/capture.rs`.
