# Hub nativo (ISA-1430)

Proceso GPUI independiente, misma revisión y kit Eficiencia que `vantare-ui`.
No usa Wails, runtime, credenciales ni servicios de red.

```powershell
cd native
cargo run --offline -j 2 -p vantare-hub
```

Todas las secciones del producto distribuido están en la navegación. Los
paneles que indican pendiente no implementan el servicio ni conceden acceso.

El botón Cerrar Hub y cerrar su ventana terminan el proceso. Un launcher puede
arrancarlo con `--control-stdin` y cerrar su stdin para pedir salida (100 ms de
sondeo); por defecto no se supervisa stdin para permitir arrancar sin consola.
La detección de entrada al juego y no relanzarlo tras el cierre pertenecen al
launcher y requieren integración; esta shell no demuestra ese gate físico.

La paridad y los bloqueos están en el
[microplan](../../docs/superpowers/plans/2026-09-30-fase-5-hub-studio-workshop.md).
