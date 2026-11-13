# Importar este archivo no inicia nada. Solo el controlador del PC usa sus funciones.
Set-StrictMode -Version Latest

function Assert-VantareGamePc {
    if (-not $IsWindows -or [IntPtr]::Size -ne 8) { throw 'Usar PowerShell 7 de 64 bits en Windows.' }
    if ([Environment]::MachineName -ieq 'SAPPHIREOS' -or
        (Test-Path -LiteralPath 'C:\VantareServer\orquestador\noche\cabecera-mac.md')) {
        throw 'Parada gráfica: este controlador no puede iniciar programas en el servidor.'
    }
}

function Start-VantareChild {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Binary,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory)][string]$LogPrefix,
        [hashtable]$Variables = @{}
    )
    Assert-VantareGamePc
    $path = [IO.Path]::GetFullPath($Binary)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Falta el programa: $path" }
    foreach ($suffix in @('.stdout.txt','.stderr.txt')) {
        if (Test-Path -LiteralPath ($LogPrefix + $suffix)) { throw 'No sobrescribir registros de procesos.' }
    }
    $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($LogPrefix)))
    $info = [Diagnostics.ProcessStartInfo]::new($path)
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.WorkingDirectory=[IO.Path]::GetDirectoryName($path)
    $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    # No heredar canal, cuentas, raíces beta ni trazas de otra ronda. No registrar sus valores.
    foreach ($name in @($info.Environment.Keys)) {
        if ($name.StartsWith('VANTARE_',[StringComparison]::OrdinalIgnoreCase) -or
            $name.StartsWith('RUNE_',[StringComparison]::OrdinalIgnoreCase) -or
            $name.StartsWith('WGPU_',[StringComparison]::OrdinalIgnoreCase)) { $null=$info.Environment.Remove($name) }
    }
    foreach ($name in $Variables.Keys) { $info.Environment[$name]=[string]$Variables[$name] }
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process=[Diagnostics.Process]::new(); $process.StartInfo=$info
    $start=[Diagnostics.Stopwatch]::GetTimestamp()
    if (-not $process.Start()) { $process.Dispose(); throw 'No se pudo iniciar el programa.' }
    [pscustomobject]@{
        Process=$process;StartQpc=$start;Frequency=[Diagnostics.Stopwatch]::Frequency
        CreatedUtc=$process.StartTime.ToUniversalTime().ToString('o');Binary=$path;LogPrefix=$LogPrefix
        Stdout=$process.StandardOutput.ReadToEndAsync();Stderr=$process.StandardError.ReadToEndAsync();Closed=$false
    }
}

function Write-VantareRootIdentity {
    param(
        [Parameter(Mandatory)]$Child,
        [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$Sha256,
        [Parameter(Mandatory)][string]$Path
    )
    if ($Child.Process.HasExited) { throw 'El proceso terminó antes de publicar su identidad.' }
    if (Test-Path -LiteralPath $Path) { throw 'La identidad de la raíz ya existe.' }
    $temporary=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
    [ordered]@{process_id=$Child.Process.Id;created_utc=$Child.CreatedUtc;start_qpc=$Child.StartQpc
        image_name=[IO.Path]::GetFileName($Child.Binary);image_sha256=$Sha256} |
        ConvertTo-Json | Out-File -Width 2147483647 -LiteralPath $temporary -NoClobber -Encoding utf8
    [IO.File]::Move($temporary,[IO.Path]::GetFullPath($Path))
}

function Close-VantareChild {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Child,[ValidateRange(1,30)][int]$GraceSeconds=15)
    if ($Child.Closed) { throw 'El proceso ya fue recogido.' }
    $process=$Child.Process; $forced=$false
    try {
        if (-not $process.HasExited) {
            $process.StandardInput.Close()
            if (-not $process.WaitForExit($GraceSeconds*1000)) {
                # Solo el árbol del proceso creado y conservado por este controlador.
                $process.Kill($true); $forced=$true
                if (-not $process.WaitForExit(5000)) { throw 'No se pudo recoger el árbol propio.' }
            }
        }
        $stdout=$Child.Stdout.GetAwaiter().GetResult(); $stderr=$Child.Stderr.GetAwaiter().GetResult()
        foreach ($entry in @(@('.stdout.txt',$stdout),@('.stderr.txt',$stderr))) {
            $stream=[IO.File]::Open($Child.LogPrefix+$entry[0],[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
            $writer=[IO.StreamWriter]::new($stream,[Text.UTF8Encoding]::new($false))
            try { $writer.Write($entry[1]) } finally { $writer.Dispose() }
        }
        [pscustomobject]@{process_id=$process.Id;exit_code=$process.ExitCode;forced=$forced
            start_qpc=$Child.StartQpc;end_qpc=[Diagnostics.Stopwatch]::GetTimestamp();frequency=$Child.Frequency}
    } finally { $Child.Closed=$true; $process.Dispose() }
}

# Una campaña por sesión, incluso con carpetas de resultados diferentes.
# Los hijos (núcleo/muestreador) no adquieren este mutex.
function Enter-VantareCampaignLease {
    $lease=[Threading.Mutex]::new($false,'Local\Vantare141Measurement')
    $held=$false
    try {
        try { $held=$lease.WaitOne(0) }
        catch [Threading.AbandonedMutexException] { $held=$true }
        if (-not $held) { throw [InvalidOperationException]::new('Hay otra campaña, prueba de aguante o recogida en esta sesión.') }
        $lease
    } catch { $lease.Dispose(); throw }
}
function Exit-VantareCampaignLease {
    param([Parameter(Mandatory)][Threading.Mutex]$Lease)
    try { $Lease.ReleaseMutex() } finally { $Lease.Dispose() }
}
