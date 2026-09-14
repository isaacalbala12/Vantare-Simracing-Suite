# ISA-996 — cierre local de E20 con cadencias aprobadas

2026-09-06. E21 identifica la build con nuevas cadencias; el transporte
incremental sigue siendo E20. No es una arquitectura nueva.

## Veredicto

Conservar E20 como candidato a integración: reducción local repetida de CPU
del13,96% (0,3691 puntos) con aumento de5,46MiB privados (1,43%).
El intercambio es razonable para priorizar CPU; no es ahorro en todos los
recursos. No alcanza<2%, no acredita ganancia de FPS frente al HUD de LMU,
no acredita todos los PCs y no sustituye QA de conducción.
No se cambia el flag OFF por defecto durante esta prueba ni se promociona.

| Ruta, N3 cada una | CPU máquina media | SD CPU | RAM privada MiB | GPU % |
| --- | ---: | ---: | ---: | ---: |
| Completa | 2,6447% | 0,0981 | 382,65 | 0,1162 |
| Incremental E20 | 2,2755% | 0,1100 | 388,11 | 0,1081 |

CV CPU:3,71% y4,84%; no declarar p-value con estas tres muestras.
La diferencia GPU es pequeña y no demuestra una mejora significativa.

| Corrida | CPU % | RAM privada MiB | GPU % | Native valid/total |
| --- | ---: | ---: | ---: | ---: |
| full-1 | 2,7546 | 379,43 | 0,1283 | 617/617 |
| full-2 | 2,5659 | 384,90 | 0,1172 | 612/612 |
| full-3 | 2,6135 | 383,63 | 0,1030 | 615/615 |
| sections-1 | 2,3661 | 389,38 | 0,0971 | 626/626 |
| sections-2 | 2,1531 | 392,56 | 0,1092 | 610/610 |
| sections-3 | 2,3075 | 382,39 | 0,1181 | 610/610 |

## Configuración real

- Misma build licenciada `bin/vantare-isa996-e21.exe`, SHA256
  `1c6cfd713cff66a529f2f0624137c9ffe22402d84556dabc27b9b67b376392a9`.
- `VANTARE_OVERLAY_SECTIONS=0/1`, sin otros cambios entre brazos.
- Perfil `testdata/bench/huella-seis-l1.json`, seis widgets: Standings,
  Relative, Pedals, Fuel, Weather, mapa. Perfil mixto, no seis Redline.
- L1: Standings4Hz, Relative30, mapa30, Pedals60, Fuel2, Weather1.
  Delta60 está configurado/testado, pero no forma parte de estos seis.
- Go permite instrumentos60 y Relative/Standings30; el mapa consume
  posiciones de Standings. Limitar esa sección a4 congelaría también el mapa.
  Fuel2; adquisición y guardas de seguridad no se reducen.
  Son techos de actualización: no promesa de60 datos distintos por segundo
  cuando la fuente no cambie, ni medición de tasa física del simulador.
- Antes: Go Fast20Hz y Relative/Standings4Hz aunque el pintado fuese más rápido.
  Por eso el cambio de cadencias también aumenta frescura y trabajo en Go.
  No atribuir un gran ahorro a la tabla por sí sola. La serie anterior visible
  E20 tenía otra build/cadencia y otra hora de sesión; no es control intercambiable.
- LMU real PID8680, práctica La Sarthe,62 coches, jugador parado en boxes,
  HUD Full, misma sesión.30s calentamiento +60s captura, orden A1/B1/B2/A2/A3/B3.
  La sesión evoluciona; no es replay perfectamente determinista.
- Seis widgets revisados visualmente antes de cada corrida. Monitor nativo
  nominal100ms, foco LMU y ventana visible/topmost/no minimizada/no cloaked
  intersectando pantalla; intervalo UTC cubierto, cero muestras inválidas.
  Esto no es inspección continua de píxeles ni prueba de ausencia de oclusión.
- Todos los CSV: live62, seis widgets, secuencia creciente, build estable,
  gate de visibilidad válido y cierre limpio.26 muestras de coste por corrida.
- Secciones realmente recibidas:5860/5799/5820; controles cero.
- CPU suma árbol propio, normalizada por16 procesadores lógicos. Incluye
  renderer-unassigned sin atribución falsa por ventana. RAM privada, no working
  set. GPU suma contadores propios de motores, no consumo total del juego.
  Instrumentación común externa excluida del coste de Vantare.

## Evidencia y comprobaciones

Crudos `C:/tmp/isa996-e21-{full,sections}-{1,2,3}/` y logs hermanos.
Conservan CSV, CDP, licencia sanitizada, JSON visibilidad y cobertura temporal,
reapertura del Hub y cierre. Resumen:
`C:/tmp/isa996-e19-summary.ps1 -Experiment e21`.
Los informes unitarios N1 siguen diciendo insuficiente; se agregan N3 aquí,
sin reescribir crudos ni ocultar resultados.

- Tests nuevos RED/GREEN: techos por widget y sección compartida con mapa.
- `go test ./internal/app/performance ./internal/telemetry/projection/overlayv2`: PASS.
- `go test ./...`: PASS, `C:/tmp/isa996-e21-go-all.log`.
- Build frontend+Go configurada: PASS, `C:/tmp/isa996-e21-build.log`.
- No cambio frontend desde E20: se conservan sus gates previos, no se presenta
  una nueva ejecución de la suite frontend. Banco16 tests PASS anteriores
  sigue aplicable: no se modificó el banco en esta serie.
- Revisión personal: base por consumidor, replay pendiente, cambio de sesión/
  epoch, validación y publicación atómicas, ruta completa y límites conservados.
  No se declara review independiente ni CI remoto.
- Pendiente del siguiente paso: preparar diff de integración sin experimentos
  descartados, revisar conjunto/CI y promover sólo a nightly según autorización.
- Nueva dirección de adaptadores ligeros y datos nativos: posterior, por fases;
  ninguna implementación de esa dirección dentro de este cierre.

## Estado Git

Rama `vantareapp/isa-996-cierre-rendimiento`, HEAD
`1c835bc031df17d2b33c0ab6a95e474e80404358`, base declarada
`659b2c57dc2c7fc75962cc3c8e425ed1289266ec`. Trabajo local acumulado preservado.
En este paso no hubo commit, push, PR, merge, promoción ni release.
La autorización de integración posterior no equivale a integración realizada.
