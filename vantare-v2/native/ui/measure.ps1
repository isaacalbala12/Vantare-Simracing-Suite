<#
Mide vantare-overlays (build release con --features paint-stats) para cada
combinación de widgets y fuente sintética (VANTARE_FUENTE, con --fuente local):
CPU del proceso, GPU 3D del proceso, RAM y contadores por segundo de fotogramas /
render / pintados (medias de las 10 últimas líneas de paint-stats). 6 s de
calentamiento y 10 s de medida. Una fila por combinación.

  cargo build --release -p vantare-ui --features paint-stats
  .\measure.ps1                                  # 4 y 22 widgets, las tres fuentes
  .\measure.ps1 -Widgets 22 -Fuentes realista
#>
param(
    [int[]]$Widgets = @(4, 22),
    [string[]]$Fuentes = @('realista', 'estres', 'quieta'),
    [string]$Exe = "$PSScriptRoot\..\target\release\vantare-overlays.exe"
)
$ErrorActionPreference = 'Stop'
foreach ($fuente in $Fuentes) {
    foreach ($n in $Widgets) {
        $env:VANTARE_FUENTE = $fuente
        $log = Join-Path $env:TEMP "medida-$n-$fuente.log"
        $p = Start-Process $Exe -ArgumentList $n, '--fuente', 'local' -PassThru -RedirectStandardOutput $log
        Start-Sleep 6
        $c0 = (Get-Process -Id $p.Id).CPU
        $t0 = Get-Date
        $gpu = @()
        for ($i = 0; $i -lt 5; $i++) {
            Start-Sleep 2
            try {
                $gpu += (Get-Counter "\GPU Engine(pid_$($p.Id)*engtype_3D)\Utilization Percentage" -ErrorAction Stop).CounterSamples |
                    Measure-Object CookedValue -Sum | ForEach-Object Sum
            } catch {}
        }
        if ($p.HasExited) {
            "{0,-8} {1,2} EL PROCESO TERMINO (codigo {2})" -f $fuente, $n, $p.ExitCode
            continue
        }
        $cpu = 100 * ((Get-Process -Id $p.Id).CPU - $c0) / ((Get-Date) - $t0).TotalSeconds
        $ram = (Get-Process -Id $p.Id).WorkingSet64 / 1MB
        Stop-Process -Id $p.Id
        # Medias de las 10 últimas líneas (10 s): fotogramas y, por widget, render y pintados.
        $filas = Get-Content $log -Tail 10 | ForEach-Object { , ([regex]::Matches($_, '=(\d+)') | ForEach-Object { [int]$_.Groups[1].Value }) }
        $m = 0..6 | ForEach-Object { $i = $_; '{0:N0}' -f (($filas | ForEach-Object { $_[$i] } | Measure-Object -Average).Average) }
        $gpuMedia = if ($gpu.Count) { ($gpu | Measure-Object -Average).Average } else { -1 }
        '{0,-8} {1,2} cpu={2,5:N1}%  gpu3d={3,4:N1}%  ram={4,4:N0} MB | fotogramas={5} standings={6}/{7} radar={8}/{9} pedales={10}/{11} (render/pintado)' -f `
            $fuente, $n, $cpu, $gpuMedia, $ram, $m[0], $m[1], $m[2], $m[3], $m[4], $m[5], $m[6]
    }
}
Remove-Item Env:VANTARE_FUENTE
