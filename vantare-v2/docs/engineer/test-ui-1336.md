# Pantalla funcional de pruebas Engineer — VAN-752 / #1336

Autorización: Isaac pide rehacer completamente el frontend para pruebas,
priorizando funcionalidad sobre diseño. Implementa las correcciones propuestas
en la auditoría VAN-735. Base nightly8b25d076; no incorporar T1/T2 sin integrar.

## Diseño y plan

Sustituir la pantalla existente, no crear otra app. Cuatro bloques: estado y
últimos errores, controles reales, prueba manual del reproductor y registro.
Se retiran voces/volumen WebView y toda acción sin implementación. Se mantienen
los setters persistidos de Ingeniero/Spotter/subtítulos/sensibilidad/familia.
Estado observado y confirmación del backend; ausencia/timeout no es éxito.

Instrumentación mínima del servicio: snapshot v1 de estado+health, disponibilidad
de reproductor/router y las últimas200 entregas de radio seleccionadas, con
configuración en el momento de selección, resultado visual/audio y lifecycle.
No afirma registrar todos los candidatos: silencios anteriores se ven agregados.
Sin audio path, IDs de piloto ni telemetría cruda en el snapshot.

Prueba explícita offline con Engineer desactivado y sin entrega activa: tono WAV
local de corta duración mediante el mismo AudioPlayer Go, sin speechSynthesis ni
TTS. Otra opción comprueba/reproduce una frase conocida si existe en caché,
con cache_miss visible. Activar Engineer o parar servicio cancela la prueba.
La finalización del reproductor no demuestra que el usuario haya oído sonido.
No se añaden síntesis, descarga o configuración de voz ficticia.

Polling de diagnóstico sólo mientras la página está montada, intervalo1s,
con cleanup y estado desactualizado visible. Historial backend acotado preserva
resultado histórico; filtro por ciclo actual/todos, exportación JSON de snapshot
con vista previa exacta, acción local de descarga/copia sin subir nada.

## Verificación acordada por el alcance funcional

RED→GREEN en frontera pública de página/bridge y servicio: error visible,
controles confirmados, timeout, historial independiente de configuración actual,
cache miss/éxito/fallo/cancelación, prueba reproductor, exportación exacta.
Tests/build/typecheck/lint frontend, Go focal/race/vet/global, revisión GPT-6,
verificación visual mediante harness identificado como sintético y CI Windows.
No se presenta un harness como prueba LMU ni audio físico.

Rollback: revertir esta PR. Sin cambio de reglas CrewChief, T3/T4 o scheduler.
Roadmap required: sólo milestones:engineer-radio-spotter, cuatro idiomas y JSON
regenerado desde base. La entrega inicial fue draft/push. Isaac autorizó después
la integración en nightly, seguida en [VAN-759](https://app.notion.com/p/3e4e51695c658192a2def8aa6dc9fb2b);
no incluye testers, master ni release.
