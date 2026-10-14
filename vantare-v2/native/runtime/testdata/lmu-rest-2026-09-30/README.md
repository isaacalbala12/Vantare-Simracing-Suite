# LMU 1.4.2.0: menú, cargas fallidas y cierre físico

Capturas propias de `vantare-grabar-lmu`, compilada en release desde
`e24c06a5786bed795a92f2f245b59bd948a2c756`. Issues #1425 y #1427.
Inventario y límites: [informe](../../../../docs/analysis/2026-09-30-lmu-rest-inventario.md).

**Ningún frame contiene vehículos ni un reloj de sesión en marcha.** Estos
corpus no demuestran práctica en pista, conducción, boxes, cambio de sesión,
daños, sanciones ni prestaciones del adaptador. Las cargas terminaron con
errores físicos de memoria de LMU. `complete: true` solo significa que la
grabadora acabó y empaquetó correctamente.

| Corpus | Escenario observado |
| --- | --- |
| `menu.tar.gz` | Menú inicial; REST HTTP 200 con cuerpos vacíos. |
| `carga-practica.tar.gz` | Intento de cargar práctica en Le Mans; sin sesión activa. |
| `monza-carga.tar.gz` | Intento de cargar práctica en Monza; sin sesión activa. |
| `singlecar-entrada.tar.gz` | Monza con cero rivales; error de memoria y posterior cierre. |
| `cierre-observado.tar.gz` | Menú, petición `NAV_EXIT`, desaparición del mapping y REST inaccesible. |

`captures.json` fija SHA-256 de cada archivo, tiempos UTC, duración, cuentas,
estados de fuente y códigos HTTP. `rest-inventory.json` conserva método,
campos raíz observados, estado y momento de cada sondeo; `status: null`
significa que no se obtuvo respuesta. `menu-responses.json` contiene cuerpos
JSON reales representativos; `bodyEmpty: true` identifica un cuerpo de cero
bytes, **no** un JSON `null`. En `/navigation/state` se eliminaron `user`,
`loadingData` y los campos ajenos al estado local.

## Sanitización y comprobación

Todos los SHM originales miden 324 820 bytes y tienen `mNumVehicles == 0`.
Se reconstruyeron desde cero copiando únicamente estos pares offset/tamaño:
`1696/4`, `1700/8`, `1708/8`, `1716/4`, `1720/8`, `1736/4`, `1740/2`,
`1844/8`, `1852/8`, `1860/8`, `1868/8`, `1876/24`, `1900/8`, `1908/8`,
`1964/8`. Conservan números de sesión, relojes, límites y campos numéricos de
clima del layout conocido; con cero coches no acreditan clima actual.
Se borraron todos los strings, punteros, bytes reservados y filas inactivas.
No se fabricaron coches, banderas, tiempos ni identidades.

Cada respuesta HTTP de estos cinco corpus tiene cuerpo vacío; se comprobó
antes de empaquetar. Se conservaron códigos, errores de adquisición y tiempos,
incluidos fallos y desconexiones. Los hashes de los payloads y referencias
del manifest se recalcularon después de sanitizar; cada hash se verificó al
reabrir el tar. El manifest incorpora la política y el hash del archivo bruto.

La evidencia privada, el script de sanitización y su salida están fuera del
repo en `C:/tmp/vw3-lmu-remote-evidence/`. La captura interrumpida
`entrada-practica/` carece de manifest y se conserva solo allí.

## Límite del replay

Estos archivos conservan el esquema de la grabadora
`vantare.lmu-temporal-high-rate.v1`. El replay actual ignora `responses` y
`sourceEvents`; no reproduce estos fallos REST ni la desconexión. Ninguna
ronda `rest` completa pudo producirse, porque un HTTP 200 vacío no es JSON.
Por tanto estos corpus son fixtures de adquisición/lifecycle para revisión;
no se presentan como una reproducción end-to-end aprobada.
