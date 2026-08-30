# ISA-894 — guion de cinco sesiones LMU largas

Estas sesiones son una precondición humana de F9. El worker **no las ejecuta**:
Isaac coordina LMU y confirma cada transición. No sustituyen ni se sustituyen
por fixtures, replay, REST o el banco corto A/B.

## Preparación común

1. Construir la build exacta del PR embebiendo la configuración autorizada de
   `frontend/.env.local`: mapear `VITE_SUPABASE_*` a `VANTARE_SUPABASE_*`,
   ejecutar `corepack pnpm --dir frontend build`,
   `tools/generate_supabase_config.ps1` y después `go build`. Verificar por CDP
   que `license:changed` no sea `unconfigured`, y anotar estado/tipo de cuenta
   sanitizados junto con SHA, versión de LMU, circuito, sesión, coches y hora.
   Está prohibido medir con una build sin licencia configurada; nunca se
   imprimen, copian ni versionan los valores de `.env.local`.
2. Cerrar Edge/WebView2 y cualquier `vantare-*.exe` ajeno. Mantener una sola
   app, un solo medidor y el juego. No cerrar `PresentMon-x64.exe` de Radeon.
3. Ejecutar **dos fases identificadas por escenario**, nunca mezcladas en un
   mismo proceso: `on` con `VANTARE_OVERLAY_V1_EMIT=1` para paridad shadow y
   `off` sin override, con `overlayV1Emit=false`, para soak V2-only. Perfil con
   Standings, Relative y Delta visibles.
4. Capturar al inicio y al final: diagnóstico V2 de cada ventana, contadores de
   pull V1/V2, métricas del host, árbol de procesos y screenshot de widgets.
5. Cada 60 s registrar CPU y Private Bytes de Go host, browser, renderer(es) y
   GPU process. No sumar procesos del sistema ni atribuir un renderer ambiguo.
6. Validar en vivo los campos equivalentes del comparador. Todo mismatch se
   conserva con feature, epoch, sequence, estado LMU y explicación; nunca se
   redondea a PASS por ser `partial` o `not-comparable`.

El colector declara `expectedWindows` en el dry-run y en `sesion.json`: S1–S4
exigen `desktop`; S5 exige `desktop` y una segunda superficie `studio-or-obs`.
Cada aparición de esas superficies debe incluir diagnóstico `pull`; una
ventana esperada ausente o un único checkpoint sin `pull` hace fallar el
resumen.

## Matriz obligatoria

| Sesión | Fase `on` | Fase `off` | Escenario y gesto humano | Evidencia específica |
| --- | ---: | ---: | --- | --- |
| S1 · práctica/garaje/pista | 20 min | 20 min | Spa práctica: 5 min garaje, salir de boxes, vuelta lanzada y volver al box | Transiciones pit/track, Delta y Relative; paridad exacta ON, cero V1 OFF y memoria inicial/final. |
| S2 · carrera | 20 min | 20 min | Carrera con salida, tráfico, al menos una vuelta y entrada a boxes | Orden/identidad Standings, tráfico Relative, banderas/eventos e histograma/p99 de entrega. |
| S3 · parrilla grande | 20 min | **60 min** | Sesión con **más de 40 coches**; mantener tráfico real alrededor | Conteo de coches, payload/Hz, CPU/RAM por proceso y soak prolongado OFF. |
| S4 · reconnect | 20 min | 20 min | En sesión: detener/reanudar la fuente de telemetría o reiniciar LMU según coordine Isaac, sin reiniciar Vantare | `live -> stale/disconnected -> connecting -> live`, epoch/revisión monotónicos y recuperación en ambas fases. |
| S5 · ventana tardía | 20 min | 20 min | Mantener LMU/Vantare live ≥5 min y abrir después Desktop; repetir abriendo Studio Live u OBS tarde | Primer status/frame retenido, perfil completo, sin hueco visual; shadow ON y cero listener V1 OFF. |

La sesión prolongada queda fijada en **S3 OFF durante 60 minutos medidos**. Las
otras nueve fases duran 20 minutos. Reiniciar Vantare entre ON y OFF es
obligatorio para que el interruptor resuelto y los contadores nazcan limpios.

## Validación y criterio de parada

- Campos `exact`: cero mismatch durante toda la ventana comparable.
- Campos `partial`/`not-comparable`: veredicto explícito según
  `isa-893/comparador-catalogo.md`; no cuentan como paridad.
- Fase ON: el shadow debe activarse, comparar frames y mantener **cero mismatch
  en campos `exact`**; cada diferencia partial/not-comparable se conserva por
  métrica. Fase OFF: `shadow` permanece inactivo y cada ventana recibe **cero**
  `telemetry:overlay:projection`.
- En OFF, cada checkpoint de cada ventana esperada debe registrar a la vez
  `receivedV1Projections=0` y `shadow=null`; campo ausente también es fallo.
