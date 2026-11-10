param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Scene,
    [ValidateSet('dark','light')][string]$Theme = 'dark',
    [Parameter(Mandatory)][string]$Output,
    [string]$Bank = 'D:/VantareServer/qa/referencia-gpui-bin',
    [string]$QaRoot = $env:VANTARE_HUB_QA_ROOT
)
$ErrorActionPreference = 'Stop'
if (-not $QaRoot) { throw 'Define VANTARE_HUB_QA_ROOT con una carpeta QA propia.' }
$bankRoot = [IO.Path]::GetFullPath($Bank)
$inventory = Get-Content -LiteralPath (Join-Path $bankRoot 'bank.json') -Raw | ConvertFrom-Json
$binary = Join-Path $bankRoot $inventory.binary
if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inventory.sha256) { throw 'El banco no coincide con bank.json.' }
$run = Join-Path ([IO.Path]::GetFullPath($QaRoot)) ('gpui-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($run)
Copy-Item -Path (Join-Path $bankRoot 'template/*') -Destination $run -Recurse
$env:VANTARE_NATIVE_DATA_ROOT = $run
$env:LOCALAPPDATA = $run
$start = [Diagnostics.ProcessStartInfo]::new($binary)
$start.UseShellExecute = $false
$start.RedirectStandardInput = $true
$start.WorkingDirectory = $bankRoot
foreach ($argument in @('--qa-root',$run,'--capture',$Scene,'--qa-size','1440x900','--qa-catalog','pro','--qa-appearance',(Join-Path $bankRoot "appearance-$Theme.json"),'--demo','--control-stdin')) { $start.ArgumentList.Add($argument) }
$process = [Diagnostics.Process]::Start($start)
try {
    # Wait for the GUI message loop, then the declared offscreen capture HWND.
    if (-not $process.WaitForInputIdle(15000)) { throw 'El banco no ha creado su bucle de ventana en 15 s.' }
    $helper = Join-Path $PSScriptRoot '../../native/hub/reference/tools/capture-window.ps1'
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    do {
        if ($process.HasExited) { throw "El banco terminó antes de capturar: $($process.ExitCode). QA: $run" }
        $captured = & pwsh -NoProfile -File $helper -ProcessId $process.Id -ExpectedExecutable $binary -OutputPath $Output -Width 1440 -Height 900 2>&1
        if ($LASTEXITCODE -eq 0) { $captured | Write-Output; break }
        if ($deadline.Elapsed.TotalSeconds -ge 30) { throw "No se pudo capturar el HWND QA: $captured. QA: $run" }
        Start-Sleep -Milliseconds 50
    } while ($true)
    [ordered]@{scene=$Scene;theme=$Theme;size=@(1440,900);bank_sha256=$inventory.sha256;source_commit=$inventory.source_commit;qa_root=$run;pid=$process.Id} | ConvertTo-Json | Set-Content -LiteralPath "$Output.bank.json" -Encoding utf8
} finally {
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(10000)) { $process.Kill($true); $process.WaitForExit() }
    $process.Dispose()
}
