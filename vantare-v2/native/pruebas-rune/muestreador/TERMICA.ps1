# Cálculo puro sobre CSV: no consulta sensores, WMI, PDH ni dispositivos.
function Convert-VantareCounterNumber($Value) {
    $number=[double]::Parse([string]$Value,[Globalization.CultureInfo]::InvariantCulture)
    if ([double]::IsNaN($number) -or [double]::IsInfinity($number) -or $number -lt 0) { throw 'Contador no finito o negativo.' }
    $number
}
function Get-VantareLuid($Value) {
    if ([string]$Value -notmatch '^luid_0x([a-f0-9]+)_0x([a-f0-9]+)$') { throw 'LUID GPU no válido.' }
    'luid_0x{0:x8}_0x{1:x8}' -f [uint32]::Parse($Matches[1],[Globalization.NumberStyles]::HexNumber),[uint32]::Parse($Matches[2],[Globalization.NumberStyles]::HexNumber)
}
function Measure-VantareThermals {
    param(
        [Parameter(Mandatory)][object[]]$Counters,
        [Parameter(Mandatory)][object[]]$Temperatures,
        [Parameter(Mandatory)][int[]]$ProcessIds,
        [Parameter(Mandatory)][long]$Frequency,
        [Parameter(Mandatory)][long]$StartQpc,
        [Parameter(Mandatory)][long]$EndQpc,
        [double]$IntervalSeconds=1.0,
        [hashtable]$Policy=@{},
        [hashtable]$ReferenceGpu=@{}
    )
    if ($Frequency -le 0 -or $StartQpc -ge $EndQpc -or $IntervalSeconds -le 0) { throw 'Ventana térmica no válida.' }
    $samples=@($Counters | Where-Object { [long]$_.qpc -ge $StartQpc -and [long]$_.qpc -le $EndQpc } | Group-Object qpc | Sort-Object {[long]$_.Name})
    if ($samples.Count -lt 2) { throw 'Faltan muestras térmicas.' }
    $margin=1.5*$IntervalSeconds*$Frequency
    if ([long]$samples[0].Name-$StartQpc -gt $margin -or $EndQpc-[long]$samples[-1].Name -gt $margin) { throw 'Muestreo térmico incompleto en los extremos.' }
    $adapters=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($sample in $samples) {
        foreach ($row in $sample.Group) {
            if ($row.counter -notin @('gpu_engine','gpu_memory')) { continue }
            if ($row.instance -notmatch '^pid_(\d+)_(luid_0x[a-f0-9]+_0x[a-f0-9]+)_phys_(\d+)(?:_|$)') { continue }
            if ([int]$Matches[1] -notin $ProcessIds) { continue }
            $luid=$Matches[2]; $physical=[int]$Matches[3]
            if ($physical -ne 0) { throw 'El sensor solo cubre el adaptador físico 0; hardware no verificable.' }
            if ([uint32]$row.status -notin @(0,1)) { throw 'Adaptador propio sin contador GPU verificable.' }
            $null=Convert-VantareCounterNumber $row.value
            $null=$adapters.Add((Get-VantareLuid $luid))
        }
    }
    if (-not $adapters.Count) { throw 'No se identificó el adaptador GPU de la familia.' }
    $thermal=@{}
    foreach ($row in $Temperatures) {
        if ([long]$row.qpc -lt $StartQpc -or [long]$row.qpc -gt $EndQpc) { continue }
        $key=([string]$row.qpc)+'/'+(Get-VantareLuid $row.adapter)
        if ($thermal.ContainsKey($key)) { throw 'Temperatura GPU duplicada.' }
        $thermal[$key]=$row
    }
    $parameters=@{cpu_performance_floor=100.0;cpu_limit_floor=100.0;cpu_bad_fraction=0.10;gpu_drift_limit_c=5.0}
    foreach($key in $Policy.Keys){if(-not $parameters.ContainsKey($key)){throw 'Política térmica desconocida.'};$parameters[$key]=[double]$Policy[$key]}
    if($parameters.cpu_bad_fraction -ne .10 -or $parameters.cpu_performance_floor -lt 95 -or $parameters.cpu_performance_floor -gt 100 -or $parameters.cpu_limit_floor -lt 95 -or $parameters.cpu_limit_floor -gt 100 -or $parameters.gpu_drift_limit_c -lt 5 -or $parameters.gpu_drift_limit_c -gt 8){throw 'Política térmica fuera de límites.'}
    $findings=[Collections.Generic.List[object]]::new()
    $badSamples=0;$performanceValues=[Collections.Generic.List[double]]::new();$limitValues=[Collections.Generic.List[double]]::new();$gpuValues=@{}
    $minPerformance=[double]::PositiveInfinity; $minLimit=[double]::PositiveInfinity
    $maxGpu=0.0; $activeReadings=0; $previous=$null
    foreach ($sample in $samples) {
        $clock=[long]$sample.Name
        $cpuBad=$false
        if ($null -ne $previous -and (($clock-$previous)/[double]$Frequency -lt 0.25*$IntervalSeconds -or ($clock-$previous)/[double]$Frequency -gt 1.75*$IntervalSeconds)) { throw 'Hueco o cadencia térmica inválida.' }
        $previous=$clock; $tables=@{}
        foreach ($row in $sample.Group) {
            if ($row.counter -notin @('cpu_active_time','cpu_performance','cpu_limit','cpu_limit_flags')) { continue }
            if (-not $tables.ContainsKey($row.counter)) { $tables[$row.counter]=@{} }
            if ($tables[$row.counter].ContainsKey($row.instance)) { throw 'Contador CPU duplicado.' }
            $tables[$row.counter][$row.instance]=$row
        }
        foreach ($name in @('cpu_active_time','cpu_performance','cpu_limit','cpu_limit_flags')) {
            if (-not $tables.ContainsKey($name)) { throw "Falta el contador térmico $name." }
        }
        $cores=@($tables.cpu_active_time.Keys | Where-Object { -not $_.EndsWith('_Total',[StringComparison]::OrdinalIgnoreCase) })
        if (-not $cores.Count) { throw 'No hay datos de procesadores lógicos.' }
        foreach ($core in $cores) {
            foreach ($name in @('cpu_active_time','cpu_limit','cpu_limit_flags')) {
                if (-not $tables[$name].ContainsKey($core) -or [uint32]$tables[$name][$core].status -notin @(0,1)) { throw 'Estado térmico CPU no verificable.' }
            }
            $busy=Convert-VantareCounterNumber $tables.cpu_active_time[$core].value
            $limit=Convert-VantareCounterNumber $tables.cpu_limit[$core].value
            $flags=Convert-VantareCounterNumber $tables.cpu_limit_flags[$core].value
            if ($flags -ne [math]::Floor($flags)) { throw 'Flags CPU no enteros.' }
            $minLimit=[math]::Min($minLimit,$limit)
            $limitValues.Add($limit)
            if ($flags -ne 0 -or $limit -lt $parameters.cpu_limit_floor) { $cpuBad=$true }
            if ($busy -gt 0) {
                if (-not $tables.cpu_performance.ContainsKey($core) -or [uint32]$tables.cpu_performance[$core].status -notin @(0,1)) { throw 'CPU activa sin rendimiento nominal verificable.' }
                $performance=Convert-VantareCounterNumber $tables.cpu_performance[$core].value
                $minPerformance=[math]::Min($minPerformance,$performance); $activeReadings++
                $performanceValues.Add($performance)
                if ($performance -lt $parameters.cpu_performance_floor) { $cpuBad=$true }
            }
        }
        if($cpuBad){$badSamples++}
        foreach ($adapter in $adapters) {
            $key=([string]$clock)+'/'+$adapter
            if (-not $thermal.ContainsKey($key)) { throw 'Falta temperatura de un adaptador propio.' }
            $row=$thermal[$key]
            if ([uint32]$row.status -ne 0 -or [uint32]$row.caps_status -ne 0 -or -not $row.temperature_c -or -not $row.warning_c) { throw 'GPU TemperatureWarning o sensor no disponible: no iniciar campaña; comprobarlo en calibración.' }
            $temperature=Convert-VantareCounterNumber $row.temperature_c
            $warning=Convert-VantareCounterNumber $row.warning_c
            if ($temperature -le 0 -or $warning -le 0) { throw 'Temperatura GPU no verificable.' }
            $maxGpu=[math]::Max($maxGpu,$temperature)
            if(-not $gpuValues.ContainsKey($adapter)){$gpuValues[$adapter]=[Collections.Generic.List[double]]::new()}
            $gpuValues[$adapter].Add($temperature)
            if ($temperature -ge $warning) { $findings.Add([pscustomobject]@{qpc=$clock;adapter=$adapter;reason='gpu_temperature';temperature_c=$temperature;warning_c=$warning}) }
        }
    }
    if (-not $activeReadings) { throw 'No hubo rendimiento CPU activo verificable.' }
    $fraction=$badSamples/[double]$samples.Count
    if($fraction -gt $parameters.cpu_bad_fraction){$findings.Add([pscustomobject]@{reason='cpu_sustained_limit';bad_samples=$badSamples;fraction=$fraction;limit=$parameters.cpu_bad_fraction})}
    $starts=@{};$ends=@{};$range=0.0
    foreach($adapter in $adapters){
        $values=$gpuValues[$adapter].ToArray();$count=[math]::Min(5,$values.Count)
        $starts[$adapter]=Get-VantareThermalPercentile @($values[0..($count-1)]) .5
        $ends[$adapter]=Get-VantareThermalPercentile @($values[($values.Count-$count)..($values.Count-1)]) .5
        $last=@($values|Select-Object -Last 10|Sort-Object);$range=[math]::Max($range,$last[-1]-$last[0])
        if($ReferenceGpu.Count){
            if(-not $ReferenceGpu.ContainsKey($adapter)){throw 'Cambió el adaptador respecto de la referencia térmica.'}
            $drift=[math]::Abs($starts[$adapter]-[double]$ReferenceGpu[$adapter])
            if($drift -gt $parameters.gpu_drift_limit_c){$findings.Add([pscustomobject]@{reason='gpu_round_drift';adapter=$adapter;drift_c=$drift;limit_c=$parameters.gpu_drift_limit_c})}
        }
    }
    [pscustomobject][ordered]@{
        schema=2;valid=($findings.Count -eq 0);cpu_temperature_c=$null;cpu_temperature_status='no_disponible'
        start_qpc=$StartQpc;end_qpc=$EndQpc;frequency=$Frequency;samples=$samples.Count
        cpu_min_active_nominal_percent=$minPerformance;cpu_min_limit_percent=$minLimit;gpu_max_c=$maxGpu
        cpu_bad_samples=$badSamples;cpu_bad_fraction=$fraction
        cpu_performance_p10=(Get-VantareThermalPercentile $performanceValues.ToArray() .1);cpu_limit_p10=(Get-VantareThermalPercentile $limitValues.ToArray() .1)
        gpu_start_c=$starts;gpu_end_c=$ends;gpu_last_range_c=$range;policy_parameters=$parameters;reference_gpu_c=$ReferenceGpu
        gpu_adapters=@($adapters);findings=@($findings.ToArray());policy='CPU: >10% of samples below calibrated floors or limit flags; GPU warning and calibrated inter-round drift'
    }
}

function Get-VantareThermalPercentile([double[]]$Values,[double]$P){
    $sorted=@($Values|Sort-Object);if(-not $sorted.Count){throw 'Percentil térmico sin datos.'}
    $index=($sorted.Count-1)*$P;$lo=[int][math]::Floor($index);$hi=[math]::Min($lo+1,$sorted.Count-1)
    $sorted[$lo]+($sorted[$hi]-$sorted[$lo])*($index-$lo)
}

function Read-VantareThermalCalibration {
    param([string]$Directory,[int]$Hz=60)
    $current=[IO.Path]::GetFullPath($Directory)
    while($current){
        $file=Join-Path $current ('calibracion-'+$Hz+'/calibracion.json')
        if(Test-Path -LiteralPath $file){
            $data=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json -AsHashtable
            if(-not $data.ContainsKey('thermal_policy')){throw 'Calibración antigua sin sensores/umbrales térmicos; repetir preparación.'}
            return @{Path=$file;Policy=$data.thermal_policy}
        }
        $parent=[IO.Path]::GetDirectoryName($current);if($parent -eq $current){break};$current=$parent
    }
    throw 'Falta calibración térmica previa. Ejecutar primero INICIAR.'
}
