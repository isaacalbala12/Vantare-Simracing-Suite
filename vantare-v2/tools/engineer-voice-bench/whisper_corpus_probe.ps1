param(
    [string]$Server,
    [string]$Model,
    [string]$ModelLabel,
    [string]$CorpusRoot,
    [string]$Manifest,
    [string]$Result,
    [int]$Port = 18181,
    [int]$Threads = 8,
    [int]$ConnectTimeoutSeconds = 3,
    [int]$RequestTimeoutSeconds = 30,
    [switch]$CheckPortOnly
)

$ErrorActionPreference = 'Stop'

function Test-LoopbackPortAvailable {
    param([Parameter(Mandatory = $true)][int]$CandidatePort)
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $CandidatePort)
    try { $listener.Start(); return $true }
    catch [Net.Sockets.SocketException] { return $false }
    finally { $listener.Stop() }
}

if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535: $Port" }
if ($ConnectTimeoutSeconds -lt 1 -or $RequestTimeoutSeconds -lt 1 -or $RequestTimeoutSeconds -gt 120) {
    throw 'Connect/request timeouts must be positive and request timeout must not exceed 120 seconds'
}
if (-not (Test-LoopbackPortAvailable -CandidatePort $Port)) {
    throw "Loopback port $Port is already in use; refusing a contaminated benchmark"
}
if ($CheckPortOnly) {
    [pscustomobject]@{ port = $Port; available = $true } | ConvertTo-Json
    return
}
foreach ($required in @('Server', 'Model', 'ModelLabel', 'CorpusRoot', 'Manifest', 'Result')) {
    if ([string]::IsNullOrWhiteSpace((Get-Variable -Name $required -ValueOnly))) {
        throw "$required is required unless CheckPortOnly is used"
    }
}
foreach ($file in @($Server, $Model, $Manifest)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing file: $file" }
}
$resolvedRoot = (Resolve-Path -LiteralPath $CorpusRoot).Path
$gitRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and $gitRoot) {
    $resolvedGitRoot = [IO.Path]::GetFullPath($gitRoot)
    foreach ($externalPath in @($resolvedRoot, [IO.Path]::GetFullPath($Model), [IO.Path]::GetFullPath($Server), [IO.Path]::GetFullPath($Result))) {
        if ($externalPath -eq $resolvedGitRoot -or $externalPath.StartsWith($resolvedGitRoot + [IO.Path]::DirectorySeparatorChar)) {
            throw "Corpus, models, server and raw result must remain outside Git: $externalPath"
        }
    }
}
$corpus = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
if ($corpus.schema -ne 'vantare.engineer.stt-benchmark-corpus.v1') { throw 'Unexpected corpus manifest schema' }
if (-not $corpus.samples -or $corpus.samples.Count -lt 1) { throw 'Corpus manifest has no samples' }

$localeMap = @{ en_us = 'en'; es_419 = 'es'; it_it = 'it'; pt_br = 'pt' }
$validated = foreach ($sample in $corpus.samples) {
    if (-not $localeMap.ContainsKey($sample.locale)) { throw "Unsupported locale: $($sample.locale)" }
    $candidate = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $sample.file))
    if (-not $candidate.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar)) {
        throw "Corpus path escapes root: $($sample.file)"
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Missing corpus WAV: $($sample.file)" }
    [pscustomobject]@{ sample = $sample; path = $candidate; language = $localeMap[$sample.locale] }
}

$scratch = Join-Path ([IO.Path]::GetTempPath()) "vantare-isa181-$PID-$ModelLabel"
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
    for ($attempt = 0; $attempt -lt 180; $attempt++) {
        Start-Sleep -Milliseconds 100
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 1 | Out-Null
            $process.Refresh()
            if ($process.HasExited) { throw "Whisper server exited: $(Get-Content -Raw $stderr)" }
            $owner = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
            if (-not $owner -or $owner.OwningProcess -ne $process.Id) { throw "Port $Port is not owned by the launched process" }
            $ready = $true
            break
        } catch {
            if ($process.HasExited) { throw "Whisper server exited before ready: $(Get-Content -Raw $stderr)" }
        }
    }
    if (-not $ready) { throw 'Whisper server did not become ready' }
    $load.Stop()

    $measurements = @()
    for ($index = 0; $index -lt $validated.Count; $index++) {
        $entry = $validated[$index]
        $responsePath = Join-Path $scratch "$index.json"
        $beforeCpu = $process.TotalProcessorTime.TotalMilliseconds
        $clock = [Diagnostics.Stopwatch]::StartNew()
        & curl.exe -sS -o $responsePath -X POST "http://127.0.0.1:$Port/inference" `
            --fail-with-body `
            --connect-timeout $ConnectTimeoutSeconds `
            --max-time $RequestTimeoutSeconds `
            -H 'Content-Type: multipart/form-data' `
            -F "file=@$($entry.path)" `
            -F 'response_format=json' `
            -F "language=$($entry.language)"
        if ($LASTEXITCODE -ne 0) { throw "curl failed or timed out with exit code $LASTEXITCODE" }
        $clock.Stop()
        $process.Refresh()
        if (-not (Test-Path -LiteralPath $responsePath -PathType Leaf)) { throw 'whisper response file was not created' }
        try {
            $payload = Get-Content -Raw -LiteralPath $responsePath | ConvertFrom-Json
        } catch {
            throw 'whisper response is not valid JSON'
        }
        if ($null -eq $payload.text -or $payload.text -isnot [string] -or [string]::IsNullOrWhiteSpace($payload.text)) {
            throw 'whisper response does not contain a non-empty text field'
        }
        $measurements += [pscustomobject]@{
            model = $ModelLabel
            locale = $entry.sample.locale
            condition = $entry.sample.condition
            recording_id = $entry.sample.recording_id
            gender = $entry.sample.gender
            kind = if ($index -eq 0) { 'first' } else { 'warm' }
            wall_ms = [math]::Round($clock.Elapsed.TotalMilliseconds, 3)
            cpu_ms = [math]::Round($process.TotalProcessorTime.TotalMilliseconds - $beforeCpu, 3)
            working_set_bytes = $process.WorkingSet64
            reference = $entry.sample.reference
            transcript = $payload.text
            expected_intent = $null
            predicted_intent = $null
        }
    }

    $modelHash = (Get-FileHash -LiteralPath $Model -Algorithm SHA256).Hash.ToLowerInvariant()
    $resultObject = [pscustomobject]@{
        schema = 'vantare.engineer.human-corpus-whisper.v1'
        captured_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        model = $ModelLabel
        model_bytes = (Get-Item -LiteralPath $Model).Length
        model_sha256 = $modelHash
        server_load_ms = [math]::Round($load.Elapsed.TotalMilliseconds, 3)
        threads = $Threads
        process_priority = 'BelowNormal'
        decoding = 'no-timestamps, no-fallback, best-of=1, beam-size=1'
        measurements = $measurements
        limitations = @(
            'FLEURS is generic human read speech, not a Vantare command corpus.',
            'Intent accuracy and false accept/reject are not measured.',
            'noise-10db is deterministic white noise, not LMU cockpit noise.',
            'Working set is sampled after each request and is not peak RSS.'
        )
    }
    $resultObject | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Result -Encoding utf8
    [pscustomobject]@{ model = $ModelLabel; samples = $measurements.Count; result = [IO.Path]::GetFileName($Result) } | ConvertTo-Json
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit()
    }
    if ([IO.Directory]::Exists($scratch)) { [IO.Directory]::Delete($scratch, $true) }
}
