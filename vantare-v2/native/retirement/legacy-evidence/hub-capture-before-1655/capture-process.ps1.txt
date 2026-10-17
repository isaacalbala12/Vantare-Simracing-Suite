param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$ExpectedExecutable,
    [Parameter(Mandatory)][string]$OutputPath,
    [Parameter(Mandatory)][string]$Screen,
    [Parameter(Mandatory)][string]$CaptureScript,
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [ValidateRange(0, 8192)][int]$Width = 0,
    [ValidateRange(0, 8192)][int]$Height = 0
)
$ErrorActionPreference = 'Stop'
$marker = 'C:\tmp\fase2\pantalla-ocupada'
$mutex = [System.Threading.Mutex]::new($false, 'Global\VantareParityCapture')
$ownsMutex = $false
$target = $null
function Test-ForeignTurn {
    if (-not (Test-Path -LiteralPath $marker)) { return $false }
    $turn = $env:VANTARE_CAPTURE_TURN
    return -not ($turn -and (Get-Content -LiteralPath $marker -Raw).Trim() -ceq $turn)
}
try {
    while ($true) {
        while (Test-ForeignTurn) {
            [Console]::Error.WriteLine("Esperando pantalla ocupada antes de abrir Hub: $Screen")
            Start-Sleep -Seconds 60
        }
        try { [void]$mutex.WaitOne(); $ownsMutex = $true }
        catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
        if (-not (Test-ForeignTurn)) { break }
        $mutex.ReleaseMutex()
        $ownsMutex = $false
    }
    [Console]::Out.WriteLine('READY')
    [Console]::Out.Flush()

    $deadline = [DateTime]::UtcNow.AddMinutes(2)
    do {
        $target = Get-Process -Id $ProcessId -ErrorAction Stop
        $target.Refresh()
        if ($target.Path -ne [IO.Path]::GetFullPath($ExpectedExecutable)) { throw 'Ejecutable inesperado' }
        if ($target.MainWindowHandle -ne 0) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($target.MainWindowHandle -eq 0) { throw 'La ventana Hub no apareció en 2 minutos' }

    & $CaptureScript -ProcessId $ProcessId -ExpectedExecutable $ExpectedExecutable -OutputPath $OutputPath -Screen $Screen -RepositoryRoot $RepositoryRoot -Width $Width -Height $Height
} finally {
    try {
        if ($target) {
            $target.Refresh()
            if (-not $target.HasExited) {
                if (-not $target.CloseMainWindow()) { throw 'No se pudo cerrar la ventana Hub tras guardar el PNG' }
                $closeDeadline = [DateTime]::UtcNow.AddSeconds(10)
                do {
                    $target.Refresh()
                    if ($target.HasExited -or $target.MainWindowHandle -eq 0) { break }
                    Start-Sleep -Milliseconds 100
                } while ([DateTime]::UtcNow -lt $closeDeadline)
                $target.Refresh()
                if (-not $target.HasExited -and $target.MainWindowHandle -ne 0) {
                    throw 'La ventana Hub de captura sigue abierta tras guardar el PNG'
                }
            }
        }
    } finally {
        if ($ownsMutex) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
