# ISA-996 — E20 repetido con HUD visible obligatorio

2026-09-06. Resultado local, no integrado ni aceptado como mejora global.

## Resultado

| Ruta | CPU máquina media | RAM privada media MiB | GPU media % |
| --- | ---: | ---: | ---: |
| Snapshot completo, tres corridas | 2,5279% | 385,52 | 0,1121 |
| Secciones incrementales E20, tres corridas | 2,3167% | 395,17 | 0,1303 |

CPU baja 0,2113 puntos (8,36% relativo), RAM sube 9,65 MiB (2,50%).
GPU no acredita ahorro. No se alcanza CPU <2%. La variación entre corridas
aconseja interpretar el ahorro como indicio local, no garantía estadística ni
promesa para otros PCs. Se mantiene el experimento desactivado por defecto.

| Corrida | CPU % | RAM MiB | GPU % | Muestras nativas válidas/total |
| --- | ---: | ---: | ---: | ---: |
| full-1 | 2,5757 | 374,52 | 0,1171 | 617/617 |
| full-2 | 2,5489 | 382,74 | 0,1075 | 622/622 |
| full-3 | 2,4592 | 399,31 | 0,1116 | 614/614 |
| sections-1 | 2,3139 | 401,61 | 0,1261 | 615/615 |
| sections-2 | 2,1640 | 387,36 | 0,0988 | 617/617 |
| sections-3 | 2,4720 | 396,54 | 0,1661 | 614/614 |

## Método y límites

- Orden A1/B1/B2/A2/A3/B3; 30s calentamiento y 60s captura por corrida.
- Misma build `bin/vantare-isa996-e20.exe`, SHA256
  `5d28a20f8ffd77debeea55ed0b5c75ecf20a329adb70b1ef45e40b9b3b5c5c06`.
- Sólo cambia `VANTARE_OVERLAY_SECTIONS=0/1`. Perfil
  `testdata/bench/huella-seis-l1.json`, seis widgets, nivel L1, Hub minimizado.
- LMU real, La Sarthe, práctica, 62 coches, jugador parado en boxes,
  HUD del juego Full sin cambios. No prueba de conducción ni vueltas.
- Standings Redline, Relative Redline Mirror, Pedals Redline, TrackMap
  Endurance Outline, FuelStrategy Original y TrackWeather Original.
  No confundir este perfil mixto con seis widgets Redline.
- Revisión Computer Use previa de los seis widgets visibles en cada corrida.
  Algunos datos de Weather/Fuel no disponibles: esto no acredita su QA funcional.
- Sondeo nativo sólo lectura cada100ms: PID exacto del juego foreground,
  ventana Vantare Overlay del PID exacto visible, no minimizada, no cloaked,
  topmost y con intersección de pantalla. Cobertura inicial/final en UTC.
  Cualquier muestra inválida o intervalo sin cobertura invalida la corrida.
  No equivale a inspección continua de píxeles ni prueba de ausencia de oclusión.
  Mayor separación observada: 221,57ms en full-3; resto máximo 102,17ms.
- Todas: seis widgets, telemetría live y secuencia creciente al final,
  misma SHA, cierre limpio y flags de visibilidad/publicabilidad válidos.
- CPU suma procesos propios, normalizada por 16 procesadores lógicos; RAM
  es memoria privada, no working set. Renderer-unassigned se incluye en total,
  sin atribuirlo a una ventana concreta. GPU es suma de contadores de motores,
  no FPS del juego. Observador común externo no incluido en coste de Vantare.
- E20 recibió 5818/5835/5793 snapshots de secciones; controles cero.
  No se perfila con CDP durante la captura de coste.

## Condición obligatoria y evidencia

`scripts/bench/huella.ps1` requiere `bin/overlay-visibility-probe.exe` para
medidas con juego y HUD. A0 queda exento porque no tiene HUD; modos sin juego
o pintura oculta siguen siendo diagnósticos no publicables. No aceptar sólo
montaje DOM como prueba de visibilidad. El plan maestro y ADR0095 recogen
también esta condición para cualquier prueba futura de ahorro visible.

Crudos completos: `C:/tmp/isa996-e20-v2-{full,sections}-{1,2,3}/`.
Cada directorio conserva CSV, CDP inicial/final, licencia sanitizada,
`*-visibility.json`, `*-visibility-interval.json` y reapertura del Hub.
Logs hermanos `.log`; resumen reproducible:
`C:/tmp/isa996-e19-summary.ps1 -Experiment e20-v2`.
Los informes unitarios dicen N1 insuficiente; la tabla superior agrega N3
por ruta, sin cambiar sus flags o sus crudos originales.

E19/E20 anteriores sin gate nativo quedan retirados como prueba de ahorro
con HUD visible. Serie `e20-visible-*` rechazada por comparación UTC/local,
corregida con test de regresión; no se reetiqueta como válida retrospectivamente.

## Checks y entrega

- `go test ./...`: PASS (`C:/tmp/isa996-visibility-go-all.log`).
- Banco: 16 tests PASS, incluido RED/GREEN de UTC con JSON DateTime real
  (`C:/tmp/isa996-visibility-final-tests.log`).
- Probe: gofmt/build y tests de geometría PASS; PID inexistente devuelve invalid.
- Frontend no modificado en esta repetición; no se repiten suites frontend.
- Roadmap regenerado; diff sin errores de whitespace.
- Rama `vantareapp/isa-996-cierre-rendimiento`, base
  `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`, HEAD
  `1c835bc031df17d2b33c0ab6a95e474e80404358` con cambios locales previos preservados.
- Sin nuevo commit, push, PR, CI remoto, merge, promoción ni release.

Para reproducir, compilar el probe con el procedimiento indicado por el banco,
usar la build configurada/licenciada y el mismo perfil; activar LMU antes de
captura, comprobar visualmente los seis widgets y no cambiar foco hasta su fin.
