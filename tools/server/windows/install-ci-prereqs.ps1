$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$d = 'C:\VantareServer\images\win'; New-Item -ItemType Directory -Force $d | Out-Null
function Get-Pinned($url, $sha) {
  $f = Join-Path $d (Split-Path $url -Leaf)
  if (-not (Test-Path $f)) { Invoke-WebRequest $url -OutFile $f }
  if ($sha -and (Get-FileHash $f -Algorithm SHA256).Hash -ne $sha.ToUpper()) { Remove-Item $f; throw "SHA incorrecto $url" }
  if (-not $sha -and (Get-AuthenticodeSignature $f).Status -ne 'Valid') { Remove-Item $f; throw "Firma no valida $url" }
  $f }
function Run($exe, $args_) { $p = Start-Process $exe -ArgumentList $args_ -Wait -PassThru; "$(Split-Path $exe -Leaf) rc=$($p.ExitCode)"; if ($p.ExitCode -notin 0,3010) { throw "fallo $exe" } }
if (-not (Test-Path 'C:\Program Files\PowerShell\7\pwsh.exe')) {
  Run msiexec.exe "/i `"$(Get-Pinned https://github.com/PowerShell/PowerShell/releases/download/v7.6.6/PowerShell-7.6.6-win-x64.msi 958838ff55091e1c8705d89efed0cc7e8245a3a6ef6c0ccfae20015227108ad8)`" /qn /norestart ENABLE_PSREMOTING=0 REGISTER_MANIFEST=1 USE_MU=1 ENABLE_MU=1 ADD_PATH=1" }
if (-not (Test-Path 'C:\Program Files\Git\bin\bash.exe')) {
  Run (Get-Pinned https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.2/Git-2.56.0.2-64-bit.exe 52188f917b378f00c70ec136bcf090005f30d44fbc4eba0bce759cc6592d60f6) '/VERYSILENT /NORESTART /NOCANCEL /SP- /SUPPRESSMSGBOXES /o:PathOption=Cmd' }
if (-not (Test-Path 'C:\Program Files\GitHub CLI\gh.exe')) {
  Run msiexec.exe "/i `"$(Get-Pinned https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_windows_amd64.msi 7944b579d76359e5b859a263bf63583e271ae3fbd427ae46e133c1f348b46371)`" /qn /norestart" }
if (-not (Test-Path 'C:\Program Files\Python313\python.exe')) {
  Run (Get-Pinned https://www.python.org/ftp/python/3.13.16/python-3.13.16-amd64.exe fb4f9f5d438b2396da0086dc70b935c530cb578e37adc6d354f7ad2037fee83b) '/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=0' }
if (-not (Test-Path 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC')) {
  Run (Get-Pinned https://aka.ms/vs/17/release/vs_BuildTools.exe $null) '--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' }
$r = Get-Pinned https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe 6f4bef66261261fcb43131be8720bab817d403a09edec7455c371974b90bdb7e
icacls $d /grant 'Users:(OI)(CI)RX' | Out-Null
"listo: $r"
