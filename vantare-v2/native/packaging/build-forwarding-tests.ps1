# Regression for entry-point re-entry under an existing shared target lease.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
$root=Join-Path $QaRoot ('forwarding-'+[guid]::NewGuid().ToString('N'))
$saved=@{}
foreach($name in @('VANTARE_CARGO_QUEUE_OWNER','CARGO_TARGET_DIR','DUCKDB_LIB_DIR')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$previousBun=Get-Item Function:global:bun -ErrorAction SilentlyContinue
try{
    # No lease, compiler or Electron is started: correct binding must reach the
    # inner stage's guard before it reads/builds any artifacts.
    $env:VANTARE_CARGO_QUEUE_OWNER='99999919'
    Remove-Item Env:CARGO_TARGET_DIR,Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
    function global:bun {$global:LASTEXITCODE=0}
    foreach($case in @(
        @{script='build-candidate.ps1';reason='La fase Rust exige el slot de compilación'},
        @{script='build-installer.ps1';reason='Setup exige el slot de compilación'}
    )){
        $rejected=$false
        try{
            if($case.script -eq 'build-candidate.ps1'){
                & (Join-Path $PSScriptRoot $case.script) -Version '0.0.989' -Channel nightly -OutputDirectory (Join-Path $root $case.script) -AllowDirty|Out-Null
            }else{
                & (Join-Path $PSScriptRoot $case.script) -Version '0.0.989' -Channel nightly -OutputDirectory (Join-Path $root $case.script)|Out-Null
            }
        }catch{
            if($_.Exception.Message -cne $case.reason){throw}
            $rejected=$true
        }
        if(-not $rejected){throw 'Re-entry did not preserve named parameters'}
    }
}finally{
    foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if($previousBun){Set-Item Function:global:bun $previousBun.ScriptBlock}else{Remove-Item Function:global:bun}
}
'PASS entry-point re-entry: version, channel and switches retain named binding'
