# ISA-944 — evidencia del sensor Automático

Fecha de ejecución: 2026-08-30. Rama de trabajo:
`vantareapp/isa-944-sensor-automatico`.

## Reproducción

El guion versionado aplica el guard de un solo Vantare antes y después del
build, usa CDP 9246 y un perfil WebView2 temporal, configura Automático y cierra
mediante `Application.Quit()`:

```powershell
pwsh -NoProfile -File scripts/bench/isa944-auto-smoke.ps1 `
  -Scenario game `
  -OutputDir docs/telemetry-core/evidence/isa-944/game-YYYYMMDD
```

Para `game`, LMU debe estar abierto, en práctica y en primer plano durante 180
segundos. El guion no espera la desaparición global de PresentMon: espera solo
el PID de su Vantare; el sensor conserva y espera el PID de PresentMon que él
mismo lanzó. `RSXTraceSession` no se toca. Si existe otro `vantare-*.exe`, una
sesión `VantareHuella-*` o una huérfana `VantareSensor-*`, el guion falla antes
de lanzar.

El caso sin juego usa el mismo procedimiento:

```powershell
pwsh -NoProfile -File scripts/bench/isa944-auto-smoke.ps1 `
  -Scenario no-game `
  -OutputDir docs/telemetry-core/evidence/isa-944/no-game-YYYYMMDD
```

## Corrida `game-20260830`

- LMU PID 16792, Spa, práctica WEC 2026, jugador en el garaje e IA rodando.
- Vantare PID 24060; duración observada entre capturas CDP: 181 s.
- Automático pasó 3 → 4 → 5 por CPU y después permaneció en 5: dos cambios,
  dentro del gate de no oscilación.
- Las capturas `performance-start.json` y `performance-end.json` proceden del
  evento Wails real observado por CDP y conservan el snapshot efectivo bajo
  `capabilities.performance`, además de `host`.
- Esta primera corrida **no demuestra frametime integrado**: ambas capturas y
  el log declaran `reason: unavailable`; el proceso PresentMon propio terminó
  antes de publicar frames. Se conserva como evidencia de degradación CPU-only,
  no como PASS del camino con juego.
- El cierre por CDP terminó Vantare y `logman query -ets` confirmó que no quedó
  `VantareSensor-24060`. `RSXTraceSession` siguió activa.

## Diagnóstico aislado `presentmon-direct-20260830`

Con el mismo binario y los mismos flags, PresentMon PID 9788 capturó CSV v2
real de LMU durante ocho segundos en una sesión propia y coexistió con
`RSXTraceSession`. `frames.csv` contiene `FrameTime` observado (~16 ms en las
primeras filas) y `stderr.log` conserva el aviso de privilegios. Se esperó solo
ese PID y se paró dos veces su sesión; después quedó únicamente
`RSXTraceSession`.

Este diagnóstico acota el fallo de la primera corrida a la ruta Go o a su
lifecycle. La prueba opt-in `TestPresentMonWindowsIntegration` ejecuta esa ruta
sin convertir PresentMon/LMU en dependencia de los gates normales.

La prueba opt-in capturó después 16,0558 ms mediante PresentMon PID 18988 y
cerró dejando solo `RSXTraceSession`. También descubrió que el segundo
`logman stop` devolvía en Windows español «Conjunto de recopiladores de datos
no encontrado» con bytes OEM; ese estado idempotente ya se reconoce y tiene
regresión unitaria.

## Corrida final `game-frametime-20260830`

- Vantare PID 14420 y PresentMon propio PID 14776; sesión
  `VantareSensor-14420`.
- 183 muestras de sensor, 182 con frametime real; rango observado 7,869–27,522
  ms. La captura CDP inicial publicó 10,1328 ms y la final 9,7701 ms.
- Secuencia de nivel `3 → 4 → 5`: exactamente dos cambios durante 181 s, ambos
  descensos ante carga/frametime; después permaneció en 5 sin oscilar.
- `performance-start.json` publica modo `auto`, nivel 3 y `sourceHz` 58,0092;
  `performance-end.json`, modo `auto`, nivel 5, `reason: frametime` y
  `sourceHz` 64,0272.
- `Application.Quit()` terminó la build. El inventario posterior no encontró
  Vantare ni su PresentMon y `logman query -ets` mostró únicamente
  `RSXTraceSession`: cierre ETW PASS.

## Pendiente de cerrar esta evidencia

- Repetir `no-game` con LMU realmente cerrado para capturar `reason:
  unavailable` sin ambigüedad.
