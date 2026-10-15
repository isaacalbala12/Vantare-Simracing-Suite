[CmdletBinding()]
param([ValidateSet('Pause','Resume','Status')][string]$Operation='Status')
$ErrorActionPreference='Stop'
$service=Get-Service -Name 'actions.runner.isaacalbala12-Vantare-Simracing-Suite.vantare-windows' -ErrorAction Stop
switch($Operation) {
    Pause { Stop-Service -InputObject $service }
    Resume {
        if(Test-Path 'C:/tmp/fase2/pantalla-ocupada'){throw 'Pantalla ocupada; runner permanece parado.'}
        $private=& gh api repos/isaacalbala12/Vantare-Simracing-Suite --jq '.private'
        if($LASTEXITCODE -or $private -cne 'true'){throw 'No iniciar runner de repo público.'}
        Start-Service -InputObject $service
    }
    Status { $service | Select-Object Name,Status }
}
