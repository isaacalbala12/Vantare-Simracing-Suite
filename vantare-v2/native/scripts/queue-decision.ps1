# Decisión pura de la cola del servidor (#1993, fase 1).
# No toca mutex, disco ni procesos: recibe el estado y devuelve qué hacer.
# La usa compilar.ps1 para las clases `heavy`/`light`; `direct` conserva la
# decisión actual y sirve de referencia en los tests.
function Get-VantareQueueDecision {
    [CmdletBinding()]
    param(
        [ValidateSet('heavy', 'light', 'direct')][string]$Class = 'direct',
        [int]$FreeSlots = 0,
        [int]$ActiveSlots = 0,
        [int]$Slots = 2,
        [double]$FreeGB = 0,
        [double]$CommitGB = 0,
        [hashtable]$Limits = @{}
    )

    $ceiling = if ($Limits.ContainsKey('CommitCeiling')) { [double]$Limits.CommitCeiling } else { 20.0 }
    $floor = if ($Limits.ContainsKey('FreeFloor')) { [double]$Limits.FreeFloor } else { 3.0 }
    $heavyGb = if ($Limits.ContainsKey('HeavyGB')) { [double]$Limits.HeavyGB } else { 4.0 }
    $lightGb = if ($Limits.ContainsKey('LightGB')) { [double]$Limits.LightGB } else { 2.5 }
    $heavyJobs = if ($Limits.ContainsKey('HeavyJobs')) { [int]$Limits.HeavyJobs } else { 4 }
    $lightJobs = if ($Limits.ContainsKey('LightJobs')) { [int]$Limits.LightJobs } else { 2 }
    $directJobs = if ($Limits.ContainsKey('DirectJobs')) { [int]$Limits.DirectJobs } else { 4 }
    $directGb = if ($Limits.ContainsKey('DirectGB')) { [double]$Limits.DirectGB } else { 7.0 }
    $directMin = if ($Limits.ContainsKey('DirectMin')) { [double]$Limits.DirectMin } else { 0.0 }
    $directCommit = if ($Limits.ContainsKey('DirectCommit')) { [double]$Limits.DirectCommit } else { 14.0 }

    switch ($Class) {
        'heavy' {
            # Un pesado solo (sin otros builds) entra siempre con sus dos
            # ranuras, aunque falte RAM: mejor tirar de disco que esperar sin
            # límite (igual que `direct`). Mientras espera, compilar.ps1 retiene
            # cada ranura libre; los ligeros solo usan la que queda.
            $solo = ($ActiveSlots -eq 0) -and ($FreeSlots -ge $Slots)
            $reason = if ($solo) {
                "pesado: solo con $heavyJobs jobs; entra aunque falte RAM"
            } elseif ($ActiveSlots -gt 0) {
                "pesado: $ActiveSlots build(s) activo(s); reserva $FreeSlots/$Slots ranura(s) y espera"
            } elseif ($FreeSlots -lt $Slots) {
                "pesado: reserva $FreeSlots/$Slots ranura(s); espera la otra"
            } else {
                'pesado: espera'
            }
            return [pscustomobject]@{
                Enter = $solo
                Jobs = $heavyJobs
                HoldSlots = if ($solo) { $Slots } else { 0 }
                NeedGB = $heavyGb
                Reason = $reason
            }
        }
        'light' {
            # Un ligero solo también entra siempre, aunque falte RAM. El
            # segundo ligero sí respeta el suelo, la reserva y el techo.
            $need = $floor + ($ActiveSlots * $lightGb)
            $solo = ($ActiveSlots -eq 0) -and ($FreeSlots -ge 1)
            $memory = ($FreeSlots -ge 1) -and ($ActiveSlots -lt $Slots) -and
                ($FreeGB -ge $need) -and (($CommitGB + $lightGb) -le $ceiling)
            $enter = $solo -or $memory
            $reason = if ($solo) {
                "ligero: solo con $lightJobs jobs; entra aunque falte RAM"
            } elseif (-not $enter) {
                if ($FreeSlots -lt 1) { 'ligero: no hay ranura libre' }
                elseif ($ActiveSlots -ge $Slots) { "ligero: $ActiveSlots/$Slots ranuras ocupadas" }
                elseif ($FreeGB -lt $need) { "ligero: libre $([math]::Round($FreeGB, 1)) GB < $need GB" }
                else { "ligero: commit $([math]::Round($CommitGB, 1)) + $lightGb > techo $ceiling GB" }
            } else {
                "ligero: entra con $lightJobs jobs (comparte ranura)"
            }
            return [pscustomobject]@{
                Enter = $enter
                Jobs = $lightJobs
                HoldSlots = if ($enter) { 1 } else { 0 }
                NeedGB = $need
                Reason = $reason
            }
        }
        default {
            # Comportamiento actual: 2 ranuras si el commit está bajo el umbral
            # de 14 GB, 1 si no; entra con cualquier hueco si nadie más compila.
            $efectivos = if ($CommitGB -lt $directCommit) { 2 } else { 1 }
            $need = $directMin + ($ActiveSlots * $directGb)
            $solo = ($ActiveSlots -eq 0) -and ($FreeSlots -gt 0)
            $enter = ($FreeSlots -gt 0) -and ($ActiveSlots -lt $efectivos) -and
                (($FreeGB -ge $need) -or $solo)
            return [pscustomobject]@{
                Enter = $enter
                Jobs = $directJobs
                HoldSlots = if ($enter) { 1 } else { 0 }
                NeedGB = $need
                Reason = "directo: efectivos $efectivos, libres $FreeSlots, activos $ActiveSlots"
            }
        }
    }
}
