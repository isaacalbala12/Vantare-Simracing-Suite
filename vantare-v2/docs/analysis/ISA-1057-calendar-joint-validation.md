# ISA-1057 - Validacion conjunta de Calendario

Base: nightly d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2.
Rama aislada: vantareapp/isa-1057-calendar-joint-validation.
Estado: ensamblaje local; validacion conjunta en curso. No integrado ni publicado.

## Candidatos reunidos

| Corte | HEAD incorporado | Contenido |
|---|---|---|
| C2/C5/C6 | 9cde32e1 | Retencion, seguimiento persistente, confirmacion y avisos nativos |
| C3/C7/C8/C9 | 77ad58ca | Vigencia, dias civiles, clasificacion mensual y detalle |
| C4a | db825e4a | Resultado y estado nativo de actualizacion |
| C4b | 31cf1600 | Estado de actualizacion en interfaz |
| Nombre | 42a7f7d0 | Pestana Calendario |
| Banco | faae79f7 | Herramientas de medicion aislada |

Se excluyen de esta referencia los candidatos de optimizacion #1020 y #1024.
El objetivo es medir primero el comportamiento corregido antes de comparar cortes.
HUD, OBS y Overlay Studio quedan fuera de las modificaciones de producto.

## Resolucion de cruces

- Se conservan ambos canales del store: resultado correlacionado de seguimiento y estado de actualizacion.
- La actualizacion nativa conserva mutex, contexto y resultado; la interfaz emite una unica peticion.
- Se mantienen las pruebas de detalle, navegacion mensual, confirmacion y estados.
- El test de vigencia desconocida ahora declara `schedule: undefined`: el calendario compartido incorporado por C3 tiene vigencia valida. Reproduccion conjunta: 1 fallo; despues 142 PASS, 2 omitidas por artefacto externo.
- Los hitos e historial de cada candidato se conservan a partir de sus fuentes. Una resolucion intermedia de documentacion incompleta se detecto y reconstruyo antes de cerrar el ensamblaje. El JSON se regenera, no se edita.

## Evidencia y pendientes

Logs locales: results/isa1057. No contienen una medicion real aceptada todavia.
Pendientes: build/checks completos, review del conjunto, ejecutable Wails aislado,
recorridos C1, referencia A/A C10 y comparacion de optimizaciones C11.
No se afirma ahorro de CPU/GPU/RAM ni mejora medida de latencia.
Se mantienen LMU y las otras aplicaciones; se atribuye consumo al proceso propio.
No se han fusionado cambios a nightly ni publicado releases.

## Checks del ensamblaje

- Review independiente estatica ACCEPT en f8c36cc1; no P1/P2 detectados.
- Build frontend (incluye tipos), lint y `go test ./...`: PASS.
- Suite completa frontend: 3299 PASS, 2 omitidas, 2 timeout de 20s en PedalsRedline.layout.test.tsx:97 (fuera de alcance, expediente #1025). Suite no verde; no se cambian presupuestos ni exclusiones.
- Roadmap: 44 tests PASS.
- Banco extendido a Proximas/Dia/Semana, manteniendo Mes/Timeline/Inicio. Tres casos RED antes; 16 pruebas PASS despues. Solo tooling, sin cambio de producto.
- Wails, referencia A/A y comparacion de optimizaciones siguen pendientes.

## Primera comprobacion Wails y correccion del banco

Ejecutable aislado bin/isa1057/vantare-calendar.exe, SHA256
3c2b9a78d0f5c32d989e0d160c63eda791c226bda58baa670114b02f5a798b66.
Cuenta autenticada, licencia activa, config portable y WebView propios. LMU y otras instancias intactas.
El calendario recibido tiene 11 series, 0 eventos actuales y vigencia real
2026-08-25 a 2026-09-01. La interfaz evita salidas inventadas y conserva duraciones estimadas.

La importacion diagnostica de /wails/runtime.js reemplazaba dispatchWailsEvent
(con otro registro de listeners), dejando la interfaz sin los eventos nativos.
Reproduccion Wails: resultado ok=true mientras UI conservaba error; recarga sin
instrumentacion recupera estado correcto. Banco corregido para conservar entrega
a la app y al observador; 17 pruebas PASS y licencia + refresh real mantienen UI correcta.
Las capturas previas a refresh-clean.png estan contaminadas por ese diagnostico.
Los bancos anteriores que usaron esa importacion necesitan repetirse; no son una referencia aceptada.

No hay horario vigente disponible en esta instancia; se ha solicitado su origen
al usuario para validar proximas salidas y avisos actuales sin inventar datos.

## Flujos disponibles y review del banco

Wails: las cinco vistas abren sin overflow global a 1264x761; seguir y dejar de
seguir confirman resultado, seguimiento conservado al recargar UI (no prueba de reinicio nativo).
Capturas limpias y real-flows.json en results/isa1057. Timeline tiene etiquetas
superpuestas en 24h: issue #1058, correccion separada dentro del plan #1027.
Review del banco detecto instalacion concurrente que duplicaba eventos: RED
reproducido, promesa compartida y restauracion tras fallo; 19 pruebas PASS.
La referencia con horario vigente y los avisos reales siguen pendientes del dato.
