# runtime — adquisición y núcleo

Adaptadores LMU/ACC privados, validación y derivaciones centrales; publicación neutral y supervisor.
El supervisor `vantare.exe` embebe ICON1 desde `build-support`, igual que Hub/UI;
los accesos apuntan al propio EXE también para su icono. `tests/windows_icon.rs`
verifica el recurso ID1 y los bytes de cada tamaño del ICO compartido sin ejecutarlo.

QA #1638: `vantare-grabar-lmu-completo` graba SHM íntegro y REST descubierto en
`.lmu.gz`; `open_replay` admite ese archivo y `vantare-verificar-lmu` produce
DTOs/informe offline por el mismo adapter y Core. [Kit, formato y límites](../../docs/telemetria/grabacion-completa-lmu.md).
Son herramientas de QA privadas; no se incorporan al instalador de producto.

## #1562 · Ocultar fuera de pista

El núcleo publica `state.driving_situation` (Unknown/OnTrack/Garage/Paused/Replay)
por DTO v10, también con demanda vacía. Una grabación `SourceKind::Replay` no
significa replay del juego. Ocultar exige 250 ms de evidencia continua; un status congelado se confirma por
el reloj del núcleo dentro de su vigencia, sin nueva muestra para series/journal. Estado OnTrack explícito,
señal ausente/caducada, silencio de 500 ms y cambio de sesión restablecen visibilidad.
Garage exige una señal explícita de garaje/stall vigente del simulador. Pits,
velocidad <=0,5 m/s y parada nativa no bastan: servicio en carrera y colas paradas
del pit lane permanecen visibles. Señal ausente nunca se infiere del movimiento.

LMU lee mInGarageStall (scoring +507) y la pausa ya confirmada por SHM detenido + REST
reciente/proceso vivo. Un cero borrado en fixtures legacy sin reloj de telemetría
conservado es ausencia, no false. No existe señal de replay del juego verificada en este adapter;
no se infiere de `inRealtime` ni del transporte. ACC usa graphics.status: 1 replay,
2 Live, 3 pausa, con su frescura propia. Sin una señal de garaje verificada no se
oculta ACC por estar parado en pits; physics/graphics/UDP no sustituyen esa señal.
Sin evidencia positiva el resultado es Unknown y nunca oculta.

Ajustes ofrece un único opt-in global, `Layout.hideOffTrack` (false por defecto).
Studio → En pista → Fuera de pista ofrece heredar / siempre visible / ocultar.
`Instance.offTrack` usa inherit/always_visible/hide y participa en el documento,
guardado atómico, conflictos, Deshacer/Rehacer y recarga de overlays. Los layouts v1
anteriores se leen con defaults; binarios anteriores pueden rechazar los nuevos campos.
La política solo afecta LiveScreens; previews Studio/Workshop y entidades permanecen
vivas. No cambia demanda, derechos, adquisición ni posiciones de ventanas.

El pipe live solo acepta v10; lectores guardados siguen aceptando v7/v8/v9/v10.
Las fixtures UI migran únicamente la etiqueta 9→10. Los goldens v9 originales y sus
hashes se conservan: la comparación elimina exclusivamente la nueva metadata y
restablece esa etiqueta, manteniendo cada byte del resto. Tests independientes
protegen situación, transiciones, política y preview. No certifica juego/OBS físicos.

## #1638 · Relojes para avisos

Pulido posterior a #1664: después de caducar, cada bloque LMU necesita dos
avances de su propio reloj separados por menos de 500 ms. Las lecturas
duplicadas no cuentan y un reloj ausente interrumpe esa confirmación. Un tick
aislado seguido de otro congelamiento conserva `Stale`; no se exige la antigua
ventana continua de 2 s. Scoring y telemetría se recuperan por separado.

El lector `.lmu.gz` limita el historial XOR a **64 MiB agregados**, incluyendo
las claves. Rechaza antes de reservar el cuerpo si no cabe; no expulsa fuentes
porque se perdería la base del siguiente delta. Sigue admitiendo hasta 16 MiB
por cuerpo, 256 KiB de metadatos y 512 claves. Los temporales de reconstrucción
y el consumidor son memoria adicional a ese historial; no es una promesa de
RSS total de 64 MiB. Al reducir una fuente libera su reserva anterior.

La energía virtual admite los tokens ASCII de clase Hyper, Hypercar, LMH y
LMDh, sin distinguir mayúsculas y con separadores/sufijos numéricos. La detección
no crea un `String` por frame. Una clase desconocida no hereda energía solo
porque REST incluya `veFraction`; se mantiene `Unavailable`.

El contrato live vigente es DTO v11 (recompilar todos los consumidores).
LMU publica `session.timing.scheduled_end_s` desde mEndET válido y la distancia
longitudinal estimada a la próxima línea de salida/meta desde mLapDist y
la longitud de pista. En boxes o sin geometría válida no hay distancia.
Se conserva el número nativo de sesión en su identidad: cambiar entre dos
prácticas también invalida el REST anterior, aunque avance el reloj.
Las capturas disponibles NO acreditan inicio/final real, fase de salida ni
agenda de próxima sesión; esos campos permanecen `Unavailable`, también ACC.
No se deducen de remaining_s, movimiento, boxes ni llegada de un coche.
