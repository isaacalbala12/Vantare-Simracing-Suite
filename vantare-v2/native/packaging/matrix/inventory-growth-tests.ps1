#requires -Version 5.1
param([string]$Root,[string]$TestVerifier,[string]$MatrixDirectory=$PSScriptRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $MatrixDirectory 'guard.ps1')
$qaGrowthRoot=Assert-MatrixRoot $Root
if (Test-Path -LiteralPath $qaGrowthRoot) { throw 'Growth test needs a fresh root' }
[IO.Directory]::CreateDirectory($qaGrowthRoot) | Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $script:Packaging 'beta.ps1') -Root $qaGrowthRoot
. (Join-Path $MatrixDirectory 'fixtures.ps1')
$passed=0
function Assert-Growth([bool]$Value,[string]$Message) { if(-not $Value){throw $Message};$script:passed++;"PASS $Message" }
function Reject-Growth([scriptblock]$Action,[string]$Message,[string]$Expected) {
    if(-not $Expected){throw 'A rejection must declare its cause'}
    $failure=$null
    try { $null=& $Action } catch { $failure=$_.Exception.Message }
    if($null -ne $failure -and $failure -cne $Expected){throw ("Unexpected rejection for {0}: {1}" -f $Message,$failure)}
    Assert-Growth ($failure -ceq $Expected) $Message
}
$qaHive='Registry::HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+[guid]::NewGuid().ToString('N')
New-Item -Path $qaHive -Force | Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry $qaHive -Scope Global | Out-Null
try {
    $old=Join-Path $qaGrowthRoot 'old'
    New-MatrixPayload $old '1.0.0' $TestVerifier
    $oldMembers=@(Get-NativeMembers 'beta')
    $install=Open-NativeRoot (Join-Path $qaGrowthRoot 'install') -Initialize
    $reference=Add-MatrixGeneration $install ('a'*32) $old
    $oldGeneration=Join-Path $install ('generations/'+$reference.generation)
    [IO.Directory]::CreateDirectory((Join-Path $oldGeneration 'data/empty')) | Out-Null
    Set-NativeState $install @{schema=1;product='vantare-native';channel='beta';active=$reference;previous=$null}
    $before=Get-NativeDataIndex (Join-Path $oldGeneration 'data')
    $stateBytes=[IO.File]::ReadAllBytes((Join-Path $install 'state.json'))
    # Simulate the next engine's closed public inventory gaining ONE approved
    # resource. The installed N manifest and its state hash remain unchanged.
    $script:GrowthMembers=$oldMembers+@('bin/fixtures/future-approved.json')
    function Get-NativeMembers([string]$CandidateChannel) {
        if ($CandidateChannel -cne 'beta') { throw 'Unexpected growth fixture channel' }
        $script:GrowthMembers
    }
    $script:NativeMembers=@(Get-NativeMembers 'beta')
    $null=Read-NativeState $install
    Assert-Growth ([Convert]::ToBase64String($stateBytes) -ceq [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $install 'state.json')))) 'N is readable under N+1 without changing state bytes'
    $incoming=Join-Path $qaGrowthRoot 'new'
    New-MatrixPayload $incoming '1.0.1' $TestVerifier
    $oldZip=Join-Path $qaGrowthRoot 'old.zip';New-NativeZip $old $oldZip
    Reject-Growth { Expand-NativePackage $oldZip (Get-NativeHash $oldZip) (Join-Path $qaGrowthRoot 'rejected') 'beta' } 'Incoming N is still rejected against the full N+1 inventory' 'Número de miembros ZIP incorrecto.'
    $zip=Join-Path $qaGrowthRoot 'new.zip';New-NativeZip $incoming $zip
    $state=Update-NativeCandidate $install $zip (Get-NativeHash $zip)
    $newGeneration=Join-Path $install ('generations/'+$state.active.generation)
    Assert-Growth ($state.previous.generation -ceq $reference.generation -and (Read-NativeManifest $newGeneration 'beta' -Installed).files.Count -eq ($oldMembers.Count+1)) 'N to N+1 grows the inventory and retains N for rollback'
    Assert-Growth ((Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before -and (Get-NativeDataIndex (Join-Path $newGeneration 'data')) -ceq $before) 'Upgrade preserves exact original and copied data, including empty directories'
    $restored=Restore-NativeCandidate $install
    Assert-Growth ($restored.active.generation -ceq $reference.generation -and (Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before) 'Rollback restores N with its exact data'

    # Retiring/renaming a resource removes it from INCOMING inventory, but its
    # explicit known path remains valid for installed N and for cleanup.
    $retired='bin/fixtures/standings-legacy.snapshot.json'
    $script:GrowthMembers=@($script:GrowthMembers | Where-Object {$_ -cne $retired})
    $script:NativeRetiredMembers=@($retired)
    $stateBeforeRetirement=Get-NativeHash (Join-Path $install 'state.json')
    $null=Read-NativeState $install
    Assert-Growth ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateBeforeRetirement) 'Removing an incoming resource does not invalidate installed manifests or state'
    $withdrawn=Join-Path $qaGrowthRoot 'withdrawn'
    New-MatrixPayload $withdrawn '1.0.2' $TestVerifier
    $withdrawnZip=Join-Path $qaGrowthRoot 'withdrawn.zip';New-NativeZip $withdrawn $withdrawnZip
    $state=Update-NativeCandidate $install $withdrawnZip (Get-NativeHash $withdrawnZip)
    $withdrawnGeneration=Join-Path $install ('generations/'+$state.active.generation)
    Assert-Growth (-not(Test-Path -LiteralPath (Join-Path $withdrawnGeneration $retired)) -and (Get-NativeDataIndex (Join-Path $withdrawnGeneration 'data')) -ceq $before) 'Incoming package omits retired resource and preserves data'
    $restored=Restore-NativeCandidate $install
    Assert-Growth ($restored.active.generation -ceq $reference.generation) 'Rollback reads a generation containing the retired resource'

    $manifestPath=Join-Path $oldGeneration 'manifest.json'
    $manifestBytes=[IO.File]::ReadAllBytes($manifestPath)
    foreach ($mutation in @('traversal','absolute','backslash','unknown','case','duplicate','channel','empty')) {
        $manifest=[Text.Encoding]::UTF8.GetString($manifestBytes) | ConvertFrom-Json
        switch ($mutation) {
            'traversal' {$manifest.files[0].path='../escape.exe'}
            'absolute' {$manifest.files[0].path='C:/escape.exe'}
            'backslash' {$manifest.files[0].path='bin\..\escape.exe'}
            'unknown' {$manifest.files[0].path='bin/unapproved.exe'}
            'case' {$manifest.files[0].path=$manifest.files[0].path.ToUpperInvariant()}
            'duplicate' {$manifest.files+=@($manifest.files[0])}
            'channel' {$manifest.channel='nightly'}
            'empty' {$manifest.files=@()}
        }
        try {
            Write-BetaJson $manifestPath $manifest
            $reason=if($mutation -ceq 'channel'){'Manifiesto, esquema o canal incompatible.'}elseif($mutation -ceq 'empty'){'Inventario instalado vacío.'}else{'Lista de archivos inválida o duplicada.'}
            Reject-Growth {Read-NativeManifest $oldGeneration 'beta' $false -Installed} "Installed manifest rejects $mutation" $reason
            Reject-Growth {Read-NativeState $install $false} "State hash rejects changed manifest: $mutation" 'Generación activa/anterior incompleta.'
        } finally { [IO.File]::WriteAllBytes($manifestPath,$manifestBytes) }
    }
    $unlisted=Join-Path $oldGeneration 'unlisted.json'
    try {
        [IO.File]::WriteAllText($unlisted,'unlisted')
        Reject-Growth {Read-NativeState $install} 'Unlisted disk file remains forbidden' 'Archivo instalado no enumerado en el manifiesto.'
    } finally { Remove-Item -LiteralPath $unlisted }
    $image=Join-Path $oldGeneration 'bin/vantare.exe'
    $imageBytes=[IO.File]::ReadAllBytes($image)
    try {
        [IO.File]::AppendAllText($image,'tampered')
        Reject-Growth {Read-NativeState $install} 'Executable integrity remains mandatory' 'Integridad incorrecta: bin/vantare.exe'
    } finally { [IO.File]::WriteAllBytes($image,$imageBytes) }
    $null=Read-NativeState $install
    $sidecar=$image+'.sha256'
    $sidecarBytes=[IO.File]::ReadAllBytes($sidecar)
    try {
        [IO.File]::WriteAllText($sidecar,(('0'*64)+'  vantare.exe'+"`n"))
        Reject-Growth {Read-NativeState $install} 'Executable sidecar remains mandatory' 'Sidecar incorrecto: bin/vantare.exe'
    } finally { [IO.File]::WriteAllBytes($sidecar,$sidecarBytes) }
    $junction=Join-Path $oldGeneration 'linked'
    $junctionTarget=Join-Path $qaGrowthRoot 'junction-target'
    [IO.Directory]::CreateDirectory($junctionTarget) | Out-Null
    New-Item -ItemType Junction -Path $junction -Target $junctionTarget | Out-Null
    try { Reject-Growth {Read-NativeState $install} 'Generation reparse point remains forbidden' 'Árbol .env o reparse point rechazado antes de leerlo.' }
    finally { $null=Assert-MatrixRoot $qaGrowthRoot;[IO.Directory]::Delete($junction) }
    Uninstall-Beta $install
    Assert-Growth ((Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before -and (Get-NativeDataIndex (Join-Path $newGeneration 'data')) -ceq $before -and (Get-NativeDataIndex (Join-Path $withdrawnGeneration 'data')) -ceq $before) 'Uninstall retains all three generations of data'
    Assert-Growth (-not(Test-Path -LiteralPath (Join-Path $oldGeneration $retired)) -and -not(Test-Path -LiteralPath (Join-Path $newGeneration $retired))) 'Uninstall removes retired program resources, never user data'
    Write-NativeJson (Join-Path $qaGrowthRoot 'result.json') @{checks=$passed;old_members=$oldMembers.Count;grown_members=($oldMembers.Count+1);withdrawn_members=$script:GrowthMembers.Count;data_unchanged=$true}
} finally {
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global | Out-Null
    if($qaHive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'Growth hive cleanup rejected'}
    Remove-Item -LiteralPath $qaHive -Recurse -Force
}
"$passed inventory growth checks PASS; evidence $qaGrowthRoot"
