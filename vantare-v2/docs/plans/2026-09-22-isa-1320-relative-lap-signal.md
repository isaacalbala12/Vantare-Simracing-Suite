# Relative: diferencia de vueltas respecto al jugador

Isaac autoriza incorporar la señal propuesta de una vuelta por delante o por detrás en Relative, también en carrera. Seguimiento: [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738527745), En curso. Continúa ISA-1320 / PR #1323; sin merge automático.

## Diseño

Etiqueta discreta junto al nombre: −1 V significa una vuelta menos que el jugador; +1 V, una más. Admite diferencias mayores. Misma vuelta y jugador no llevan etiqueta. Solo se muestra en carrera; práctica/clasificación no representan batallas por vueltas. Nombre, posición de clasificación y distancia física conservan su significado. Sin parpadeos, cambio de altura ni animaciones por cambiar el valor. Texto descriptivo accesible y traducciones es/en/pt/it resueltas por idioma.

Se prefiere texto breve frente a usar exclusivamente color: permite distinguir el signo y no confunde con el color de clase. Se mantiene pendiente la preferencia visual consultada a Isaac; su solicitud ya autoriza la señal y el harness permite revisarla.

Reutilizar `derive.VehicleGap.Laps`, diferencia canónica respecto al jugador obtenida de `LapsBehindLeader`. No inferirla de CompletedLaps, clasificación, clase, distancia física ni gap temporal. Proyectar el dato y su calidad en Relative V2, incluidos immediate/settled, fingerprint, tipos generados y contratos. Datos ausentes/antiguos/inválidos no generan una etiqueta afirmativa. Los fixtures declaran los valores de forma explícita.

## Rendimiento y límites

No añadir otra derivación de vueltas, joins a Standings, suscripciones, temporizadores ni lecturas de layout al widget. El dato ya existe en el pipeline; Relative solo lo transporta y presenta. Diccionarios de texto estáticos por idioma. La prueba física LMU/Windows sigue pendiente y no se sustituye por fixtures.

## Ejecución y aceptación

1. Verificar procedencia y semántica de la señal canónica y proyectarla con tests de valores ±N, cero y calidad.
2. Mostrar etiqueta estable y localizada sin afectar selección, orden ni las animaciones aprobadas.
3. Añadir escena de revisión en Workshop para misma vuelta, doblado/doblador delante y detrás, varias vueltas y señal ausente. La escena combinada de carrera debe mostrar un ejemplo coherente de P1 con rival peor clasificado delante.
4. Verificar cadencia, cambio únicamente de vueltas/calidad, reinicio de sesión, settled, paso por meta sin inferencia por contador, fuente/contrato, renderer, idiomas y seis rivales.
5. Revisión independiente; pruebas focales Go/frontend, tipos, build, lint y ratchet. Incorporar al preview por cambios limitados conservando Delta/Standings; actualizar PR y Asana. Aceptación visual pendiente de Isaac.
