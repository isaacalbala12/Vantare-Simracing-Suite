param([string]$EvidenceDirectory = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'queue-decision.ps1')

$cases = @(
    # Pesados: entran solos con las dos ranuras y no esperan por RAM (P1.2).
    @{ Name = 'pesado solo, memoria holgada'; Class = 'heavy'; FreeSlots = 2; ActiveSlots = 0; FreeGB = 5.5; CommitGB = 12.0; Enter = $true; Jobs = 4; Hold = 2 },
    @{ Name = 'pesado solo, libre 2.9 (entra igual)'; Class = 'heavy'; FreeSlots = 2; ActiveSlots = 0; FreeGB = 2.9; CommitGB = 12.0; Enter = $true; Jobs = 4; Hold = 2 },
    @{ Name = 'pesado solo, commit 17 (entra igual)'; Class = 'heavy'; FreeSlots = 2; ActiveSlots = 0; FreeGB = 5.5; CommitGB = 17.0; Enter = $true; Jobs = 4; Hold = 2 },
    @{ Name = 'pesado con un ligero activo: reserva y espera (P1.1)'; Class = 'heavy'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.5; CommitGB = 12.0; Enter = $false },
    @{ Name = 'pesado con un ligero activo y una ranura reservada'; Class = 'heavy'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.5; CommitGB = 12.0; Enter = $false },

    # Ligeros: el primero entra solo aunque falte RAM; el segundo respeta
    # suelo, reserva y techo. Con un pesado esperando solo queda una ranura.
    @{ Name = 'ligero solo, memoria holgada'; Class = 'light'; FreeSlots = 2; ActiveSlots = 0; FreeGB = 5.5; CommitGB = 12.0; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero solo, libre 2.9 (entra igual)'; Class = 'light'; FreeSlots = 1; ActiveSlots = 0; FreeGB = 2.9; CommitGB = 12.0; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero solo, commit 17.6 (entra igual)'; Class = 'light'; FreeSlots = 2; ActiveSlots = 0; FreeGB = 5.5; CommitGB = 17.6; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero con un pesado esperando: usa la otra ranura'; Class = 'light'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.6; CommitGB = 13.0; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero segundo con 5.6'; Class = 'light'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.6; CommitGB = 13.0; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero segundo justo en 5.5'; Class = 'light'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.5; CommitGB = 13.0; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero segundo corto (5.4)'; Class = 'light'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.4; CommitGB = 13.0; Enter = $false },
    @{ Name = 'pesado esperando + ligero activo: segundo ligero no (P1.1)'; Class = 'light'; FreeSlots = 0; ActiveSlots = 2; FreeGB = 5.5; CommitGB = 13.0; Enter = $false },
    @{ Name = 'ligero segundo justo en el techo (20.0)'; Class = 'light'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.6; CommitGB = 17.5; Enter = $true; Jobs = 2; Hold = 1 },
    @{ Name = 'ligero segundo por encima del techo (20.1)'; Class = 'light'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.6; CommitGB = 17.6; Enter = $false },

    # Directo: comportamiento actual (solo entra aunque falte RAM; segundo con 7 GB).
    @{ Name = 'directo actual: segundo bajo 14 sin 7 GB'; Class = 'direct'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 5.0; CommitGB = 13.0; Enter = $false },
    @{ Name = 'directo actual: solo aunque falte RAM'; Class = 'direct'; FreeSlots = 1; ActiveSlots = 0; FreeGB = 4.0; CommitGB = 15.0; Enter = $true; Jobs = 4; Hold = 1 },
    @{ Name = 'directo actual: dos huecos y solo'; Class = 'direct'; FreeSlots = 2; ActiveSlots = 0; FreeGB = 4.0; CommitGB = 13.0; Enter = $true; Jobs = 4; Hold = 1 },
    @{ Name = 'directo actual: segundo con 7 GB justos'; Class = 'direct'; FreeSlots = 1; ActiveSlots = 1; FreeGB = 7.0; CommitGB = 13.0; Enter = $true; Jobs = 4; Hold = 1 }
)

$failures = @()
foreach ($case in $cases) {
    $d = Get-VantareQueueDecision -Class $case.Class -FreeSlots $case.FreeSlots -ActiveSlots $case.ActiveSlots `
        -Slots 2 -FreeGB $case.FreeGB -CommitGB $case.CommitGB
    $problems = @()
    if ([bool]$d.Enter -ne [bool]$case.Enter) { $problems += "Enter=$($d.Enter), esperado $($case.Enter)" }
    if ($case.Enter) {
        if ($d.HoldSlots -ne [int]$case.Hold) { $problems += "HoldSlots=$($d.HoldSlots), esperado $($case.Hold)" }
        if ($d.Jobs -ne [int]$case.Jobs) { $problems += "Jobs=$($d.Jobs), esperado $($case.Jobs)" }
    } elseif ($d.HoldSlots -ne 0) { $problems += "HoldSlots=$($d.HoldSlots) sin entrar" }
    if ($problems.Count) {
        $failures += "$($case.Name): $($problems -join '; ')"
    }
}

if ($failures.Count) {
    $failures | ForEach-Object { Write-Host "FALLO: $_" }
    exit 1
}
Write-Host "queue-decision: $($cases.Count) casos OK"
if ($EvidenceDirectory) {
    [IO.Directory]::CreateDirectory($EvidenceDirectory) | Out-Null
    [pscustomobject]@{ cases = $cases.Count; result = 'ok' } |
        ConvertTo-Json | Set-Content (Join-Path $EvidenceDirectory 'queue-decision.json') -Encoding utf8
}
