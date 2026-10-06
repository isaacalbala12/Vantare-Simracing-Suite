#requires -Version 5.1
param([string]$EvidenceDirectory = 'C:/tmp/1472-arreglos-r2-evidence')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/beta.ps1"
$evidence = Join-Path $EvidenceDirectory ('uninstall-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($evidence) | Out-Null
function New-FixturePackage([string]$Label,[bool]$Fixtures){
  $payload=Join-Path $evidence $Label
  [IO.Directory]::CreateDirectory($payload)|Out-Null
  $members=@($script:NativeMembers | Where-Object { $Fixtures -or -not $_.StartsWith('bin/fixtures/') })
  foreach($member in $members){
    $path=Join-Path $payload $member
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))|Out-Null
    if($member.EndsWith('.exe')){
      $bytes=New-Object byte[] 128
      $bytes[0]=0x4d;$bytes[1]=0x5a;$bytes[60]=64;$bytes[64]=0x50;$bytes[65]=0x45;$bytes[68]=0x64;$bytes[69]=0x86
      [IO.File]::WriteAllBytes($path,$bytes)
    } elseif($member.EndsWith('.sha256')){
      $bin=$path.Substring(0,$path.Length-7)
      [IO.File]::WriteAllText($path,"$(Get-NativeHash $bin)  $([IO.Path]::GetFileName($bin))`n",[Text.UTF8Encoding]::new($false))
    } else {[IO.File]::WriteAllText($path,'{}',[Text.UTF8Encoding]::new($false))}
  }
  $files=@($members|ForEach-Object {$item=Get-Item -LiteralPath (Join-Path $payload $_); @{path=$_;size=$item.Length;sha256=(Get-NativeHash $item.FullName)}})
  Write-NativeJson (Join-Path $payload 'manifest.json') @{schema=1;product='vantare-native';candidate=$true;architecture='windows-x64';data_schema='opaque-v1';source_sha=('a'*40);source_dirty=$false;build_profile='Debug';version='0.1.0';channel='beta';files=$files}
  $zip=Join-Path $evidence "$Label.zip"
  New-NativeZip $payload $zip
  @{zip=$zip;hash=(Get-NativeHash $zip);payload=$payload}
}

$package = New-FixturePackage 'package' $true
foreach ($interrupted in @($false, $true)) {
    $root = Join-Path $evidence ([guid]::NewGuid().ToString('N'))
    $state = Install-NativeCandidate $root $package.zip $package.hash 'beta'
    $active = Join-Path $root "generations/$($state.active.generation)"
    [IO.File]::WriteAllText("$active/data/preserved.txt", 'datos del tester')
    if ($interrupted) {
        $script:cut = $false
        function Invoke-NativeCheckpoint([string]$Point) {
            if ($Point -eq 'uninstall-member' -and -not $script:cut) { $script:cut = $true; throw 'interrupción inyectada' }
        }
        try { Uninstall-Beta $root; throw 'No interrumpió' } catch { if (-not $script:cut) { throw } }
        function Invoke-NativeCheckpoint([string]$Point) { }
    }
    Uninstall-Beta $root
    if ((Test-Path "$root/state.json") -or (Test-Path "$active/bin") -or (Test-Path "$active/licenses")) { throw 'Inventario incompleto al desinstalar' }
    if ([IO.File]::ReadAllText("$active/data/preserved.txt") -cne 'datos del tester') { throw 'Datos perdidos' }
    Write-Output "PASS uninstall fixtures interrupted=$interrupted; datos conservados"
}
