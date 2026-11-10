# Gate físico VRR antes de aceptar un motor

Estado: PENDIENTE. Solo Isaac o el orquestador autoriza ejecutar esto en el PC de juego.
El servidor remoto a 59 Hz no puede aprobarlo. Duración: 12 capturas de 70 s
(14 minutos) más unos 10 minutos de preparación y revisión.

## Procedimiento


1. Anotar Windows, GPU/driver, monitor, conexión, Hz, rango VRR, juego/build,
   resolución, borderless, V-Sync, límite FPS y estado de G-Sync/FreeSync.
   Mantener esas opciones iguales entre pasadas. Elegir una repetición/escena
   estable con FPS dentro del rango VRR y por debajo del techo del monitor.
   Cerrar otros overlays; OBS se prueba aparte y queda registrado si se usa.
2. Descargar PresentMon oficial y consultar su `--help`. Usar la consola,
   **sin su overlay gráfico**. La [CLI oficial](https://github.com/GameTechDev/PresentMon/blob/main/README-ConsoleApplication.md)
   admite los filtros siguientes; sustituir `LeMansUltimate.exe` si cambia el
   ejecutable real. Crear `D:\VRR` y ejecutar una consola con permisos ETW:

   ```powershell
   .\PresentMon.exe --process_name LeMansUltimate.exe --process_name vantare-overlays.exe --output_file D:\VRR\01-sin-overlays.csv --delay 10 --timed 60 --terminate_after_timed --session_name VantareVRR01 --write_display_metadata
   ```

3. Primera pasada con overlays cerrados. Segunda con el mismo layout visible
   (`02-visibles.csv`, sesión distinta). Tercera usando «Ocultar overlays»
   (`03-ocultos.csv`); verificar que no quedan ventanas de overlay. Cuarta tras
   volver a mostrarlos (`04-restaurados.csv`). Volver al juego durante el delay,
   sin menús sobre la escena medida. Repetir tres rondas, invirtiendo el orden
   visible/oculto en la segunda para detectar calentamiento.
4. Separar filas del juego y del overlay. Guardar distribución de PresentMode,
   FPS y percentiles p50/p95/p99 del tiempo entre presents/display según la
   versión de CSV. Comparar baseline/visible/oculto/restaurado por ronda.
   Comprobar además el indicador VRR del driver/monitor y sus Hz físicos:
   PresentMode por sí solo no acredita que el panel esté variando frecuencia.
5. Aceptación: documentar si el juego mantiene Independent Flip/Hardware
   Composed Independent Flip y VRR físico al mostrar, si cambia a Composed
   Flip, y si ocultar recupera el estado baseline. Adjuntar los CSV sin cuentas
   ni datos privados y la tabla de configuración. Si solo visible pierde VRR,
   dejar el modo ocultar como mitigación y reportar el hardware exacto.

No desactivar MPO, cambiar registro ni forzar ajustes globales del driver como
parte de esta prueba. **Esta validación física no se ha ejecutado en el servidor.**


## Resultado que desbloquea la comparación

Guardar SHA y hashes de A/B, configuración y CSV por pasada; repetir el
procedimiento para ambos motores. La aceptación exige VRR físico conservado
al mostrar overlays y ausencia de regresión de presentación frente a A. Si
solo ocultar recupera VRR, documentar la mitigación: no marcar el gate como
aprobado con overlays visibles. Un valor desconocido nunca cuenta como aprobado.
