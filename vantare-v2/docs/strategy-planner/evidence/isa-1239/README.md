# ISA-1239 — clima por piloto en Strategy Orbit

Base aislada: `65ced901` del candidato Strategy #1393. Rama
`vantareapp/isa-1239-strategy-weather-by-driver`. Este corte no acredita Wails,
LMU ni calibración meteorológica empírica.

## Reproducción y corrección

Carrera de seis vueltas, orden fijo A→B, dos vueltas de A y cuatro de B:
ambos hacen 100 s en seco; A hace 110 s en mojado y B, 130 s. El test
`TestCalculateOrbitWeatherKeepsEachDriversWetPace` falló antes del cambio:
la ruta aplicó el promedio de +20 s a las seis vueltas y publicó +120 s.
Con perfiles individuales, la ruta aplica +10 s a A y +30 s a B: +140 s.
El mismo test conserva esta diferencia cuando existe una proyección de ritmo
seco, sin sustituir el dato individual de lluvia por un promedio.

El contrato `WeatherBucketParameter.DriverProfiles` transporta por identidad
el delta de ritmo y el consumo húmedo. El solver usa la identidad del piloto
elegido en búsqueda, reserva, consumo y replay. Rechaza una lista individual
parcial o un piloto desconocido en lugar de completar con un promedio sin
aviso. El promedio anterior se mantiene cuando no hay perfiles húmedos
individuales. Un consumo húmedo individual explícito prevalece sobre el
agregado del bucket; el agregado sigue siendo fallback para perfiles sin
consumo individual y para la ruta legacy sin perfiles.

`TestSolveAndReplayKeepDriverSpecificWetFuel` verifica que 2 vueltas de A a
1 L y 4 de B a 3 L requieren 14 L en total y un repostaje de 2 L cuando la
capacidad es 12 L. `TestWetDriverProfilesChooseTheFasterDriverWithoutFixedOrder`
verifica que el solver elige A bajo lluvia incluso si B aparece primero en la
lista. Ambos comparan solve y replay. `TestWetDriverProfilesRejectPartialCoverage`
custodia el rechazo de una lista incompleta.

## Checks locales

- La reproducción previa falló con `wet delta = 120.000 s` frente a los
  140 s esperados; después, aplicación y solver pasaron sus tests focales.
- `go test ./...` pasó tras generar `frontend/dist` con
  `pnpm --dir frontend build` (PASS). La primera ejecución de Go se detuvo
  durante setup por faltar ese directorio en el worktree nuevo; no fue un
  fallo funcional y se repitió la suite completa tras resolver el requisito.
- El digest del roadmap se regeneró desde `origin/nightly`; 44 tests de
  roadmap/digest PASS y `git diff --check` PASS.

## Límite

La proyección de telemetría disponible es agregada por clima y no atribuye
por sí sola un consumo a cada piloto. Este corte conserva los valores
individuales explícitos del evento; su exactitud empírica requiere T19–T21 y
una sesión real en T22. No cambia la UI, live, Monte Carlo ni otros formatos.
