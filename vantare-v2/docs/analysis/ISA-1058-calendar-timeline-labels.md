# ISA-1058 - Etiquetas legibles en Timeline

Base: ISA-1057 dd5dc1d7 sobre nightly d6d0992f.
Rama: vantareapp/isa-1058-calendar-timeline-labels.

Reproduccion real C1: a 1264x761, la escala 24h dibuja etiquetas cada hora
separadas por pocos pixeles. No es un problema del horario caducado.
Se cambia solo tickEveryMinFor en el modelo de Calendario: intervalos de horas
mas amplios cuando el eje no permite reservar 50px para cada HH:mm y su borde.
Los bloques, horarios, rango, zoom y el componente compartido quedan iguales.
No se modifica HUD/OBS/Studio ni Strategy.

Prueba de geometria Chromium con componente y CSS productivos: RED con codigo
anterior, GREEN en anchos 200/320/550/1200px y escalas 6/12/24h.
Suite focal: 152 PASS, 2 omitidas por artefactos externos.
Build (incluye tipos) y lint PASS. Suite completa frontend: 3302 PASS, 2 omitidas;
AbortError de teardown con exit0 no invalida el resumen final. Review ACCEPT bfea3baa.
Go completo no repetido: ningun cambio Go/contrato compartido desde ISA-1057, cuyo fullGo paso.

Wails real a 1264x761 DPR1 con cuenta autenticada/licencia activa: 24h=7 etiquetas,
12h=13, 6h=25; cero solapamientos en las tres escalas. Capturas y
wails-geometry.json en results/isa1058. Horarios/eventos no alterados.
Ejecutable construido desde bfea3baa, SHA256
78b7f711ccbe8857ec8e91286e5823164df4b358fa5111eaf3d07165ae0bb873.
No es medicion de ahorro. Banco con horario vigente y avisos reales pendientes
del origen de datos solicitado a Isaac; el disponible sigue caducado.
Verificacion manual: abrir Calendario > Timeline, alternar 6/12/24h y ajustar
ancho; comprobar eje legible y bloques/seleccion conservados cuando haya horario.
No integrado a nightly ni publicado.
