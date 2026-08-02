param(
    [string]$Server,
    [string]$Model,
    [string]$AudioDirectory,
    [string]$Result,
    [int]$Port = 18180,
    [int]$Threads = 8,
    [int]$WarmRuns = 2,
    [switch]$CheckPortOnly
)

$ErrorActionPreference = 'Stop'

function Test-LoopbackPortAvailable {
    param([Parameter(Mandatory = $true)][int]$CandidatePort)

    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $CandidatePort)
    try {
        $listener.Start()
        return $true
    } catch [Net.Sockets.SocketException] {
        return $false
    } finally {
        $listener.Stop()
    }
}

if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535: $Port" }
if (-not (Test-LoopbackPortAvailable -CandidatePort $Port)) {
    throw "Loopback port $Port is already in use; refusing a contaminated benchmark"
}
if ($CheckPortOnly) {
    [pscustomobject]@{ port = $Port; available = $true } | ConvertTo-Json
    return
}

foreach ($required in @('Server', 'Model', 'AudioDirectory', 'Result')) {
    if ([string]::IsNullOrWhiteSpace((Get-Variable -Name $required -ValueOnly))) {
        throw "$required is required unless CheckPortOnly is used"
    }
}
if (-not (Test-Path -LiteralPath $Server -PathType Leaf)) { throw "Missing server: $Server" }
if (-not (Test-Path -LiteralPath $Model -PathType Leaf)) { throw "Missing model: $Model" }
if ($WarmRuns -lt 1) { throw 'WarmRuns must be at least 1' }

$cases = @(
    @{ locale = 'en'; file = 'en.wav'; reference = 'Car on the left. Hold your line.' },
    @{ locale = 'es'; file = 'es.wav'; reference = 'Coche a la izquierda. Mantén tu línea.' },
    @{ locale = 'it'; file = 'it.wav'; reference = 'Auto a sinistra. Mantieni la traiettoria.' },
    @{ locale = 'pt'; file = 'pt-BR.wav'; reference = 'Carro à esquerda. Mantenha sua linha.' }
)
foreach ($case in $cases) {
    $path = Join-Path $AudioDirectory $case.file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing audio: $path" }
}

$scratch = Join-Path ([IO.Path]::GetTempPath()) "vantare-isa180-$PID"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
$stdout = Join-Path $scratch 'server.stdout.log'
$stderr = Join-Path $scratch 'server.stderr.log'
$load = [Diagnostics.Stopwatch]::StartNew()
$process = Start-Process -FilePath $Server -ArgumentList @(
    '-m', $Model, '-l', 'auto', '-t', $Threads,
    '--host', '127.0.0.1', '--port', $Port, '-ng',
    '-nt', '-nf', '-bo', '1', '-bs', '1'
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

try {
    $process.PriorityClass = 'BelowNormal'
    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        Start-Sleep -Milliseconds 100
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 1 | Out-Null
            $process.Refresh()
            if ($process.HasExited) {
                throw "Whisper server exited while another service answered on port ${Port}: $(Get-Content -Raw $stderr)"
            }
            $owner = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction Stop |
                Select-Object -First 1
            if (-not $owner -or $owner.OwningProcess -ne $process.Id) {
                throw "Loopback port $Port is not owned by the launched whisper-server process"
            }
            $ready = $true
            break
        } catch {
            if ($process.HasExited) {
                throw "Whisper server exited before ready: $(Get-Content -Raw $stderr)"
            }
        }
    }
    if (-not $ready) { throw 'Whisper server did not become ready' }
    $load.Stop()

    $measurements = @()
    foreach ($case in $cases) {
        for ($run = 0; $run -le $WarmRuns; $run++) {
            $responsePath = Join-Path $scratch "$($case.locale)-$run.json"
            $beforeCpu = $process.TotalProcessorTime.TotalMilliseconds
            $clock = [Diagnostics.Stopwatch]::StartNew()
            & curl.exe -sS -o $responsePath -X POST "http://127.0.0.1:$Port/inference" `
                -H 'Content-Type: multipart/form-data' `
                -F "file=@$(Join-Path $AudioDirectory $case.file)" `
                -F 'response_format=json' `
                -F "language=$($case.locale)"
            if ($LASTEXITCODE -ne 0) { throw "curl failed with exit code $LASTEXITCODE" }
            $clock.Stop()
            $process.Refresh()
            $payload = Get-Content -Raw $responsePath | ConvertFrom-Json
            $measurements += [pscustomobject]@{
                locale = $case.locale
                run = $run
                kind = if ($run -eq 0) { 'first' } else { 'warm' }
                wall_ms = [math]::Round($clock.Elapsed.TotalMilliseconds, 3)
                cpu_ms = [math]::Round($process.TotalProcessorTime.TotalMilliseconds - $beforeCpu, 3)
                working_set_bytes = $process.WorkingSet64
                reference = $case.reference
                transcript = $payload.text
            }
        }
    }

    $resultObject = [pscustomobject]@{
        schema = 'vantare.engineer.voice-bench.whisper-server.v1'
        captured_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        server_load_ms = [math]::Round($load.Elapsed.TotalMilliseconds, 3)
        threads = $Threads
        model = [IO.Path]::GetFileName($Model)
        decoding = 'no-timestamps, no-fallback, best-of=1, beam-size=1'
        process_priority = 'BelowNormal'
        measurements = $measurements
        limitations = @(
            'Audio is synthetic Kokoro output, not a human command corpus.',
            'The first request is cold inference after model load; warm requests reuse the resident server.',
            'Working set is sampled after each request and is not peak RSS.'
        )
    }
    $json = $resultObject | ConvertTo-Json -Depth 7
    Set-Content -LiteralPath $Result -Value $json -Encoding utf8
    $json
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit()
    }
    if (Test-Path -LiteralPath $scratch) {
        Remove-Item -LiteralPath $scratch -Recurse -Force
    }
}
