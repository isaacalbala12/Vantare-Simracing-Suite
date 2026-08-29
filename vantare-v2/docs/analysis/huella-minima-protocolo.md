# Huella mínima · protocolo del banco F0

Issue: GitHub #924. Spec: `docs/superpowers/specs/2026-08-28-huella-minima-niveles-rendimiento-spec.md` (§2, §8, §12 y §16 Issue A).

## Objetivo y límite de la evidencia

El banco mide el coste del árbol propio de Vantare y el frametime de Le Mans
Ultimate sin atribuir al overlay un proceso que no existe. El overlay es una
segunda `WebviewWindow` del mismo host: su coste marginal es **A1 − A0**.

Una corrida corta solo prueba el banco. El baseline aceptable exige 180 s,
tres repeticiones por condición, el mismo SHA y escena, y ruido ≤ 5 %. Chromium,
tests o `-DryRun` no sustituyen una corrida Wails/LMU real.

## Preparación

1. Compilar una build diagnóstica con nombre propio y sin `-tags production`:

   ```powershell
   corepack pnpm --dir frontend build
   go build -o bin/vantare-isa924.exe ./cmd/vantare
   ```

   El nombre propio crea `...\vantare-isa924.exe\EBWebView`; el banco usa esa
   ruta para excluir WebView2 de Windows, Edge y otras builds de Vantare.

2. Instalar PresentMon 2.x y abrir una consola nueva:

   ```powershell
   winget install --id Intel.PresentMon -e
   Get-Command PresentMon.exe
   PresentMon.exe --help
   ```

   En el PC de referencia, el MSI 2.5.1 de `winget` devolvió código 1620. La
   alternativa usada fue el ejecutable x64 oficial del mismo release, con
   SHA-256 verificado, instalado como
   `%LOCALAPPDATA%\Programs\PresentMon\PresentMon.exe` y añadido al `PATH` de
   usuario. `huella.ps1` añade esa ruta al `PATH` de usuario de forma
   persistente y resuelve exclusivamente `PresentMon.exe`.

3. Preparar LMU: coche parado en pista, fuera de boxes, motor en marcha y la
   parrilla máxima de IA rodando. Mantener circuito, hora, clima, resolución,
   DPI, ajustes gráficos y HUD idénticos entre corridas.

4. Cerrar manualmente Edge, WebView2 de aplicaciones y otras builds Vantare.
   Los WebView2 del shell cuyo `--user-data-dir` vive bajo
   `AppData\Local\Packages\Microsoft*` quedan permitidos: usan browser/GPU
   process propios y el CSV/resumen registra su conteo y rutas como
   `systemWebView2`. Cualquier otro Edge/WebView2/Vantare bloquea; el script lo
   lista y aborta, sin matar procesos. `-Forzar` solo sirve para un smoke
   consciente contaminado y nunca para una corrida publicable. Si se usa, el
   CSV conserva
   `hygieneForced=true`, `publishable=false` y el inventario completo de
   procesos ajenos; el Markdown muestra un banner y el agregador rechaza la
   corrida para la tabla final.

5. Usar un puerto CDP libre y distinto de 9222/9231. El script también asigna
   a su build un puerto HTTP/OBS derivado para no colisionar con otra Vantare.

## PresentMon y Radeon Software

PresentMon 2.x permite varias capturas simultáneas cuando cada una usa un
`--session_name` distinto. Radeon Software mantiene `RSXTraceSession`; el banco
usa `VantareHuella-<pid>-<fecha>`, por lo que ambas sesiones pueden convivir.

Flags exactos del banco:

```text
--process_name "Le Mans Ultimate.exe"
--output_file <corrida>-presentmon.csv
--v2_metrics
--timed 180
--terminate_after_timed
--session_name VantareHuella-<pid>-<fecha>
--no_console_stats
```

