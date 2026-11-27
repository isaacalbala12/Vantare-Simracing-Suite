#requires -Version 5.1
# Actualización firmada del Hub en la matriz instalada (#2771, P5 PR C). Raíz real
# (`vantare.exe` QA con `hub-update-qa`), sesión real con su `stage`, Hub de pega
# (`boot-confirmation-matrix`) y feed por 127.0.0.1 con ofertas firmadas con la semilla
# TEST pública de la matriz (`matrix-verifier --matrix-sign`). Solo raíces QA guardadas y
# HKCU inyectado; el servidor de feed se para por su propio proceso, nunca por nombre.
param([string]$Root,[string]$TestVerifier,[string]$BootProbe,[string]$WriteEngine,[string]$FeedLauncher,[string]$FeedServer)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qa=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qa){throw 'SIGNED_FEED_NEEDS_FRESH_QA_ROOT'}
foreach($path in @($TestVerifier,$BootProbe,$WriteEngine,$FeedLauncher,$FeedServer)){
    if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'SIGNED_FEED_BINARY_MISSING'}
}
[IO.Directory]::CreateDirectory($qa)|Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'support.ps1')
. (Join-Path $PSScriptRoot 'fixtures.ps1')
$assets=Join-Path $qa 'assets'
$releases='/api/releases?per_page=100'
$offerRoute='/download/hub-beta-v0.0.990/vantare-hub-beta.json'
$zipRoute='/download/hub-beta-v0.0.990/vantare-native-amd64-package.zip'
$passed=0
$hives=[Collections.Generic.List[string]]::new()
$feeds=[Collections.Generic.List[object]]::new()
function Assert-Signed([bool]$Value,[string]$Message){if(-not $Value){throw "SIGNED_FEED_ASSERT: $Message"};$script:passed++;"PASS $Message"}

