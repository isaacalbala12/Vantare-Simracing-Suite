# P8 · Instalador nightly en un Windows 11 real (P7-4)

VANTA-138 · #2859 · parte de #2822 y #1995. **Estado: preparado, no ejecutado.** El Windows 11 de P8 es el
**PC de juego de Isaac** (decisión del 26-11; no hay VM). Alcance de hoy, **opción A**: instalador, arranque y
actualización A→B→C, sin cuentas. Contratos: [instalador](../installer/README.md) (canales #2812, T3, #2830),
[empaquetado](README.md) y [candidato Electron](../../hub-web/docs/package-qa.md).

`$Pc` es el destino SSH del PC de juego (memoria de la raíz `reference-pc-de-juego`; no se escribe aquí). Acceso
y custodia: [qa-overlays](../../../tools/qa-overlays/README.md). La sesión SSH entra **elevada**: por SSH solo se
copia y se lee; Setup, Vantare y las capturas se lanzan **siempre** con la tarea interactiva sin elevar de §4.

| Producto | Raíz | Registro HKCU `...\Uninstall\` | Instancia |
| --- | --- | --- | --- |
| Nightly (se prueba) | `%LOCALAPPDATA%\Programs\Vantare Nightly` | `VantareNativeNightly` | `native-nightly` |
| Beta personal (**no se toca**) | la de `InstallLocation` (normalmente `Programs\Vantare`) | `VantareNativeBeta` | `native-beta` |

## 1. Qué NO hacer

- Matar procesos por nombre (`taskkill /IM`, `Stop-Process -Name`, comodines). Solo por PID propio verificado.
- Abrir, cerrar a la fuerza, actualizar, reparar o desinstalar la beta; usar `/D=` o `--parar` sin `native-nightly`.
- Apagar, reiniciar, suspender o cerrar la sesión del PC (única excepción: paso 8, con permiso en ese momento).
- Firmar con claves reales, publicar release o feed, o pasar `-ConfigFile` al construir el candidato.
- Usar cuentas, claves o datos reales de Clerk, Polar o Supabase; iniciar sesión en nightly.
- Desactivar Defender o SmartScreen, añadir exclusiones o borrar `data`, copias o restos a mano.
- Lanzar nada visible fuera de la ventana acordada, o copiar al servidor o a GitHub el contenido de la copia
  de seguridad. El repositorio es público: ninguna captura con datos personales se adjunta a una issue.

## 2. Prerrequisitos (todos antes de T0)

- [ ] Hora de **inicio y fin** acordada con Isaac (tope 90 min). Isaac está delante o localizable; hace los pasos
      3, 8 y 9. «El PC está libre» no sustituye la hora.
- [ ] PC encendido, mirado esa tarde (`tailscale status` desde el servidor). Sin Wake-on-LAN.
- [ ] Sin citas, medidores ni workers del servidor que puedan tocar el PC en la ventana; en el PC, ninguna tarea
      `Vantare*` programada para ella. LMU y otros juegos cerrados.
- [ ] Isaac sale de la beta (bandeja → «Salir de Vantare») y no la abre hasta el cierre.
- [ ] **No hay nightly previa**: no existen su clave de registro ni su raíz. Si existen, parar y preguntar.
- [ ] Espacio libre ≥ tamaño de `%LOCALAPPDATA%\Vantare` + raíz beta + 5 GB.
- [ ] **Antes del primer Setup:** copia hecha y verificada (paso 1) y foto de la beta (paso 2).
- [ ] Tres candidatos nightly **nuevos**, versiones crecientes A < B < C (p. ej. `0.0.2001`–`0.0.2003`), del mismo
      SHA de `nightly`, checkout limpio, sin `-AllowDirty` ni `-ConfigFile`, y sin firma Authenticode.

En el servidor, desde `vantare-v2/native/`, para cada versión y en una carpeta vacía propia (requisitos de Bun en el
empaquetado; los dos scripts entran solos en la cola de compilación):

```powershell
pwsh -NoProfile -File packaging/build-candidate.ps1 -Channel nightly -Version <V> -OutputDirectory D:/VantareServer/qa/isa-2822-p8/<A|B|C>
pwsh -NoProfile -File packaging/build-installer.ps1 -Channel nightly -Version <V> -OutputDirectory D:/VantareServer/qa/isa-2822-p8/<A|B|C>
```

Anotar SHA, `source_dirty=false`, versión y SHA-256 de cada `VantareSetup.exe` y ZIP. Antes de T0 se pueden copiar
por `scp` los `VantareSetup.exe` y sus `.sha256` a `C:\VantareP8\<fecha>\candidato\<A|B|C>\`, y el kit a
`C:\VantareP8\<fecha>\kit\`. Crear también `evidencia\` y `copia\`. Nada se ejecuta todavía.

## 3. Ventana de 90 minutos

| Minuto | Pasos | Corte |
| --- | --- | --- |
| 0–20 | 0 comprobaciones, 1 copia, 2 foto | T+25 sin copia verificada: cancelar |
| 20–50 | 3 A, 4 comprobaciones, 5 B | T+55 sin B correcta: saltar al cierre |
| 50–68 | 6 C, 7 versión antigua, 8 reinicio (opcional) | T+58 con retraso: omitir el 8 |
| 68–82 | 9 desinstalar y reinstalar | T+75: no empezar ningún Setup, reinicio ni caso nuevo |
| 82–90 | 10 cierre | T+90: fin; lo no hecho queda `NO EJECUTADO` |

Si se agota el tiempo o Isaac pide parar: no se interrumpe un Setup en marcha; al terminar se aplica **R1** (§5).
No se amplía la ventana sin su OK explícito. Nunca queda nightly abierta, un `boot-pending.json` sin resolver
ni una tarea `VantareP8-*` registrada.

## 4. Kit mínimo (solo en `C:\VantareP8\<fecha>\kit\`, no va al repositorio)

Cada paso es un archivo `kit\pasos\<paso>.ps1` con las órdenes de §6. No usar `Stop-ScheduledTask`: puede arrastrar
lo que lanzó la tarea. Desde el servidor:

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes $Pc "pwsh -NoProfile -File C:/VantareP8/<fecha>/kit/p8-tarea.ps1 -Paso 01-copia -Minutos 15"
```

`p8-tarea.ps1` (se ejecuta por SSH: crea la tarea interactiva, recoge su salida y la retira):

```powershell
param([Parameter(Mandatory)][string]$Paso,[int]$Minutos=12)
$ErrorActionPreference='Stop'
$P8=Split-Path $PSScriptRoot; $fin="$P8\evidencia\$Paso.fin.json"; $nombre="VantareP8-$Paso"
if(Test-Path $fin){throw "$Paso ya tiene resultado; usar otro nombre"}
$a=New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument "-NoProfile -WindowStyle Hidden -File `"$P8\kit\p8-paso.ps1`" -Paso $Paso"
$u=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes ($Minutos+5)) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName $nombre -Action $a -Principal $u -Settings $s | Out-Null
try{
  Start-ScheduledTask -TaskName $nombre
  $limite=(Get-Date).AddMinutes($Minutos)
  while(-not(Test-Path $fin)){ if((Get-Date) -gt $limite){throw "$Paso sin resultado: no repetir, avisar"}; Start-Sleep 2 }
  Start-Sleep 5; Get-Content "$P8\evidencia\$Paso.log"; Get-Content $fin
}finally{
  if((Get-ScheduledTask -TaskName $nombre).State -ne 'Running'){Unregister-ScheduledTask -TaskName $nombre -Confirm:$false}
  else{Write-Warning "$nombre sigue en marcha: revisar y retirar en el cierre"}
}
```

`p8-paso.ps1` (corre dentro de la sesión de Isaac):

```powershell
param([Parameter(Mandatory)][string]$Paso)
$ErrorActionPreference='Stop'
$P8=Split-Path $PSScriptRoot; $Salida="$P8\evidencia"; $fallo=$null
Start-Transcript -Path "$Salida\$Paso.log" | Out-Null
try{ . "$PSScriptRoot\p8-lib.ps1"; . "$PSScriptRoot\pasos\$Paso.ps1" }catch{ $fallo="$_"; Write-Host "ERROR: $_" }
finally{ Stop-Transcript | Out-Null
  @{paso=$Paso;sesion=(Get-Process -Id $PID).SessionId;error=$fallo;utc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress | Set-Content "$Salida\$Paso.fin.json" }
```

`p8-lib.ps1`:

```powershell
$Nightly="$env:LOCALAPPDATA\Programs\Vantare Nightly"
$ClaveBeta='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta'
$Beta=(Get-ItemProperty -LiteralPath $ClaveBeta).InstallLocation
if(-not $Beta){throw 'No se localiza la beta: parar'}
function Inventario([string]$Raiz,[string]$Destino){
  if(-not(Test-Path -LiteralPath $Raiz)){ Set-Content -LiteralPath $Destino 'AUSENTE'; return }
  $base=(Get-Item -LiteralPath $Raiz -Force).FullName
  if(Get-ChildItem -LiteralPath $base -Recurse -Force -Attributes ReparsePoint){throw "Hay enlaces en ${base}: parar"}
  $lineas=@(Get-ChildItem -LiteralPath $base -Recurse -File -Force | ForEach-Object {
    '{0}|{1}|{2}' -f $_.FullName.Substring($base.Length+1),$_.Length,(Get-FileHash -LiteralPath $_.FullName).Hash } | Sort-Object)
  [IO.File]::WriteAllLines($Destino,[string[]]$lineas)
}
function Igual($a,$b){ (Get-FileHash -LiteralPath $a).Hash -eq (Get-FileHash -LiteralPath $b).Hash }
function Copiar([string]$Origen,[string]$Nombre){
  $copia="$P8\copia\$Nombre"; $antes="$Salida\copia-$Nombre-origen.txt"; $despues="$Salida\copia-$Nombre-destino.txt"
  Inventario $Origen $antes
  if(Test-Path -LiteralPath $Origen){
    robocopy $Origen $copia /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1 /NP "/LOG:$Salida\robocopy-$Nombre.log" | Out-Null
    if($LASTEXITCODE -ge 8){throw "Copia fallida: $Nombre"} }
  Inventario $copia $despues
  if(-not(Igual $antes $despues)){throw "Copia distinta del origen: $Nombre"}
  $f=@(Get-ChildItem -LiteralPath $copia -Recurse -File -Force -ErrorAction SilentlyContinue)
  "${Nombre}: $($f.Count) archivos, $([long]($f|Measure-Object Length -Sum).Sum) bytes, hashes iguales"
}
function Foto([string]$E){
  $d="$Salida\foto-$E"; New-Item -ItemType Directory -Force $d | Out-Null
  reg export 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta' "$d\registro.reg" /y | Out-Null
  Inventario $Beta "$d\beta-raiz.txt"; Inventario "$env:LOCALAPPDATA\Vantare" "$d\localappdata-vantare.txt"
  $com=New-Object -ComObject WScript.Shell
  $menu=[Environment]::GetFolderPath('Programs')
  $accesos="$menu\Vantare\Vantare Simracing Suite.lnk","$menu\Vantare\Desinstalar.lnk",
    "$([Environment]::GetFolderPath('DesktopDirectory'))\Vantare Simracing Suite.lnk","$([Environment]::GetFolderPath('Startup'))\Vantare.lnk"
  [IO.File]::WriteAllLines("$d\accesos.txt",[string[]]@(foreach($x in $accesos){ if(Test-Path -LiteralPath $x){$l=$com.CreateShortcut($x); "$x|$($l.TargetPath)|$($l.Arguments)|$((Get-FileHash -LiteralPath $x).Hash)"}else{"$x|AUSENTE"} }))
  [IO.File]::WriteAllLines("$d\run.txt",[string[]]@((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run').PSObject.Properties | Where-Object Name -like 'Vantare*' | ForEach-Object {"$($_.Name)|$($_.Value)"}))
  $s=Get-Content "$Beta\state.json" -Raw | ConvertFrom-Json
  Set-Content "$d\version.txt" (Get-Content "$Beta\generations\$($s.active.generation)\manifest.json" -Raw | ConvertFrom-Json).version
}
function Comparar($A,$B){ foreach($f in Get-ChildItem "$Salida\foto-$A" -File){ "$($f.Name): $(if(Igual $f.FullName "$Salida\foto-$B\$($f.Name)"){'IGUAL'}else{'DISTINTO'})" } }
function Procesos([string]$Raiz){ @(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith("$Raiz\",[StringComparison]::OrdinalIgnoreCase)} | Select-Object ProcessId,ParentProcessId,ExecutablePath) }
function Lanzar([string]$Exe,[string]$Argumentos){
  $p=Start-Process -FilePath $Exe -ArgumentList $Argumentos -PassThru; $null=$p.Handle
  @{pid=$p.Id;ticks=$p.StartTime.Ticks;exe=$Exe} | ConvertTo-Json -Compress | Add-Content "$Salida\pids.jsonl"; $p }
function MatarPropio([int]$Id){
  $r=Get-Content "$Salida\pids.jsonl" | ForEach-Object {$_|ConvertFrom-Json} | Where-Object pid -eq $Id | Select-Object -Last 1
  $p=Get-Process -Id $Id -ErrorAction SilentlyContinue
  if(-not $r -or -not $p -or $p.Path -ine $r.exe -or $p.StartTime.Ticks -ne $r.ticks){throw "El PID $Id no es nuestro: no se toca"}
  Stop-Process -Id $Id }
function Setup([string]$Letra,[int]$Esperado=0){
  $t=[Diagnostics.Stopwatch]::StartNew(); $p=Lanzar "$P8\candidato\$Letra\VantareSetup.exe" '/S'
  if(-not $p.WaitForExit(480000)){throw 'Setup sigue en marcha: no matar, avisar'}
  "Setup ${Letra}: código $($p.ExitCode), $([int]$t.Elapsed.TotalSeconds) s"
  if($p.ExitCode -ne $Esperado){throw "Setup ${Letra}: se esperaba $Esperado"} }
function Abrir([switch]$Fondo){ $null=Lanzar "$Nightly\Vantare.exe" "--root -Root `"$Nightly`"$(if($Fondo){' --background'})" }
function Cerrar{
  if(-not(Test-Path "$Nightly\Vantare.exe")){return 'Nightly sin lanzador: nada que cerrar'}
  $null=(Lanzar "$Nightly\Vantare.exe" '--parar --instancia native-nightly').WaitForExit(10000)
  $t=[Diagnostics.Stopwatch]::StartNew(); while((Procesos $Nightly).Count -and $t.Elapsed.TotalSeconds -lt 30){Start-Sleep 1}
  "Procesos nightly tras $([int]$t.Elapsed.TotalSeconds) s: $((Procesos $Nightly).Count)"; Procesos $Nightly }
function Estado([string]$E){
  foreach($n in 'state.json','update-status.json','boot-pending.json','installer-log.txt','retained-data.json'){
    if(Test-Path "$Nightly\$n"){Copy-Item "$Nightly\$n" "$Salida\$E-$n"; "--- $n"; Get-Content "$Nightly\$n"}else{"--- ${n}: ausente"} }
  Get-ChildItem "$env:TEMP\VantareSetup-*.log" | Sort-Object LastWriteTime | Select-Object -Last 1 | Copy-Item -Destination "$Salida\$E-setup.log" }
function Activa{ (Get-Content "$Nightly\state.json" -Raw | ConvertFrom-Json).active.generation }
function Datos([string]$Id,[string]$E){ Inventario "$Nightly\generations\$Id\data" "$Salida\datos-$E.txt" }
function EsperarConfirm{
  $t=[Diagnostics.Stopwatch]::StartNew(); while((Test-Path "$Nightly\boot-pending.json") -and $t.Elapsed.TotalSeconds -lt 90){Start-Sleep -Milliseconds 200}
  "boot-pending presente: $(Test-Path "$Nightly\boot-pending.json"); $([int]$t.Elapsed.TotalSeconds) s; hub-ready: $(Test-Path "$Nightly\hub-ready")" }
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -Namespace P8 -Name Pantalla -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
$null=[P8.Pantalla]::SetProcessDPIAware()
function Captura([string]$E){
  $r=[Windows.Forms.SystemInformation]::VirtualScreen; $b=[Drawing.Bitmap]::new($r.Width,$r.Height); $g=[Drawing.Graphics]::FromImage($b)
  $g.CopyFromScreen($r.Location,[Drawing.Point]::Empty,$r.Size); $b.Save("$Salida\$E.png"); $g.Dispose(); $b.Dispose() }
```

## 5. Criterios de parada y vuelta atrás

**Parada inmediata** (además de la de cada paso): la beta o `%LOCALAPPDATA%\Vantare` cambian; Defender detecta
algo; Setup no termina; un PID no es verificable; aparece un fallo que no se entiende; Isaac lo pide.

- **R1, retirar nightly:** `Cerrar`. Si quedan procesos, no matarlos por nombre: `MatarPropio` solo con un PID de
  `pids.jsonl`; si es un hijo, lo decide Isaac. Con cero procesos, `Lanzar "$Nightly\Uninstall.exe" '/S'` y
  comprobar código 0 y clave nightly ausente (retira también `boot-pending.json` y conserva `data`). Si falla,
  dejarla cerrada, no borrar nada a mano y anotar el estado. Terminar con el paso 10.
- **R2, restaurar la copia** (solo si cambió algo protegido y **con OK de Isaac**, con la beta cerrada): guardar
  antes ambos inventarios; **apartar, no borrar**; copiar y verificar. Para `<origen>` = `$Beta` con `beta-raiz`, o
  `$env:LOCALAPPDATA\Vantare` con `localappdata-vantare`:

```powershell
if(Test-Path -LiteralPath <origen>){Rename-Item -LiteralPath <origen> "$(Split-Path <origen> -Leaf).p8-apartado-$(Get-Date -f yyyyMMdd-HHmm)"}
robocopy "$P8\copia\<nombre>" <origen> /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1
if($LASTEXITCODE -ge 8){throw 'Restauración fallida'}
Inventario <origen> "$Salida\restaurado-<nombre>.txt"; Igual "$Salida\restaurado-<nombre>.txt" "$Salida\copia-<nombre>-origen.txt"
```

El registro y los accesos de la beta no se reimportan por defecto: se comparan con `foto-antes` y se decide con Isaac.

## 6. Pasos

En cada paso se guarda `<paso>.log` y `<paso>.fin.json` (`error` nulo y `sesion` distinta de 0). «PARAR» significa
aplicar R1; si nightly aún no está instalada, solo el cierre. Todo lo visible se avisa antes a Isaac.

**0 · Comprobaciones** (`00-previo`). Ejecutar:

```powershell
quser; "clave nightly: $(Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeNightly')"; "raíz nightly: $(Test-Path $Nightly)"
"procesos beta: $((Procesos $Beta).Count)"; Get-ScheduledTask -TaskName 'Vantare*' | Select-Object TaskName,State; Get-PSDrive C
Get-MpComputerStatus | Select-Object AMServiceEnabled,RealTimeProtectionEnabled; Get-ComputerInfo OsName,OsBuildNumber
foreach($l in 'A','B','C'){ $e="$P8\candidato\$l\VantareSetup.exe"; "$l $((Get-FileHash $e).Hash) coincide=$((Get-FileHash $e).Hash -ieq (Get-Content "$e.sha256").Split()[0]) $((Get-Item $e).VersionInfo.ProductVersion) $((Get-AuthenticodeSignature $e).Status)" }
Set-Content "$P8\candidato\A\VantareSetup.exe" -Stream Zone.Identifier -Value '[ZoneTransfer]','ZoneId=3'
```

Esperado: Windows 11; sesión de Isaac activa; nightly ausente; 0 procesos beta; hashes iguales a los anotados en el
servidor; versiones crecientes; `NotSigned`. Evidencia: log. **PARAR** (cancelar) si algo difiere. La marca `Zone.Identifier`
simula una descarga (MOTW) sin cambiar el contenido.

**1 · Copia, antes de todo lo demás** (`01-copia`, 15 min):
`Copiar "$env:LOCALAPPDATA\Vantare" localappdata-vantare; Copiar $Beta beta-raiz`.
Esperado: recuento, tamaño y SHA-256 por archivo iguales (carpeta ausente: `AUSENTE` en ambos). La copia puede
contener credenciales cifradas: no sale del PC. **PARAR** (cancelar) ante cualquier error o archivo en uso.

**2 · Foto de la beta** (`02-foto`):

```powershell
Foto antes; foreach($n in 'beta-raiz','localappdata-vantare'){ "${n}: $(Igual "$Salida\foto-antes\$n.txt" "$Salida\copia-$n-origen.txt")" }
```

Esperado: registro, accesos, entrada Run, versión e inventarios en `foto-antes\`, y dos `True`. **PARAR** si no.

**3 · Instalar A como un usuario** (Isaac). Abre `candidato\A` en el Explorador y hace doble clic. Mientras está el
aviso, `03-smartscreen`: `Captura smartscreen`. Esperado: SmartScreen avisa de editor desconocido; «Más
información» → «Ejecutar de todas formas»; el instalador dice nightly y propone la raíz `Vantare Nightly`; instala
con «Abrir con Windows» desactivado y se cierra **sin abrir la app** (si la abre, ejecutar `Cerrar`).
Si no aparece el aviso: `NO OBSERVADO`, anotar la configuración; no es PASS. **PARAR** si propone otra raíz,
Defender lo bloquea o falla (guardar captura y `%TEMP%\VantareSetup-*.log`).

**4 · Identidad, Electron y beta** (`04-arranque-A`):

```powershell
Unblock-File "$P8\candidato\A\VantareSetup.exe"; Estado A; $id=Activa; Set-Content "$Salida\id-A.txt" $id
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeNightly' | Select-Object DisplayName,DisplayVersion,InstallLocation
Get-StartApps -Name Vantare*; Get-Item "$Nightly\generations\$id\bin\vantare*.exe" -Stream Zone.Identifier -ErrorAction SilentlyContinue
Abrir; Start-Sleep 30; Captura hub-A; Procesos $Nightly; Foto tras-A; Comparar antes tras-A
```

Esperado: «Vantare Simracing Suite (Nightly)», versión A, AppID `Vantare.SimracingSuite.Nightly`, EXE instalados
sin MOTW; ventana del Hub **pintada y con contenido** (no vacía ni en carga); todo `IGUAL`. Comprobar por SSH que los
procesos siguen vivos al acabar la tarea; si no, PARAR y corregir el kit. Después Isaac pone en Ajustes → General
**«Empezar minimizado»** y cambia el tema; `04b-cerrar-A`: `Captura ajustes-A; Cerrar`. Esperado: 0 procesos.

**5 · Actualizar a B** (`05-B`):

```powershell
$a=Activa; Abrir; Start-Sleep 20; Copy-Item "$Nightly\state.json" "$Salida\B-state-antes.json"
Setup B 2; if(-not(Igual "$Nightly\state.json" "$Salida\B-state-antes.json")){throw 'state.json cambió'}
Cerrar; if((Procesos $Nightly).Count){throw 'Siguen procesos'}
Datos $a A-antes; Setup B; Estado B-aplicada; $b=Activa; Set-Content "$Salida\id-B.txt" $b
Datos $b B-nace; Datos $a A-despues
"copia exacta: $(Igual "$Salida\datos-A-antes.txt" "$Salida\datos-B-nace.txt"); A intacta: $(Igual "$Salida\datos-A-antes.txt" "$Salida\datos-A-despues.txt")"
Abrir; EsperarConfirm; Start-Sleep 5; Captura hub-B; Estado B-confirmada; "activa es B: $((Activa) -eq $b)"
```

Esperado: primer Setup código **2** sin cambios (app abierta); tras `Cerrar`, 0 procesos (anotar segundos); segundo
código **0** (anotar duración); copia exacta y A intacta; `boot-pending.json` desaparece en menos de 60 s,
`update-status.json` = `current`, versión B, activa B; se conservan tema y «Empezar minimizado». **PARAR** si hay
`rollback` o `repair`, queda el marcador, difieren datos o un archivo retenido impide actualizar.
Continuidad DPAPI del perfil (`05b-perfil`; solo la huella, nunca la clave). Las dos huellas deben coincidir:

```powershell
foreach($l in 'A','B'){ $f="$Nightly\generations\$(Get-Content "$Salida\id-$l.txt")\data\hub\hub-ui\Local State"
  $k=if(Test-Path -LiteralPath $f){(Get-Content -LiteralPath $f -Raw | ConvertFrom-Json).os_crypt.encrypted_key}
  if($k){"$l $([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($k))))"}else{"${l}: NO OBSERVADO"} }
```

**6 · Actualizar a C y confirmar minimizado** (`06-C`):

```powershell
Cerrar; $b=Activa; $a=Get-Content "$Salida\id-A.txt"; Datos $b B-antes; Datos $a A-antes-C
Setup C; $c=Activa; Set-Content "$Salida\id-C.txt" $c; Datos $c C-nace; Datos $b B-despues
"C copia B: $(Igual "$Salida\datos-B-antes.txt" "$Salida\datos-C-nace.txt"); B intacta: $(Igual "$Salida\datos-B-antes.txt" "$Salida\datos-B-despues.txt")"
Abrir -Fondo; EsperarConfirm; Start-Sleep 5; Captura minimizado-C; Estado C-confirmada; "activa es C: $((Activa) -eq $c)"
Datos $a A-tras-C; "data A conservada: $(Igual "$Salida\datos-A-antes-C.txt" "$Salida\datos-A-tras-C.txt"); binarios A: $(Test-Path "$Nightly\generations\$a\bin\vantare.exe")"
```

Esperado: código 0; C copia B/data (no la de A); la ventana queda **minimizada** y aun así confirma (`current`, C);
binarios de A retirados (`False`) y su `data` conservada, salvo grabaciones recogidas y anotadas en
`installer-log.txt`. **PARAR** igual que en el 5. Isaac restaura la ventana: pinta con sus ajustes.

**7 · Versión antigua** (`07-antigua`): `Cerrar; Copy-Item "$Nightly\state.json" "$Salida\7-antes.json"; Setup A 3;
Igual "$Nightly\state.json" "$Salida\7-antes.json"; Estado antigua`. Esperado: código **3**, `True`, sin
`boot-pending.json`. **PARAR** si cambia algo.

**8 · Reinicio con `boot-pending`, solo si Isaac lo autoriza en ese momento** (si no: `NO EJECUTADO`). Avisar de que
la beta puede arrancar sola si la tiene en el inicio. `08a-pendiente`: `Cerrar; Setup C; Estado pendiente;
Set-Content "$Salida\id-pendiente.txt" (Activa); Foto pre-reinicio; Comparar antes pre-reinicio` (mismo Setup =
reparación, deja arranque pendiente). Confirmar 0 procesos nightly y **reinicia Isaac** desde Inicio; esperar como
máximo 6 min a SSH y a que inicie sesión. `08b-tras`: `Estado tras-reinicio; Procesos $Nightly; Procesos $Beta;
Abrir; EsperarConfirm; Captura reinicio; Estado reinicio-final; (Activa) -eq (Get-Content "$Salida\id-pendiente.txt");
Foto post-reinicio; Comparar pre-reinicio post-reinicio`. Esperado: marcador presente tras reiniciar, nightly no
arrancó sola; al abrir confirma (`current`) la generación pendiente (`True`).
Si la beta arrancó, Isaac sale de ella; sus diferencias se anotan y se atribuyen con él antes de seguir.
**Vuelta atrás propia:** si no confirma, el lanzador debe volver solo a la anterior (`rollback`): FAIL, guardar
logs y R1. Si el PC o SSH no vuelven, no actuar a distancia: avisar a Isaac; al volver, `Estado` y R1.

**9 · Desinstalar, recuperar y reinstalar.** `09a-cerrar`: `Cerrar; $id=Activa; Set-Content "$Salida\id-retenida.txt" $id;
Datos $id antes-desinstalar`. Isaac desinstala **«Vantare Simracing Suite (Nightly)»** desde Aplicaciones
instaladas. Pasados 60 s, `09b-restos`: `Estado desinstalada; Test-Path "$Nightly\installer-cleanup.json";
Test-Path "$Nightly\Uninstall.exe"; Test-Path "$Nightly\Vantare.exe"; Get-StartApps -Name Vantare*;
Datos (Get-Content "$Salida\id-retenida.txt") retenidos; Igual "$Salida\datos-antes-desinstalar.txt" "$Salida\datos-retenidos.txt"`.
Esperado: clave, accesos nightly, ambos EXE y marcador ausentes; `retained-data.json` presente y `data` igual
(`True`; las grabaciones pueden pasar a `recordings`, anotado).
`09c-reinstalar`: `Setup C; Estado reinstalada; Datos (Activa) readoptados;
Igual "$Salida\datos-retenidos.txt" "$Salida\datos-readoptados.txt"; Abrir; Start-Sleep 30; Captura reinstalada; Cerrar`.
Esperado: código 0, `True`, ajustes conservados. **Si quedó el marcador (#2830):** ese mismo Setup debe retirarlo y
reinstalar; guardar antes el marcador y el log. Código 2 con un PID: esperar 60 s y repetir una vez como
`09d-reintento`; si persiste, no matar: FAIL y avisar. Sin marcador, la recuperación queda `NO OBSERVADO` (no se provoca).

**10 · Cierre, siempre** (`10-cierre`). Preguntar a Isaac si nightly se queda instalada; por defecto se desinstala:

```powershell
Cerrar; if(Test-Path "$Nightly\Uninstall.exe"){$p=Lanzar "$Nightly\Uninstall.exe" '/S'; $null=$p.WaitForExit(300000); "desinstalar: $($p.ExitCode)"; Start-Sleep 60}
Estado cierre; Foto final; Comparar antes final; Procesos $Nightly
```

Esperado: todo `IGUAL` y 0 procesos. Después, por SSH: `Get-MpThreatDetection` sin detecciones desde T0, y
`Get-ScheduledTask -TaskName 'VantareP8-*'` vacío (retirar por su nombre exacto lo que quede, una vez detenida).
Comprimir **solo** `evidencia\`, copiarla a `D:\VantareServer\evidence\hub-web\p8-<fecha>\` y comparar SHA-256 en
ambos lados. La copia y los candidatos se quedan en el PC hasta que Isaac autorice borrarlos. Avisar a Isaac de que
puede abrir su beta.

## 7. Cuenta de tester — **pendiente de cuentas QA de Isaac**

No se ejecuta: hoy no hay cuentas QA y el candidato va sin autoridad ni configuración de cuentas. Quedan sin
acreditar el inicio de sesión, el pase de tester y la continuidad de sesión (DPAPI) tras copiar o volver atrás.
Cuando existan, necesitará candidato con configuración QA, su propio plan y otra ventana. Tampoco entra abrir beta
y nightly a la vez (modificaría datos de la beta): requiere permiso aparte.

## 8. Resultado

Estados: `PASS`, `FAIL`, `NO OBSERVADO`, `NO EJECUTADO`; solo `PASS` acredita. Anotar fecha, hora real, SHA, versiones.

| # | Comprobación (paso) | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | Candidatos: hashes, versiones, sin firma (0) | | |
| 2 | Copia verificada por recuento, tamaño y SHA-256 (1) | | |
| 3 | SmartScreen/MOTW avisa y permite seguir (3) | | |
| 4 | Nightly separada: raíz, registro, accesos, AppID (3–4) | | |
| 5 | Electron real pinta y monta (4) | | |
| 6 | App abierta: Setup 2 sin cambios; al cerrar, nada retiene archivos (5) | | |
| 7 | A→B copia exacta, A intacta, `ready` real confirma (5) | | |
| 8 | Ajustes y clave del perfil Electron conservados (5) | | |
| 9 | B→C copia B y confirma minimizada (6) | | |
| 10 | Binarios de A retirados y su `data` conservada (6) | | |
| 11 | Versión antigua rechazada con 3 (7) | | |
| 12 | Reinicio de Windows con `boot-pending` (8) | | |
| 13 | Desinstalación desde Aplicaciones instaladas sin restos propios (9) | | |
| 14 | Reinstalación adopta los datos (9) | | |
| 15 | Recuperación con marcador pendiente, #2830 (9) | | |
| 16 | Beta y `%LOCALAPPDATA%\Vantare` idénticas antes y después (4, 10) | | |
| 17 | Defender sin detecciones; sin procesos ni tareas nuestras; evidencia verificada (10) | | |
| 18 | Cuenta de tester (§7) | NO EJECUTADO | pendiente de cuentas QA |
