# ISA-940 · lifecycle a coste cero

## Autoridad y alcance

- Rama: `vantareapp/isa-940-lifecycle-coste-cero`.
- Base rebasada antes del cierre: `origin/nightly@8b4a7e4f`.
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
| Mayor chunk JS cargado por overlay | 2.000,85 kB | 936,48 kB | -53,2 % |
| Entrada + preloads JS estáticos del HTML | 2.000,85 kB | 203,71 kB | -89,8 % |
| gzip del mayor chunk | 542,49 kB | 255,04 kB | -53,0 % |

La ruta dinámica aún necesita módulos compartidos de edición importados por
`CompositeApp`; ese archivo está reservado a #936 y no se modificó. No existe
`pyftsubset` en esta máquina, por lo que CascadiaCode continúa como TTF de
387,94 kB. TODO: generar y validar un subset woff2 cuando haya tooling aprobado.

## Corridas HubMin

Las corridas contaminadas realizadas antes de la coordinación de máquina se
descartaron y no se usan en esta tabla. Ninguna corrida aceptada usó `-Forzar`.

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
| 3, repetición | 81,49 | 44,98 | 174,11 | 22,53 | 2,87 | 69,54 | 126,58 | 522,10 |
| 3, registro empujado | 72,94 | 44,27 | 139,09 | 22,68 | 2,85 | 0,00 | 148,17 | 430,00 |

L3 quedó 18,76 MiB (-3,5 %) por debajo de L1, pero permanece 122,25 MiB por
encima del objetivo ≤393 MiB y no representa el lifecycle deseado. Artefactos
crudos: `results/isa-940-full-l3/hubmin-20260830-010413.csv` y
`results/isa-940-full-l1/hubmin-20260830-011056.csv`. PresentMon observó 0/4168
y 0/6494 frames perdidos respectivamente.

La repetición física posterior al probe dirigido tampoco destruyó el Hub:
`hub:can-suspend` agotó dos veces los 500 ms y el renderer Hub siguió presente.
CDP midió 2.199,51 ms al reabrir y el log Go 2,362 s. PresentMon observó
0/5871 frames perdidos. Artefacto crudo:
`results/isa-940-full-l3-repeat/hubmin-20260830-012549.csv`.

La corrida final sustituyó la consulta posterior a minimizar por un registro
empujado y ligado a la generación de la ventana. El frontend publicó el estado
limpio a las 23:56:54Z; el Hub se minimizó a las 23:57:09Z y no apareció ningún
`renderer-hub` en las 120 muestras. CDP midió 328,89 ms hasta el nuevo target y
Go 99,14 ms para crear/abrir la ventana. PresentMon observó 0/9.244 frames
perdidos. Una muestra de contadores GPU fue inválida y quedó nula, no rellenada
con cero. Artefacto crudo:
`results/isa-940-full-l3-pushed/hubmin-20260830-015652.csv`.

El total final es 430,00 MiB. Utility suma dos PID (13,79 + 8,89 = 22,68 MiB)
y la tabla ya presenta ese coste conjunto; no debe duplicarse otra vez al sumar
el árbol. El gate ≤393 MiB queda incumplido por 37,00 MiB. La proyección previa
de ~453 MiB suponía que todos los procesos salvo el Hub conservarían la media
de la repetición anterior; la corrida real bajó sobre todo GPU process de
174,11 a 139,09 MiB, por eso el resultado observado es mejor, pero no alcanza
el contrato.

El incremento inicial del host Go no se reprodujo como memoria estable. En L1
su privada fue media 75,02, p50 72,81 y p95 76,67 MiB; en la primera L3 fue
media 104,23, p50 78,07 y p95 298,56 MiB; en la repetición fue media 81,49,
p50 74,19 y p95 109,46 MiB. La repetición comenzó en 74,88 y terminó en
85,90 MiB, con un pico aislado de 191,97 MiB. Esto demuestra que los +29 MiB
de media procedían de picos transitorios (GC/reservas del runtime), no de una
retención estable específica de nivel 3. No se atribuye a heap Go mediante
`VANTARE_CPU_PROFILE_PATH`: ese gancho produce perfil de CPU, no heap, y usarlo
como prueba de memoria sería incorrecto.

