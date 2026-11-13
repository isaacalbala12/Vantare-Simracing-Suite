# Comparación pura; el controlador aporta las lecturas reales de Windows.
function Get-VantareResolutionFingerprint([object[]]$Displays){
 @($Displays|Where-Object {$_.CurrentHorizontalResolution -gt 0 -and $_.CurrentVerticalResolution -gt 0}|Sort-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution|ForEach-Object {
  '{0}:{1}x{2}' -f $_.Name,$_.CurrentHorizontalResolution,$_.CurrentVerticalResolution
 }) -join '|'
}
function Test-VantareResolutionConfirmation([bool]$ObservedChange,[object[]]$Initial,[object[]]$Current){
 $ObservedChange -and (Get-VantareResolutionFingerprint $Initial) -eq (Get-VantareResolutionFingerprint $Current)
}
function Test-VantareActualResolutionChange([object[]]$Initial,[object[]]$Current){
 $before=@($Initial|Where-Object {$_.CurrentHorizontalResolution -gt 0 -and $_.CurrentVerticalResolution -gt 0})
 $after=@($Current|Where-Object {$_.CurrentHorizontalResolution -gt 0 -and $_.CurrentVerticalResolution -gt 0})
 if(-not $before.Count -or $before.Count -ne $after.Count -or (@($before.Name|Sort-Object) -join '|') -ne (@($after.Name|Sort-Object) -join '|')){return $false}
 (Get-VantareResolutionFingerprint $before) -ne (Get-VantareResolutionFingerprint $after)
}
