# SapphireOS deshabilita los drivers de virtualizacion y no da batch logon a cuentas normales. Requiere SVM en BIOS.
$ErrorActionPreference = 'Stop'
# Valores por defecto de Windows 11; SapphireOS los dejó en 4 (deshabilitado). Registro para revertir.
$set = [ordered]@{ vdrvroot=0; Vid=1; hvservice=3; HvHost=3; NdisVirtualBus=3; W32Time=3; VaultSvc=3 }
$log = 'C:\VantareServer\logs\services-reenabled.txt'
foreach ($k in $set.Keys) {
  $p = "HKLM:\SYSTEM\CurrentControlSet\Services\$k"
  $old = (Get-ItemProperty $p).Start
  Set-ItemProperty $p Start $set[$k] -Type DWord
  "$(Get-Date -f s) $k Start $old -> $($set[$k])" | Tee-Object -Append $log }

$sids = 'vantare-ci','vantare-svc' | % { '*' + (Get-LocalUser $_).SID.Value }
$tmp='C:\VantareServer\ops\run'
secedit /export /cfg "$tmp\cur.inf" /areas USER_RIGHTS | Out-Null
$line = (Select-String "$tmp\cur.inf" -Pattern '^SeBatchLogonRight').Line
$vals = (($line -split '=',2)[1].Trim() -split ',') + $sids | select -Unique
@('[Unicode]','Unicode=yes','[Version]','signature="$CHICAGO$"','Revision=1','[Privilege Rights]',"SeBatchLogonRight = $($vals -join ',')") | Set-Content "$tmp\new.inf" -Encoding Unicode
secedit /configure /db "$tmp\batch.sdb" /cfg "$tmp\new.inf" /areas USER_RIGHTS /quiet
"rc=$LASTEXITCODE"
Remove-Item "$tmp\cur.inf","$tmp\new.inf","$tmp\batch.sdb*" -ErrorAction SilentlyContinue
"$(Get-Date -f s) SeBatchLogonRight + vantare-ci, vantare-svc" | Add-Content C:\VantareServer\logs\services-reenabled.txt
shutdown /r /t 60 /d p:4:1 /c "Vantare: reinicio en 1 minuto para activar virtualizacion (WSL2)."
