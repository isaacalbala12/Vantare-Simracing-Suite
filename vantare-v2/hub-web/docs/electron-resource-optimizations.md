# Trabajo visual y carga inicial

VANTA-138 / #1995. Comparación sobre el mismo producto base `b18a3618d`,
Chromium 156, mismo recorrido QA y perfiles nuevos. La instrumentación y la
propuesta de ciclo de vida están en #2342 (`docs/electron-resources.md`).

## Cambios acotados

Las secciones ya se cargaban con `lazy` en `ScreenRegistry`. El asistente de
primera configuración, en cambio, entraba en el bundle inicial aunque el usuario
ya lo hubiera completado. Ahora su importación espera a que el anfitrión indique
que hace falta. Mientras carga siguen disponibles los controles de ventana y la
pantalla de espera; no se permite saltarse la configuración requerida.

Inicio y Calendario detienen solamente su reloj visual cuando el documento
queda oculto o minimizado. Al volver leen la hora actual inmediatamente; no
reproducen los ticks perdidos. Las publicaciones del anfitrión siguen llegando:
no se suspenden guardados, recibos, cambios de cuenta, avisos ni lanzamientos.

`spellcheck:false` y `backgroundThrottling:true` ya estaban configurados. No se
atribuyen a este cambio ni se modifican seguridad, CSP, preload, sandbox o fuses.
Tampoco se cambia el cierre del Hub al entrar en pista. Las animaciones siguen
la política de Chromium; no se añade una regla CSS global que pueda interrumpir
las transiciones de diálogos.

## Evidencia reproducible

Tres candidatos, construidos y empaquetados por separado:

| Candidato | Código | Cambio |
|---|---|---|
| A | `b18a3618d` | Producto previo |
| B | `c5bf648d2` | Importación diferida del asistente |
| C | `0005545d3` | B + pausa de relojes visuales |

Carpeta: `D:/VantareServer/evidence/hub-web/isa-1995-d-electron-resources/`.
`baseline-v8/report.json` es A; `compare-lazy/report.json` es B;
`compare-clock/report.json` es C. Los manifiestos `bundle-before.json`,
`bundle-lazy.json` y `bundle-clock.json` conservan los tamaños de los artefactos.

El archivo inicial minificado pasa de **603.936 a 382.241 bytes** con B
(−221.695 bytes, −36,7 %); C ocupa 382.277 bytes. Es el tamaño de ese archivo,
no la suma de todos los módulos ni una medida de RAM. Resource Timing en esta
ejecución con archivos locales no enumeró los módulos JS; no se infiere de ello
que no se cargaran otros chunks.

Las muestras por proceso distinguen memoria privada y working set. No se suman
working sets como RAM exclusiva ni se confunde memoria GPU con VRAM. Una pasada
de 20 segundos por fase, con mock y CDP en servidor compartido, no demuestra un
ahorro permanente de RAM: GC, cachés y presión del sistema introducen ruido.
Para comparar diferencias pequeñas se necesita repetir pares alternados en el
PC de juego con el mismo guion y estado de ventana.

## Regresiones

Los tests verifican que una configuración completada no evalúa el asistente y
que una pendiente sigue bloqueando el Hub hasta completarse. Los relojes se
prueban con reloj falso: ocultación, reanudación inmediata, cambio de hora,
cambio de derechos, StrictMode y desmontaje sin timers residuales.

La integración de Calendario comprueba que, mientras el reloj está parado,
se consume una publicación de horario y no se añaden peticiones. Se mutó de
verdad la guarda `document.hidden`: el test falló con 21.000 en vez de 1.000;
después se restauraron los bytes originales. La integración de Inicio conserva
el número exacto de lecturas y la cancelación de su suscripción.

Se aplicó Modern Web Guidance local 1.0.0 (`performance`: “DO use dynamic
imports”). No se añadieron dependencias ni se ejecutó `legacy-scan`.
