# Propuesta de QA de Hub instalado · #1697 / VANTA-105

PR draft independiente de #1694. El workflow nuevo solo responde a PR hacia
nightly; el job se limita a la rama de esta propuesta y se omite mientras
el PR sea draft. No añade compilaciones costosas a otros PR. No modifica workflows,
rulesets ni checks requeridos existentes. Pasarlo a ready requiere la revisión
del orquestador y que #1694 esté integrado. No se ha ejecutado esta propuesta
en una VM hosted; ni su viabilidad gráfica ni hub-ready están acreditados.

El job windows-latest compila desde su checkout todos los EXE Release y el
Setup propio con DuckDB bundled/CRT estático. Instala el Setup recién generado,
verifica el manifiesto y lanza exclusivamente el Hub instalado desde un CWD
vacío. Exige marker nuevo con PID real, ventana y cierre exit0 mediante EOF.
Guarda adaptadores, hash/procedencia, stdout/stderr, exit code y desinstala.
No escribe markers, no usa capturas/demo ni fallback al checkout de Release.
Es QA local sin configuración beta: login y pagos quedan sin probar.
Los artefactos de evidencia de Actions duran siete días; no publica releases,
Setup en Downloads ni firma. La instalación solo se permite en un runner
GitHub-hosted efímero, nunca en el escritorio principal del servidor.

## WARP y límite del backend actual

`native/vendor/gpui_windows/src/directx_devices.rs` enumera DXGI y elige el
primer adaptador con D3D11/StructuredBuffer compatible; no excluye software.
`directx_renderer.rs::gpu_specs` reconoce DXGI_ADAPTER_FLAG_SOFTWARE. No hay
variable de producción para forzar WARP, ni llamada a EnumWarpAdapter en esa
ruta. GPUI_DISABLE_DIRECT_COMPOSITION cambia composición, no el adaptador.
No se cambia el backend ni se inventa una variable GPUI para esta propuesta.

