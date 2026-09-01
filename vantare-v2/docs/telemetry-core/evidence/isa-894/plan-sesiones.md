# ISA-894 — cierre físico acotado de Overlay V1

Este documento fija el protocolo vigente para cerrar los gates físicos antes de
valorar el corte 2. Sustituye el guion operativo de sesiones de 20/60 minutos.
Las capturas largas ya realizadas se conservan como evidencia histórica y no se
reescriben, pero no gobiernan las nuevas ejecuciones.

## Decisiones de producto vigentes

- Cada comprobación individual dura exactamente cinco minutos.
- El orden obligatorio es **S3 → S4 → S5 → S2**. S2 se ejecuta al final.
- El jugador permanece en pista durante todos los gates físicos.
- No se exige completar, validar ni comparar una vuelta del jugador.
- Delta queda fuera de S3. Esta exclusión no retira Delta del producto.
- Ningún PASS de este protocolo autoriza por sí solo la retirada física de V1,
  una promoción de canal o una release.

## Preparación común

1. Construir una única build exacta y licenciada. La configuración autorizada se
   embebe con el procedimiento documentado sin leer, imprimir ni versionar
   valores de `.env.local`.
2. Registrar HEAD, SHA-256 del ejecutable y de `frontend/dist`, versión de LMU,
   circuito, tipo de sesión, coches observados y timestamps.
3. Cerrar procesos Vantare/WebView2 ajenos. Mantener LMU, una única app y un
   único colector. No matar el PresentMon permanente de Radeon.
4. Para los gates con `sesion-v1.ps1`, ejecutar procesos separados:
   `on` con `VANTARE_OVERLAY_V1_EMIT=1` y `off` sin override.
5. Capturar diagnóstico V2, transporte V1/V2, árbol de procesos, CPU, Private
   Bytes, screenshots inicial/final y cierre limpio. Un dato ausente no se
   sustituye por cero.

## Matriz obligatoria

| Orden | Gate | Ejecución | Escenario y evidencia |
| ---: | --- | --- | --- |
| 1 | S3 · Redline visual | Una familia por vez, ≤5 min | Jugador en pista. Standings Redline, Relative Redline Mirror/Proximity/Traffic y Pedals Redline. Sin Delta. Revisar texto, filas completas, estabilidad, transparencia exterior, placas negras, recortes y solapes. Sellar los diez PNG/checker con `attest-s3.ps1`. |
| 2 | S4 · reconnect | ON 5 min + OFF 5 min | Sin reiniciar Vantare: provocar y recuperar una pérdida de fuente. Exigir `live → no-live → live`, revisión/epoch monotónicos y frame V2 nuevo ≤30 s. |
| 3 | S5 · ventana tardía | ON 5 min + OFF 5 min | Con LMU/Vantare live y jugador en pista, abrir Desktop y después Studio Live u OBS. Primer status/frame ≤5 s y widgets completos ≤10 s. |
| 4 | S2 · carrera | ON 5 min + OFF 5 min | Último gate. Jugador en pista con tráfico real; validar identidad/orden de Standings, Relative, banderas/eventos y p99. No se usa la validez o finalización de vueltas como criterio. |

S3 usa `testdata/bench/huella-endurance-s3-sin-delta.json` cuando pasa por el
colector general. Las capturas visuales selladas usan además el arnés cerrado
`C:\tmp\vantare-s3-gate`, cuyo catálogo contiene exactamente cinco perfiles.

## Criterios comunes

- Campos `exact`: cero mismatch durante toda ventana comparable.
- ON: shadow activo y cero mismatch exacto en cada ventana esperada.
- OFF: `shadow=null` y `receivedV1Projections=0` en todos los checkpoints.
- V2 debe avanzar; p99 empírico ≤250 ms y máximo ≤5.000 ms.
- Cinco muestras por proceso como mínimo en cada observación de cinco minutos.
  La pendiente de memoria de esta ventana es **indicativa**, no sustituye el
  diagnóstico de retención de #956 ni una prueba prolongada futura.
- Cero excepción renderer, `overlay-v2-*`, `widget-authority-missing` o fallback
  visual V1.
- Cualquier consumidor V1 productivo, mismatch exacto no entendido, pérdida V2,
  captura visual defectuosa o cierre incompleto detiene el gate.

## Comandos

El colector falla cerrado si `-Duracion` no es exactamente `5`:

```powershell
pwsh -File scripts/bench/sesion-v1.ps1 `
  -Sesion S4 -Fase off -Duracion 5 `
  -Exe bin/vantare-isa894.exe -Puerto 9294 `
  -Escena 'Spa; jugador en pista; reconnect' -Coches 37
```

S3 selecciona por defecto el perfil sin Delta. `S4`, `S5` y `S2` conservan el
perfil general salvo que el operador indique otro explícitamente. `S5` exige
`desktop` y `studio-or-obs`; los demás gates exigen `desktop`.

La salida se guarda bajo
`results/isa-894/sesiones/<sesion>-<fase>-<timestamp>/` con JSON crudo, CSV,
diagnósticos, screenshots, logs y resumen. Los checks del colector son:

```powershell
node --test scripts/bench/sesion-v1-state.test.mjs scripts/bench/sesion-v1-resumen.test.mjs
```

## Cierre

Tras S2 se actualizan issue, handoff y evidencia con SHA y rutas literales. Una
revisión independiente debe quedar sin P0/P1. La retirada física de V1 continúa
requiriendo autorización expresa de Isaac.