- V2 aumenta entre checkpoints de cinco minutos. El pull publica histograma de
  las últimas 512 entregas y su p99 empírico: **p99 ≤ 250 ms**, máximo ≤ 5.000 ms
  y cero checkpoints consecutivos sin avance V2. La espera incluida en el POST
  se declara; no se confunde con los 17 µs del encoder V2 medidos por #912.
- Pendiente lineal de Private Bytes calculada sobre toda la fase: Go host,
  browser y **cada renderer** ≤ **5 MiB/h**; GPU process ≤ **10 MiB/h**; suma
  de procesos propios ≤ **15 MiB/h**. Cada rol necesita al menos 15 muestras en
  una fase de 20 min y 45 en S3 OFF; un proceso reiniciado invalida su pendiente.
- En cada checkpoint CDP se capturan además, por target Hub/overlay, heap JS
  usado/reservado, documentos, nodos y listeners, junto con los tamaños
  retenidos del shadow. Un error CDP queda explícito y no se sustituye por cero.
- Cero `overlay-v2-*`, `widget-authority-missing`, renderer exception o fallback
  visual V1.
- Reconnect recupera `live` y un frame V2 nuevo en ≤ **30 s** desde la marca de
  reanudación. Una ventana tardía recibe primer status/frame en ≤ **5 s** y
  completa widgets en ≤ **10 s** desde su marca de apertura.
- S4 evalúa por separado cada ciclo `live → no-live → live`: cada uno necesita
  su marca humana y un `frameRevision` V2 posterior en la misma clave de
  ventana. S5 necesita marcas separadas para Desktop y Studio Live/OBS; sus
  eventos `window-first-seen` y `window-widget-ready` deben compartir la misma
  clave, por lo que no se puede completar una apertura con eventos de otra.

Se detiene el gate y se entrega la evidencia si aparece cualquier consumidor
V1 productivo, mismatch exacto no entendido, pérdida de V2, crecimiento de
memoria no acotado o sesión incompleta. No se habilita el corte 2.

## Entrega que debe devolver Isaac

Por cada S1–S5: SHA, timestamps, escenario/coches, CSV de procesos, diagnóstico
JSON por ventana, screenshot inicial/final, resumen de mismatches y cierre
limpio. Pregunta operativa: **¿qué ventana horaria coordinamos para S1 y quién
confirma desde LMU cada transición garaje → pista → boxes?**

## Colector ejecutable

Cada fase se captura con `scripts/bench/sesion-v1.ps1`. No acepta `-Forzar`,
aplica exactamente la allow-list de `huella.ps1` y no cierra procesos ajenos.
El polling de transiciones conecta CDP cada 5 s por defecto. Para aislar si esa
conexión repetida altera memoria, S1–S3 pueden repetirse con `-EstadoCada 0`:
se conservan inicio, checkpoints cada 5 min, final, heap y screenshots, pero
las transiciones se marcan manualmente con Enter. S4/S5 no usan este modo
porque necesitan observar reconnect y ventanas tardías entre checkpoints.
Ejemplos desde `vantare-v2`:

```powershell
pwsh -File scripts/bench/sesion-v1.ps1 `
  -Sesion S1 -Fase on -Duracion 20 `
  -Exe bin/vantare-isa894.exe -Puerto 9294 `
  -Escena 'Spa práctica, jugador en garaje' -Coches 20

pwsh -File scripts/bench/sesion-v1.ps1 `
  -Sesion S1 -Fase off -Duracion 20 `
  -Exe bin/vantare-isa894.exe -Puerto 9294 `
  -Escena 'Spa práctica, jugador en garaje' -Coches 20

pwsh -File scripts/bench/sesion-v1.ps1 `
  -Sesion S3 -Fase off -Duracion 60 `
  -Exe bin/vantare-isa894.exe -Puerto 9294 `
  -Escena 'Spa práctica, parrilla grande' -Coches 45
```

Antes de ocupar la máquina puede validarse el plan sin resolver ni lanzar el
ejecutable:

```powershell
pwsh -File scripts/bench/sesion-v1.ps1 `
  -Sesion S5 -Fase off -Duracion 20 `
  -Exe C:\ruta\futura\vantare.exe -Puerto 9294 -DryRun
```

Durante la captura la consola muestra `marca de transición: <texto>`. Isaac
escribe, por ejemplo, `salir de boxes`, `reanudar LMU` o `abrir Desktop tarde`
y pulsa Enter en el instante real. El colector añade además marcas automáticas
cuando cambia `sourceState`, el estado de pit o aparece una ventana/widget.

La salida única `results/isa-894/sesiones/<sesion>-<fase>-<timestamp>/`
contiene el JSON crudo, `procesos.csv`, checkpoints
CDP, screenshots inicial/final, logs, `resumen.json` y `resumen.md`. El resumen
falla cerrado si falta metadata/hash, duración, un rol, muestras, avance V2,
captura visual o cierre limpio. El parser se prueba con:

```powershell
node --test scripts/bench/sesion-v1-resumen.test.mjs
```
