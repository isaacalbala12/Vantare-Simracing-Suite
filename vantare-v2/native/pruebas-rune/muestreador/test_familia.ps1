$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'FAMILIA.ps1')
$root=[DateTime]::Parse('2026-11-13T00:00:01.0000000Z').ToUniversalTime()
$family=@{1=$root.ToString('o')}; $approximate=@{}
function Candidate($Id,$Parent,$Milliseconds,$Source) {
    [pscustomobject]@{process_id=$Id;parent_id=$Parent;created_utc=$root.AddMilliseconds($Milliseconds).ToString('o');source=$Source}
}
# Un padre desapareció antes del primer CIM; su evento WMI se genera más tarde
# que la creación de su hijo, que sí sigue vivo. No debe inventarse una pérdida.
$candidates=@((Candidate 3 2 15 cim),(Candidate 2 1 20 event),(Candidate 3 2 22 event))
Update-VantareFamily -Family $family -Approximate $approximate -Candidates $candidates -RootCreated $root
if ($family.Count -ne 3 -or $family[3] -ne $root.AddMilliseconds(15).ToString('o') -or $approximate.ContainsKey(3)) { throw 'No se refinó la identidad del hijo.' }
Update-VantareFamily -Family $family -Approximate $approximate -Candidates @((Candidate 2 1 5 cim)) -RootCreated $root
if ($approximate.Count -ne 0) { throw 'La fecha exacta del padre no sustituyó al evento WMI.' }
$family[3]='2026-11-13T02:00:01.0150000+02:00'
Update-VantareFamily -Family $family -Approximate $approximate -Candidates @((Candidate 3 2 15 cim)) -RootCreated $root
$rejected=$false
try { Update-VantareFamily -Family $family -Approximate $approximate -Candidates @((Candidate 3 2 30 cim)) -RootCreated $root } catch { $rejected=$true }
if (-not $rejected) { throw 'Se aceptó un PID reutilizado.' }
Write-Output 'PASS: padre transitorio, identidad refinada y reutilización rechazada sin WMI ni procesos reales.'
