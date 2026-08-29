# ISA-940 · lifecycle a coste cero

## Autoridad y alcance

- Rama: `vantareapp/isa-940-lifecycle-coste-cero`.
- Base rebasada antes del cierre: `origin/nightly@c93d93ba`.
- Build diagnóstica propia: `bin/vantare-isa940.exe` (sin `-tags production`).
- Perfil: `testdata/bench/huella-endurance-3.json`, tres widgets.
- Puerto CDP propio: 9244. LMU y los procesos Vantare ajenos no se modifican.
- Una corrida RAM-only de 120 muestras por nivel solo compara el corte: no es el baseline
  publicable de 180 s × 3 ni demuestra iGPU, VR o paridad visual humana.

## Entrada overlay

`pnpm build` sobre la base produjo `AppShell-CDzxp1pO.js` de 2.000,85 kB
(gzip 542,49 kB), que era el chunk compartido cargado por la ventana overlay.
Tras separar la entrada y rebasar #936, la ventana pide `overlay-*.js` y sus
imports; el mayor chunk de esa ruta es `widget-visibility-*.js`. Los hashes
cambian entre builds equivalentes, por lo que la evidencia fija el tamaño.

| Métrica de build Vite | Antes | Después | Cambio |
|---|---:|---:|---:|
| Mayor chunk JS cargado por overlay | 2.000,85 kB | 931,68 kB | -53,4 % |
| Entrada + preloads JS estáticos del HTML | 2.000,85 kB | 203,71 kB | -89,8 % |
| gzip del mayor chunk | 542,49 kB | 253,39 kB | -53,3 % |

La ruta dinámica aún necesita módulos compartidos de edición importados por
`CompositeApp`; ese archivo está reservado a #936 y no se modificó. No existe
`pyftsubset` en esta máquina, por lo que CascadiaCode continúa como TTF de
387,94 kB. TODO: generar y validar un subset woff2 cuando haya tooling aprobado.

## Corridas HubMin

Pendiente de ejecutar sin `-Forzar`. Las corridas contaminadas realizadas
antes de la coordinación de máquina se descartaron y no se usan en esta tabla.

Tras aclarar que el `PresentMon-x64` permanente pertenece a Radeon
`RSXTraceSession`, se esperó exclusivamente a `vantare-baseline*`. Entre las
00:47 y la 01:47 del 29 de agosto hubo una sucesión continua de corridas
baseline con PIDs distintos. Dos intentos propios encontraron un hueco limpio
durante 5 s, pero la higiene detectó un nuevo baseline antes de lanzar Vantare
y abortó sin `-Forzar`. Por tanto no existe una corrida limpia propia que pueda
publicarse o resumirse. El 30 de agosto LMU no estaba abierto, por lo que se
añadió `-SinJuego`: conserva las muestras privadas por rol y CDP, omite
PresentMon, fija `measurementMode=ram-only-no-game` y marca la corrida como no
publicable para el protocolo completo. El dry-run pasó, pero el gate de higiene
detectó siete procesos Edge ajenos estables en dos polls separados por 30 s y
abortó antes de lanzar Vantare. No se usó `-Forzar`, no se cerró Edge y no quedó
ninguna sesión ETW `VantareHuella-*`.

Guion listo, desde `vantare-v2`, cuando la higiene esté limpia:

```powershell
go build -o bin/vantare-isa940.exe ./cmd/vantare
$env:VANTARE_PERF_LEVEL = '3'
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion HubMin -Duracion 120 -Puerto 9244 -Exe bin/vantare-isa940.exe -Salida results/isa-940-ram-only-l3 -SinJuego
$env:VANTARE_PERF_LEVEL = '1'
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion HubMin -Duracion 120 -Puerto 9244 -Exe bin/vantare-isa940.exe -Salida results/isa-940-ram-only-l1 -SinJuego
Remove-Item Env:VANTARE_PERF_LEVEL
```

El mismo 30 de agosto LMU volvió a estar disponible en Spa, práctica WEC 2026,
jugador en garaje e IA rodando. Se ejecutó entonces una pareja completa
HubMin de 120 muestras con PresentMon. Ambas corridas tuvieron higiene limpia,
0 frames perdidos y cierre limpio, pero L3 conservó el renderer Hub porque el
ACK agotó los 500 ms. La pareja es evidencia diagnóstica del fallo, no prueba de
que el gate 12.2 se haya superado.

| Nivel | Go host privada MiB | Browser privada MiB | GPU process privada MiB | Utility privada MiB | Crashpad privada MiB | Renderer Hub privada MiB | Renderer overlay privada MiB | Total árbol privado MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 75,02 | 45,65 | 176,90 | 22,92 | 2,88 | 66,54 | 144,10 | 534,01 |
| 3 | 104,23 | 44,83 | 174,17 | 22,40 | 2,87 | 62,49 | 104,26 | 515,25 |

L3 quedó 18,76 MiB (-3,5 %) por debajo de L1, pero permanece 122,25 MiB por
encima del objetivo ≤393 MiB y no representa el lifecycle deseado. Artefactos
crudos: `results/isa-940-full-l3/hubmin-20260830-010413.csv` y
`results/isa-940-full-l1/hubmin-20260830-011056.csv`. PresentMon observó 0/4168
y 0/6494 frames perdidos respectivamente.

El banco conserva `renderer-unassigned` para el renderer creado tras abrir el
overlay: CDP prueba el target `overlay.html` y sus tres widgets, pero no aporta
una relación PID↔target suficiente para renombrarlo sin inferencia.

## Evidencia funcional

- Wails v3 alpha.98 no contiene `TrySuspend` ni una API de suspensión de
  CoreWebView2. Se usa destrucción fail-closed y recreación bajo demanda.
- `hub:can-suspend` espera hasta 500 ms. Un registro central bloquea por Studio
  sucio, borrador del Launcher u OAuth pendiente y devuelve todas las razones.
  `false` o timeout conserva el Hub.
- Un ACK tardío solo destruye la misma ventana, de la misma generación y aún
  minimizada; `Open()` invalida el intento pendiente.
- `/overlay?profile=…` sirve `overlay.html`, conserva `ObsOverlayApp` y los
  contratos SSE, sin cargar la entrada principal.
- En la corrida L3 fallida, CDP midió 10.389 ms desde `hub:open` hasta el target
  y el log Go 8,846 s de recreación; no es un tiempo aceptable ni valida la
  corrección posterior que dirige el probe al WebView Hub actual.
- Bounding box: un clúster usa su unión más 16 px; widgets en esquinas opuestas
  saturan al monitor completo; DPI convierte primero a coordenadas lógicas de
  Wails; edición fuerza el monitor completo. Guardar Ajustes aplica 1↔3 a la
  ventana activa y recalcula una sola vez por transición.
- Ingeniero: en 4–5 no publica presentación visual ni subtítulos y mantiene la
  reproducción de audio.
- Windows: 4–5 aplica `PROCESS_POWER_THROTTLING_EXECUTION_SPEED` y prioridad
  below-normal; 1–3 revierte ambos.

## Límites de esta evidencia

- Pendientes tras el diagnóstico: repetir L3 con el ACK dirigido y comprobar
  renderer Hub = 0, total ≤393 MiB y reapertura real. También quedan captura de paridad visual,
  escucha humana del audio, baseline N=3, iGPU y VR.
- Un warning aislado de contador GPU en las corridas descartadas no se rellena
  con datos sintéticos; las corridas limpias deben conservar cualquier ausencia.
