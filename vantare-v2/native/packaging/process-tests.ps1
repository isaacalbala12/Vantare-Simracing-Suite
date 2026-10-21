#requires -Version 5.1
param([Parameter(Mandatory)][string]$GuiExecutable,[Parameter(Mandatory)][string]$ExpectedVersion)
. (Join-Path $PSScriptRoot 'candidate.ps1')
function Assert-Process([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};"PASS $Message"}
$image=[IO.File]::ReadAllBytes($GuiExecutable)
$pe=[BitConverter]::ToInt32($image,60)
Assert-Process ([BitConverter]::ToUInt16($image,$pe+24+68) -eq 2) 'La regresión usa un EXE GUI real'
$versionProbe=Invoke-NativeProcess -Executable $GuiExecutable -Arguments @('--version')
Assert-Process ($versionProbe.ExitCode -eq 0 -and $versionProbe.Stdout.TrimEnd([char[]]"`r`n") -ceq $ExpectedVersion -and -not $versionProbe.Stderr) 'Versión GUI capturada completa, sin consola'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('vantare-native-process-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
$fixture=Join-Path $testRoot 'argumentos ü con espacios.ps1'
$script=@'
param([string]$Mode,[string]$Marker,[Parameter(ValueFromRemainingArguments=$true)][string[]]$Values)
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
switch($Mode){
    'Args' {[Console]::Out.Write((ConvertTo-Json -InputObject @($Values) -Compress))}
    'Echo' {[Console]::Out.Write([Console]::In.ReadToEnd())}
    'Directory' {[Console]::Out.Write([IO.Directory]::GetCurrentDirectory())}
    'Duplex' {[Console]::Out.Write(('o'*100000));[Console]::Error.Write(('e'*100000));exit 23}
    'Hang' {[IO.File]::WriteAllText($Marker,$PID.ToString());$event=[Threading.ManualResetEvent]::new($false);$null=$event.WaitOne()}
}
'@
[IO.File]::WriteAllText($fixture,$script,[Text.UTF8Encoding]::new($true))
$hostExe=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
try {
    $values=@('','espacio ü','dijo "sí"','final\','con espacio\')
    $arguments=@('-NoProfile','-File',$fixture,'Args','unused')+$values
    $result=Invoke-NativeProcess -Executable $hostExe -Arguments $arguments
    $received=ConvertFrom-Json -InputObject $result.Stdout
    Assert-Process ($result.ExitCode -eq 0 -and $received.Count -eq $values.Count) 'argv conserva el número de argumentos'
    for($index=0;$index -lt $values.Count;$index++){
        Assert-Process ($received[$index] -ceq $values[$index]) "argv conserva argumento $index (vacío/Unicode/comillas/backslash)"
    }
    $text='stdin α y emoji 😀'
    Push-Location $testRoot
    try {$directory=Invoke-NativeProcess -Executable $hostExe -Arguments @('-NoProfile','-File',$fixture,'Directory','unused')}
    finally {Pop-Location}
    Assert-Process ($directory.ExitCode -eq 0 -and $directory.Stdout -ieq [IO.Path]::GetFullPath($testRoot)) 'El hijo conserva el directorio PowerShell aunque difiera del cwd de .NET'
    $result=Invoke-NativeProcess -Executable $hostExe -Arguments @('-NoProfile','-File',$fixture,'Echo','unused') -InputText $text
    Assert-Process ($result.ExitCode -eq 0 -and $result.Stdout -ceq $text) 'stdin UTF8 llega completo y recibe EOF'
    $result=Invoke-NativeProcess -Executable $hostExe -Arguments @('-NoProfile','-File',$fixture,'Duplex','unused')
    Assert-Process ($result.ExitCode -eq 23 -and $result.Stdout -ceq ('o'*100000) -and $result.Stderr -ceq ('e'*100000)) 'Dos pipes grandes drenados y código de salida preservado'
    $marker=Join-Path $testRoot 'owned.pid'
    $timedOut=$false
    # El plazo probado incluye un arranque frío de PS5.1 en CI; el hijo espera
    # un evento sin señal, no un sleep. Se verifica su muerte mediante su PID.
    try { $null=Invoke-NativeProcess -Executable $hostExe -Arguments @('-NoProfile','-File',$fixture,'Hang',$marker) -TimeoutMilliseconds 10000 }
    catch [TimeoutException] { $timedOut=$true }
    Assert-Process $timedOut 'Timeout tipado de proceso bloqueado en evento, sin sleeps'
    Assert-Process (Test-Path -LiteralPath $marker) 'El hijo alcanzó la espera antes del timeout'
    $ownedPid=[int][IO.File]::ReadAllText($marker)
    Assert-Process ($null -eq (Get-Process -Id $ownedPid -ErrorAction SilentlyContinue)) 'El timeout retiró únicamente su hijo'
} finally {
    $resolved=[IO.Path]::GetFullPath($testRoot)
    $parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/')
    if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^vantare-native-process-[a-f0-9]{32}$'){throw 'Temporal fuera del ámbito propio'}
    Remove-Item -LiteralPath $resolved -Recurse
}