# Paquete de la matriz con el lanzador QA y el Hub de pega en su generación.
function New-FeedPackage([string]$Version){
    $directory=Join-Path $assets ('v'+$Version)
    New-MatrixPayload $directory ('0.0.'+$Version) $TestVerifier
    Copy-Item -LiteralPath $FeedLauncher -Destination (Join-Path $directory 'bin/vantare.exe') -Force
    Copy-Item -LiteralPath $BootProbe -Destination (Join-Path $directory 'bin/vantare-hub.exe') -Force
    foreach($name in @('vantare.exe','vantare-hub.exe')){
        [IO.File]::WriteAllText((Join-Path $directory "bin/$name.sha256"),((Get-NativeHash (Join-Path $directory "bin/$name"))+"  $name`n"))
    }
    $manifestPath=Join-Path $directory 'manifest.json'
    $manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
    foreach($member in $manifest.files){
        if($member.path -in @('bin/vantare.exe','bin/vantare.exe.sha256','bin/vantare-hub.exe','bin/vantare-hub.exe.sha256')){
            $file=Join-Path $directory $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file
        }
    }
    $null=Assert-MatrixRoot $manifestPath
    Remove-Item -LiteralPath $manifestPath -Force
    Write-NativeJson $manifestPath $manifest
    $zip=Join-Path $assets ('v'+$Version+'.zip')
    New-NativeZip $directory $zip
    # Total expandido como lo comprueba `stage`: el manifiesto y cada miembro declarado.
    $expanded=[int64](Get-Item -LiteralPath $manifestPath).Length
    foreach($member in $manifest.files){$expanded+=[int64]$member.size}
    [pscustomobject]@{Zip=$zip;Expanded=$expanded}
}
# Sobre firmado con la semilla TEST pública; `-Tamper` cambia un carácter de la firma.
function New-SignedOffer($Package,[switch]$Tamper){
    $offer=[ordered]@{schema=2;product='vantare-hub';channel='beta';version='0.0.990'
        url='https://github.com/isaacalbala12/Vantare-Downloads/releases/download/hub-beta-v0.0.990/vantare-native-amd64-package.zip'
        sha256=(Get-NativeHash $Package.Zip);notes='Matriz firmada';compressed_bytes=(Get-Item -LiteralPath $Package.Zip).Length;expanded_bytes=$Package.Expanded}
    $signed=Invoke-NativeProcess $TestVerifier @('--matrix-sign') ($offer|ConvertTo-Json -Compress)
    if($signed.ExitCode){throw "SIGNED_FEED_SIGN_FAILED: $($signed.Stderr)"}
    $envelope=$signed.Stdout|ConvertFrom-Json
    if($Tamper){
        $first=if($envelope.signature[0] -ceq 'A'){'B'}else{'A'}
        $envelope.signature=$first+$envelope.signature.Substring(1)
    }
    $envelope|ConvertTo-Json -Compress
}
# Raíz nueva con 0.0.989 instalada por el escritor, HKCU y carpetas inyectados propios.
function New-Case([string]$Name){
    $case=Join-Path $qa $Name
    $paths=[pscustomobject]@{Install=(Join-Path $case 'install');Shell=(Join-Path $case 'shell');Local=(Join-Path $case 'LocalAppData')
        Payload=(Join-Path $case 'payload');Feed=(Join-Path $case 'feed');State=(Join-Path $case 'feed-state')
        Prefix=('Software\VantareInstallerMatrix\'+[guid]::NewGuid().ToString('N')+'\signed')}
    foreach($directory in @($paths.Shell,$paths.Local,$paths.Payload,$paths.Feed,$paths.State)){[IO.Directory]::CreateDirectory($directory)|Out-Null}
    New-Item -Path ('HKCU:\'+$paths.Prefix) -Force|Out-Null
    $script:hives.Add('HKCU:\'+$paths.Prefix)
    Copy-Item -LiteralPath (Join-Path $assets 'v989.zip') -Destination (Join-Path $paths.Payload 'package.zip')
    Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $paths.Payload 'Uninstall.exe')
    [IO.File]::WriteAllText((Join-Path $paths.Payload 'installer-notices.txt'),'QA fixture')
    $contract=Join-Path $case 'contract.json'
    $request=@{operation='Install';root=$paths.Install;qa=$false;silent=$true;uninstall=$false;version='0.0.989';size=1;mode='auto';desktop=$true;autostart=$true
        processId=2147483647;packageSha=(Get-NativeHash (Join-Path $paths.Payload 'package.zip'));logFile=($contract+'.log')}
    Write-NativeJson $contract @{request=$request;context=@{localAppData=$paths.Local;registryPrefix=$paths.Prefix;shellRoot=$paths.Shell};payloadDirectory=$paths.Payload;qaAction=$null}
    & $WriteEngine $contract | Out-Null
    if($LASTEXITCODE){throw "SIGNED_FEED_INSTALL_FAILED: $Name"}
    Copy-Item -LiteralPath $FeedLauncher -Destination (Join-Path $paths.Install 'Vantare.exe') -Force
    # El Hub de pega sale en cuanto la sesión lo permite: el recorrido va solo.
    [IO.File]::WriteAllText((Join-Path $paths.Install 'allow-exit'),'QA child may exit')
    $paths
}
function Write-Feed($Case,[string[]]$Versions,[AllowNull()][string]$Offer,[string]$Zip){
    # -InputObject conserva el array aunque tenga un solo elemento (la tubería lo desenrolla).
    $list=ConvertTo-Json -InputObject @($Versions|ForEach-Object {[ordered]@{draft=$false;tag_name="hub-beta-v$_"}}) -Compress
    [IO.File]::WriteAllText((Join-Path $Case.Feed 'releases.json'),$list,[Text.UTF8Encoding]::new($false))
    if($Offer){
        $tag=Join-Path $Case.Feed 'hub-beta-v0.0.990'
        [IO.Directory]::CreateDirectory($tag)|Out-Null
        [IO.File]::WriteAllText((Join-Path $tag 'vantare-hub-beta.json'),$Offer)
        Copy-Item -LiteralPath $Zip -Destination (Join-Path $tag 'vantare-native-amd64-package.zip')
    }
}
function Start-Feed($Case){
    $port=Join-Path $Case.State 'port';$log=Join-Path $Case.State 'requests.log';$stop=Join-Path $Case.State 'stop'
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$FeedServer
    $info.Arguments=(@($Case.Feed,$port,$log,$stop)|ForEach-Object {'"'+$_+'"'}) -join ' '
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $process=[Diagnostics.Process]::Start($info)
    $feed=[pscustomobject]@{Process=$process;Log=$log;Stop=$stop}
    $script:feeds.Add($feed)
    [IO.File]::WriteAllText((Join-Path $Case.State 'server.pid'),[string]$process.Id)
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    while(-not(Test-Path -LiteralPath $port)){
        if($process.HasExited -or [DateTime]::UtcNow -ge $deadline){throw 'SIGNED_FEED_SERVER_NOT_READY'}
        Start-Sleep -Milliseconds 20
    }
    [IO.File]::WriteAllText((Join-Path $Case.Install 'qa-feed-port'),[IO.File]::ReadAllText($port))
    $feed
}
function Stop-Feed($Feed){
    if($Feed.Process.HasExited){return}
    [IO.File]::WriteAllText($Feed.Stop,'stop')
    if(-not $Feed.Process.WaitForExit(10000)){$Feed.Process.Kill();$Feed.Process.WaitForExit()}
}
function Get-Requests($Feed){if(Test-Path -LiteralPath $Feed.Log){@(Get-Content -LiteralPath $Feed.Log)}else{@()}}
function Invoke-Root($Case,[switch]$WrongToken){
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $Case.Install 'Vantare.exe'
    $info.Arguments='--root -Root "'+$Case.Install+'" --background'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables['TEMP']=$qa;$info.EnvironmentVariables['TMP']=$qa
    $info.EnvironmentVariables['LOCALAPPDATA']=$Case.Local
    $info.EnvironmentVariables['VANTARE_QA_LOCAL_APP_DATA']=$Case.Local
    $info.EnvironmentVariables['VANTARE_QA_REGISTRY_PREFIX']=$Case.Prefix
    $info.EnvironmentVariables['VANTARE_QA_SHELL_ROOT']=$Case.Shell
    $info.EnvironmentVariables['VANTARE_QA_SESSION_PROBE']=$BootProbe
    # Solo el arranque pendiente de 0.0.990 publica otro token; la sesión de después de
    # revertir debe ir bien para demostrar que la oferta rechazada no se vuelve a pedir.
    if($WrongToken){$info.EnvironmentVariables['VANTARE_QA_WRONG_PENDING_BOOT_TOKEN']='1'}
    $process=[Diagnostics.Process]::Start($info)
    try{
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        if(-not $process.WaitForExit(180000)){throw 'SIGNED_FEED_ROOT_TIMEOUT'}
        $output="$($stdout.GetAwaiter().GetResult())`n$($stderr.GetAwaiter().GetResult())"
        [IO.File]::WriteAllText((Join-Path (Split-Path $Case.Install -Parent) 'root.log'),$output)
        [pscustomobject]@{ExitCode=$process.ExitCode;Output=$output}
    }finally{
        if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
        $process.Dispose()
    }
}
function Get-ActiveVersion($Case){
    $state=Get-Content -LiteralPath (Join-Path $Case.Install 'state.json') -Raw|ConvertFrom-Json
    (Get-Content -LiteralPath (Join-Path $Case.Install ('generations/'+$state.active.generation+'/manifest.json')) -Raw|ConvertFrom-Json).version
}
function Get-Status($Case){
    $path=Join-Path $Case.Install 'update-status.json'
    if(Test-Path -LiteralPath $path){Get-Content -LiteralPath $path -Raw|ConvertFrom-Json}else{$null}
}
function Test-Same([string[]]$Actual,[string[]]$Expected){($Actual -join "`n") -ceq ($Expected -join "`n")}

try{
    $env:TEMP=$qa;$env:TMP=$qa
    [IO.Directory]::CreateDirectory($assets)|Out-Null
    $null=New-FeedPackage '989'
    $next=New-FeedPackage '990'
    $valid=New-SignedOffer $next

    # 1. Oferta firmada: la sesión la prepara, la aplica al salir y la raíz confirma 0.0.990.
    $case=New-Case 'confirma'
    Write-Feed $case @('0.0.990') $valid $next.Zip
    $feed=Start-Feed $case
    $run=Invoke-Root $case
    Stop-Feed $feed
    Assert-Signed ($run.ExitCode -eq 0) "signed update run exits cleanly ($($run.ExitCode))"
    Assert-Signed (Test-Same (Get-Requests $feed) @($releases,$offerRoute,$zipRoute)) 'session asks list, offer and ZIP once'
    Assert-Signed ((Get-ActiveVersion $case) -ceq '0.0.990') 'signed 0.0.990 is active after the restart'
    Assert-Signed ((Get-Status $case).state -ceq 'current') 'confirmed boot leaves the status current'
    Assert-Signed (-not(Test-Path -LiteralPath (Join-Path $case.Install 'boot-pending.json'))) 'confirmation removes the boot marker'
    $key='HKCU:\'+$case.Prefix+'\Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta'
    Assert-Signed ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq '0.0.990') 'injected HKCU registers the confirmed version'

    # 2. El arranque de 0.0.990 publica otro token: vuelve 0.0.989 y no se reofrece.
    $case=New-Case 'token-ajeno'
    Write-Feed $case @('0.0.990') $valid $next.Zip
    $feed=Start-Feed $case
    $run=Invoke-Root $case -WrongToken
    Stop-Feed $feed
    Assert-Signed ($run.ExitCode -eq 0) "rolled back run ends on 0.0.989 ($($run.ExitCode))"
    Assert-Signed ((Get-ActiveVersion $case) -ceq '0.0.989') 'wrong Hub token restores 0.0.989'
    Assert-Signed ((Get-Status $case).rejectedVersion -ceq '0.0.990') 'rollback rejects 0.0.990'
    Assert-Signed (Test-Same (Get-Requests $feed) @($releases,$offerRoute,$zipRoute,$releases)) 'rejected offer is never fetched again'
    Assert-Signed (-not(Test-Path -LiteralPath (Join-Path $case.Install 'staging/pending.json'))) 'nothing stays pending after the rollback'

    # 3. Firma alterada: se pide la oferta, nunca el ZIP.
    $case=New-Case 'firma-alterada'
    Write-Feed $case @('0.0.990') (New-SignedOffer $next -Tamper) $next.Zip
    $feed=Start-Feed $case
    $run=Invoke-Root $case
    Stop-Feed $feed
    Assert-Signed ($run.ExitCode -eq 0) "tampered offer run exits cleanly ($($run.ExitCode))"
    Assert-Signed (Test-Same (Get-Requests $feed) @($releases,$offerRoute)) 'tampered signature never downloads the ZIP'
    Assert-Signed ((Get-ActiveVersion $case) -ceq '0.0.989') 'tampered offer leaves 0.0.989 active'
    Assert-Signed (-not(Test-Path -LiteralPath (Join-Path $case.Install 'staging/pending.json'))) 'tampered offer publishes nothing'

    # 4. Solo versiones iguales o menores: solo la lista.
    $case=New-Case 'version-igual-o-menor'
    Write-Feed $case @('0.0.989','0.0.988') $null ''
    $feed=Start-Feed $case
    $run=Invoke-Root $case
    Stop-Feed $feed
    Assert-Signed ($run.ExitCode -eq 0) "equal or older feed run exits cleanly ($($run.ExitCode))"
    Assert-Signed (Test-Same (Get-Requests $feed) @($releases)) 'equal or older versions are never fetched'
    Assert-Signed (-not(Test-Path -LiteralPath (Join-Path $case.Install 'staging/pending.json'))) 'equal or older versions publish nothing'
    Assert-Signed (-not(Test-Path -LiteralPath (Join-Path $case.Install 'boot-pending.json'))) 'equal or older versions leave no boot marker'
    Assert-Signed ((Get-ActiveVersion $case) -ceq '0.0.989') 'equal or older versions leave 0.0.989 active'
    # «Estás al día» se publica bajo .operation.lock, que la raíz toma a la vez para renovar el
    # registro: si la sesión llega mientras, `stage` falla con «archivo en uso» (os error 32),
    # lo registra y no escribe estado (igual que el producto). Uno de los dos, completo.
    $status=Get-Status $case
    $busy=$run.Output -match 'feed beta QA: .*\(os error 32\)'
    Assert-Signed ((($null -ne $status) -and $status.state -ceq 'current') -or (($null -eq $status) -and $busy)) 'equal or older versions: status current, or none with the busy-lock log'

    # 5. Sin archivo de puerto: el feed falla, se registra y la sesión sigue.
    $case=New-Case 'sin-puerto'
    $run=Invoke-Root $case
    Assert-Signed ($run.ExitCode -eq 0) "run without a port file exits cleanly ($($run.ExitCode))"
    Assert-Signed ((Get-ActiveVersion $case) -ceq '0.0.989') 'missing port file leaves 0.0.989 active'
    Assert-Signed ($null -eq (Get-Status $case)) 'missing port file writes no update status'
}finally{
    foreach($feed in $feeds){Stop-Feed $feed;$feed.Process.Dispose()}
    foreach($hive in $hives){
        if($hive -cnotmatch '^HKCU:\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}\\signed$'){throw 'SIGNED_FEED_HIVE_REJECTED'}
        Remove-Item -LiteralPath $hive -Recurse -Force
    }
}
"$passed signed feed checks PASS"
