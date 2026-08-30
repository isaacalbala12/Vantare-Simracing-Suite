# ISA-894 — S1 definitiva ON/OFF y aislamiento CDP

## Identidad y gesto

Las dos fases S1 usaron el mismo ejecutable
`d02054e33a25139a59f57ef443255bb1fa63cc5988d05d4db98a332fbb1eda98`,
el mismo `dist`
`5b8e388c3a4b242d2e913dcfcfb1a7f5211536c564c464f7880a4fc77bf944f3`
y el HEAD `0a47361f7c144332d494f7f8b588a0936ebde8b4`. La escena fue Spa,
práctica, jugador en garaje e IA rodando, con 14 coches.

Gesto humano observado: **cruce a pista y escapatoria, sin vuelta lanzada
completa — conducción remota por teclado; Isaac puede repetir el gesto estricto
al volante si lo exige el gate**.

Crudas locales:

- ON: `results/isa-894/sesiones/s1-on-20260830-201420/`.
- OFF: `results/isa-894/sesiones/s1-off-20260830-203454/`.

## Resúmenes regenerados

Los dos `sesion.json` se reprocesaron con el parser posterior a `643a7dca`.
Desaparecen los falsos fallos de `windows`, `v1Off` y `shadowOn`. El único
criterio común que permanece en FAIL es memoria; es un fallo observado, no un
arrastre del parser.

| Criterio | ON · 20 min | OFF · 20 min | Veredicto |
| --- | --- | --- | --- |
| captura / screenshots / cierre | PASS / PASS / PASS | PASS / PASS / PASS | Evidencia completa y cierre limpio. |
| ventanas | PASS, `desktop` 1/1, pull 5/5 | PASS, `desktop` 1/1, pull 5/5 | El singleton legacy se normaliza a array. |
| V1 / shadow | 6.074 frames shadow, **0 mismatch exacto** | 0 V1; `shadow=null` 5/5 | PASS en la condición aplicable. |
| entrega | p99 67,6 ms; max 796,2 ms | p99 49,1 ms; max 871,8 ms | PASS: p99 ≤250 ms y max ≤5.000 ms. |
| renderer A | +732,4 MiB/h | +314,4 MiB/h | FAIL: límite 5 MiB/h. |
| renderer B | +309,5 MiB/h | +307,6 MiB/h | FAIL: límite 5 MiB/h. |
| GPU | +52,0 MiB/h | +79,9 MiB/h | FAIL: límite 10 MiB/h. |
| Go host | +24,0 MiB/h | +28,0 MiB/h | FAIL: límite 5 MiB/h. |
| browser | +15,3 MiB/h | +15,3 MiB/h | FAIL: límite 5 MiB/h. |
| pendiente privada total | +1.133,3 MiB/h | +745,2 MiB/h | FAIL: límite 15 MiB/h. |

S1 acredita la paridad exacta y el apagado real de V1, pero **no supera el gate
de memoria**. El gesto tampoco cumple literalmente la vuelta lanzada completa
del guion; si ese detalle es vinculante, S1 debe repetirse al volante.

## Aislamiento del polling CDP

Se ejecutó una fase diagnóstica S1 OFF de 10 minutos, sin gesto, con el mismo
exe/dist, `EstadoCada=0` y solo tres conexiones CDP: inicio, minuto 5 y final.
La cruda está en
`results/isa-894/cdp-isolation/s1-off-20260830-205930/`. Captura, metadata,
duración, higiene, ventanas, V1 OFF, entrega (p99 39,5 ms; max 1.016,1 ms),
screenshots y cierre pasaron. Memoria falló.

| Proceso | Pendiente 0–10 min | Pendiente tras descartar 5 min de warm-up |
| --- | ---: | ---: |
| renderer PID 13576 | +424,2 MiB/h | +134,9 MiB/h |
| renderer PID 3632 | +146,2 MiB/h | −18,2 MiB/h |
| Go host | +28,4 MiB/h | +30,1 MiB/h |
| browser | +32,4 MiB/h | +28,3 MiB/h |
| GPU | −71,1 MiB/h | −23,4 MiB/h |

En la S1 OFF con polling, la suma de pendientes renderer tras el minuto 5 era
+467,4 MiB/h; sin polling periódico fue +116,7 MiB/h, una reducción observada
del **75,0 %**. No es una estimación causal precisa: las duraciones son
distintas, el warm-up pesa mucho y los PID no están asignados a Hub/Overlay.

La instrumentación por target sí acota qué queda retenido en el heap JS entre
los minutos 5 y 10: Hub subió de 29,33 a 31,06 MiB (+1,73 MiB) y Overlay de
35,24 a 39,05 MiB (+3,81 MiB). Los nodos quedaron 100→100 y 363→365; no aparece
un árbol DOM creciente. Es decir, gran parte del incremento de Private Bytes no
está explicado por heap JS vivo ni por el shadow. Esta captura expone tamaños,
pero no contiene heap snapshots y por tanto no permite afirmar un retaining
path de objetos concreto.

## Conclusión y seguimiento

El attach/detach CDP cada 5 s infla materialmente la pendiente, pero no explica
todo: queda un renderer en +134,9 MiB/h después del warm-up, muy por encima del
límite. La build `production` no abre CDP por diseño
(`webview_debug_production.go`), así que esta fase tampoco demuestra que una
release tenga la misma pendiente. Se abrió #956 para asignar PID a target,
capturar dominators/retaining paths y medir `-tags production` con muestreo
externo sin CDP. No se propone un fix sin esa reproducción.

Por ello el corte 2 de ISA-894 permanece bloqueado: S1 pasa transporte/paridad,
pero falla memoria y su gesto no incluyó una vuelta lanzada completa.