### Aritmética del límite

La repetición anterior sumaba 522,10 MiB privados. Incluso eliminando por completo el
renderer Hub (69,54 MiB), el mismo árbol quedaría en aproximadamente
452,56 MiB: todavía 59,56 MiB por encima del gate de 393 MiB. Por tanto el gate
12.2 no es alcanzable con este corte aunque se arregle el ACK.

| Coste L3 repetido | MiB | Lectura y siguiente palanca |
|---|---:|---|
| GPU process | 174,11 | Mayor coste; es infraestructura WebView2 compartida. Requiere medir y reducir superficies/rasterización/composición del overlay, no puede eliminarse mientras el overlay visual siga activo. |
| Renderer overlay (`renderer-unassigned`) | 126,58 | Revisar el grafo runtime que aún entra por `CompositeApp` y desmontar módulos/estado no usados; esos archivos están reservados a #936 y no se tocaron aquí. |
| Go host | 81,49 media; 74,19 p50 | No muestra la fuga de +29 MiB. Para bajar más habría que perfilar heap con un gancho específico y separar reservas de telemetría/sensor; el perfil CPU existente no sirve. |
| Browser | 44,98 | Base del entorno WebView2; solo una decisión arquitectónica distinta o flags soportados podrían recortarlo. |
| Utility | 22,53 | Dos servicios WebView2; coste estructural a validar junto con browser/GPU. |
| Crashpad | 2,87 | Marginal. |

La proyección conservadora de este hito, si el Hub llegaba a cero sin mover los
otros procesos, era ~453 MiB (-19,4 % frente a 562 MiB). La corrida final con
Hub a cero observó 430,00 MiB (-23,5 %), todavía no ≤393 MiB (-30 %). Cambiar
el gate no forma parte de #940 y queda expresamente en manos de Isaac.

El banco conserva `renderer-unassigned` para el renderer creado tras abrir el
overlay: CDP prueba el target `overlay.html` y sus tres widgets, pero no aporta
una relación PID↔target suficiente para renombrarlo sin inferencia.

## Evidencia funcional

- Wails v3 alpha.98 no contiene `TrySuspend` ni una API de suspensión de
  CoreWebView2. Se usa destrucción fail-closed y recreación bajo demanda.
- `hub:can-suspend` espera hasta 500 ms. Un registro central bloquea por Studio
  sucio, borrador del Launcher u OAuth pendiente y devuelve todas las razones.
  El intento antiguo emitió desde Go a `1788047641790/1791` ms, venció a los
  500 ms y no produjo recepción/respuesta JS ni siquiera tras restaurar el Hub
  durante 5 s. Subir el timeout no arregla esa carrera. El camino efectivo
  publica `hub:blockers` mientras el Hub está visible y en cada cambio; Go solo
  destruye si recibió el snapshot limpio de la generación actual. Sin snapshot,
  con generación vieja o con cualquier razón, conserva fail-closed el Hub.
- Un ACK tardío solo destruye la misma ventana, de la misma generación y aún
  minimizada; `Open()` invalida el intento pendiente.
- `/overlay?profile=…` sirve `overlay.html`, conserva `ObsOverlayApp` y los
  contratos SSE, sin cargar la entrada principal.
- En la primera corrida L3 fallida, CDP midió 10.389 ms desde `hub:open` hasta
  el target y el log Go 8,846 s. La repetición con probe dirigido bajó a
  2.199,51 ms / 2,362 s, pero siguió siendo una restauración del Hub conservado,
  no una recreación validada.
