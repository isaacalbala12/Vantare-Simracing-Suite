[CmdletBinding()]
param([Parameter(Mandatory)][pscredential]$ServiceCredential,
      [Parameter(Mandatory)][string]$ExpectedComputerName)
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -cne $ExpectedComputerName) { throw 'Equipo incorrecto: no instalar en el PC de juego.' }
$hooks = 'C:/VantareCI/hooks'
foreach ($pair in @(@('ACTIONS_RUNNER_HOOK_JOB_STARTED', "$hooks/job-start.ps1"), @('ACTIONS_RUNNER_HOOK_JOB_COMPLETED', "$hooks/job-end.ps1"))) {
    if ([Environment]::GetEnvironmentVariable($pair[0], 'Machine') -cne $pair[1] -or -not (Test-Path $pair[1] -PathType Leaf)) { throw 'El operador debe preparar hooks de SO y reiniciar antes de configurar servicio.' }
}
$repo = 'isaacalbala12/Vantare-Simracing-Suite'
$root = 'C:/VantareCI/runner'
if ($ServiceCredential.UserName -cnotin @('.\vantare-ci', "$env:COMPUTERNAME\vantare-ci")) { throw 'Use la cuenta local exclusiva vantare-ci.' }
$account = Get-LocalUser -Name 'vantare-ci'
if (-not $account.Enabled) { throw 'Cuenta CI deshabilitada.' }
if (Get-LocalGroupMember -SID 'S-1-5-32-544' | Where-Object { $_.SID -eq $account.SID }) { throw 'La cuenta CI no puede ser administrador.' }
$private = & gh api "repos/$repo" --jq '.private'
if ($LASTEXITCODE -or $private -cne 'true') { throw 'Registro bloqueado: el repo debe ser privado.' }
if (Test-Path 'C:/tmp/fase2/pantalla-ocupada') { throw 'Pantalla ocupada; no instalar/iniciar runner.' }
if (-not (Test-Path $root -PathType Container) -or (Get-Item $root).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'El operador debe preparar C:/VantareCI/runner con ACL exclusiva.' }
if ((Test-Path "$root/.runner") -or (Test-Path "$root/config.cmd")) { throw 'No reemplazar un directorio utilizado.' }
$zip = Join-Path $root 'runner.zip'
Invoke-WebRequest 'https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-win-x64-2.338.0.zip' -OutFile $zip
if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'f48e0750a21812bca5f82de5f7f5aeae71abee647fab5a582f1742d07eba455f') { throw 'Checksum del runner incorrecto.' }
Expand-Archive $zip $root
Push-Location $root
try {
    $env:ACTIONS_RUNNER_INPUT_TOKEN = & gh api --method POST "repos/$repo/actions/runners/registration-token" --jq '.token'
    if ($LASTEXITCODE -or -not $env:ACTIONS_RUNNER_INPUT_TOKEN) { throw 'No se pudo obtener token de registro.' }
    $env:ACTIONS_RUNNER_INPUT_WINDOWSLOGONPASSWORD = $ServiceCredential.GetNetworkCredential().Password
    & ./config.cmd --unattended --url "https://github.com/$repo" --name vantare-windows --labels vantare-1565 --work _work --runasservice --windowslogonaccount $ServiceCredential.UserName *> $null
    if ($LASTEXITCODE) { throw 'Falló registro; revisar localmente sin imprimir credenciales.' }
} finally {
    Remove-Item Env:/ACTIONS_RUNNER_INPUT_TOKEN,Env:/ACTIONS_RUNNER_INPUT_WINDOWSLOGONPASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
