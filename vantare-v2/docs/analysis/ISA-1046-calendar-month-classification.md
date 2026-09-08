# ISA-1046 — clasificación mensual

C8 del plan #1027. Base C7 411b5538 sobre C3 317ff133 y nightly d6d0992f;
rama vantareapp/isa-1046-calendar-month-classification. Sin integrar dependencias.

Mes clasificaba cada Calendar.events como especial, incluyendo 4596 ocurrencias
del motor Go que ya estaban representadas mediante sus series. Ahora separa una
vez los especiales usando fuente e identidad exacta del generador: ID de serie
publicada + timestamp UTC del propio evento. No usa títulos ni el filtro visible.
La página pasa todas las series publicadas aunque el usuario filtre otra categoría.
Un evento externo, un ID especial propio o una serie desconocida se conservan.
No se muta Calendar.events, ni se cambia HUD/Studio, estructura o CSS.

RED tres regresiones; GREEN siete pruebas normales. Contraste local adicional
con el JSON Go real de #1027: 4596 eventos, cero ocurrencias reclasificadas como
especiales, con todos los filtros y solo avanzada; documento original intacto.
Ocho pruebas PASS con CALENDAR_REAL_AUDIT_PATH apuntando al backend-calendar.json
de esa auditoría. Ese contraste es opt-in porque usa un artefacto externo; CI
ejecuta los siete casos portables y no se atribuye esa prueba al runtime Wails.

Reproducir el contraste: establecer CALENDAR_REAL_AUDIT_PATH a la salida JSON Go
de la auditoría #1027 y ejecutar el test calendar-month-classification.test.ts.
Se añade la vigencia del mismo seed al snapshot anterior a C2, sin inventar fechas.
No hay medición de ahorro CPU/GPU/RAM en este corte. Wails real sigue pendiente.

Archivos: races-orbit-model.ts, RacesOrbitPage.tsx, prueba de clasificación,
informe/handoff y roadmap manual/generado. Checks finales y review pendientes.
Verificación manual: Mes de una publicación vigente o histórica, filtro Todas y
otra categoría, resúmenes compactos sin miles de especiales; evento externo visible.
Sin dependencias nuevas, datos reales modificados, merge o release.
