# Dot-sourced by beta-tests.ps1: real hidden window/process, no sleep-based sync.
function Start-TestBootstrap([string]$Directory, [bool]$Hung) {
    $compiled = Join-Path $evidence 'bootstrap-fixture.exe'
    if (-not (Test-Path -LiteralPath $compiled)) {
        Add-Type -Path (Join-Path $PSScriptRoot 'fixtures/bootstrap-window.cs') -OutputAssembly $compiled -OutputType ConsoleApplication
    }
    $generation = Join-Path $Directory ('generations/' + [guid]::NewGuid().ToString('N'))
    $bin = Join-Path $generation 'bin'
    [IO.Directory]::CreateDirectory($bin) | Out-Null
    $exe = Join-Path $bin 'vantare.exe'
    [IO.File]::Copy($compiled, $exe)
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $exe
    if ($Hung) { $info.Arguments = 'hung' }
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        $ready = $process.StandardOutput.ReadLineAsync()
        if (-not $ready.Wait(10000) -or $ready.Result -cnotmatch '^[1-9][0-9]*$') { throw 'El bootstrap fixture no creó su ventana invisible.' }
        $env:VANTARE_STARTUP_WINDOW = $ready.Result
        $env:VANTARE_STARTUP_PID = $process.Id.ToString()
        $null = Reject-Beta { $handles = Open-NativeBinaryGuard $Directory; foreach ($handle in $handles.Values) { $handle.Dispose() } } 'guard real rechaza la imagen del indicador ejecutándose'
        @{ Process = $process; Generation = $generation; Directory = $Directory }
    } catch {
        $process.StandardInput.Close()
        $null = $process.WaitForExit(10000)
        $process.Dispose()
        throw
    }
}

function Stop-TestBootstrap($Bootstrap) {
    $Bootstrap.Process.StandardInput.Close()
    try {
        if (-not $Bootstrap.Process.WaitForExit(10000)) { throw 'El fixture propio no cerró tras EOF.' }
        Assert-Beta ($Bootstrap.Process.ExitCode -eq 0) 'fixture cierra por señal o EOF sin terminarlo a la fuerza'
    } finally {
        $Bootstrap.Process.Dispose()
        Remove-Item Env:VANTARE_STARTUP_WINDOW, Env:VANTARE_STARTUP_PID -ErrorAction SilentlyContinue
    }
    # Exactly the unique fixture generation created above, inside the test root.
    $target = Assert-NativePath $Bootstrap.Generation
    $parent = (Assert-NativePath (Join-Path $Bootstrap.Directory 'generations')) + [IO.Path]::DirectorySeparatorChar
    if (-not $target.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase) -or $target.Substring($parent.Length) -cnotmatch '^[a-f0-9]{32}$') { throw 'Ruta de limpieza del fixture inválida.' }
    Remove-Item -LiteralPath $target -Recurse
}

function Test-BusyBootstrap([string]$Directory, [scriptblock]$Action, [string]$Label) {
    $before = @{}
    foreach ($file in @('state.json', 'staging/pending.json', 'boot-pending.json')) {
        $path = Join-Path $Directory $file
        $before[$file] = if (Test-Path -LiteralPath $path) { Get-NativeHash $path } else { '' }
    }
    $bootstrap = Start-TestBootstrap $Directory $true
    try {
        $timedOut = $false
        try { $null = & $Action } catch [TimeoutException] { $timedOut = $true }
        Assert-Beta $timedOut "$Label aplazado por el plazo real del bootstrap"
        foreach ($file in $before.Keys) {
            $path = Join-Path $Directory $file
            $after = if (Test-Path -LiteralPath $path) { Get-NativeHash $path } else { '' }
            Assert-Beta ($after -ceq $before[$file]) "$Label conserva $file byte por byte"
        }
        Assert-Beta (-not $bootstrap.Process.HasExited) "$Label no mata el bootstrap bloqueado"
    } finally { Stop-TestBootstrap $bootstrap }
}

# Valid real generations are supplied by installer-registration-tests.ps1.
function Test-RollbackNaturalExit([string]$Directory) {
    $before=Read-NativeState $Directory
    Write-BetaJson (Join-Path $Directory 'boot-pending.json') @{schema=1;previous=$before.previous.generation;version='0.0.979'}
    $bootstrap=Start-TestBootstrap $Directory $true
    $workerScript=Join-Path $evidence 'rollback-natural-worker.ps1'
    $script=@'
$ErrorActionPreference='Stop'
. '__BETA__'
function Get-NativeShortcutFolder([string]$Name){if($Name -cne 'Startup'){throw 'Only private Startup is allowed in this fixture.'};'__STARTUP__'}
$complete=${function:Complete-BetaBootstrap}
function Complete-BetaBootstrap([string]$Directory,[switch]$AllowNaturalExit){
    & $complete $Directory 50 -AllowNaturalExit:$AllowNaturalExit -NaturalExitMilliseconds 10000
}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $env:WINDIR 'System32/cmd.exe'
$info.Arguments='/D /C exit /B 7';$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$hub=[Diagnostics.Process]::Start($info)
try {
    $null=$hub.WaitForExit(10000)
    if(Confirm-BetaBoot '__ROOT__' $hub 0){throw 'Failed Hub unexpectedly confirmed.'}
} finally {$hub.Dispose()}
'@
    $script=$script.Replace('__BETA__',(Join-Path $PSScriptRoot 'beta.ps1').Replace("'","''")).Replace('__ROOT__',$Directory.Replace("'","''")).Replace('__STARTUP__',(Get-NativeShortcutFolder 'Startup').Replace("'","''"))
    [IO.File]::WriteAllText($workerScript,$script)
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$workerScript+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true
    $worker=[Diagnostics.Process]::Start($info)
    try {
        $waiting=$worker.StandardError.ReadLineAsync()
        Assert-Beta ($waiting.Wait(20000) -and $null -ne $waiting.Result -and -not $worker.HasExited) 'failed Hub rollback reached the natural-exit wait'
        Assert-Beta ((Read-NativeState $Directory).active.generation -ceq $before.active.generation) 'rollback leaves generation intact while bootstrap is alive'
        Assert-Beta (-not $bootstrap.Process.HasExited) 'rollback never forces bootstrap exit'
        $bootstrap.Process.StandardInput.Close()
        Assert-Beta ($worker.WaitForExit(20000) -and $worker.ExitCode -eq 0) 'actual Confirm-BetaBoot completes rollback after bootstrap natural exit'
        Assert-Beta ((Read-NativeState $Directory).active.generation -ceq $before.previous.generation) 'actual rollback restores previous verified generation'
        Assert-Beta (-not (Test-Path (Join-Path $Directory 'boot-pending.json'))) 'completed rollback clears boot-pending'
    } finally {
        Stop-TestBootstrap $bootstrap
        $null=$worker.WaitForExit(15000);$worker.Dispose()
    }
}
