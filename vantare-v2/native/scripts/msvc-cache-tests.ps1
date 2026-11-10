param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:VANTARE_SLOT_TARGET) { throw 'Ejecutar mediante compilar.ps1.' }
. (Join-Path $PSScriptRoot 'setup-msvc-cache.ps1')
$root=Join-Path $env:VANTARE_SLOT_TARGET ('msvc-probe-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
[IO.Directory]::CreateDirectory($EvidenceDirectory)|Out-Null
$source=Join-Path $root 'probe.cpp'
[IO.File]::WriteAllText($source, "#include <vector>`nextern `"C`" int probe() { std::vector<int> x(4096, 42); int n=0; for(int v:x) n+=v; return n; }")
$before=& sccache --show-stats --stats-format=json | ConvertFrom-Json
$records=@()
foreach($name in @('first','second')) {
    $output=Join-Path $root "$name.obj"
    $clock=[Diagnostics.Stopwatch]::StartNew()
    & sccache cl.exe /nologo /c /O2 /MT /EHsc $source "/Fo$output"
    $result=$LASTEXITCODE
    $clock.Stop()
    if($result -or -not(Test-Path -LiteralPath $output)){throw "Falló C++ MSVC: $name"}
    $records+=@{name=$name;seconds=$clock.Elapsed.TotalSeconds;sha256=(Get-FileHash -LiteralPath $output).Hash}
}
$after=& sccache --show-stats --stats-format=json | ConvertFrom-Json
$after | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $EvidenceDirectory 'msvc-cache-stats.json')
$records | ConvertTo-Json | Set-Content (Join-Path $EvidenceDirectory 'msvc-cache-times.json')
$hitsBefore=0L
foreach($property in $before.stats.cache_hits.counts.PSObject.Properties){$hitsBefore += [long]$property.Value}
$hitsAfter=0L
foreach($property in $after.stats.cache_hits.counts.PSObject.Properties){$hitsAfter += [long]$property.Value}
if($hitsAfter -le $hitsBefore){throw 'El segundo objeto C++ no reutilizó sccache.'}
if($records[0].sha256 -cne $records[1].sha256){throw 'El objeto restaurado difiere del original.'}
Write-Host 'PASS: MSVC x64, CRT estático, segundo objeto servido de caché e idéntico.'
