# VANTA-8 / #1629 · capturas y P3 después de #1641

17-oct-2026. Continuación encargada por el orquestador tras R2 APTO/APTO.
#1641 fue fusionada por el orquestador en nightly `04521bf3d`; su HEAD
`3441fe15c` pasó CI 5/5, Nextest 2033/2033 y lifecycle 18/18. La rama anterior
permanece congelada en ese SHA. Esta entrega usa la nueva rama
`vantareapp/isa-1629-widgets-capturas`, nacida de nightly04521bf3d.

## Tres P3 comprobados

| Caso de ronda 2 | Resultado observable | Evidencia en `1629-r7/` |
|---|---|---|
| Banderas: negro heredado | CORREGIDO. Un `textColor:#000000` sin versión se convierte en el texto claro del diseño. La elección explícita de negro con contentVersion1 y los otros colores se conservan. La migración es idempotente al guardar/reabrir. | `comparacion/legacy-black-es.png`, `capturas/p3/legacy-black-{es,en}.png`, `custom-blue-{es,en}.png` |
| Fuel Estándar práctica: «Última vuelta» | CONFIRMADO Y CORREGIDO. El HTML aprobado la incluye y R6 la había perdido. Se recupera la última medición, 3.69 L, junto a media3.74 L, autonomía8.5v y planV21. Las cinco filas y el pie caben en300×204, sin quitar los datos del P2 anterior. Sin historia se pinta —; cuando limita energía también —, porque la historia disponible mide litros. | `comparacion/fuel-practice.png`, `comparacion/fuel-design-practice.png`, `capturas/p3/fuel-practice-{es,en}.png`, `fuel-energy-practice-{es,en}.png`, `fuel-practice-no-history.png` |
| Radar: rótulos largos | VERIFICADO SIN CAMBIAR EL PINTOR. Los cuatro motivos de capacidad y tres situaciones en ambos idiomas:14 PNG. Textos completos, sin puntos suspensivos; tinta entrex19 y199 en la caja220, con margen mínimo19px. | `capturas/p3/radar-*.png`, `radar-ink-bounds.json` |

La migración añade `contentVersion` al ajuste de Banderas: serde identifica
las instancias antiguas con 0, las nuevas nacen con 1 y la normalización actualiza
solo el negro de versión 0. Los layouts antiguos no permiten distinguir el
default negro de una elección negra deliberada: ambos se migran. No se
reescriben datos de Isaac durante la prueba.
Las capturas usan escenas QA congeladas, no una conexión real a LMU/ACC.

Para verificar inglés sin abrir el Workshop interactivo, el lote admite
`parameters:{"language":"es"}` o `en`. Rechaza idiomas/claves desconocidos
antes de crear el HWND. Las preferencias forman parte de la entrada del caché.
No se cambian los parámetros del Hub ni sus ventanas.

## Matriz Windows actual

**68/68 estados y 23/23 casos de foco**, más un control anterior del negro.
Sí significa PNG generada e inspeccionada; no certifica paridad completa con
todo el HTML ni acepta los otros P3 documentados en la review.

| Widget/directorio | Carrera | Qualy | Práctica | Sin datos | Comparación con R6 |
|---|---|---|---|---|---|
| standings | Sí | Sí | Sí | Sí | Sin cambio visible |
| relative | Sí | Sí | Sí | Sí | Idéntico |
| delta | Sí | Sí | Sí | Sí | Idéntico |
| pedals | Sí | Sí | Sí | Sí | Sin cambio visible |
| fuel-strategy | Sí | Sí | Sí | Sí | Última vuelta recuperada en práctica; otros estados idénticos |
| multiclass-relative | Sí | Sí | Sí | Sí | Idéntico |
| radar | Sí | Sí | Sí | Sí | Idéntico;14 variantes ES/EN adicionales completas |
| input-telemetry | Sí | Sí | Sí | Sí | Sin cambio visible |
| delta-trace | Sí | Sí | Sí | Sí | Sin cambio visible |
| pedals-telemetry | Sí | Sí | Sí | Sí | Idéntico |
| track-map | Sí | Sí | Sí | Sí | Sin cambio visible |
| track-weather | Sí | Sí | Sí | Sí | Idéntico |
| racing-flags | Sí | Sí | Sí | Sí | Sin cambio visible en defaults; negro heredado corregido en casos de foco |
| fastest-lap | Sí | Sí | Sí | Sí | Idéntico; sin datos se oculta y la PNG es transparente |
| head-to-head | Sí | Sí | Sí | Sí | Sin cambio visible |
| broadcast-tower | Sí | Sí | Sí | Sí | Sin cambio visible |
| car-damage-visual | Sí | Sí | Sí | Sí | Sin cambio visible |

