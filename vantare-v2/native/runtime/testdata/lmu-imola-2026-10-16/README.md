# REST real saneado de Imola — #1638

Origen privado: `C:/VantareServer/evidence/grabacion-lmu-imola/sesion.lmu.gz`,
LMU 1.4.2.0, práctica de 6 h, grabada durante 77 min 18 s el 15/16-oct-2026.
SHA-256 del contenedor comunicado y cotejado por el worker de grabación:
`8cdca1dfe915e9a6d93300662a52279daf5cd54db83e245959904e33fa3527c1`.

`sessionInfo.json` conserva sin alterar los valores de `trackName`, `session`,
`windSpeed` y `averagePathWetness` de la primera respuesta 200 del endpoint
`/rest/watch/sessionInfo`. Se eliminan todos los demás campos: nombres, paths,
configuración privada y datos ajenos a esta regresión. Solo cambia el formato JSON.

La respuesta prueba viento explícitamente cero y humedad media de pista cero;
no prueba rumbo geográfico, presión, previsión ni unidades de viento no nulo.
El test la asocia deliberadamente a un frame histórico para comprobar identidad,
caducidad y ausencia; esa asociación es una frontera sintética, no una nueva
captura física SHM de Imola ni una transición de sesión.

`clock-trace.json` conserva las 582 lecturas SHM estables de los primeros
10 segundos de ese mismo archivo: `at_ns` del registro, `mCurrentET` de scoring
y `mElapsedTime` de la fila del jugador. Números originales, sin redondeo,
nombres, paths, posiciones ni inputs. La regresión de frescura usa ambos
relojes por separado: mantiene los huecos >=500 ms y exige recuperar al
siguiente avance, sin esperar 2 s continuos. No es una captura de conducción.
Extracción reproducible: test opt-in `recorded_clock_cadence`; su informe
`first_10s_trace` añade una cuarta columna diagnóstica que esta fixture omite.
