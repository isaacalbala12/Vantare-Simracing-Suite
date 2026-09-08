# ISA-1064 - Optimizaciones temporales sobre Calendario integrado

Base nightly b6b5754eee059bc239fce18c08b39adae8c553fa. Issue #1064 retoma #1020/#1024 dentro de #1015. Worktree aislado C:/tmp/vantare-isa1064-calendar-performance, rama vantareapp/isa-1064-calendar-performance.

Hipotesis previamente reproducida: nuevas instancias Date invalidan modelos de Timeline y columna sin cambios efectivos; Mes reconstruye42 celdas cada segundo aunque solo usa el dia local. Revalidar sobre contratos actuales de vigencia, series y DST; no importar codigo antiguo que omita calendar.series.

Cambios previstos: useClock conserva identidad por tick; Timeline usa el instante producido por timelineStart actual como clave, sin sustituir su algoritmo DST; Mes usa dayAnchor local con dependencias de calendario/series/filtro/offset intactas. No estilos, animaciones, informacion, cadencias ni dependencias nuevas. Sin HUD/OBS/Studio.

Regresiones reutilizadas observan las funciones reales y resultado DOM; fecha de prueba de medianoche adaptada con publicacion vigente explicita para2026-12/2027-01. Es fixture unitario, nunca evidencia LMU. Se conserva el cambio de cuenta atras cada segundo y actualizacion inmediata por hora/dia/filtro/eventos.

Estado: candidato local revisado; RED/GREEN completado. Medidas Wails pendientes de ventana coordinada con otra tarea activa. No ejecutar mediciones simultaneas con builds/tests ni atribuir consumo de otras aplicaciones. Sin ahorro global CPU/GPU/RAM o latencia de pantallas certificado. No publicar horario real. No merge/release autorizados para este candidato.

## Evidencia local

RED en nightly:51 tests,48PASS/3FAIL;10 llamadas monthDays,10 timelineRows y29 upcomingRows en intervalos donde sus entradas efectivas no cambian. Tras corte de reloj,50PASS y solo falla Mes: el wrapper ejecuto todo el archivo pese al filtro solicitado. Tras corte mensual,112PASS/2omitidas en6 archivos de Calendario y motor. Ningun umbral o exclusion modificado. Se conservan logs red.log, clock-green.log y green.log en results/isa1064.

Revision preliminar independiente: conservar calendar.series como quinto argumento/dependencia de monthDays evita reclasificar recurrencias ocultas como especiales. Cambio conserva ese contrato y timelineStart actual (incluidas transiciones DST). Build/typecheck, lint y44 tests roadmap PASS. Go no modificado ni contratos compartidos: no se repite suite Go local.

Cambio productivo13 lineas de diff en RacesOrbitPage.tsx (8 nuevas/5 sustituidas), cuatro regresiones reutilizadas y adaptadas. No se crean stores ni timers nuevos; no se reduce frecuencia del detalle. No se modifica el algoritmo de calendario ni codigo excluido.

## Cierre del corte 2026-09-08

Review independiente ACCEPT sobre01b2b77f119c1a968e7aa9835779be4d31de9ed5, sinP1/P2. Revisión parental del diff confirma un archivo productivo, cuatro regresiones, roadmap y handoff; seis archivos creados/modificados, ninguno movido. No Go ni contratos compartidos modificados, por lo que no se ejecuta suite Go local.

Suite completa:3311PASS/2omitidas/3FAIL en421 archivos, salida1. Los tres fallos son timeouts20000ms en timeline-labels.layout.test.tsx (Calendario), TrackMapEndurance.layout.test.tsx y StandingsRedlineTemplate.layout.test.tsx. Timeline habia pasado en focales; una comprobacion aislada posterior PASS (649ms de test). No se modifica ningun limite ni se reintenta la suite completa. Los timeouts se anotan en #1025; no se atribuye causa al candidato ni se declaran resueltos. Se conservan todos los logs, incluido AbortError de teardown de Happy DOM.

Sin reserva confirmada de ventana de medicion, no se lanza/controla Wails ni otra aplicacion; la tarea paralela sigue activa. A/A, A/B, consumo CPU/GPU/RAM, rapidez de pantallas y apariencia nativa permanecen pendientes. Las cifras10->0 y29->0 son reconstrucciones de modelos evitadas en tests de pagina real, no porcentajes de consumo. Tampoco se ha completado la validacion visual pendiente del aviso Owner de #1061.

Verificacion manual posterior: comparar la misma publicacion vigente en baseb6b5754e y candidato, LMU en estado estable y mismas rutas/foco/Auto; confirmar cinco vistas, filtros, seguimiento, cuenta atras1s y fronteras hora/dia. Reutilizar banco integrado sin perfilador en aceptacion; >=3 pares comparables y A/A antes de anunciar ahorro. No cargar fixtures unitarios en la app ni publicar horarios para forzar datos.

Rama vantareapp/isa-1064-calendar-performance desdeb6b5754e. Commit/push/PR/CI finales se registran en issue1064. No integracion, promocion, release ni cambios a aplicaciones ajenas. Candidato apto para revision de codigo; aceptacion de rendimiento real pendiente.
