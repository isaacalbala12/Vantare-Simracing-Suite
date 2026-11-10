# Local IPC bank only. Capture its offscreen HWND, without desktop input.
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$QaRoot,
    [Parameter(Mandatory)][string]$EvidenceRoot,
    [ValidateSet('resumen','cuestionarios','comunidad','triage')][string[]]$Tabs=@('resumen','cuestionarios','comunidad','triage')
)
$ErrorActionPreference='Stop'
function Get-CaptureReceiptHash([string]$Path){
    $bytes=[IO.File]::ReadAllBytes($Path)
    $parts=[Text.StringBuilder]::new()
    for($offset=0;$offset -lt $bytes.Length;$offset+=1048576){
        $length=[Math]::Min(1048576,$bytes.Length-$offset)
        $chunk=[byte[]]::new($length)
        [Buffer]::BlockCopy($bytes,$offset,$chunk,0,$length)
        [void]$parts.Append([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($chunk)).ToLowerInvariant())
    }
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($parts.ToString()))).ToLowerInvariant()
}
$binary=[IO.Path]::GetFullPath($Executable)
if([IO.Path]::GetFileName($binary) -ne 'vantare.exe'){throw 'Usa la copia QA de ui-quality como vantare.exe'}
$fixtures=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../fixtures'))
$qa=[IO.Path]::GetFullPath($QaRoot)
$evidence=[IO.Path]::GetFullPath($EvidenceRoot)
foreach($theme in @('dark','light')){
    foreach($tab in $Tabs){
        $scene="testing-center-$tab"
        $root=Join-Path $qa "$theme-$tab"
        [IO.Directory]::CreateDirectory($root)|Out-Null
        $replies=Get-Content -LiteralPath (Join-Path $fixtures 'testing-access.json') -Raw | ConvertFrom-Json -AsHashtable
        $replies.LicenseStatus=@{result='LicenseStatus';policy=$replies.core_policy;session='SignedIn';notice=$null}
        $replies.AccountProfileRefresh=$replies.AccountPoll
        $replies.TestingRefresh.data=Get-Content -LiteralPath (Join-Path $fixtures 'testing-participation.json') -Raw | ConvertFrom-Json -AsHashtable
        $replies | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $root 'replies.json') -Encoding utf8
        $appearance=Join-Path $root 'appearance.json'
        @{scheme=$theme;palette='vantare';contrast=100;glassOpacity=80;interfaceFont='inter';monoFont='cascadia';reducedMotion=$false} | ConvertTo-Json | Set-Content -LiteralPath $appearance -Encoding utf8
        $start=[Diagnostics.ProcessStartInfo]::new($binary)
        $start.UseShellExecute=$false
        $start.CreateNoWindow=$true
        $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
        $start.RedirectStandardInput=$true
        $start.Environment['VANTARE_CAPTURE_POLICY']='ipc'
        $start.Environment['VANTARE_NATIVE_DATA_ROOT']=$root
        foreach($argument in @('--qa-root',$root,'--capture',$scene,'--qa-testing','--qa-size','1440x900','--qa-appearance',$appearance,'--control-stdin')){[void]$start.ArgumentList.Add($argument)}
        $process=[Diagnostics.Process]::Start($start)
        try{
            $deadline=[DateTime]::UtcNow.AddMinutes(15)
            # Wait for two fresh IPC policy reads and the confirmed local account,
            # rather than sleeping a fixed time and guessing that access is ready.
            do{
                if($process.HasExited){throw "Banco QA terminado: $($process.ExitCode)"}
                $rights=@(Get-Content -LiteralPath (Join-Path $root 'rights-requests.jsonl') -ErrorAction SilentlyContinue)
                $requests=Get-Content -LiteralPath (Join-Path $root 'requests.jsonl') -Raw -ErrorAction SilentlyContinue
                if($rights.Count -ge 2 -and $requests -match 'AccountPoll' -and $requests -match 'LicenseStatus'){break}
                if([DateTime]::UtcNow -ge $deadline){throw 'No llegó la política de tester o la cuenta del doble local'}
                Start-Sleep -Milliseconds 100
            }while($true)
            $folder=Join-Path $evidence $theme
            [IO.Directory]::CreateDirectory($folder)|Out-Null
            & (Join-Path $PSScriptRoot 'capture-window.ps1') -ProcessId $process.Id -ExpectedExecutable $binary -OutputPath (Join-Path $folder "$scene.png") -Width 1440 -Height 900
            $png=Join-Path $folder "$scene.png"
            $inputs=@{scene=$scene;appearance="vantare-$theme";size=@(1440,900);executable=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash;replies=$replies} | ConvertTo-Json -Depth 30 -Compress
            $inputHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($inputs))).ToLowerInvariant()
            @{inputs=$inputHash;png=(Get-CaptureReceiptHash $png)} | ConvertTo-Json -Compress | Set-Content -LiteralPath "$png.capture.json" -Encoding utf8
            $manifest=Join-Path $folder 'capture-batch.json'
            $entries=if(Test-Path -LiteralPath $manifest){@(Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)}else{@()}
            $entries=@($entries | Where-Object {$_.scene -ne $scene}) + @(@{scene=$scene;appearance="vantare-$theme";size=@(1440,900);output=$png})
            ConvertTo-Json -InputObject $entries -Depth 20 | Set-Content -LiteralPath $manifest -Encoding utf8
        }finally{
            $process.StandardInput.Close()
            if(-not $process.WaitForExit(10000)){$process.Kill();$process.WaitForExit()}
            $process.Dispose()
        }
    }
}
