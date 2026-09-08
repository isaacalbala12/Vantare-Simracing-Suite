# ISA-1064 - Optimizaciones temporales sobre Calendario integrado

Base nightly b6b5754eee059bc239fce18c08b39adae8c553fa. Issue #1064 retoma #1020/#1024 dentro de #1015. Worktree aislado C:/tmp/vantare-isa1064-calendar-performance, rama vantareapp/isa-1064-calendar-performance.

Hipotesis previamente reproducida: nuevas instancias Date invalidan modelos de Timeline y columna sin cambios efectivos; Mes reconstruye42 celdas cada segundo aunque solo usa el dia local. Revalidar sobre contratos actuales de vigencia, series y DST; no importar codigo antiguo que omita calendar.series.

Cambios previstos: useClock conserva identidad por tick; Timeline usa el instante producido por timelineStart actual como clave, sin sustituir su algoritmo DST; Mes usa dayAnchor local con dependencias de calendario/series/filtro/offset intactas. No estilos, animaciones, informacion, cadencias ni dependencias nuevas. Sin HUD/OBS/Studio.

Regresiones reutilizadas observan las funciones reales y resultado DOM; fecha de prueba de medianoche adaptada con publicacion vigente explicita para2026-12/2027-01. Es fixture unitario, nunca evidencia LMU. Se conserva el cambio de cuenta atras cada segundo y actualizacion inmediata por hora/dia/filtro/eventos.

Estado: RED/GREEN y gates en curso. Medidas Wails pendientes de ventana coordinada con otra tarea activa. No ejecutar mediciones simultaneas con builds/tests ni atribuir consumo de otras aplicaciones. Sin ahorro global CPU/GPU/RAM o latencia de pantallas certificado. No publicar horario real. No merge/release autorizados para este candidato.

## Evidencia local

RED en nightly:51 tests,48PASS/3FAIL;10 llamadas monthDays,10 timelineRows y29 upcomingRows en intervalos donde sus entradas efectivas no cambian. Tras corte de reloj,50PASS y solo falla Mes: el wrapper ejecuto todo el archivo pese al filtro solicitado. Tras corte mensual,112PASS/2omitidas en6 archivos de Calendario y motor. Ningun umbral o exclusion modificado. Se conservan logs red.log, clock-green.log y green.log en results/isa1064.

Revision preliminar independiente: conservar calendar.series como quinto argumento/dependencia de monthDays evita reclasificar recurrencias ocultas como especiales. Cambio conserva ese contrato y timelineStart actual (incluidas transiciones DST). Build/typecheck PASS; suite completa/lint/roadmap en curso. Go no modificado ni contratos compartidos: no se repite suite Go local.

Cambio productivo13 lineas de diff en RacesOrbitPage.tsx (8 nuevas/5 sustituidas), cuatro regresiones reutilizadas y adaptadas. No se crean stores ni timers nuevos; no se reduce frecuencia del detalle. No se modifica el algoritmo de calendario ni codigo excluido.