Microsoft documenta el adaptador WARP en la enumeración DXGI desde Windows 8:
[DXGI overview](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/d3d10-graphics-programming-guide-dxgi)
y [WARP guide](https://learn.microsoft.com/en-us/windows/win32/direct3darticles/directx-warp).
Esto permite intentar el camino existente en una VM sin GPU. La precondición
del job exige que **todos** los adaptadores enumerados tengan el flag software:
así un éxito del Hub no puede atribuirse a una GPU hardware elegida primero.
Si hay hardware, no se deshabilitan drivers: el job falla con diagnóstico.
Si DirectX/composición no funciona en la sesión hosted, también falla;
no convierte una omisión en aprobación. El runner trae herramientas/VC Runtime:
esta prueba no demuestra por sí sola ausencia del redistribuible ni sustituye
la inspección estática de imports de #1692.

## QA física de Isaac cuando autorice su PC

1. Usar un Windows 10/11 x64 limpio o un usuario estándar nuevo dedicado a QA,
   con sesión interactiva y driver gráfico operativo. No ejecutar estos pasos
   en la sesión del servidor. Registrar versión Windows, GPU y driver.
2. Copiar solo Setup y su `.sha256` desde `share/rc1/hub-1694` a una carpeta
   local. Comprobar `Get-FileHash .\VantareSetup.exe -Algorithm SHA256` contra
   el sidecar y registrar `PROCEDENCIA.json`. Esa build es QA sin servicios;
   para aceptar login/pagos hace falta otra build con configuración beta pública
   autorizada. No leer ni copiar claves de producción.
3. En PowerShell, instalar con
   `Start-Process .\VantareSetup.exe -ArgumentList '/S' -Wait -PassThru`.
   Exigir ExitCode 0. La raíz es `$env:LOCALAPPDATA\Programs\Vantare`.
4. Leer `state.json`, obtener `active.generation` y localizar
   `generations\<generation>\bin\vantare-hub.exe`. Comprobar que existe
   `bin\fixtures\standings-design-system.sequence.json`. Crear un CWD vacío
   fuera de cualquier checkout y usarlo para el siguiente lanzamiento.
5. Establecer `$env:VANTARE_BETA_ROOT` a la raíz. Usar ProcessStartInfo con
   `UseShellExecute=false`, redirección de stdin/stdout/stderr y argumentos
   `--control-stdin --data-dir "<raíz>\data"`. Conservar ambos streams con
   `ReadToEndAsync`. No usar `--demo`, escenas ni capturas.
6. Esperar como máximo 90 segundos: el archivo `<raíz>\hub-ready` debe ser
   nuevo, contener exactamente el PID lanzado y el Hub mostrar ventana Home.
   Guardar marker, PID, captura si Isaac lo permite y stderr. Cerrar stdin,
   esperar como máximo 20 segundos y exigir ExitCode 0. Si no llega, guardar
   stderr/HRESULT y exit code; no crear marker a mano ni declarar aprobado.
7. Crear un archivo testigo en `<raíz>\data`, ejecutar `Uninstall.exe /S` con
   espera y exigir exit0, retirada del registro y binarios y conservación del
   testigo. Guardar resultados en evidencia VANTA-105. Borrar solo el usuario
   y datos de QA propios al terminar, con autorización de Isaac.

Comando para los pasos 4–6, en PowerShell 7 de la sesión QA autorizada, tras
instalar y situarse en una carpeta de evidencia nueva (sin checkout):

```powershell
$root = Join-Path $env:LOCALAPPDATA 'Programs/Vantare'
$state = Get-Content (Join-Path $root 'state.json') -Raw | ConvertFrom-Json
$hub = Join-Path $root ('generations/' + $state.active.generation + '/bin/vantare-hub.exe')
$ready = Join-Path $root 'hub-ready'
if (Test-Path -LiteralPath $ready) { throw 'Ya hay marker; usar instalación limpia' }
$cwd = Join-Path (Get-Location) 'empty-cwd'
$null = New-Item -ItemType Directory -Path $cwd
$psi = [Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $hub
$psi.ArgumentList.Add('--control-stdin')
$psi.ArgumentList.Add('--data-dir')
$psi.ArgumentList.Add((Join-Path $root 'data'))
$psi.Environment['VANTARE_BETA_ROOT'] = $root
$psi.WorkingDirectory = $cwd
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [Text.Encoding]::UTF8
$started = [DateTime]::UtcNow
$p = [Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEndAsync()
$err = $p.StandardError.ReadToEndAsync()
$ok = $false
$forced = $false
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    do {
        $p.Refresh()
        if ((Test-Path -LiteralPath $ready) -and
            (Get-Item -LiteralPath $ready).LastWriteTimeUtc -ge $started -and
            [IO.File]::ReadAllText($ready).Trim() -ceq [string]$p.Id -and
            $p.MainWindowHandle -ne [IntPtr]::Zero) { $ok = $true; break }
        if ($p.HasExited) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
} finally {
    $p.StandardInput.Close()
    if (-not $p.WaitForExit(20000)) { $forced = $true; $p.Kill(); $p.WaitForExit() }
    [IO.File]::WriteAllText((Join-Path (Get-Location) 'hub.stdout.log'), $out.Result)
    [IO.File]::WriteAllText((Join-Path (Get-Location) 'hub.stderr.log'), $err.Result)
    $code = $p.ExitCode
    @{ pid=$p.Id; hub_ready=$ok; exit=$code; forced=$forced } |
        ConvertTo-Json | Set-Content hub-result.json
    $p.Dispose()
}
if (-not $ok -or $forced -or $code -ne 0) { throw 'Hub no acreditado: conservar logs' }
```

El servidor acreditó recursos/manifiesto, pero su escritorio privado terminó
con exit1, sin hub-ready: DirectX resources 0x8007000E. Es compatible con una
limitación gráfica/memoria de escritorio del entorno; no demuestra por sí solo
un defecto de producto ni un lanzamiento correcto. No hay otra VM autorizada.
