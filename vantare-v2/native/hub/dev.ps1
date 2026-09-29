<#
Hub/Workshop GPUI: recompila y reabre conservando selección.
Solo procesos y copia de ejecutable de esta sesión; nunca inicia juego ni núcleo.
#>
#requires -Version 7
param(
    [string]$DataDir = (Join-Path $env:LOCALAPPDATA 'VantareNative/hub'),
    [string]$Scene
)
$ErrorActionPreference = 'Stop'
$nativeRoot = Split-Path $PSScriptRoot
$runDir = Join-Path ([IO.Path]::GetTempPath()) ('vantare-hub-dev-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($runDir)
$copy = Join-Path $runDir 'vantare-hub.exe'
$running = $null
$firstStart = $true

function Build-Hub {
    Push-Location $nativeRoot
    try {
        & cargo build --offline -j 2 -p vantare-hub
        if ($LASTEXITCODE -ne 0) { throw 'Build falló; se conserva la ventana anterior.' }
    } finally { Pop-Location }
}
function Stop-Hub {
    if ($script:running -and -not $script:running.HasExited) {
        $script:running.StandardInput.Close()
        if (-not $script:running.WaitForExit(5000)) {
            Write-Warning 'Hub no terminó en 5 s; se fuerza su cierre. Revisar selección y errores de guardado.'
            $script:running.Kill()
            [void]$script:running.WaitForExit(5000)
        }
        if ($script:running.ExitCode -ne 0) { throw 'Hub terminó con error; revisar stderr y datos antes de reabrir.' }
    }
}
function Start-Hub {
    Copy-Item -LiteralPath (Join-Path $nativeRoot 'target/debug/vantare-hub.exe') -Destination $copy -Force
    $info = [Diagnostics.ProcessStartInfo]::new($copy)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.ArgumentList.Add('--workshop')
    $info.ArgumentList.Add('--control-stdin')
    $info.ArgumentList.Add('--data-dir')
    $info.ArgumentList.Add([IO.Path]::GetFullPath($DataDir))
    if ($Scene -and $script:firstStart) {
        $info.ArgumentList.Add('--scene')
        $info.ArgumentList.Add([IO.Path]::GetFullPath($Scene))
    }
    $script:running = [Diagnostics.Process]::Start($info)
    $script:firstStart = $false
}
function Source-Stamp {
    $roots = @('hub/src', 'ui/src', 'domain/src', 'ui/assets') | ForEach-Object { Join-Path $nativeRoot $_ }
    $files = @($roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File })
    $files += Get-Item -LiteralPath (Join-Path $nativeRoot 'hub/Cargo.toml'), (Join-Path $nativeRoot 'Cargo.toml')
    return (($files | Sort-Object FullName | ForEach-Object { '{0}:{1}:{2}' -f $_.FullName, $_.Length, $_.LastWriteTimeUtc.Ticks }) -join '|')
}
try {
    Build-Hub
    Start-Hub
    $stamp = Source-Stamp
    while (-not $running.HasExited) {
        Start-Sleep -Milliseconds 500
        $next = Source-Stamp
        if ($next -eq $stamp) { continue }
        $stamp = $next
        try {
            Build-Hub
            Stop-Hub
            Start-Hub
            $stamp = Source-Stamp
        } catch { Write-Warning $_ }
    }
} finally {
    try { Stop-Hub } finally {
        if (Test-Path -LiteralPath $copy) { Remove-Item -LiteralPath $copy -Force }
        Remove-Item -LiteralPath $runDir
    }
}