- Bounding box: un clúster usa su unión más 16 px; widgets en esquinas opuestas
  saturan al monitor completo; DPI convierte primero a coordenadas lógicas de
  Wails; edición fuerza el monitor completo. Guardar Ajustes aplica 1↔3 a la
  ventana activa y recalcula una sola vez por transición.
- Ingeniero: en 4–5 no publica presentación visual ni subtítulos y mantiene la
  reproducción de audio.
- Windows: 4–5 aplica `PROCESS_POWER_THROTTLING_EXECUTION_SPEED` y prioridad
  below-normal; 1–3 revierte ambos.

### Auditoría de estado local del Hub

Se revisaron todas las secciones que monta `HubApp` y sus diálogos. El criterio
fue bloquear solo trabajo del usuario que se perdería al destruir el WebView;
filtros, pestañas, búsquedas y estados de carga reproducibles no son borradores.

| Pantalla | Estado revisado | Veredicto |
|---|---|---|
| Estrategia | Asistente, crear/editar evento, selección de calendario, disponibilidad e inputs de planificación | Bloqueadores `strategy-event-draft`, `strategy-availability-draft` y uno por input hasta aplicar. El resto de cambios del plan usa `commit` inmediato. |
| Launcher | Editor de perfiles, alta manual de aplicación, búsqueda y confirmación de borrado | El editor ya bloqueaba; se añade `launcher-add-app-draft` desde ruta/nombre/selector. Búsqueda y confirmación no contienen trabajo editable. |
| Acceso y cuenta | Email/contraseña/reset, OAuth, checkout externo y paywall | Se añaden `auth-form-draft` y `billing-checkout-pending`; OAuth ya publica `oauth-pending`. Nunca se publica el contenido de una credencial. |
| Onboarding | Rol de la bienvenida beta | `onboarding-role-draft` desde la primera selección hasta completar. |
| Overlay Studio | Documento, crear/renombrar perfil, guardar diseño, dimensiones del lienzo, importación de fondo y diálogos de catálogo/confirmación | El documento ya bloqueaba por dirty; se cubren los campos locales y la lectura del fondo. Catálogo, recuperación y confirmaciones no contienen texto editable sin persistir. |
| Testing Center | Informe con autosave y formulario de rechazo | Se bloquea el intervalo sucio/debounce/error hasta guardar y el rechazo hasta enviar o descartar. |
| Ajustes | Apariencia, idioma, inicio, notificaciones, hotkeys, updater, almacenamiento, privacidad e importación de calendario | Sin borrador: los controles guardan en cada gesto; una combinación hotkey válida se guarda al capturarla. La importación se reconstruye desde inbox o borrador backend y su fuente es de solo lectura. |
| Inicio, Carreras, Telemetría, Ingeniero y Roadmap | Filtros, selección, paneles, zoom y preferencias | Sin pérdida de datos: son navegación/visualización o preferencias persistidas inmediatamente. |
| Operaciones largas | Diagnóstico, cold-start de Estrategia, actualización y procesos del Launcher | El trabajo vive en backend/proceso y se reconsulta; no depende del estado React para continuar. |

## Límites de esta evidencia

- El ACK dirigido posterior a minimizar se conserva solo como diagnóstico y no
  participa en la decisión. `DispatchWailsEvent` y `WebviewWindow.EmitEvent`
  agotaron 500 ms con WebView2 minimizado. Se probó despertar el WebView oculto,
  pero eventos duplicados de Wails provocaron un bucle; la corrida se abortó,
  la sesión ETW se cerró y ese cambio fue revertido.
- El p95 de 298,56 MiB observado en el primer host L3 merece un gancho de heap
  (`inuse_space`/`runtime.MemStats` detallado) en otra issue. #940 solo dispone
  del gancho CPU y la repetición/final no reprodujeron retención estable.
- También quedan captura de paridad visual, escucha humana del audio, baseline
  N=3, iGPU y VR.
- Un warning aislado de contador GPU en las corridas descartadas no se rellena
  con datos sintéticos; las corridas limpias deben conservar cualquier ausencia.
