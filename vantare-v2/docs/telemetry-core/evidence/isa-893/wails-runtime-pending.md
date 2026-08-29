# ISA-893 — revalidación Wails/LMU del catálogo completo

## Estado

La aceptación física del HEAD corregido tras la review de PR #941 está
pendiente. El 2026-08-30 LMU y Vantare estaban cerrados, por lo que no se lanzó
la aplicación ni se sustituyó la telemetría real por fixtures, replay o datos
sintéticos.

Existe una captura histórica real obtenida el 2026-08-29 sobre `cbfb63b8`: LMU
estaba en práctica en Spa con 37 coches, una build propia recibió 231 frames V2
y pintó 20/20 widgets sin diagnósticos. Esa corrida permitió corregir el tipo
`track-map`, pero es anterior a los arreglos P1.1–P1.5 y P2 de la review. Por
tanto, no acredita el HEAD actual y sus JSON/PNG no se versionan como evidencia
final.

La sonda fail-closed está preparada en `capture-wails-v2.mjs`. Exige los 20
tipos, dimensiones pintadas, cero errores de renderer, cero diagnósticos de
autoridad y al menos un frame Overlay V2 live decodificado.

## Precondiciones manuales

1. Abrir LMU en una sesión real con el coche del jugador presente. No cerrar,
   reiniciar ni interactuar con LMU desde la prueba.
2. Confirmar que no hay otra medición Vantare. `PresentMon-x64` no bloquea la
   prueba porque Radeon mantiene una instancia permanente.
3. Ejecutar desde `C:\tmp\vantare-isa893\vantare-v2` con el worktree limpio y
   el HEAD exacto ya publicado en PR #941.

```powershell
$competidores = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -like 'vantare*' }
$competidores | Select-Object ProcessName, Id, Path
if ($competidores) { throw 'Hay otro vantare-*.exe activo; no iniciar la prueba.' }
```

## Build y arranque propios

La build diagnóstica conserva CDP; su nombre proporciona un user-data WebView2
separado bajo `%APPDATA%\vantare-isa893.exe\EBWebView`. El directorio de
trabajo también es exclusivo de esta corrida.

```powershell
corepack pnpm --dir frontend build
go build -o bin/vantare-isa893.exe ./cmd/vantare

$runtimeIsa893 = 'C:\tmp\vantare-isa893-runtime-final'
New-Item -ItemType Directory -Force -Path $runtimeIsa893 | Out-Null
$env:VANTARE_WEBVIEW_DEBUG_PORT = '9243'
$appIsa893 = Start-Process -FilePath '.\bin\vantare-isa893.exe' `
  -ArgumentList @('-profile', 'C:\tmp\vantare-isa893\vantare-v2\testdata\bench\huella-completo.json', '-http', '127.0.0.1:29243') `
  -WorkingDirectory $runtimeIsa893 -WindowStyle Normal -PassThru
Remove-Item Env:VANTARE_WEBVIEW_DEBUG_PORT

$deadlineIsa893 = (Get-Date).AddSeconds(30)
do {
  try {
    $null = Invoke-RestMethod 'http://127.0.0.1:9243/json/version' -TimeoutSec 1
    $cdpIsa893 = $true
  } catch {
    $cdpIsa893 = $false
    Start-Sleep -Milliseconds 250
  }
} until ($cdpIsa893 -or (Get-Date) -ge $deadlineIsa893)
if (-not $cdpIsa893) { throw 'CDP 9243 no respondió en 30 s.' }
```

## Captura exigida

El primer helper abre el perfil activo por el mismo evento Wails que usa el
Hub. El segundo guarda la captura solo si pasa todas las aserciones de
autoridad y pintado.

```powershell
node scripts/bench/huella-cdp.mjs `
  --cdp http://127.0.0.1:9243 `
  --action overlay-start `
  --duration 10 `
  --expected-widgets 20 `
  --output docs/telemetry-core/evidence/isa-893/wails-overlay-start.json

node docs/telemetry-core/evidence/isa-893/capture-wails-v2.mjs `
  --cdp http://127.0.0.1:9243 `
  --output docs/telemetry-core/evidence/isa-893/wails-v2-live.json `
  --screenshot docs/telemetry-core/evidence/isa-893/wails-v2-live.png
```

La evidencia final debe registrar el SHA/commit exacto, hash SHA-256 del exe,
PID, puerto CDP `9243`, HTTP `29243`, user-data observado y estos 20 códigos:

```text
delta
standings
relative
pedals
broadcast-tower
fuel-strategy
pedals-telemetry
pedals-telemetry-compact
racing-flags
delta-trace
race-schedule
head-to-head
delta-advanced
input-telemetry
multiclass-relative
track-weather
car-damage-visual
car-damage-numbers
engineer-radio
track-map
```

Además debe conservar el JSON de apertura, el JSON de autoridad, el PNG del
overlay completo, el contador de frames V2 live y cualquier diagnóstico
visible. Si aparece un `role="alert"`, un `data-diagnostic-code`, un error de
renderer o menos de 20 tipos, la prueba falla y no se presenta como evidencia
de aceptación.

## Cierre e higiene

Se cierra la build propia mediante Wails/CDP y se verifica el PID exacto. No se
mata ningún proceso por patrón y no se toca LMU.

```powershell
node scripts/bench/huella-cdp.mjs `
  --cdp http://127.0.0.1:9243 `
  --action app-quit `
  --output docs/telemetry-core/evidence/isa-893/wails-app-quit.json

Wait-Process -Id $appIsa893.Id -Timeout 15 -ErrorAction SilentlyContinue
if (Get-Process -Id $appIsa893.Id -ErrorAction SilentlyContinue) {
  throw "La build propia PID $($appIsa893.Id) no se cerró; revisar sin usar cierre por patrón."
}
if (Get-NetTCPConnection -LocalPort 9243 -State Listen -ErrorAction SilentlyContinue) {
  throw 'El puerto CDP 9243 sigue escuchando.'
}
```

## Qué queda por demostrar

Solo falta ejecutar el procedimiento anterior con LMU real abierto sobre el
HEAD corregido y versionar sus salidas. Los tests, builds y CDP sin juego no
pueden sustituir esa prueba física.
