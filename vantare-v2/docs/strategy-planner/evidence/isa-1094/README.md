# ISA-1094 — asistente registrado

Base e95d3bbb72cfd95f06bda84fb6d6d549f5c892ab; rama
vantareapp/isa-1094-recorded-wizard; SDD R03–R05, A03–A05, T05.

## T05a — borrador y selección

Dos paths nuevos, strategy-recorded-wizard.ts y su test. Borrador sólo en memoria:
no persiste, no importa archivos ni calcula. Ausencia de duración, capacidades,
reservas, pilotos y sesiones se conserva. Volver atrás conserva valores.
Cambiar combinación retira las referencias seleccionadas, registra cuántas y
no toca las correcciones de Analysis. Calendario se copia con versión, fecha
de actualización y captura; no se reaplica al refrescar el proveedor.
Compatibilidad usa identidades de simulador, circuito y categoría declaradas.

Siete tests focales PASS. La primera ejecución detectó que la proyección por
IDs podía admitir una fila incompatible si el catálogo repetía ese ID; se
comprueba ahora cada fila con las identidades completas. Typecheck y ESLint
focal PASS. Logs C:/tmp/isa1094-t05a-tests.log, -types.log y -lint.log.
Sin cambios Go. Gates generales se ejecutan al integrar las pantallas.

Pendiente: componentes A4 e integración, controles de evento y pilotos,
descubrimiento automático real, persistencia nativa de configuración incompleta.
No se presenta el borrador como guardado, calculable ni aceptado visualmente.
