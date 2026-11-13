# Scope de CI compartido por ci-gates.ps1; función pura para poder probarla.
function New-VantareCiScope {
    param(
        [Parameter(Mandatory)][string]$Revision,
        [Parameter(Mandatory)][string]$Workspace,
        [Parameter(Mandatory)][string]$Target,
        [bool]$Telemetry,
        [string[]]$Packages = @(),
        [int]$LifecycleCount = 0,
        [bool]$ArchiveEmpty = $false
    )
    # Sin archivo de tests no hay overlays ni lifecycle: evita que el job de
    # lifecycle intente descargar un artefacto que no se generó.
    $overlays = $false
    $lifecycle = $false
    if (-not $ArchiveEmpty) {
        $overlays = (-not $Packages.Count -or 'vantare-runtime' -cin $Packages)
        $lifecycle = $LifecycleCount -gt 0
    }
    [ordered]@{
        revision = $Revision
        workspace = $Workspace
        target = $Target
        telemetry = $Telemetry
        overlays = $overlays
        lifecycle = $lifecycle
        packages = $Packages
    }
}
