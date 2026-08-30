# ISA-894 — guion de cinco sesiones LMU largas

Estas sesiones son una precondición humana de F9. El worker **no las ejecuta**:
Isaac coordina LMU y confirma cada transición. No sustituyen ni se sustituyen
por fixtures, replay, REST o el banco corto A/B.

## Preparación común

1. Instalar/abrir la build exacta del PR y anotar SHA, versión de LMU, circuito,
   sesión, número de coches y hora de inicio.
2. Cerrar Edge/WebView2 y cualquier `vantare-*.exe` ajeno. Mantener una sola
   app, un solo medidor y el juego. No cerrar `PresentMon-x64.exe` de Radeon.
3. Arrancar con V1 apagado (sin `VANTARE_OVERLAY_V1_EMIT`; ajuste
   `overlayV1Emit=false`). Perfil con Standings, Relative y Delta visibles.
4. Capturar al inicio y al final: diagnóstico V2 de cada ventana, contadores de
   pull V1/V2, métricas del host, árbol de procesos y screenshot de widgets.
5. Cada 60 s registrar CPU y Private Bytes de Go host, browser, renderer(es) y
   GPU process. No sumar procesos del sistema ni atribuir un renderer ambiguo.
6. Validar en vivo los campos equivalentes del comparador. Todo mismatch se
   conserva con feature, epoch, sequence, estado LMU y explicación; nunca se
   redondea a PASS por ser `partial` o `not-comparable`.

## Matriz obligatoria

| Sesión | Duración mínima | Escenario y gesto humano | Evidencia específica |
| --- | ---: | --- | --- |
| S1 · práctica/garaje/pista | 20 min | Spa práctica: 5 min garaje, salir de boxes, vuelta lanzada y volver al box | Transiciones pit/track, Delta y Relative; cero V1 recibido; memoria inicial/final. |
| S2 · carrera | 20 min | Carrera con salida, tráfico, al menos una vuelta y entrada a boxes | Orden/identidad Standings, tráfico Relative, banderas/eventos y p99 de entrega. |
| S3 · parrilla grande | 20 min | Sesión con **más de 40 coches**; mantener tráfico real alrededor | Conteo de coches, payload/Hz, CPU/RAM por proceso y cero pérdida de autoridad. |
| S4 · reconnect | 20 min | En sesión: detener/reanudar la fuente de telemetría o reiniciar LMU según coordine Isaac, sin reiniciar Vantare | `live -> stale/disconnected -> connecting -> live`, epoch/revisión monotónicos y recuperación sin V1. |
| S5 · ventana tardía | 20 min | Mantener LMU/Vantare live ≥5 min y abrir después Desktop; repetir abriendo Studio Live u OBS tarde | Primer status/frame retenido, perfil completo, sin hueco visual ni listener V1. |

Una de S1–S5 debe prolongarse lo suficiente para cubrir una observación de fuga
representativa; ninguna puede durar menos de 20 minutos medidos. Si la sesión
grande no cabe en S2, S3 es obligatoria además de las otras cuatro.

## Validación y criterio de parada

- Campos `exact`: cero mismatch durante toda la ventana comparable.
- Campos `partial`/`not-comparable`: veredicto explícito según
  `isa-893/comparador-catalogo.md`; no cuentan como paridad.
- Cero `telemetry:overlay:projection` recibido en todas las ventanas con V1 OFF.
- V2 continúa recibiéndose; cero `overlay-v2-*`, `widget-authority-missing`,
  renderer exception o fallback visual V1.
- Private Bytes no muestra pendiente monotónica sin explicación; reportar
  browser, renderer y Go host por separado.
- Reconnect y ventana tardía recuperan status/frame sin remount inseguro.

Se detiene el gate y se entrega la evidencia si aparece cualquier consumidor
V1 productivo, mismatch exacto no entendido, pérdida de V2, crecimiento de
memoria no acotado o sesión incompleta. No se habilita el corte 2.

## Entrega que debe devolver Isaac

Por cada S1–S5: SHA, timestamps, escenario/coches, CSV de procesos, diagnóstico
JSON por ventana, screenshot inicial/final, resumen de mismatches y cierre
limpio. Pregunta operativa: **¿qué ventana horaria coordinamos para S1 y quién
confirma desde LMU cada transición garaje → pista → boxes?**
