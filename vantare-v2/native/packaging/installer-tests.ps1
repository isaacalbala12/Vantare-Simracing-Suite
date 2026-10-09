#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$Version010Directory,
    [Parameter(Mandatory)][string]$Version011Directory,
    [Parameter(Mandatory)][string]$EvidenceDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$root = Join-Path (Assert-NativePath $EvidenceDirectory) ('setup-' + [guid]::NewGuid().ToString('N'))
$key = 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$programs = [Environment]::GetFolderPath('Programs')
$legacyShortcut = Join-Path $programs 'Vantare Native Beta QA1492/Vantare Native Beta.lnk'
$shortcut = Join-Path $programs 'Vantare QA1492/Vantare.lnk'
if (Test-Path -LiteralPath $key) { throw 'Hay otra instalación QA1492; conservarla y terminar antes de probar.' }
$script:Passed = 0
function Assert-Setup([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
    $script:Passed++
    Write-Output "PASS $Message"
}
function Invoke-Setup([string]$Directory, [int]$Expected = 0) {
    $process = Start-Process -FilePath (Join-Path $Directory 'VantareSetup.exe') -ArgumentList "/S /D=$root" -WindowStyle Hidden -PassThru
    try {
        if (-not $process.WaitForExit(120000)) { throw 'Setup no terminó; no se mata el proceso.' }
        Assert-Setup ($process.ExitCode -eq $Expected) "Setup código $Expected"
    } finally { $process.Dispose() }
}
function Read-SetupState { Read-NativeState $root }
function Get-SetupData { Join-Path $root "generations/$((Read-SetupState).active.generation)/data/profile.json" }
function Fail-SetupBoot {
    $state = Read-SetupState
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Join-Path $root "generations/$($state.active.generation)/bin/vantare-hub.exe"
    $info.Arguments = '--invalid-beta-start'
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true; $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        Assert-Setup (-not (Confirm-BetaBoot $root $process 15)) 'Hub construido falla realmente y activa rollback'
        Assert-Setup ($process.HasExited -and $process.ExitCode -ne 0) 'Hub nuevo termina con código de error'
        [IO.File]::WriteAllText((Join-Path $EvidenceDirectory 'setup-failed-hub.log'), $process.StandardError.ReadToEnd())
    } finally { $process.Dispose() }
}
Invoke-Setup $Version010Directory
$initial = (Read-SetupState).active.generation
$oldVersion = (Get-ItemProperty -LiteralPath $key).DisplayVersion
Assert-Setup ((Get-ItemProperty -LiteralPath $key).DisplayName -ceq 'Vantare Native Beta') 'instalador anterior usa nombre beta real'
Assert-Setup (Test-Path -LiteralPath $legacyShortcut) 'instalador anterior crea acceso beta'
[IO.File]::WriteAllText((Get-SetupData), '{"profile":"setup QA","layout":[1,2],"account":"fake"}')
$hash = Get-NativeHash (Get-SetupData)
$session = [IO.File]::Open((Join-Path $root 'beta-session.lock'), 'Open', 'ReadWrite', 'None')
try { Invoke-Setup $Version011Directory 2 } finally { $session.Dispose() }
$busy = [IO.File]::Open((Join-Path $root "generations/$initial/bin/vantare-hub.exe"), 'Open', 'Read', 'Read')
try { Invoke-Setup $Version011Directory 2 } finally { $busy.Dispose() }
Assert-Setup ((Read-SetupState).active.generation -ceq $initial) 'sesión/binario abiertos conservan instalación'
Invoke-Setup $Version011Directory
$newVersion = (Get-ItemProperty -LiteralPath $key).DisplayVersion
Assert-Setup ((Read-BetaVersion $newVersion) -gt (Read-BetaVersion $oldVersion)) 'registro actualizado a versión mayor'
Assert-Setup ((Get-ItemProperty -LiteralPath $key).DisplayName -ceq 'Vantare') 'Setup migra nombre visible con la misma identidad'
Assert-Setup ((Get-ItemProperty -LiteralPath $key).InstallLocation -ceq $root) 'Setup conserva carpeta anterior y datos'
Assert-Setup (-not (Test-Path -LiteralPath $legacyShortcut)) 'Setup retira acceso beta duplicado'
Assert-Setup ((Get-NativeHash (Get-SetupData)) -ceq $hash) 'Setup nuevo conserva datos'
Assert-Setup ([IO.File]::ReadAllText((Join-Path $root 'registration-identity.txt')) -ceq 'VantareNativeBetaQA1492') 'Setup QA declara su identidad fuera del bootstrap productivo'
$pendingHash = Get-NativeHash (Join-Path $root 'boot-pending.json')
$pendingGeneration = (Read-SetupState).active.generation
Invoke-Setup $Version011Directory 4
Assert-Setup ((Get-NativeHash (Join-Path $root 'boot-pending.json')) -ceq $pendingHash) 'Setup repetido conserva marcador exacto'
Assert-Setup ((Read-SetupState).active.generation -ceq $pendingGeneration) 'Setup repetido conserva generación y rollback'
Assert-Setup ((Get-NativeHash (Get-SetupData)) -ceq $hash) 'Setup repetido conserva datos'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
Assert-Setup ($link.Arguments.Contains($root)) 'Inicio apunta a bootstrap de la instalación aislada'
Invoke-Setup $Version010Directory 3
Assert-Setup ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq $newVersion) 'rechazo de downgrade conserva registro'
Fail-SetupBoot
Assert-Setup ((Read-SetupState).active.generation -ceq $initial) 'rollback recupera generación anterior'
Assert-Setup ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq $oldVersion) 'rollback corrige versión en registro'
Assert-Setup ((Get-NativeHash (Get-SetupData)) -ceq $hash) 'rollback conserva perfil'
Assert-Setup ((Get-ItemProperty -LiteralPath $key).DisplayName -ceq 'Vantare') 'rollback mantiene nombre único sin alterar versión anterior'
# Reaplicar el nombre nuevo después del rollback a la beta anterior.
Invoke-Setup $Version011Directory
Assert-Setup ((Read-SetupState).active.generation -cne $initial) 'Setup nuevo vuelve a activar una generación tras rollback'
Assert-Setup (Test-Path (Join-Path $root "generations/$((Read-SetupState).active.generation)/bin/vantare-hub.exe")) 'generación nueva contiene Hub íntegro'
Assert-Setup ((Get-NativeHash (Get-SetupData)) -ceq $hash) 'reaplicar tras rollback conserva datos'
# Desinstalar incluso con arranque pendiente conserva la copia activa exacta.
$process = Start-Process -FilePath (Join-Path $root 'Uninstall.exe') -ArgumentList "/S _?=$root" -WindowStyle Hidden -PassThru
try { $process.WaitForExit(); Assert-Setup ($process.ExitCode -eq 0) 'desinstalador construido termina' }
finally { $process.Dispose() }
Assert-Setup (-not (Test-Path -LiteralPath $key)) 'desinstalar retira registro QA'
Assert-Setup (-not (Test-Path -LiteralPath $shortcut)) 'desinstalar retira acceso nuevo'
Assert-Setup (-not (Test-Path -LiteralPath $legacyShortcut)) 'desinstalar no deja acceso beta'
Assert-Setup (-not (Test-Path (Join-Path $root 'registration-identity.txt'))) 'desinstalar retira identidad QA'
Invoke-Setup $Version011Directory
Assert-Setup ((Get-NativeHash (Get-SetupData)) -ceq $hash) 'Setup adopta datos tras desinstalar'
$retainedData = Get-SetupData
$process = Start-Process -FilePath (Join-Path $root 'Uninstall.exe') -ArgumentList "/S _?=$root" -WindowStyle Hidden -PassThru
try { $process.WaitForExit(); Assert-Setup ($process.ExitCode -eq 0) 'limpieza final solo de instalación QA' }
finally { $process.Dispose() }
Invoke-Setup $Version010Directory 3
Assert-Setup (-not (Test-Path -LiteralPath $key)) 'datos más recientes rechazan Setup anterior sin registrar instalación'
Assert-Setup ((Get-NativeHash $retainedData) -ceq $hash) 'datos conservados intactos'
$root = Join-Path (Assert-NativePath $EvidenceDirectory) ('fresh-Vantare-' + [guid]::NewGuid().ToString('N'))
Invoke-Setup $Version011Directory
Assert-Setup ((Get-ItemProperty -LiteralPath $key).DisplayName -ceq 'Vantare') 'instalación limpia usa nombre final'
Assert-Setup (Test-Path -LiteralPath $shortcut) 'instalación limpia crea acceso Vantare'
Assert-Setup (([Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $Version011Directory 'VantareSetup.exe'))).ProductName -ceq 'Vantare') 'metadatos reales del Setup usan Vantare'
$fresh = (Read-SetupState).active.generation
[IO.File]::WriteAllText((Get-SetupData), '{"profile":"repair new name","layout":[1,2],"account":"fixture"}')
$freshHash = Get-NativeHash (Get-SetupData)
Remove-Item -LiteralPath (Join-Path $root "generations/$fresh/bin/vantare-hub.exe")
Invoke-Setup $Version011Directory
Assert-Setup ((Read-SetupState).active.generation -cne $fresh) 'mismo Setup Vantare reinstala binarios'
Assert-Setup (Test-Path (Join-Path $root "generations/$((Read-SetupState).active.generation)/bin/vantare-hub.exe")) 'mismo Setup Vantare recupera Hub ausente'
Assert-Setup ((Get-NativeHash (Get-SetupData)) -ceq $freshHash) 'reparación de la misma versión conserva datos exactos'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'uninstall-vantare.ps1') -Operation UninstallInstalled -Root $root
Assert-Setup ($LASTEXITCODE -eq 0 -and -not (Test-Path -LiteralPath $key) -and -not (Test-Path -LiteralPath $shortcut)) 'desinstalación registrada de instalación limpia no deja duplicados'
Write-Output "$script:Passed comprobaciones PASS. Evidencia: $root"
