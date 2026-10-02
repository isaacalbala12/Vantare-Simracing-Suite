# Verificación manual de la build

Guía de comprobación, no acta de pruebas ejecutadas. Registrar versión, SHA/canal, Windows, perfil usado, fuente y resultado. Usar un perfil de prueba. Arranque: [operaciones](operations.md).

## Hub y fuente

1. Abrir la app y comprobar carga del Hub y navegación entre las pantallas del cambio.
2. Sin LMU, o con `-live=false`, comprobar estado desconectado: no deben aparecer datos ficticios como observaciones live.
3. Con LMU en una sesión real, contrastar estado y datos con el simulador. Anotar campos no disponibles; no sustituirlos por ceros.

## Editor único de Overlay Studio

1. Abrir Studio y seleccionar/crear un perfil propio; si se parte de un recomendado, crear una copia.
2. Añadir un widget y cambiar una propiedad y su colocación dentro del mismo editor.
3. Arrastrar y redimensionar: la preview debe seguir el gesto y confirmar al soltar, sin saltos ni rastro.
4. Esperar la confirmación de autoguardado, salir y reabrir el perfil. Comprobar que el cambio persiste.
5. Deshacer/rehacer una edición ya guardada y verificar la nueva persistencia.
6. Ante error de guardado o conflicto, comprobar estado explícito y conservación del borrador. No interpretar un click como confirmación.

El comportamiento previsto está en [ADR 0093](adr/0093-overlay-studio-autosave-history.md) y el [contrato del canvas](overlays-studio/canvas-drag-imperative-preview.md). Las instrucciones antiguas de `WidgetStudio` y `LayoutStudio` ya no describen esta UI.

## Desktop y OBS

1. Iniciar/detener el overlay con un perfil válido; comprobar apertura y cierre reales.
2. Editar el perfil en Studio, esperar guardado y comprobar coherencia de geometría y contenido en Desktop.
3. Añadir OBS con la [URL local del perfil](obs-local-setup.md); comprobar el mismo perfil, estados de fuente y cambios guardados.
4. Desconectar/reconectar la fuente y cerrar las superficies. Verificar que no quedan ventanas o suscripciones visibles inesperadas.

## Reporte

Indicar pantalla, acción, resultado esperado/observado, repetibilidad, fuente live/desconectada y evidencia permitida. Para diagnósticos usar la UI y el [contrato de exportación sanitizada](telemetry-core/inspector-privacy-diagnostic-export-isa-104.md). No adjuntar indiscriminadamente perfiles, credenciales o logs completos.

[Versión anterior y evidencia fechada](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/manual-verification.md).
