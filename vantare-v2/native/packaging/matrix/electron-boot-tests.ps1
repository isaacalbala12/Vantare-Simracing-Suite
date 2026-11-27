#requires -Version 5.1
# Arranque Electron instalado (#2849, P7-3): raíz real (`vantare.exe` QA con `installer-qa`),
# sesión real, anfitrión real `vantare-hub-host` (features de producto) como
# `bin/vantare-hub.exe` y la UI de pega sin ventana (`hub-host/examples/ui-peer.rs`) como
# `hub-ui/vantare-hub-ui.exe`, con su hash en el manifiesto. Cada caso tiene raíz, HKCU
# inyectado y carpetas propias. Solo se cierran procesos propios, por PID y comprobando que
# su imagen está en la raíz del caso; nunca por nombre. No dibuja nada.
param([string]$Root,[string]$TestVerifier,[string]$BootProbe,[string]$WriteEngine,[string]$RootLauncher,[string]$HostExecutable,[string]$UiPeer)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qa=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qa){throw 'ELECTRON_BOOT_NEEDS_FRESH_QA_ROOT'}
foreach($path in @($TestVerifier,$BootProbe,$WriteEngine,$RootLauncher,$HostExecutable,$UiPeer)){
    if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'ELECTRON_BOOT_BINARY_MISSING'}
}
[IO.Directory]::CreateDirectory($qa)|Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'support.ps1')
. (Join-Path $PSScriptRoot 'fixtures.ps1')
$assets=Join-Path $qa 'assets'
$settingsFixture=Join-Path $PSScriptRoot '../../hub-host/fixtures/writer-bytes/hub-settings.json'
$passed=0
$hives=[Collections.Generic.List[string]]::new()
$script:current=$null
function Assert-Electron([bool]$Value,[string]$Message){if(-not $Value){throw "ELECTRON_BOOT_ASSERT: $Message"};$script:passed++;"PASS $Message"}

