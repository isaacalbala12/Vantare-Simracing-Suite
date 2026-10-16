# Captura de lanzamiento #1638 — 14-oct-2026

37 coches en PRACTICE1. Tres GET de sesión separados por 500 ms dieron
`currentEventTime=5052.4`, `gamePhase=9`: **no demuestra conducción viva**.
REST entrega `sectorFlag=[YELLOW,YELLOW,YELLOW]`, `yellowFlagState=NONE`,
`flag=GREEN` y `finishStatus=FSTAT_NONE` en los 37 coches. Solo acredita esos
códigos; los otros códigos de regresión son mutaciones controladas, no capturas.
Jugador Hyper con `veFraction=0.9999520182609558`; valor fraccional 0–1.
No hay captura positiva de daños/sanciones/forecast ni energía consumida por vuelta.

Solo lectura: `mmap ACCESS_READ`, 324820 bytes, `LMU_Data`; dos copias idénticas
con máximo cuatro intentos. Los crudos viven solo en memoria: **no se guardaron**.
No se tocó instalación/datos de Isaac ni se abrió una ventana. Versión del proceso
no recuperable desde esta sesión; replay usa layout 1.4.2.0, ya admitido por el
repo, sin añadir una build a la allowlist ni afirmar build física comprobada.

Sanitización por reconstrucción desde cero:

- Cabecera offset/tamaño: 1632/64 (circuito), 1696/44, 1852/24, 1876/24, 1964/8.
- Scoring base 2192, stride 584, solo filas activas: 0/4, 100/3, 104/8,
  128/72, 200/32 (clase), 232/24, 264/48, 336/72, 457/1, 464/16, 506/2, 532/4.
- Telemetría base 128468, stride 1888: 0/4, 12/8, 160/48, 232/72,
  352/12, 404/8, 420/16, 444/8, 524/8, 604/1, 608/8, 656/1, 696/8,
  1000/8, 1260/8, 1520/8, 1780/8. Conserva reloj propio y goma de cuatro ruedas.
- Pilotos sustituidos por `Driver-<slot>`, etiquetas por `Car-<slot>` tanto en
  SHM como REST para conservar el join. Clases y dorsales son datos deportivos.
  Punteros, bytes desconocidos/reservados y filas inactivas quedan en cero.
- REST allowlist sesión: session/yellowFlagState/sectorFlag. Standings:
  slotID/carNumber/vehicleName/flag/finishStatus/pitstops/veFraction/player.
  No nombres originales, SteamID, servidor, contraseña, archivo de piloto ni
  cuerpos ajenos a esta allowlist. `capture.json` fija hashes y límites.

Prueba pública: `cargo test -p vantare-runtime --test launch_coverage`, por
`native/scripts/compilar.ps1`, jobs 2 y target `C:/tmp/target-1638`.
Protege adapter → DTO → lector live y expiración; no certifica el rendering de
los nuevos diseños ni respuestas del juego que no aparecen en esta captura.
