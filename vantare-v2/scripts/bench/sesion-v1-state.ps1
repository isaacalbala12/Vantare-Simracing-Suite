Set-StrictMode -Version Latest

function Get-SessionOptionalProperty {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $InputObject) { return $null }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function ConvertTo-SessionCdpTargets {
    param([AllowNull()][object]$Capture)

    $targets = Get-SessionOptionalProperty -InputObject $Capture -Name 'targets'
    foreach ($target in @($targets)) {
        if ($null -eq $target) { continue }
        $role = [string](Get-SessionOptionalProperty -InputObject $target -Name 'role')
        $surface = [string](Get-SessionOptionalProperty -InputObject $target -Name 'surface')
        if ([string]::IsNullOrWhiteSpace($surface)) { $surface = $role }
        $diagnostics = Get-SessionOptionalProperty -InputObject $target -Name 'diagnostics'
        $transport = Get-SessionOptionalProperty -InputObject $diagnostics -Name 'overlay_v2_transport'
        $widgetCount = Get-SessionOptionalProperty -InputObject $target -Name 'widgetCount'

        [pscustomobject][ordered]@{
            surface = $surface
            role = $role
            url = [string](Get-SessionOptionalProperty -InputObject $target -Name 'url')
            title = [string](Get-SessionOptionalProperty -InputObject $target -Name 'title')
            widgetCount = if ($null -eq $widgetCount) { 0 } else { [int]$widgetCount }
            screenshot = Get-SessionOptionalProperty -InputObject $target -Name 'screenshot'
            transport = if ($null -eq $transport) {
                $null
            } else {
                [pscustomobject][ordered]@{
                    sourceState = [string](Get-SessionOptionalProperty -InputObject $transport -Name 'sourceState')
                    frameRevision = Get-SessionOptionalProperty -InputObject $transport -Name 'frameRevision'
                    sequence = Get-SessionOptionalProperty -InputObject $transport -Name 'sequence'
                    playerPit = [string](Get-SessionOptionalProperty -InputObject $transport -Name 'playerPit')
                }
            }
        }
    }
}
