param([ValidateSet('hardware-off','hardware-off-no-gpu','renderer-limit','media-router-off','media-keys-off','trace')][string]$Experiment='hardware-off',[ValidateSet(1,5)][int]$Runs=5)
$ErrorActionPreference='Stop'
# Same global ownership wrapper as hub-web/scripts/measure.ps1. The driver and
# experiment data are confined to QA; no product script is modified.
. (Join-Path $PSScriptRoot 'capture-lock.ps1')
$env:VANTARE_MEASURE_EXPERIMENT=$Experiment
$env:VANTARE_MEASURE_RUNS=[string]$Runs
$env:TEMP='D:/VantareServer/qa/isa-1995-measure-2/tmp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$lease=Enter-HubCaptureTurn "medicion-2-$Experiment"
$reservationPath=Join-Path 'D:/VantareServer/evidence/hub-web/medicion-2' ("reservation-$Experiment-"+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+'.json')
$reservation=@{started=(Get-Date -Format o);experiment=$Experiment;runs=$Runs;buildsBefore=@();buildsAfter=@();completed=$false}
try {
    $reservation.buildsBefore=@(Get-CimInstance Win32_Process -Filter "Name='cargo.exe' OR Name='rustc.exe' OR Name='cl.exe' OR Name='link.exe'" | Select-Object ProcessId,Name)
    $reservation.reservedAt=$reservation.started
    $reservation.buildsAtReservation=$reservation.buildsBefore
    $reservation | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reservationPath
    while($reservation.buildsBefore.Count) {
        Write-Output "$(Get-Date -Format o) reservation held; waiting for existing compilation"
        $owner=Get-Content -LiteralPath 'D:/VantareServer/qa/captura.lock/owner.json' -Raw|ConvertFrom-Json
        if($owner.nonce -ne $lease.nonce){throw 'Measurement reservation lost'}
        (Get-Item -LiteralPath 'D:/VantareServer/qa/captura.lock').LastWriteTime=Get-Date
        Start-Sleep -Seconds 60
        $reservation.buildsBefore=@(Get-CimInstance Win32_Process -Filter "Name='cargo.exe' OR Name='rustc.exe' OR Name='cl.exe' OR Name='link.exe'" | Select-Object ProcessId,Name)
    }
    # A previous build can hand off between cargo processes; require a whole
    # quiet minute, not a single empty process snapshot, before the first run.
    $quietSince=Get-Date
    while(((Get-Date)-$quietSince).TotalSeconds -lt 60) {
        Start-Sleep -Seconds 5
        $builds=@(Get-Process -Name cargo,rustc,cl,link -ErrorAction SilentlyContinue)
        if($builds.Count){$quietSince=Get-Date}
        $owner=Get-Content -LiteralPath 'D:/VantareServer/qa/captura.lock/owner.json' -Raw|ConvertFrom-Json
        if($owner.nonce -ne $lease.nonce){throw 'Measurement reservation lost'}
        (Get-Item -LiteralPath 'D:/VantareServer/qa/captura.lock').LastWriteTime=Get-Date
    }
    $reservation.started=Get-Date -Format o
    $reservation | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reservationPath
    $env:VANTARE_MEASURE_RESERVATION_FILE=$reservationPath
    & node --experimental-strip-types (Join-Path $PSScriptRoot 'measure.mjs')
    $result=$LASTEXITCODE
    $reservation.buildsAfter=@(Get-CimInstance Win32_Process -Filter "Name='cargo.exe' OR Name='rustc.exe' OR Name='cl.exe' OR Name='link.exe'" | Select-Object ProcessId,Name)
    $reservation.completed=($result -eq 0 -and $reservation.buildsAfter.Count -eq 0)
    if($reservation.buildsAfter.Count){throw 'Compilation detected while reservation was held: results require exclusion'}
} finally {
    $reservation.finished=Get-Date -Format o
    $reservation | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reservationPath
    Exit-HubCaptureTurn $lease
}
exit $result
