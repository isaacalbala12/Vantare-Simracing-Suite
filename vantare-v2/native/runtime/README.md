# runtime — adquisición y núcleo

Adaptadores LMU/ACC privados, validación y derivaciones centrales; publicación neutral y supervisor.

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
