# Plan del roadmap

Restaurado en ISA-1403 por instrucción de Isaac el 2026-09-29 para registrar el
cambio de dirección de Telemetry Core. El contenido histórico anterior a #1380
no se importa: su estado no se ha reconciliado con la publicación actual. La
app de esta base lee el roadmap visual de Supabase y no este archivo;
`.github/scripts/roadmap_digest.py` y `roadmap.json` fueron retirados en #1380.
Esta entrada **no está publicada** por el mero hecho de aparecer en la PR.

## Fases

### Telemetría live en Rust

- id: telemetry-rust-live
- estado: in-progress
- progreso: 35
- objetivo: Sustituir la ruta live de telemetría y su entrega a Overlay, Engineer y Strategy.
- item: Windows selecciona el helper Rust por defecto; Studio y OBS reciben Overlay mediante sesiones, ACK, replay y selección Rust. Rust emite epochs continuos tras reiniciar el helper. El host aún adapta Engineer/Strategy y conserva código Go live por retirar.
- item: Instalador NSIS y ZIP portable construidos y verificados localmente con el helper Rust; falta prueba física LMU/Wails/OBS y CI del SHA final.
- item: Comparación de rendimiento del camino final y rondas de optimización pendientes.

## Hitos

### Telemetría live completa en Rust

- id: telemetry-rust-live
- tipo: plan
- titulo: Telemetría live completa en Rust
- cuerpo: Sustituir el camino live de Go, incluida la distribución a Overlay, Engineer y Strategy, por Rust; mantener Wails y los otros servicios de producto Go. Verificar paridad, recuperación y rendimiento con capturas LMU reales y rondas de optimización medidas antes de retirar el motor Go.
- etiqueta: En desarrollo