# Paquete de la matriz con la raíz QA, el anfitrión real y la UI de pega en su generación.
function New-ElectronPackage([string]$Version){
    $directory=Join-Path $assets ('v'+$Version)
    New-MatrixPayload $directory ('0.0.'+$Version) $TestVerifier
    Copy-Item -LiteralPath $RootLauncher -Destination (Join-Path $directory 'bin/vantare.exe') -Force
    Copy-Item -LiteralPath $HostExecutable -Destination (Join-Path $directory 'bin/vantare-hub.exe') -Force
    [IO.Directory]::CreateDirectory((Join-Path $directory 'hub-ui/resources'))|Out-Null
    Copy-Item -LiteralPath $UiPeer -Destination (Join-Path $directory 'hub-ui/vantare-hub-ui.exe')
    [IO.File]::WriteAllText((Join-Path $directory 'hub-ui/resources/app.asar'),'QA asar')
    foreach($exe in @('bin/vantare.exe','bin/vantare-hub.exe','hub-ui/vantare-hub-ui.exe')){
        $file=Join-Path $directory $exe
        [IO.File]::WriteAllText("$file.sha256",((Get-NativeHash $file)+'  '+[IO.Path]::GetFileName($file)+"`n"))
    }
    $manifestPath=Join-Path $directory 'manifest.json'
    $manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
    $changed=@('bin/vantare.exe','bin/vantare.exe.sha256','bin/vantare-hub.exe','bin/vantare-hub.exe.sha256')
    $added=@('hub-ui/vantare-hub-ui.exe','hub-ui/vantare-hub-ui.exe.sha256','hub-ui/resources/app.asar')
    $files=@($manifest.files)+@($added|ForEach-Object {[pscustomobject]@{path=$_;size=0;sha256=''}})
    foreach($member in $files){
        if($member.path -in ($changed+$added)){
            $file=Join-Path $directory $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file
        }
    }
    $manifest.files=$files
    $null=Assert-MatrixRoot $manifestPath
    Remove-Item -LiteralPath $manifestPath -Force
    Write-NativeJson $manifestPath $manifest
    New-NativeZip $directory (Join-Path $assets ('v'+$Version+'.zip'))
}
function Install-Version($Case,[string]$Version){
    Copy-Item -LiteralPath (Join-Path $assets ('v'+$Version+'.zip')) -Destination (Join-Path $Case.Payload 'package.zip') -Force
    $contract=Join-Path $Case.Dir ('contract-'+$Version+'.json')
    $request=@{operation='Install';root=$Case.Install;qa=$false;silent=$true;uninstall=$false;version=('0.0.'+$Version);size=1;mode='auto';desktop=$true;autostart=$true
        processId=2147483647;packageSha=(Get-NativeHash (Join-Path $Case.Payload 'package.zip'));logFile=($contract+'.log')}
    Write-NativeJson $contract @{request=$request;context=@{localAppData=$Case.Local;registryPrefix=$Case.Prefix;shellRoot=$Case.Shell};payloadDirectory=$Case.Payload;qaAction=$null}
    & $WriteEngine $contract | Out-Null
    if($LASTEXITCODE){throw "ELECTRON_BOOT_INSTALL_FAILED: $($Case.Name) $Version"}
    Copy-Item -LiteralPath $RootLauncher -Destination (Join-Path $Case.Install 'Vantare.exe') -Force
}
# A (0.0.989) confirmada con ajustes minimizado y zoom 125; C (0.0.990) instalada y pendiente.
function New-Case([string]$Name,[string]$Mode){
    $dir=Join-Path $qa $Name
    $case=[pscustomobject]@{Name=$Name;Dir=$dir;Install=(Join-Path $dir 'install');Shell=(Join-Path $dir 'shell');Local=(Join-Path $dir 'LocalAppData')
        Payload=(Join-Path $dir 'payload');Runs=0;Prefix=('Software\VantareInstallerMatrix\'+[guid]::NewGuid().ToString('N')+'\electron')}
    foreach($directory in @($case.Shell,$case.Local,$case.Payload)){[IO.Directory]::CreateDirectory($directory)|Out-Null}
    New-Item -Path ('HKCU:\'+$case.Prefix) -Force|Out-Null
    $script:hives.Add('HKCU:\'+$case.Prefix)
    $script:current=$case
    Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $case.Payload 'Uninstall.exe')
    [IO.File]::WriteAllText((Join-Path $case.Payload 'installer-notices.txt'),'QA fixture')
    Install-Version $case '989'
    $settings=[IO.File]::ReadAllText($settingsFixture)
    $minimized=$settings.Replace('"minimized": false','"minimized": true')
    if($minimized -ceq $settings){throw 'ELECTRON_BOOT_SETTINGS_FIXTURE_CHANGED'}
    $state=Get-Content -LiteralPath (Join-Path $case.Install 'state.json') -Raw|ConvertFrom-Json
    $hub=Join-Path $case.Install ('generations/'+$state.active.generation+'/data/hub')
    [IO.Directory]::CreateDirectory($hub)|Out-Null
    [IO.File]::WriteAllText((Join-Path $hub 'hub-settings.json'),$minimized,[Text.UTF8Encoding]::new($false))
    Install-Version $case '990'
    if(-not(Test-Path -LiteralPath (Join-Path $case.Install 'boot-pending.json'))){throw 'ELECTRON_BOOT_C_NOT_PENDING'}
    foreach($file in @('qa-ui-peer-owned','allow-exit')){[IO.File]::WriteAllText((Join-Path $case.Install $file),'QA')}
    [IO.File]::WriteAllText((Join-Path $case.Install 'qa-ui-peer-mode'),$Mode)
    $case
}
# Procesos de este caso: los de «Hub en marcha (pid N)» y los de las trazas, solo si su
# imagen está dentro de la raíz del caso (un PID reutilizado nunca es nuestro).
function Get-Own($Case,[string]$Output){
    $ids=@([regex]::Matches($Output,'en marcha \(pid (\d+)\)')|ForEach-Object {[int]$_.Groups[1].Value})
    foreach($trace in Get-Traces $Case ''){$ids+=@([regex]::Matches($trace,'started pid=(\d+)')|ForEach-Object {[int]$_.Groups[1].Value})}
    $prefix=[IO.Path]::GetFullPath($Case.Install).TrimEnd('\')+'\'
    @($ids|Sort-Object -Unique|ForEach-Object {
        $process=Get-Process -Id $_ -ErrorAction SilentlyContinue
        if($process){try{if($process.Path -and $process.Path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){$process}}catch{}}
    })
}
function Invoke-Root($Case,[switch]$Interactive){
    $Case.Runs++
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $Case.Install 'Vantare.exe'
    $info.Arguments='--root -Root "'+$Case.Install+'"'+$(if($Interactive){''}else{' --background'})
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables['TEMP']=$qa;$info.EnvironmentVariables['TMP']=$qa
    $info.EnvironmentVariables['LOCALAPPDATA']=$Case.Local
    $info.EnvironmentVariables['VANTARE_QA_LOCAL_APP_DATA']=$Case.Local
    $info.EnvironmentVariables['VANTARE_QA_REGISTRY_PREFIX']=$Case.Prefix
    $info.EnvironmentVariables['VANTARE_QA_SHELL_ROOT']=$Case.Shell
    $info.EnvironmentVariables['VANTARE_QA_SESSION_PROBE']=$BootProbe
    $clock=[Diagnostics.Stopwatch]::StartNew()
    $process=[Diagnostics.Process]::Start($info)
    try{
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        $finished=$process.WaitForExit(150000)
        $seconds=$clock.Elapsed.TotalSeconds
        if(-not $finished){$process.Kill();$process.WaitForExit()}
        # Un hijo huérfano conserva el stderr heredado: la espera también tiene tope.
        $closed=[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout,$stderr),20000)
        $output=if($closed){"$($stdout.Result)`n$($stderr.Result)"}else{'(salida retenida por un proceso huerfano)'}
        [IO.File]::WriteAllText((Join-Path $Case.Dir ('root-'+$Case.Runs+'.log')),$output)
        $deadline=[DateTime]::UtcNow.AddSeconds(10)
        while(($alive=@(Get-Own $Case $output)).Count -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 50}
        foreach($own in $alive){$own.Kill();$own.WaitForExit(5000)|Out-Null}
        [pscustomobject]@{ExitCode=$process.ExitCode;Output=$output;Seconds=$seconds;Clean=($finished -and $closed -and -not $alive.Count)}
    }finally{
        if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
        $process.Dispose()
    }
}
function Get-Traces($Case,[string]$Version){
    $directory=Join-Path $Case.Install 'qa-ui-peer'
    if(-not(Test-Path -LiteralPath $directory)){return ,@()}
    ,@(Get-ChildItem -LiteralPath $directory -Filter ($(if($Version){$Version}else{'*'})+'-*.log')|Sort-Object CreationTimeUtc|ForEach-Object {[IO.File]::ReadAllText($_.FullName)})
}
function Get-ActiveVersion($Case){
    $state=Get-Content -LiteralPath (Join-Path $Case.Install 'state.json') -Raw|ConvertFrom-Json
    (Get-Content -LiteralPath (Join-Path $Case.Install ('generations/'+$state.active.generation+'/manifest.json')) -Raw|ConvertFrom-Json).version
}
function Get-Rejected($Case){
    $path=Join-Path $Case.Install 'update-status.json'
    if(Test-Path -LiteralPath $path){(Get-Content -LiteralPath $path -Raw|ConvertFrom-Json).rejectedVersion}else{$null}
}
function Test-Pending($Case){Test-Path -LiteralPath (Join-Path $Case.Install 'boot-pending.json')}
function Test-Good([string]$Trace){$Trace.Contains('ready-sent') -and $Trace.Contains('close-answered ControlEof') -and $Trace.Contains('exit 0')}
# Rollback a A rechazando C: lo comparten los casos que fallan antes de confirmar.
function Assert-Rejected($Case,$Run){
    $n=$Case.Name
    Assert-Electron ($Run.ExitCode -eq 0) "${n}: run ends on 0.0.989 ($($Run.ExitCode))"
    Assert-Electron ((Get-ActiveVersion $Case) -ceq '0.0.989' -and -not(Test-Pending $Case)) "${n}: 0.0.989 is active with nothing pending"
    Assert-Electron ((Get-Rejected $Case) -ceq '0.0.990') "${n}: rollback rejects 0.0.990"
    $a=Get-Traces $Case '0.0.989'
    Assert-Electron ($a.Count -eq 1 -and (Test-Good $a[0])) "${n}: 0.0.989 opens once and closes cleanly"
    Assert-Electron $Run.Clean "${n}: root finished and every own process ended"
}

try{
    $env:TEMP=$qa;$env:TMP=$qa
    [IO.Directory]::CreateDirectory($assets)|Out-Null
    New-ElectronPackage '989'
    New-ElectronPackage '990'

    # 1. Bien con --background: C confirma, se registra y el anfitrión lee los ajustes de A.
    $case=New-Case 'bien' 'bien'
    $run=Invoke-Root $case
    Assert-Electron ($run.ExitCode -eq 0) "bien: background run exits cleanly ($($run.ExitCode))"
    Assert-Electron ((Get-ActiveVersion $case) -ceq '0.0.990' -and -not(Test-Pending $case)) 'bien: 0.0.990 is confirmed and nothing stays pending'
    $key='HKCU:\'+$case.Prefix+'\Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta'
    Assert-Electron ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq '0.0.990') 'bien: injected HKCU registers 0.0.990'
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($c.Count -eq 1 -and (Get-Traces $case '0.0.989').Count -eq 0) 'bien: the UI of 0.0.990 starts once and 0.0.989 never'
    Assert-Electron ($c[0] -cmatch 'host-hello v=\d+ minimized=true zoom=125') 'bien: background hello is minimized with the zoom copied from 0.0.989'
    Assert-Electron (Test-Good $c[0]) 'bien: the UI sends ready and answers the control EOF'
    Assert-Electron $run.Clean 'bien: root finished and every own process ended'
    # 1b. La misma raíz sin --background: interactivo, nada pendiente.
    $run=Invoke-Root $case -Interactive
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($run.ExitCode -eq 0 -and (Get-ActiveVersion $case) -ceq '0.0.990' -and -not(Test-Pending $case)) "bien: interactive run keeps 0.0.990 ($($run.ExitCode))"
    Assert-Electron ($c.Count -eq 2 -and $c[1] -cmatch 'host-hello v=\d+ minimized=false zoom=125' -and (Test-Good $c[1])) 'bien: interactive hello is not minimized'
    Assert-Electron $run.Clean 'bien: interactive root finished and every own process ended'

    # 2. Nunca ready: el minuto de la raíz vence y vuelve A sin rechazar C (reintentable).
    $case=New-Case 'sin-ready' 'sin-ready'
    $run=Invoke-Root $case
    Assert-Electron ($run.ExitCode -eq 0) "sin-ready: run ends on 0.0.989 ($($run.ExitCode))"
    Assert-Electron ((Get-ActiveVersion $case) -ceq '0.0.989' -and -not(Test-Pending $case)) 'sin-ready: 0.0.989 is active with nothing pending'
    Assert-Electron ($null -eq (Get-Rejected $case)) 'sin-ready: rollback leaves 0.0.990 retryable (no rejectedVersion)'
    $c=Get-Traces $case '0.0.990';$a=Get-Traces $case '0.0.989'
    Assert-Electron ($c.Count -eq 1 -and $c[0].Contains('hello-sent') -and -not $c[0].Contains('ready-sent')) 'sin-ready: 0.0.990 greets and never sends ready'
    Assert-Electron ($a.Count -eq 1 -and (Test-Good $a[0])) 'sin-ready: 0.0.989 opens once and closes cleanly'
    Assert-Electron ($run.Seconds -ge 60) "sin-ready: root waited its full minute ($([int]$run.Seconds) s)"
    Assert-Electron $run.Clean 'sin-ready: root finished and every own process ended'

    # 3. Cae antes de conectar: la sesión muere y C se rechaza.
    $case=New-Case 'cae-antes' 'cae-antes'
    $run=Invoke-Root $case
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($c.Count -eq 1 -and $c[0].Contains('exit 3') -and -not $c[0].Contains('connected')) 'cae-antes: 0.0.990 exits before connecting'
    Assert-Rejected $case $run

    # 4. Cae tras Confirm: C sigue confirmada, la raíz sale con error una vez, sin bucle.
    $case=New-Case 'cae-tras-confirm' 'cae-tras-confirm'
    $run=Invoke-Root $case
    Assert-Electron ($run.ExitCode -eq 1) "cae-tras-confirm: root exits with error once ($($run.ExitCode))"
    Assert-Electron ((Get-ActiveVersion $case) -ceq '0.0.990' -and -not(Test-Pending $case) -and $null -eq (Get-Rejected $case)) 'cae-tras-confirm: 0.0.990 stays confirmed and is not rejected'
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($c.Count -eq 1 -and $c[0].Contains('confirmed-crash') -and (Get-Traces $case '0.0.989').Count -eq 0) 'cae-tras-confirm: one crash after the Confirm, no rollback'
    Assert-Electron $run.Clean 'cae-tras-confirm: root finished and every own process ended'
    $run=Invoke-Root $case
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($run.ExitCode -eq 0 -and (Get-ActiveVersion $case) -ceq '0.0.990' -and $c.Count -eq 2 -and (Test-Good $c[1])) "cae-tras-confirm: next start opens 0.0.990 without reverting ($($run.ExitCode))"
    Assert-Electron $run.Clean 'cae-tras-confirm: second root finished and every own process ended'

    # 5. Versión distinta: el anfitrión responde Incompatible y C se rechaza.
    $case=New-Case 'version' 'version'
    $run=Invoke-Root $case
    $c=Get-Traces $case '0.0.990'
    $hello=if($c.Count -eq 1){[regex]::Match($c[0],'host-hello v=(\d+)')}else{$null}
    $expected=if($hello -and $hello.Success){[int]$hello.Groups[1].Value}else{-1}
    Assert-Electron ($expected -gt 0 -and $c[0].Contains("hello-sent v=$($expected-1)") -and $c[0].Contains("host-failure Incompatible { expected: $expected, found: $($expected-1) }")) 'version: the host answers Incompatible with the exact versions'
    Assert-Rejected $case $run

    # 6. Token ajeno: el anfitrión cierra sin saludar y C se rechaza.
    $case=New-Case 'token' 'token'
    $run=Invoke-Root $case
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($c.Count -eq 1 -and $c[0].Contains('auth-sent') -and -not $c[0].Contains('host-hello')) 'token: a foreign token never gets the host hello'
    Assert-Rejected $case $run

    # 7. UI alterada tras instalar: la integridad de hub-ui impide arrancarla; C se rechaza.
    $case=New-Case 'integridad' 'bien'
    $state=Get-Content -LiteralPath (Join-Path $case.Install 'state.json') -Raw|ConvertFrom-Json
    [IO.File]::WriteAllText((Join-Path $case.Install ('generations/'+$state.active.generation+'/hub-ui/resources/app.asar')),'QA asar tampered')
    $run=Invoke-Root $case
    Assert-Electron ((Get-Traces $case '0.0.990').Count -eq 0) 'integridad: the tampered UI of 0.0.990 never starts'
    Assert-Rejected $case $run

    # 8. Reinicio en cada arranque: tres vueltas y luego «Reparar», sin diálogo ni bucle.
    $case=New-Case 'reinicio' 'reinicio'
    $run=Invoke-Root $case
    Assert-Electron ($run.ExitCode -eq 1 -and $run.Output.Contains('Demasiados reinicios consecutivos; ejecuta Reparar')) "reinicio: root stops with the repair error ($($run.ExitCode))"
    $c=Get-Traces $case '0.0.990'
    Assert-Electron ($c.Count -eq 3 -and @($c|Where-Object {Test-Good $_}).Count -eq 3) "reinicio: exactly three clean UI starts ($($c.Count))"
    Assert-Electron ((Get-ActiveVersion $case) -ceq '0.0.990' -and -not(Test-Pending $case) -and (Get-Traces $case '0.0.989').Count -eq 0) 'reinicio: the first turn confirmed 0.0.990'
    Assert-Electron ($run.Seconds -lt 30) "reinicio: the three turns take under 30 s ($([int]$run.Seconds) s)"
    Assert-Electron $run.Clean 'reinicio: root finished and every own process ended'
}catch{
    # El log del job es la evidencia: sin artefactos ni YAML.
    if($script:current){
        Write-Host "ELECTRON_BOOT_FAILED_CASE: $($script:current.Name)"
        foreach($log in @(Get-ChildItem -LiteralPath $script:current.Dir -Filter 'root-*.log' -ErrorAction SilentlyContinue)){Write-Host "--- $($log.Name)";Get-Content -LiteralPath $log.FullName|Write-Host}
        $traces=Join-Path $script:current.Install 'qa-ui-peer'
        foreach($trace in @(Get-ChildItem -LiteralPath $traces -ErrorAction SilentlyContinue)){Write-Host "--- $($trace.Name)";Get-Content -LiteralPath $trace.FullName|Write-Host}
    }
    throw
}finally{
    foreach($hive in $hives){
        if($hive -cnotmatch '^HKCU:\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}\\electron$'){throw 'ELECTRON_BOOT_HIVE_REJECTED'}
        Remove-Item -LiteralPath $hive -Recurse -Force
    }
}
"$passed electron boot checks PASS"
