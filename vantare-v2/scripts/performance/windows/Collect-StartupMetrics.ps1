[CmdletBinding()]
param([Parameter(Mandatory)][string]$RawDirectory, [Parameter(Mandatory)][string]$OutputFile,
 [Parameter(Mandatory)][double]$ScenarioSeconds)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$markers = foreach ($name in @('process-start','go-services-ready','webview-created','javascript-loaded',
 'react-mounted','hub-visible','hub-interactive','initial-route-visible','overlay-visible','first-data-frame','close-complete')) {
 [pscustomobject]@{ marker=$name; milliseconds=$null; state='UNKNOWN'; reason='No aligned start-to-marker instrumentation in this build' }
}
$ready = @(Get-ChildItem -LiteralPath $RawDirectory -Filter '*-cdp.json' -File | ForEach-Object {
 $capture = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
 [pscustomobject]@{ overlayReadyAt=$capture.overlayReadyAt; capturedAt=$capture.capturedAt }
})
# A complete scenario includes sampling and cleanup; it is NEVER reported as startup.
[pscustomobject]@{ schema='vantare.astra.startup.v1'; scenarioSeconds=$ScenarioSeconds; markers=@($markers); observations=$ready } |
 ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputFile -Encoding utf8
