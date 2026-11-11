param([switch]$Capture,[string]$Workshop,[string]$Provenance,[string]$QaRoot)
$ErrorActionPreference='Stop'
$scriptPath=Join-Path $PSScriptRoot '../../vantare-v2/hub-web/scripts/widget-thumbnails.ts'
$arguments=@('--experimental-strip-types',$scriptPath)
if($Capture){
 if(-not $Workshop -or -not $Provenance -or -not $QaRoot){throw 'Capture exige Workshop, Provenance y QaRoot; lee la receta antes.'}
 $arguments+=@('--capture','--workshop',$Workshop,'--provenance',$Provenance,'--qa-root',$QaRoot)
}
& node @arguments
exit $LASTEXITCODE
