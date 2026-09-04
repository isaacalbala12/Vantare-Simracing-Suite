[CmdletBinding()]
param([Parameter(Mandatory)][string]$RawDirectory, [Parameter(Mandatory)][string]$OutputFile)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$rows = @(Get-ChildItem -LiteralPath $RawDirectory -Filter '*-cdp.json' -File | ForEach-Object {
 $capture = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
 foreach ($target in $capture.targets) {
  [pscustomobject]@{
   role = $target.role
   memory = $target.memory | Select-Object jsHeapUsedBytes,jsHeapTotalBytes,documents,nodes,jsEventListeners
   probe = $target.probe | Select-Object rafPerSecond,longTaskCount,longTaskTotalMs,longTaskMaxMs,widgetCount
  }
 }
})
# Exclude URLs, titles, license payloads, screenshot paths and raw error messages.
ConvertTo-Json -InputObject $rows -Depth 6 | Set-Content -LiteralPath $OutputFile -Encoding utf8