No se usa `--stop_existing_session`: nunca se debe detener `RSXTraceSession` ni
otra captura. Si el host rechaza sesiones ETW concurrentes, cerrar Radeon
Software manualmente, registrar esa variante y repetir todas las condiciones
con el mismo estado.

PresentMon puede avisar que algunas métricas requieren privilegios elevados.
Para este protocolo la elevación es opcional: la captura v2 de frametime puede
funcionar en una consola normal. Se valida el resultado, no el texto del aviso:
el CSV debe contener al menos un frame válido.

Cada captura posee `VantareHuella-<pid>-<fecha>`. El bloque `finally` termina el
PresentMon propio y pide `logman stop <sesión> -ets`, también ante excepciones o
`Ctrl+C`. Un kill forzado del proceso PowerShell puede impedir ejecutar ese
`finally`; por eso la siguiente corrida consulta `logman query -ets`, conserva
sesiones cuyo PID aún corresponde a un proceso Vantare vivo y detiene las
huérfanas antes de lanzar la app. Los nombres recuperados quedan en
`orphanEtwSessionsStopped`. Si `logman query` falla por el proveedor WMI del
host, el banco completa la enumeración con `Get-EtwTraceSession`; al detener,
`Stop-EtwTraceSession` es también el fallback de `logman stop`.

## Condiciones

| Condición | Overlay | Hub | Aplicación automática |
|---|---|---|---|
| `A0` | detenido | visible | CDP pide `overlay:stop` si estaba abierto |
| `A1` | activo | visible | CDP emite `overlay:start-active` por el runtime Wails y registra el instante exacto |
| `HubVisible` | activo | restaurado | `ShowWindowAsync(..., SW_RESTORE)` |
| `HubMin` | activo | minimizado | `ShowWindowAsync(..., SW_MINIMIZE)` |

El helper identifica el overlay por URL exacta `http://wails.localhost/` y
marcadores runtime; el Hub usa `http://wails.localhost/#/hub`. Antes de abrir el
overlay conserva los PID renderer ya observados del Hub. Tras emitir
`overlay:start-active` desde un estado inicial detenido, espera el target `/` y
el número exacto de widgets del perfil. El renderer creado dentro de esa
ventana y que no pertenece al Hub se
marca `renderer-overlay`. Si aparecen varios, el endpoint browser de CDP
(`/json/version`) y `SystemInfo.getProcessInfo` limitan los candidatos a PID de
tipo renderer y se elige el de creación más reciente; empate o falta de prueba
queda como `renderer-unassigned`. Sin arranque de overlay no se atribuye ningún
renderer a ese rol. Cuenta
`[data-testid="runtime-widget-frame"]` y mide rAF/s y long tasks
durante 10 s. El banco espera primero al target Hub y, al arrancar el overlay,
no inicia PresentMon ni el muestreo hasta ver exactamente los widgets
habilitados por el perfil. Un timeout incluye las URLs de todos los targets.

## Ejecución

Validación sin lanzar nada:

```powershell
pwsh -File scripts/bench/huella.ps1 -DryRun `
  -Condicion A1 `
  -Exe bin/vantare-isa924.exe `
  -Perfil testdata/bench/huella-endurance-3.json `
  -Duracion 180 `
  -Puerto 9247 `
  -Juego "Le Mans Ultimate" `
  -Salida results/
```

Corrida real (repetir tres veces por condición, sin `-Forzar`):

```powershell
pwsh -File scripts/bench/huella.ps1 `
  -Condicion A1 `
  -Exe bin/vantare-isa924.exe `
  -Perfil testdata/bench/huella-endurance-3.json `
  -Duracion 180 `
  -Puerto 9247 `
  -Juego "Le Mans Ultimate" `
  -Salida results/isa-924-pc-principal/
```

