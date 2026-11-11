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
  revisión nula y bloquea solo sus propias acciones. Recargar permite recuperar
  un documento reparado. `calendarScheduleUnavailable` explica que todavía no
  hay horario vigente para añadir una serie a favoritas.

Las pruebas solo usan fixtures pÃºblicos y dobles locales. La publicaciÃ³n de
referencia de octubre se obtiene del corpus generado por Rust y aplica los
mismos desplazamientos pÃºblicos de `native/hub/src/calendar/capture.rs`.
