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