Cada corrida conserva CSV combinado, CSV PresentMon, JSON CDP, logs y resumen
Markdown. El CSV muestrea a 1 Hz Private Bytes, Working Set, CPU como porcentaje
de máquina, GPU Engine y memoria GPU dedicada por proceso/rol; el árbol propio
se redescubre cada 5 s sin perder los roles de renderer. Cada fila registra
`gpuSampleValid`; si Windows no entrega los contadores en una muestra, sus
valores GPU quedan vacíos y el agregador la excluye de medias y percentiles en
vez de convertirla en cero. PresentMon aporta
frametime y considera perdido un frame v2 cuando `DisplayedTime` es `NA` (no
llegó a pantalla), publicando recuento y porcentaje. Si no aparece ningún frame
válido, el CSV combinado registra `gameFrametimeValid=false`, el Markdown marca
el frametime como no publicable y conserva válidas las métricas RAM/CPU/GPU de
Vantare. La build arranca desde `<corrida>-runtime/configs`, por lo que sus
refrescos y datos de desarrollo no escriben en `configs/` versionado ni en la
configuración real del usuario. La aplicación se cierra mediante
`Application.Quit()`; el kill
forzado queda limitado al PID de la build propia si el cierre limpio falla.

Para juntar las tres corridas de una condición:

```powershell
node scripts/bench/huella-resumen.mjs `
  --condition A1 `
  --output results/isa-924-pc-principal/a1-final.md `
  results/isa-924-pc-principal/a1-1.csv `
  results/isa-924-pc-principal/a1-2.csv `
  results/isa-924-pc-principal/a1-3.csv
```

El resumen calcula media, desviación muestral y ruido (`desv/media`) por rol y
métrica; con menos de tres corridas marca `INSUFICIENTE / NO PUBLICABLE` y con
tres o más marca `✗` cuando supera 5 %. Para el juego muestra p50/p95/p99,
frames perdidos y porcentaje.

## Tabla baseline (§8)

Estado inicial: vacía hasta ejecutar 180 s × 3. No completar con smokes.

| Hardware | SHA | Condición | Perfil | N | Go host CPU % / privada MiB / WS MiB | Browser CPU % / privada MiB / WS MiB | GPU process CPU % / privada MiB / WS MiB | Renderer Hub CPU % / privada MiB / WS MiB | Renderer Overlay CPU % / privada MiB / WS MiB | Utilities CPU % / privada MiB / WS MiB | GPU Engine % / dedicada MiB | Juego frametime p50 / p95 / p99 ms | Frames perdidos | Ruido máx. | Gate |
|---|---|---|---|---:|---|---|---|---|---|---|---|---|---:|---:|:---:|
| PC principal · dGPU | — | A0 | Endurance 3 | 0/3 | — | — | — | — | n/a | — | — | — | — | — | pendiente |
| PC principal · dGPU | — | A1 | Endurance 3 | 0/3 | — | — | — | — | — | — | — | — | — | — | pendiente |
| PC principal · dGPU | — | HubVisible | Endurance 3 | 0/3 | — | — | — | — | — | — | — | — | — | — | pendiente |
| PC principal · dGPU | — | HubMin | Endurance 3 | 0/3 | — | — | — | — | — | — | — | — | — | — | pendiente |

Repetir la misma matriz con `huella-completo.json`, portátil iGPU y VR cuando
estén disponibles. Sin iGPU no se aprueban niveles 4–5 ni composición.

## Gates del banco

```powershell
node --test scripts/bench
pwsh -File scripts/bench/huella.ps1 -DryRun -Condicion A1 -Exe bin/vantare-isa924.exe -Perfil testdata/bench/huella-endurance-3.json -Duracion 180 -Puerto 9247 -Juego "Le Mans Ultimate" -Salida results/
corepack pnpm --dir frontend test -- profile-document
corepack pnpm --dir frontend typecheck
git diff --check
```

Rechazar la evidencia si falta CSV crudo, SHA, tres repeticiones, roles
separados, PresentMon o si cualquier ruido supera 5 %. A1 − A0 es la única
atribución válida del coste marginal del overlay Wails.
