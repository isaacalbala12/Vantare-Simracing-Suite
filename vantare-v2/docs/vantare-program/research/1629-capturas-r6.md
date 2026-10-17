# #1629 / VANTA-8 · matriz Windows R6 tras la review

17-oct-2026. Los 17 widgets originales tienen sus cuatro capturas actuales: **68/68**, más **17 casos de borde P2**, en `C:/VantareServer/evidence/1629-r4/capturas/`.
La columna Sí de la tabla significa **captura producida e inspeccionada**, no paridad exacta ni aceptación de Isaac. Las diferencias concretas siguen abajo y los 99 P3 permanecen en [la respuesta de review](1629-review-r5.md). No se da por aprobada toda la paridad por haber corregido los P2.

## Fuentes y método

- Código capturado: `fc5853d78d3131b1bccdf35e6dd8cb0978a9845e`, con P2 corregidos y nightly `c9a832d70` (#1675). Ejecutable SHA256 `5714d947f862f774b15b9a20ce0704b3345ba9ff8f3fe060bb6a969911e87912`.
- Después se incorpora por merge nightly `8ef018cef` (#1685) en `12869809b`: probe de Hub y documentación de Avisos. Ningún Rust del Workshop/pintores/domain/ipc/backend GPUI cambia; las imágenes siguen representando esos pintores.
- Única invocación de app: `vantare-workshop.exe --capture-batch <manifest.json>`, sin consola, con el banco oficial de #1675. No se abre Hub, Workshop interactivo ni overlays de producto.
- Primero una sola captura: HWND nacido oculto, NOACTIVATE/TOOLWINDOW; rectángulos `(-4352,0,-2412,1100)` antes de presentar y `(-4352,0,-2048,1440)` al capturar, fuera de todos los monitores según comprobación nativa. Sin foco. Se cierra el proceso al terminar cada lote.
- Smoke Standings: mismo tamaño 520×289 que la referencia histórica; **2 píxeles distintos, diferencia máxima 1 por canal RGBA**. La comprobación inicial de bbox no incluía el segundo cambio de alfa; el inventario RGBA completo es el dato final.
- Lote 68: 67 imágenes nuevas + 1 incremental del smoke, **55.32 s**. Segunda pasada: **68 omitidas, 0 HWND, 0.20 s**, recibos válidos. Casos P2: lote inicial de 16 y ampliación de 1; esta última omite las otras 16. Ningún proceso Workshop propio queda vivo.
- Entradas QA congeladas: escenas R3/versionadas del diseño, convertidas solo en memoria por el lector histórico v10→v11. Se guarda origen/hash/configuración/estado en `inputs.json` e `inventory.json`. Q/P sin placa propia se derivan cambiando el tipo de sesión; no se atribuye a ellas un diseño propio inexistente.
- Los 68 pares `comparacion/<widget>/<estado>.png` colocan referencia aprobada R3 y Windows R6 a píxeles físicos originales, sin reescalar ni tapar diferencias. R3 es una referencia conservada, **no una captura nueva del HTML**. Dimensiones, hashes y ruta exacta quedan en `inventory.json`; altura reservada/transparente puede diferir del panel visible.

## Matriz inspeccionada

C=carrera, Q=clasificación, P=práctica, S=sin datos. PNG originales: `<widget>/{race,qualifying,practice,nodata}.png`.

| Widget | C | Q | P | S | Comprobación y diferencias restantes |
|---|---|---|---|---|---|
| `standings` | Sí | Sí | Sí | Sí | LMP2 se conserva completo. Sin estado tipado de vuelta lanzada/salida/garaje; hay pies y campos diferentes del HTML. |
| `relative` | Sí | Sí | Sí | Sí | Sesión visible; predicción de vuelta/tanda ausente. Pie y signo del gap según contrato, no cifras decorativas. |
| `delta` | Sí | Sí | Sí | Sí | Número del sector en curso visible en ampliado (−0.094). Q/P conservan referencia personal si falta traza de pole/óptima. |
| `pedals` | Sí | Sí | Sí | Sí | DESCONECTADO visible en Waiting/Lost. Q/P reutilizan aspecto de carrera; ABS/TC/FFB requieren productor. |
| `fuel-strategy` | Sí | Sí | Sí | Sí | Q/P muestran recurso limitante, plan y «Media últimas 3 v». Energía 12 %, 6 %/v, 2 v. Carga mínima de qualy sigue sin dato. |
| `multiclass-relative` | Sí | Sí | Sí | Sí | Clases/jugador dentro del panel. Práctica derivada de carrera porque no tiene placa propia; sin conversión a curvas. |
| `radar` | Sí | Sí | Sí | Sí | Cuatro motivos espaciales distintos. Q/P usan mismo aspecto. Sin TTC, hueco libre entre carrocerías ni autoocultación equivalente. |
| `input-telemetry` | Sí | Sí | Sí | Sí | Traza observada y vacío visibles. Q/P usan mismo aspecto; ABS/TC/luces calibradas sin señal disponible. |
| `delta-trace` | Sí | Sí | Sí | Sí | Progreso −3 % y 101 % omitido. Sectores y encabezado dentro del panel. Q/P sin traza de referencia específica en estas escenas. |
| `pedals-telemetry` | Sí | Sí | Sí | Sí | DESCONECTADO visible en Waiting/Lost. Q/P reutilizan aspecto; señal ABS pendiente de productor. |
| `track-map` | Sí | Sí | Sí | Sí | Texto de cabecera cabe en C/Q/P; nombre largo se acorta con puntos. El nombre QA desconocido no tiene geometría; sin estado de vuelta lanzada. |
| `track-weather` | Sí | Sí | Sí | Sí | Cabeceras dentro del panel. Sin forecast/tendencia/hora del día/número de práctica; plantilla de práctica reutiliza datos actuales. |
| `racing-flags` | Sí | Sí | Sí | Sí | Color personalizado visible en título/cuerpo. Práctica derivada de carrera. Sanciones tipadas/contadores sin productor siguen fuera de la foto live. |
| `fastest-lap` | Sí | Sí | Sí | Sí | Tarjeta y sectores caben. Sin datos se oculta (PNG transparente), diferente de tarjeta fija HTML. Sin selector absoluto/clase independiente. |
| `head-to-head` | Sí | Sí | Sí | Sí | Ganancia negativa verde y pérdida positiva roja; guiones neutros. Cálculo observable difiere de cifras ilustrativas HTML; práctica derivada. |
| `broadcast-tower` | Sí | Sí | Sí | Sí | 20 filas guardadas se normalizan a 11; las 11 caben en 1400×56. Códigos/gaps se ajustan con puntos; sin vuelta lanzada tipada. |
| `car-damage-visual` | Sí | Sí | Sí | Sí | Cifras muestra daño 6 %/18 %, y Aero desaparece al desactivarlo. Coche mantiene integridad. Sin zonas/pinchazo/reparación. |

## Selección para la ronda 2

Todos estos archivos cuelgan de `C:/VantareServer/evidence/1629-r4/capturas/p2/`:

- `mapa-cabecera-larga.png`: el texto largo se ajusta sin invadir sesión; geometría no disponible para ese nombre QA.
- `torre-20-ajuste-limitado-11.png`: las 11 tarjetas admitidas visibles, última incluida.
- `delta-sector-en-curso.png`: S2 en curso pinta −0.094 con total −0.214 y S1 −0.120.
- `danos-cifras.png` / `danos-cifras-sin-aero.png`: 6 % de daño aerodinámico frente a integridad 94 %; quitar Aero compacta las otras filas.
- `fuel-energia-practice.png` / `fuel-energia-qualifying.png`: 12 %/6 % por vuelta = 2 vueltas, plan de parada y media de tres vueltas.
- `pedales-lost.png`, `telemetria-pedales-lost.png`, `banderas-color-texto.png`, `standings-lmp2.png`, cuatro `radar-*.png` y dos `delta-trace-progreso-*.png` completan los casos de borde.

## Gates y entrega

Build Windows `parity-capture` PASS por cola oficial, target propio D, MIN_GB=0, jobs2, 151 s. El primer comando seleccionaba solo UI junto a defaults de otros miembros y falló antes de compilar; se corrigió la selección del workspace, sin alterar features del producto. Ambos logs se conservan en `1629-r5/build-batch*.log`.
En el corte capturado, CI 5/5 PASS: fmt/check/clippy -D warnings, Nextest2031/2031 (19 skips canónicos), regresiones23/23, telemetría33/33 y lifecycle18/18, run38988567303. Tras incorporar #1685 y este informe, los checks del SHA publicado se verifican y enlazan en [PR #1641](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1641), sin extrapolar ese verde anterior.
No cambió código propio de producto en R6. Quedan ronda 2, aceptación de diferencias P3, simuladores/OBS/DPI distintos y tecla física de Daños. No hay capturas pendientes de esta matriz. Sin merge del PR, promoción, release, despliegue ni dependencias nuevas.
