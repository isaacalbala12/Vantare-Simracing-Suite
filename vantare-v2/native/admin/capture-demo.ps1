# Captura física demo, sin compilar ni tocar cuentas. Evidencia fuera del repo.
param(
    [string]$Executable = (Join-Path $PSScriptRoot '../target/debug/vantare-admin.exe'),
    [string]$Out = 'C:/tmp/isa-1456-evidence',
    [string]$ReviewedNotesHash = '',
    [ValidateSet('users', 'rollout', 'reports')][string[]]$Screens = @('users', 'rollout', 'reports')
)
$ErrorActionPreference = 'Stop'
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$Out = [IO.Path]::GetFullPath($Out)
if ($Out.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or
    $Out.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La evidencia debe quedar fuera del repo'
}
New-Item -ItemType Directory -Force $Out | Out-Null
foreach ($screen in $Screens) {
    # No abrir la ventana antes de obtener el turno físico de pantalla.
    while (Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada') {
        Write-Output 'Pantalla ocupada; esperando un minuto'
        Start-Sleep -Seconds 60
    }
    $mutex = [Threading.Mutex]::new($false, 'Global\VantareParityCapture')
    $locked = $false
    $process = $null
    try {
        try { $locked = $mutex.WaitOne() } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada') { throw 'Pantalla reservada durante la espera del mutex; repetir después' }
        if (Test-Path -LiteralPath 'C:/tmp/fase2/notas-1456.md') {
            $hash = (Get-FileHash -LiteralPath 'C:/tmp/fase2/notas-1456.md' -Algorithm SHA256).Hash
            if ($hash -ne $ReviewedNotesHash) { throw 'Las notas cambiaron: leerlas, aplicarlas y pasar su SHA256 en -ReviewedNotesHash' }
        }
        $process = Start-Process -FilePath $Executable -ArgumentList @('--demo', '--screen', $screen) -WindowStyle Hidden -PassThru
        Start-Sleep -Seconds 3
        $output = Join-Path $Out "$screen.png"
        & (Join-Path $PSScriptRoot '../hub/reference/tools/capture-window.ps1') -ProcessId $process.Id -ExpectedExecutable $Executable -OutputPath $output -RepositoryRoot $root -Width 1280 -Height 800
        $first = Join-Path $Out "primera-$screen.png"
        if (-not (Test-Path -LiteralPath $first)) { Copy-Item -LiteralPath $output -Destination $first }
    } finally {
        if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id }
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
