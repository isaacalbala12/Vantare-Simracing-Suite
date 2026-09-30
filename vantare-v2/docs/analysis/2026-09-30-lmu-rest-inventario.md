# Inventario REST y capturas físicas de LMU — 2026-09-30

Worker Codex; revisión del diff a cargo de Claude Opus 5.5.
Referencias: [#1425](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1425)
y [#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Proyecto: arquitectura nativa, ADR 0099, fases 1/2. Isaac autorizó controlar
este PC, configurar una práctica y capturarla. Notion no disponible: excepción
explícita del encargo para trabajar con las referencias GitHub. No se afirma
actualización de Notion ni cierre de las issues.

## Resultado y bloqueo

**Inventario parcial de menú y cinco corpus físicos sanitizados; pista
bloqueada por memoria. No se amplió el cliente REST.** LMU arrancó como
v1.4200/build 1.4.2.0. La REST respondió en `127.0.0.1:6397` y permitió
seleccionar circuito, generar/cargar una sesión y cerrar el juego.

Le Mans con el preset original, Monza con ese preset y Monza sin rivales no
llegaron a una sesión activa. En los dos últimos intentos se observó en
pantalla `Critical memory allocation error` y el aviso de memoria agotada.
El primer intento coincidió con la caída de Codex comunicada por Isaac.
La ampliación del pagefile no bastó para el último intento: el SO informó
1 757 184 KiB de memoria virtual libre y LMU ocupaba unos 16,6 GB privados.
Son observaciones puntuales, no una medición de rendimiento ni una prueba
del tamaño adecuado del pagefile. No se cambiaron gráficos, controles,
cuenta, seguridad ni memoria virtual.

La herramienta Computer Use no pudo conectar con su pipe nativo tras el
reintento y reinicio de sesión. Se usaron Steam/PowerShell y la propia REST,
según la alternativa autorizada. Las pantallas se capturaron con PowerShell
solo para diagnosticar el bloqueo; quedaron fuera del repo.

El preset original tenía `Opponents: 0`, pero `Grid` contenía 44 coches y
`generateSaveFileFromSessionPreset` creó sus vehículos AI. El último intento
usó `Grid: []` y produjo `aiVehicles: []`. No se deduce que ello causara ni
resolviera la falta de memoria: ambos intentos siguieron fallando.

## Método y cobertura del inventario

Se probaron rutas por GET con plazo de 3 s y se guardó el resultado, incluso
errores y cuerpos vacíos. Las rutas candidatas se extrajeron del cliente
oficial instalado `Bin/UI.zip`, sin ejecutar scripts extraídos. Su hash se conserva fuera del repo en
`C:/tmp/vw3-lmu-remote-evidence/build-provenance.json`.

`/`, `/index.html`, `/swagger`, `/swagger.json`, `/openapi.json`, `/rest` y
`/rest/watch` respondieron 404. No se encontró Swagger/OpenAPI. **No existe
prueba de exhaustividad de toda la API**: esta es la lista completa de los
39 candidatos de lectura sondeados en las familias de sesión, carrera,
garaje, HUD, estrategia, watch y navegación. No se sondearon autenticación,
perfil, tickets Steam, cuenta ni rutas que cambian gráficos/controles.
Tampoco se expandieron todas las rutas parametrizadas de imágenes/replays.

Los campos raíz exactos y las marcas UTC están en
[`rest-inventory.json`](../../native/runtime/testdata/lmu-rest-2026-09-30/rest-inventory.json).
Las muestras representativas están en
[`menu-responses.json`](../../native/runtime/testdata/lmu-rest-2026-09-30/menu-responses.json).
HTTP 200 con cero bytes no acredita datos disponibles. `null` en la columna
de estado indica timeout o conexión fallida, no un código HTTP.

### Rutas con HTTP 200 en menú

Todas usan GET. En pista: **no observado** para todas.

| Ruta | Campos/contenido observado | Unidades y frecuencia observada |
| --- | --- | --- |
| `/navigation/state` | `state`: appBuild, gamePhase, gameSession, gameState, internalStateCode, navigationState, settingMode; loadingStatus: loading/percentage. Se excluyó user. | Estados enum; porcentaje de carga 0–1. 20 lecturas a ~10 Hz en menú: un mismo cuerpo. Durante carga se observó INIT/BEFORE; no GREEN. |
| `/navigation/GetLoadingScreen` | selectedCar, trackInfo | Metadatos de selección; cadencia no medida. |
| `/rest/garage/UIScreen/SessionSetup` | classesSelection, fullGrid, selectedCar, trackInfo | Selección/catálogos; cadencia no medida. |
| `/rest/hud` | chat, mfd, speedo, timing, trackMap | Booleanos de visibilidad; no telemetría; cadencia no medida. |
| `/rest/race/car` | 13 campos: catálogo, id, nombre, fabricante, engine, fullPathTree, imágenes, owned, vehFile, etc. | Identidad de contenido; no velocidad/daños; cadencia no medida. |
| `/rest/race/track` | displayProperties, dlcappID, id, image, length, name, owned, premId, sceneDesc, shortName, thumbnail, type | length de catálogo, string; no se convirtió al modelo. Cadencia no medida. |
| `/rest/race/getAllowedToStartRacing` | Booleano false en menú, true durante carga | Permiso de entrar; no significa sesión en marcha. Cadencia no medida. |
| `/rest/sessions/` | 62 ajustes SESSSET; currentValue, numStepsTotal, settingID, stringValue, uiSelectionType, valueType | Unidades dependientes del ajuste/stringValue; no se normalizaron ni midieron. Configuración, no valores instantáneos; cadencia no medida. |
| `/rest/sessions/amount` | PRACTICE=1, QUALIFY=0, RACE=0, WARMUP=0 | Número de sesiones configuradas; cadencia no medida. |
| `/rest/sessions/GetSessionsInfoForEvent` | scheduledSessions: name, airTemp, lengthTime, rainChance | PRACTICE, airTemp=29, lengthTime=360, lluvia configurada 0 %. No se verificaron aquí unidades térmicas/de duración. Plan de sesión; cadencia no medida. |
| `/rest/sessions/getAllVehicles` | 21 campos por coche; catálogo completo | Contenido instalado/propiedad, no pilotos vivos; cadencia no medida. |
| `/rest/sessions/getTracksAll` | 29 campos por circuito, presets por sesión incluidos | trackLength de catálogo y horario/preset; cadencia no medida. |
| `/rest/sessions/getTracksInSeries` | Mismo esquema de circuito, filtrado por serie | Catálogo; cadencia no medida. |
| `/rest/sessions/opponents` | id, name | Selección de oponentes; no parrilla viva; cadencia no medida. |
| `/rest/sessions/weather` | PRACTICE/QUALIFY/RACE; START, NODE_25/50/75, FINISH; WNV_HUMIDITY, RAIN_CHANCE, SKY, TEMPERATURE, WINDDIRECTION, WINDSPEED | **Preset**, no clima actual. 20 lecturas a ~10 Hz: un mismo cuerpo. |
| `/rest/strategy/usage` | JSON null | No historial disponible; cadencia no medida. |
| `/rest/watch/sessionInfo` | Cuerpo de cero bytes | 20 lecturas a ~10 Hz: sigue vacío. La grabadora conserva todas las consultas; no genera ronda REST válida. |
| `/rest/watch/standings` | Cuerpo de cero bytes | Igual: sin coches, tiempos ni sanciones disponibles. |
| `/rest/watch/standings/history` | JSON `{}` | Sin vueltas registradas; cadencia no medida. |

El sondeo de frecuencia duró unos 2 s con 20 rondas y cuatro rutas. Los
hashes idénticos prueban estabilidad de respuesta en ese intervalo, **no**
una cadencia de publicación de 10 Hz. La grabadora conserva solo frames SHM
que cambian; contar sus frames tampoco mide la frecuencia del simulador.

### Errores y rutas sin respuesta utilizable en menú

| Estado | Rutas GET |
| --- | --- |
| 503 | `/rest/sessions/GetGameState`: `{status: "unavailable", reason: "Game is not in an active session", gameState: "Setup"}`. Durante carga también se observó 503. |
| 500 | `/rest/garage/PitMenu/receivePitMenu`: cuerpo de error, sin servicio de boxes utilizable. |
| 400 | `/rest/strategy/overall`, `/rest/watch/focus`. |
| 404 | `/rest/garage/UIScreen/CarSetupOverview`, `CoopOverview`, `DriverHandOffStintStart`, `PitCarReview`, `RepairAndRefuel`, `TireManagement`; `/rest/garage/brakeinfo`, `/rest/garage/getPlayerGarageData`; `/rest/race/series`; `/rest/sessions/TireInventory`, `/rest/sessions/opponents/filter`; `/rest/watch/getBookmarkedTimestamps`. |
| null | `/rest/garage/getVehicleCondition`, `/rest/garage/showOnlyRelevantSetups`, `/rest/garage/summary`, `/rest/garage/tireinfo`. |

Durante el sondeo inicial de garaje en menú el proceso terminó y apareció un
Crash Report. No se aisló qué petición lo provocó ni si fue memoria; no se
atribuye causalidad a un endpoint. Esas cuatro rutas sin respuesta se apartaron
del sondeo final. No se fabricaron muestras ni se declararon endpoints útiles
a partir de sus nombres en el cliente oficial.

### POST usados para controlar la sesión

| Ruta | Cuerpo y resultado observado |
| --- | --- |
| `/navigation/action/NAV_TO_EVENT_MONITOR` | `null`, HTTP 200; cambia NAV_MAIN_MENU a NAV_EVENT, pero no inicia por sí solo una sesión activa. |
| `/rest/race/track` | ID de circuito como text/plain, HTTP 200; Monza y restauración de Le Mans. |
| `/rest/sessions/SessionPresets/requestPreset` | `null`, HTTP 200; copia privada del preset, no versionada. |
| `/rest/sessions/SaveLoad/generateSaveFileFromSessionPreset` | Preset JSON, HTTP 200; devuelve save con aiVehicles y estado de sesión. Es un estado generado de configuración, **no** una captura física de telemetría. |
| `/rest/sessions/SaveLoad/loadGame` | `{save: ...}`, HTTP 200; empieza carga, no prueba que concluya. |
| `/rest/sessions/SessionPresets/applyPreset` | Preset original, HTTP 200; restauración. |
| `/navigation/action/NAV_EXIT` | `null`, HTTP 200; proceso/mapping desaparecen después. |

El cliente instalado también referencia POST `/rest/garage/drive`,
`/rest/sessions/returnToMonitor` y `/navigation/action/NAV_NEXT_SESSION`.
**No se ejecutaron**: nunca hubo sesión activa donde hacerlo con sentido.

## Señales candidatas y decisión del adaptador

| Señal solicitada | Lo demostrado | Decisión |
| --- | --- | --- |
| Daño en porcentaje | getVehicleCondition no devolvió cuerpo utilizable; los presets incluyen multiplicador de daño, no integridad. | No mapear multiplicador a daños. Siguen pendientes porcentajes reales. |
| Viento y dirección | PRACTICE/START: WINDSPEED currentValue=19 y stringValue="68.4 kph"; equivale a m/s. WINDDIRECTION currentValue=2, stringValue="East". | Son parámetros del preset. No rellenar clima actual ni asumir todos los códigos por una sola muestra. El adaptador ya obtiene módulo del viento SHM; su dirección meteorológica sigue sin probarse. |
| Presión atmosférica | No campo actual encontrado en respuestas útiles. | Sigue sin cubrir. Presión de neumáticos no es presión atmosférica. |
| Humedad | WNV_HUMIDITY currentValue=60, "60%", en preset. | Humedad relativa configurada; no humedad real ni wetness de pista. El modelo Weather actual no tiene humedad relativa. |
| Servicio de boxes | PitMenu HTTP 500 en menú; UIScreen/RepairAndRefuel 404. | Sin servicio físico probado. |
| Sanciones | Standings vacío; estrategia sin datos. | No extender desde REST; el contador SHM pendiente ya existe, pero esta campaña no observó una sanción positiva. |
| Tiempo estimado de vuelta | Standings/history vacío; ningún coche/vuelta físico. | No cubierto por esta campaña; los nombres del cliente/SDK no son datos actuales. |
| Estado de sesión | BEFORE, SETUP, INIT y carga observados; GetGameState 503. | Sin secuencia Preparing/Running/Finished corroborada. No traducir carga o NAV_EVENT a Running. |

El cliente nativo `rest.rs`/`rest/http.rs` sigue consultando standings y
sessionInfo para dorsal, amarillo candidato y respaldo de circuito/tipo.
La memoria compartida sigue siendo la autoridad de los coches. El inventario
no demuestra una señal nueva **actual y utilizable** con semántica/ calidad
suficiente; por eso el punto 4 no genera código, dependencias ni falsas
capacidades. La aceptación física completa de #1425/#1427 queda pendiente.

## Capturas, privacidad y restauración del PC

Los cinco archivos están en
[`native/runtime/testdata/lmu-rest-2026-09-30/`](../../native/runtime/testdata/lmu-rest-2026-09-30/README.md).
`captures.json` conserva hashes, tiempos y resultados; el README describe la
sanitización y el límite del replay. UTC; hora de Madrid = UTC+2.

| Captura | Inicio UTC | Duración | SHM / respuestas REST | Acción y resultado |
| --- | --- | --- | --- | --- |
| menu | 10:31:42.391215800 | 12,01 s | 1 / 90 | Menú inicial, cero vehículos, respuestas 200 vacías. |
| carga-practica | 10:35:55.624633000 | 30,40 s | 2 / 60 | Le Mans/Alpine seleccionado originalmente; intento de cargar práctica. No llegó a pista. |
| monza-carga | 11:08:41.982132400 | 90,03 s | 1 / 176 | Monza con preset original; no sesión activa, fallo físico de memoria. |
| singlecar-entrada | 11:13:06.571310700 | 121,25 s | 2 / 206 | Cero rivales generados; carga fallida, cierre del diálogo de memoria; connected → disconnected a +85,27 s. |
| cierre-observado | 11:17:37.450995600 | 45,63 s | 3 / 140 | NAV_EXIT respondió 200 a 11:17:51.0477637; disconnected a +14,69 s, luego unavailable. 104 HTTP 200 vacíos y 36 sin headers. |

La captura `entrada-practica/`, interrumpida por la caída de Codex, no tiene
manifest y **no** se versionó. `menu-cierre/` acabó antes de cerrar el juego y
tampoco se ofrece como prueba del cierre. No se usaron datos sintéticos.

Se restauraron circuito Le Mans, coche Alpine original y preset. La
relectura del preset solo difería en `Player/Sound Options/Maximum Effects`:
el servidor había normalizado 256 a 255. Con el juego cerrado se restauró
únicamente ese campo a 256 en `Settings.JSON` y se verificó su lectura.
No se reescribieron otros ajustes. Se cerraron los Crash Report mediante
cierre de ventana, sin enviar informes. La comprobación final confirmó que LMU y Crash Report están ausentes; Steam
se conserva abierto como al principio.

Evidencia bruta privada, logs, capturas, script de sanitización, hashes y
salidas QA: `C:/tmp/vw3-lmu-remote-evidence/`. No se copiaron nombres de
usuario, IDs Steam, presets personales ni capturas de pantalla al repo.

El hash de compilación de la grabadora release está fuera del repo en
`build-provenance.json`; el manifest mantiene la procedencia del fixture.
Comando: `cargo build --release -p vantare-runtime --bin vantare-grabar-lmu -j 2`.
Resultado: exit 0, `Finished release profile ... in 2m 01s`.

## Verificación y continuidad

Worktree asignado: `C:/tmp/vw3-lmu-remote/vantare-v2`, rama
`vantareapp/isa-1427-w-lmu-remote`, base local de esta entrega
`e24c06a5786bed795a92f2f245b59bd948a2c756`. Se preservó esa base asignada;
no se cambió de rama ni se incorporaron otros workers. `origin/nightly`
consultado tras fetch: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`;
merge-base `5838de5a4abee3e99d9d50aebd5dc20609c53611`. Esto no es una
entrega integrada en nightly.

Solo se añaden este informe y fixtures/documentación bajo runtime/testdata.
Gates ejecutados desde `native/` antes del commit local:

| Check | Resultado |
| --- | --- |
| Build release de la grabadora, `-j 2` | Exit 0; 2m 01s. |
| `cargo fmt --check` | Exit 0, repetido tras cerrar la documentación. |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | Primera pasada exit 101: `libduckdb-sys`/MSVC `C1060: compiler is out of heap space`. Repetición con LMU cerrado: exit 0, `Finished dev profile ... in 23m 05s` (incluye espera por lock). No se cambiaron flags ni dependencias para aprobarlo. |
| `cargo test --workspace -j 2` | Exit 0: 637 aprobadas, cero fallos, cuatro ignoradas; 37 reportes de suite incluidos doc-tests. Las ignoradas requieren LMU/ACC físicos activos. |
| Integridad de fixtures | Cinco tar.gz reabiertos, 681 registros de events/responses; hashes de archivos/manifests, JSON, whitelist de privacidad y enlaces locales aprobados. Script y salida fuera del repo. |
| `git diff --check` y revisión del staged | Sin errores; diez archivos nuevos dentro de las dos rutas autorizadas. |

No se modificó Rust productivo, Go, frontend ni contratos comunes. No se
añadieron tests de comportamiento porque no cambió comportamiento; los nuevos
fixtures se validaron por integridad/privacidad, no como paridad del replay.
No se ejecutaron las cuatro pruebas live ignoradas, conducción, boxes ni cambio
de sesión, por el bloqueo físico descrito. Tampoco CI remoto: no se publica
rama ni PR en este encargo.

Para verificar manualmente, comparar `Get-FileHash -Algorithm SHA256` de los
cinco tar.gz con `captures.json`, abrir el manifest de `cierre-observado.tar.gz`
y comprobar connected → disconnected → unavailable y los códigos sin headers
tras el cierre. Confirmar que cada SHM tiene cero coches; repetir la campaña
en pista cuando el PC disponga del margen necesario. No usar estas capturas
para certificar porcentajes de daño, clima actual ni estado Running.

El SHA del commit local se entrega al orquestador; los logs de gates permanecen
fuera del repo. No hay push, PR, CI remoto, merge, release ni promoción. El siguiente
paso para el orquestador es revisar estos límites y resolver la disponibilidad
de memoria antes de repetir pista/boxes/cambio de sesión. No requiere decidir
un cambio de arquitectura ni aceptar señales de configuración como medidas.
