# #1461: ablaciones intercaladas. Reutiliza el protocolo de spikes/go-gio/measure-live.ps1 (#1466).
param(
 [Parameter(Mandatory)][string]$Core,
 [Parameter(Mandatory)][string]$UI,
 [Parameter(Mandatory)][string]$SHA,
 [Parameter(Mandatory)][string]$Layout,
 [string]$MotionProbe='C:/tmp/1466-evidence/gio-current.exe',
 [string]$Out='C:/tmp/1461m-evidence/live',
 [string]$Samply,
 [switch]$ProfileOnly,
 [switch]$PhaseOnly,
 [switch]$ReviewWarmup
)
$ErrorActionPreference='Stop'
$notes='C:/tmp/fase2/notas-1461m.md'
$marker='C:/tmp/fase2/medicion-1466'
New-Item -ItemType Directory -Force $Out | Out-Null
$notesHash=(Get-FileHash $notes).Hash
Get-Content $notes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class Cost1461 {
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetProcessTimes(IntPtr p,out ulong c,out ulong e,out ulong k,out ulong u);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool QueryProcessCycleTime(IntPtr p,out ulong cycles);
 [DllImport("kernel32.dll")] public static extern bool QueryPerformanceCounter(out long counter);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
function Assert-Conditions {
 if((Get-FileHash $notes).Hash -ne $notesHash){throw 'Notas cambiaron: invalidar campaña y releer'}
 if(Test-Path C:/tmp/fase2/pantalla-ocupada){throw 'Pantalla ocupada'}
 if(Get-Process cargo,rustc -ErrorAction SilentlyContinue){throw 'Cargo/rustc activo: no medir'}
 $session=Invoke-RestMethod http://127.0.0.1:6397/rest/watch/sessionInfo -TimeoutSec 3
 if($session.inRealtime -ne $true){throw 'necesito LMU en pista: REST inRealtime!=true'}
 $game=Get-Process 'Le Mans Ultimate' -ErrorAction Stop
 if([Cost1461]::GetForegroundWindow() -ne $game.MainWindowHandle){throw 'LMU debe conservar primer plano'}
}
function Assert-Motion {
 & $MotionProbe --motion *> "$Out/motion-latest.log"
 if($LASTEXITCODE){throw 'No se demuestra movimiento real'}
}
function Read-Counters($process) {
 $process.Refresh()
 if($process.HasExited){throw "PID $($process.Id) terminó"}
 [ulong]$creation=0;[ulong]$exit=0;[ulong]$kernel=0;[ulong]$user=0;[ulong]$cycles=0
 if(![Cost1461]::GetProcessTimes($process.Handle,[ref]$creation,[ref]$exit,[ref]$kernel,[ref]$user) -or
    ![Cost1461]::QueryProcessCycleTime($process.Handle,[ref]$cycles)){throw 'Falló contador Win32'}
 [pscustomobject]@{PID=$process.Id;Name=$process.ProcessName;CPUSeconds=($kernel+$user)/1e7;Cycles=$cycles;PrivateBytes=$process.PrivateMemorySize64}
}
function Save-Frame($name) {
 Assert-Conditions
 $x=[Cost1461]::GetSystemMetrics(76);$y=[Cost1461]::GetSystemMetrics(77)
 $bitmap=[Drawing.Bitmap]::new([Cost1461]::GetSystemMetrics(78),[Cost1461]::GetSystemMetrics(79))
 $graphics=[Drawing.Graphics]::FromImage($bitmap)
 try {$graphics.CopyFromScreen($x,$y,0,0,$bitmap.Size);$bitmap.Save("$Out/$name.png")} finally {$graphics.Dispose();$bitmap.Dispose()}
 if(!(Test-Path C:/tmp/1461m-evidence/primera-standings.png)){Copy-Item "$Out/$name.png" C:/tmp/1461m-evidence/primera-standings.png}
}
foreach($file in @($Core,$UI,$Layout,$MotionProbe)){if(!(Test-Path -LiteralPath $file)){throw "Falta $file"}}
if($ProfileOnly -and !$Samply){throw 'ProfileOnly requiere Samply'}
if($ProfileOnly -and $PhaseOnly){throw 'Separar muestreo ETW y contadores por fase'}
[pscustomobject]@{Date=(Get-Date -Format o);SHA=$SHA;CoreHash=(Get-FileHash $Core).Hash;UIHash=(Get-FileHash $UI).Hash;LayoutHash=(Get-FileHash $Layout).Hash;MotionHash=(Get-FileHash $MotionProbe).Hash;NotesHash=$notesHash;CPUUnit='100%=one logical core; GetProcessTimes';Cycles='raw QueryProcessCycleTime; no frequency conversion';Profile='Release with line tables; same executable all arms';Scene='live LMU; Standings20/player-class/250ms';Profiler=$Samply} | ConvertTo-Json | Set-Content "$Out/metadata.json"
$mutex=[Threading.Mutex]::new($false,'Global\VantareParityCapture')
$held=$false;$reserved=$false
try {
 $rounds=if($ProfileOnly -or $PhaseOnly){1}else{3}
 for($round=1;$round -le $rounds;$round++) {
  # Una reserva por ronda (<8 minutos), para no acaparar el banco durante builds.
  if(Test-Path $marker){throw 'Otro worker tiene la reserva'}
  $stream=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  $stream.Dispose();$reserved=$true
  $wait=[Diagnostics.Stopwatch]::StartNew()
  while(Get-Process cargo,rustc -ErrorAction SilentlyContinue){if($wait.Elapsed.TotalSeconds -gt 120){throw 'Compiladores no cedieron en120s'};Start-Sleep -Seconds 2}
  Assert-Conditions;Assert-Motion
  $held=$mutex.WaitOne(5000);if(!$held){throw 'Mutex visual ocupado'}
  $modes=if($ProfileOnly -or $PhaseOnly){@('normal')}elseif($round -eq 2){@('no-both','no-validation','no-flows','normal')}else{@('normal','no-flows','no-validation','no-both')}
  foreach($mode in $modes) {
   Get-Content $notes;Assert-Conditions;Assert-Motion
   $name="$round-$mode";$owned=@();$recording=$false;$coreProcess=$null;$stdout=$null;$stderr=$null
   try {
    $pipe="Vantare1461.Cost.$PID.$round.$mode"
    $info=[Diagnostics.ProcessStartInfo]::new($Core,"--live --pipe $pipe")
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.Environment['VANTARE_MEASUREMENT_MODE']=$mode
    $info.Environment['VANTARE_PROFILE_PHASES']=$(if($PhaseOnly){'1'}else{'0'})
    $coreProcess=[Diagnostics.Process]::Start($info);$owned+=$coreProcess
    $stdout=$coreProcess.StandardOutput.ReadToEndAsync();$stderr=$coreProcess.StandardError.ReadToEndAsync()
    Start-Sleep -Milliseconds 800
    $owned+=Start-Process -FilePath $UI -ArgumentList @('--layout',('"'+$Layout+'"'),'--fuente',"pipe:$pipe") -Environment @{VANTARE_PROFILE_PHASES=$(if($PhaseOnly){'1'}else{'0'})} -PassThru -WindowStyle Hidden -RedirectStandardOutput "$Out/$name-ui.log" -RedirectStandardError "$Out/$name-ui.err.log"
    Start-Sleep -Seconds 5
    Assert-Conditions
    if($ReviewWarmup){
     Save-Frame "$name-ready"
     $approval="$Out/$name-ready-approved.txt";$review=[Diagnostics.Stopwatch]::StartNew()
     while(!(Test-Path $approval)){if($review.Elapsed.TotalSeconds -gt 60){throw "Revisar $name-ready.png con view_image y crear $approval"};Start-Sleep -Milliseconds 500}
     Assert-Conditions
    }
    if($ProfileOnly){
     # La traza va aparte de las ablaciones: muestrear altera el coste.
     & wpr -start CPU -filemode *> "$Out/wpr-start.log"
     if($LASTEXITCODE){throw 'WPR no puede muestrear; revisar permisos y wpr-start.log'}
     $recording=$true
    }
    [long]$startQpc=0;[long]$endQpc=0
    $starts=@($owned|ForEach-Object {Read-Counters $_});$null=[Cost1461]::QueryPerformanceCounter([ref]$startQpc);$watch=[Diagnostics.Stopwatch]::StartNew();$rows=@();$frames=$false
    while($watch.Elapsed.TotalSeconds -lt 90){
     Start-Sleep -Milliseconds 1000;Assert-Conditions
     if(!$frames -and $watch.Elapsed.TotalSeconds -ge 10){
      Save-Frame "$name-live-a";Start-Sleep -Seconds 2;Save-Frame "$name-live-b";$frames=$true
      [pscustomobject]@{Second=$watch.Elapsed.TotalSeconds;PIDs=@($owned.Id);Foreground=[Cost1461]::GetForegroundWindow().ToInt64()}|ConvertTo-Json|Set-Content "$Out/$name-frames.json"
     }
     foreach($process in $owned){$counter=Read-Counters $process;$counter|Add-Member Seconds $watch.Elapsed.TotalSeconds;$rows+=$counter}
    }
    $ends=@($owned|ForEach-Object {Read-Counters $_});$seconds=$watch.Elapsed.TotalSeconds;$null=[Cost1461]::QueryPerformanceCounter([ref]$endQpc)
    # Endpoints antes del preflight final: no sumar trabajo posterior a90s.
    $rows|Export-Csv "$Out/$name-samples.csv" -NoTypeInformation
    Assert-Conditions;Assert-Motion
    if($recording){
     & wpr -stop "$Out/profile.etl" *> "$Out/wpr-stop.log"
     $recording=$false
     if($LASTEXITCODE){throw 'WPR no terminó la traza'}
     & $Samply import "$Out/profile.etl" --pid $owned[0].Id --pid $owned[1].Id --save-only --unstable-presymbolicate --symbol-dir (Split-Path $Core) --output "$Out/profile.json.gz" *> "$Out/samply-import.log"
     if($LASTEXITCODE){throw 'Samply no convirtió la traza; ETL conservado'}
    }
    $results=@(for($i=0;$i -lt $starts.Count;$i++){[pscustomobject]@{PID=$starts[$i].PID;Name=$starts[$i].Name;CPUStart=$starts[$i].CPUSeconds;CPUEnd=$ends[$i].CPUSeconds;CPUOneCore=100*($ends[$i].CPUSeconds-$starts[$i].CPUSeconds)/$seconds;CycleStart=$starts[$i].Cycles;CycleEnd=$ends[$i].Cycles;CycleDelta=$ends[$i].Cycles-$starts[$i].Cycles}})
    [pscustomobject]@{Round=$round;Mode=$mode;Seconds=$seconds;Processes=$results;Valid=$true;ProfileOnly=[bool]$ProfileOnly;PhaseOnly=[bool]$PhaseOnly;StartQpc=$startQpc;EndQpc=$endQpc}|ConvertTo-Json -Depth 4|Set-Content "$Out/$name-result.json"
    Add-Content C:/tmp/fase2/informe-1461m.md "$(Get-Date -Format HH:mm) — pasada $name válida / $([math]::Round($results[0].CPUOneCore,4))% core / revisar capturas"
   } finally {
    if($recording){& wpr -stop "$Out/profile-incomplete.etl" *> "$Out/wpr-incomplete.log"}
    if($coreProcess -and !$coreProcess.HasExited){$coreProcess.StandardInput.Close();$null=$coreProcess.WaitForExit(2000)}
    foreach($process in $owned){if(!$process.HasExited){$process.Kill()};$process.WaitForExit();$process.Dispose()}
    if($stdout){[IO.File]::WriteAllText("$Out/$name-core.log",$stdout.GetAwaiter().GetResult())}
    if($stderr){[IO.File]::WriteAllText("$Out/$name-core.err.log",$stderr.GetAwaiter().GetResult())}
   }
  }
  $mutex.ReleaseMutex();$held=$false
  Remove-Item -LiteralPath $marker;$reserved=$false
 }
 Set-Content "$Out/complete.txt" 'Todos los brazos completos; verificar visualmente capturas antes de interpretar.'
} catch {$_|Out-String|Set-Content "$Out/INCOMPLETE.txt";throw} finally {
 if($held){$mutex.ReleaseMutex()};$mutex.Dispose()
 if($reserved){Remove-Item -LiteralPath $marker -ErrorAction SilentlyContinue}
}
