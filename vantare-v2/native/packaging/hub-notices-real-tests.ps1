# Uses actual frozen Bun dependencies, not a fabricated node_modules tree.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$Project,[Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
$project=[IO.Path]::GetFullPath($Project)
$evidence=Assert-BuildPath $EvidenceDirectory
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$output=Join-Path $evidence 'distribution-hub-notices.txt'
Write-HubNotices $project $output
$text=[IO.File]::ReadAllText($output).Replace("`r`n","`n")
$checked=@()
# scheduler is transitive: the collector must preserve more than package.json.
foreach($name in @('react','react-dom','scheduler')){
    $module=Join-Path $project ('node_modules/'+$name)
    $license=@(Get-ChildItem -LiteralPath $module -File|Where-Object {$_.Name -match '^LICENSE([._-].*)?$'})
    if(-not $license.Count){throw "Missing real Bun license: $name"}
    foreach($file in $license){
        $body=[IO.File]::ReadAllText($file.FullName).Replace("`r`n","`n")
        $suffix=[regex]::Escape($name+'/'+$file.Name)
        if(-not $body.Trim() -or -not $text.Contains($body) -or -not [regex]::IsMatch($text,'(?m)^--- (?:.*/)?'+$suffix+' ---$')){throw "Real Bun license omitted from notices: $name"}
        $checked+=@{package=$name;file=$file.Name;sha256=(Get-NativeHash $file.FullName)}
    }
}
Write-BuildJson (Join-Path $evidence 'distribution-hub-notices.json') @{checked=$checked;bytes=(Get-Item -LiteralPath $output).Length;real_bun_dependencies=$true;graphics=$false}
'PASS real Bun license notices: React, React DOM and transitive scheduler'
