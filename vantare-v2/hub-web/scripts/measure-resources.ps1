param([Parameter(Mandatory)][string]$Output,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'capture-lock.ps1')
$lease=$null
$previous=$env:VANTARE_HUB_RESOURCE_LEASE
try {
 $lease=Enter-HubCaptureTurn 'D Electron resource measurement'
 $env:VANTARE_HUB_RESOURCE_LEASE=$lease.nonce
 if(!$CheckOnly){
  & node --experimental-strip-types (Join-Path $PSScriptRoot 'measure-resources.ts') (Join-Path $Output 'preflight') --check-only
  if($LASTEXITCODE -ne 0){throw "Resource preflight failed ($LASTEXITCODE)"}
 }
 $resourceArgs=@('--experimental-strip-types',(Join-Path $PSScriptRoot 'measure-resources.ts'),$Output)
 if($CheckOnly){$resourceArgs+='--check-only'}
 & node @resourceArgs
 if($LASTEXITCODE -ne 0){throw "Resource measurement failed ($LASTEXITCODE)"}
} finally {
 $env:VANTARE_HUB_RESOURCE_LEASE=$previous
 if($lease){Exit-HubCaptureTurn $lease}
}
