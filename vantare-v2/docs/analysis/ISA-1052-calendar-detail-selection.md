# ISA-1052 — detalle y selección de Calendario

C9 de #1027, base C8 ec3a75f5 sobre C7/C3 y nightly d6d0992f.
Rama vantareapp/isa-1052-calendar-detail-selection. Sin integración.

El detalle perdía estimated al formatear sesiones y conservaba pickedAt aunque
el filtro eligiese otra serie, cambiase la publicación o llegase otro destino.
Ahora cada duración estimada lleva ~ con explicación traducida; las confirmadas
no lo llevan. La selección une serie/instante/destino. Un nuevo target reinicia
selección y filtro antes de pintar; no resucita selecciones de destinos previos.
El instante se valida mediante el motor actual, incluida la vigencia. Las horas
históricas aún publicadas se conservan al actualizar seguimiento. No se añade
otro motor, panel, dependencia o CSS; ni se amplían campos de equipo/energía.

RED siete fallos iniciales y dos casos adicionales de navegación; GREEN 133
focales (dos skips heredados de Lord Howe/artefacto Go, comprobados en sus cortes).
Build/tipos/lint/roadmap23+21 PASS; review ACCEPT3c85e2b8.
Full frontend3276PASS/2skips/4FAIL por timeouts externos: Crystal tables:33
(30s), PedalsRedline:47 missing, StandingsRedlineTemplate:246 missing y
TrackMapEndurance:89 (20s), registrados en #1025. Sin ampliar límites. No cambios
Go/contrato compartido: no se repite full Go. Wails/foco/geometría y medición real
siguen pendientes, junto con C6c permisos/avisos. C6a/C6b aceptados #1051/#1053.

Archivos: modelo/página de Calendario, sus dos tests, cuatro locales, informe,
handoff, roadmap manual/generado. Pruebas usan fixtures explícitas, no runtime.
Manual: elegir salida, cambiar filtro; navegar desde Inicio a otra serie; renovar
horario y comprobar la hora; sesiones estimadas visibles; fecha histórica válida.
Sin HUD/Studio, datos reales modificados, merge, promoción o release.
