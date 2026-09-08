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
Pendientes: build/lint/suite completa, review y Wails. No ahorro medido.