Las 68 conservan dimensiones: 48 son idénticas, 19 solo cambian píxeles con
diferencia máxima 1 por canal RGBA y una cambia por el arreglo de Fuel.
No se reescalan ni se enmascaran para comparar. `inventory.json` contiene
hashes, tamaño, diferencias y entradas. Se conservan R6 y sus68 pares con el
diseño en `1629-r4/capturas/`; `comparacion/fuel-design-practice.png` muestra el
HTML conservado frente al nuevo Fuel. La media de tres vueltas y el plan real
siguen prevaleciendo sobre cifras ilustrativas de la referencia.

## Captura y trazabilidad

- Raíz de evidencia: `C:/VantareServer/evidence/1629-r7/`.
- Código capturado: `5893cc330a386f28b20ec8752555fc562bf6431b`.
- SHA256 del exe: `fe261a59fefd01dffeedfe1ae1745d40ca8485fdb2827e20b9a0e8105e346b9c`.
- Control anterior: exe5714d947 de fc5853d78, mismo Rust de los pintores que la base nightly04521bf3d; guardado en `antes/legacy-black-es.png`.
- Solo `--capture-batch` oficial de #1675. HWND oculto al nacer, NOACTIVATE/TOOLWINDOW, fuera de todos los monitores; PrintWindow del propio HWND y comprobación nativa de rect/foco en cada pasada. No se usa captura de escritorio ni arranque interactivo.
- Rectángulos medidos: nacimiento(-4352,0,-2412,1100), captura(-4352,0,-2048,1440). Auditoría independiente posterior:372 rectángulos sin cruce con el monitor y cuatro procesos terminados. Los logs registran los HWND; los incrementales no crean ninguno.
- Matriz68:48.11s. Foco23:22 nuevas y una omitida del smoke,70.54s incluyendo espera del turno compartido. Repetición incremental:68 omitidas,0HWND,0.84s. Son observaciones con carga compartida, no un benchmark aislado.
- Manifiestos `matrix.json`, `focused.json`, `smoke.json`, recibos `.capture.json` y logs con nombre único; `contact-01.png`/`contact-02.png` sirven de índice, conservando las PNG originales.

## Validación y límites

Local Windows, cola oficial, MIN_GB0, target propio D:/VantareServer/targets/1629:
fmt PASS; build parity-capture PASS89s/jobs2; Clippy UI/all-targets con
parity-capture y `-D warnings` PASS95s/jobs2; regresiones dirigidas **5/5 PASS**,
384 filtradas, compilación327s/build1. Prueban color/texto pintados, migración
guardada/reabierta, consumo ausente/energía, filas y altura204 en Neo/Neutro y
ES/EN, preferencias del lote y los mensajes del radar. No son una suite completa.

Los gates finales del workspace (check,Clippy,Nextest,lifecycle) y el SHA
publicado se enlazan en el PR nuevo de esta rama y en #1629. El verde de #1641
no se extrapola a esta continuación. No se toca runtime/domain/ipc/testdata;
no se repite localmente el corpus de telemetría, cuyo último verde está en
#1641. La CI aplica su clasificador de alcance.

Pendientes: review de esta continuación, otros P3 y aceptación completa del
diseño, LMU/ACC/OBS/DPI distintos y tecla física de Daños. Ninguna captura
pendiente de esta matriz. Sin nuevas dependencias, publicación, promoción ni
merge de este PR por el worker.
