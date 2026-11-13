# Función pura: TIME_CREATED del evento WMI no es GetProcessTimes.
function Update-VantareFamily {
    param(
        [Parameter(Mandatory)][hashtable]$Family,
        [Parameter(Mandatory)][hashtable]$Approximate,
        [Parameter(Mandatory)][object[]]$Candidates,
        [Parameter(Mandatory)][DateTime]$RootCreated
    )
    do {
        $added=$false
        foreach ($candidate in $Candidates) {
            $id=[int]$candidate.process_id; $parentId=[int]$candidate.parent_id
            $created=[DateTime]::Parse($candidate.created_utc).ToUniversalTime()
            if ($Family.ContainsKey($id)) {
                if ($candidate.source -eq 'cim') {
                    if ($Approximate.ContainsKey($id)) {
                        # Un evento de inicio ocurre después de la creación real.
                        # Refinar una identidad aproximada no equivale a reutilizar PID.
                        $upper=[DateTime]::Parse($Family[$id]).ToUniversalTime().AddMilliseconds(1)
                        if ($created -lt $RootCreated -or $created -gt $upper) { throw 'PID de la familia reutilizado tras su evento de inicio.' }
                        $Family[$id]=$created.ToString('o'); $Approximate.Remove($id)
                    } elseif ([math]::Abs(($created-[DateTime]::Parse($Family[$id]).ToUniversalTime()).TotalMilliseconds) -gt 1) {
                        throw 'PID de la familia reutilizado.'
                    }
                }
            } elseif ($Family.ContainsKey($parentId)) {
                # El PID del padre pertenece a esta captura y no puede tener un
                # segundo evento de inicio (lo rechaza el muestreador). Cuando su
                # fecha solo procede de WMI, la cota segura es la raíz exacta.
                $lower=if($Approximate.ContainsKey($parentId)){$RootCreated}else{[DateTime]::Parse($Family[$parentId]).ToUniversalTime()}
                if ($created -ge $lower) {
                    $Family[$id]=$created.ToString('o'); $added=$true
                    if ($candidate.source -eq 'event') { $Approximate[$id]=$true }
                }
            }
        }
    } while ($added)
}
