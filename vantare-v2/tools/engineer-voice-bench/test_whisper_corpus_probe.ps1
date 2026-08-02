$ErrorActionPreference = 'Stop'

function Test-PortAvailable {
    param([int]$Port)
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start(); return $true }
    catch [Net.Sockets.SocketException] { return $false }
    finally { $listener.Stop() }
}

$root = Join-Path ([IO.Path]::GetTempPath()) "vantare-isa181-probe-test-$PID"
$server = Join-Path $root 'fake-whisper-server.exe'
$model = Join-Path $root 'model.bin'
$corpus = Join-Path $root 'corpus'
$audio = Join-Path $corpus 'sample.wav'
$manifest = Join-Path $corpus 'manifest.json'
$probe = Join-Path $PSScriptRoot 'whisper_corpus_probe.ps1'

New-Item -ItemType Directory -Path $corpus -Force | Out-Null
try {
    go build -o $server ./tools/engineer-voice-bench/testdata/fake-whisper-server
    if ($LASTEXITCODE -ne 0) { throw "fake server build failed: $LASTEXITCODE" }
    [IO.File]::WriteAllBytes($model, [byte[]](1, 2, 3))
    [IO.File]::WriteAllBytes($audio, [byte[]](1, 2, 3))
    @{
        schema = 'vantare.engineer.stt-benchmark-corpus.v1'
        samples = @(@{ locale = 'en_us'; condition = 'clean'; file = 'sample.wav'; reference = 'hello'; recording_id = 'fixture'; gender = 'UNKNOWN' })
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifest -Encoding utf8

    foreach ($case in @(
        @{ mode = 'timeout'; port = 18187; timeout = 1 },
        @{ mode = 'invalid'; port = 18188; timeout = 5 }
    )) {
        $env:VANTARE_FAKE_WHISPER_MODE = $case.mode
        $failed = $false
        $failureMessage = ''
        try {
            & $probe -Server $server -Model $model -ModelLabel "fake-$($case.mode)" `
                -CorpusRoot $corpus -Manifest $manifest -Result (Join-Path $root "$($case.mode).json") `
                -Port $case.port -Threads 1 -ConnectTimeoutSeconds 1 -RequestTimeoutSeconds $case.timeout
        } catch {
            $failed = $true
            $failureMessage = $_.Exception.Message
        }
        if (-not $failed) { throw "$($case.mode) probe did not fail" }
        $expected = if ($case.mode -eq 'timeout') { 'curl failed or timed out' } else { 'not valid JSON' }
        if ($failureMessage -notlike "*$expected*") { throw "$($case.mode) probe failed for the wrong reason: $failureMessage" }
        if (-not (Test-PortAvailable -Port $case.port)) { throw "$($case.mode) probe left port $($case.port) occupied" }
    }
    'timeout/invalid-response cleanup PASS'
} finally {
    Remove-Item Env:VANTARE_FAKE_WHISPER_MODE -ErrorAction SilentlyContinue
    if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
