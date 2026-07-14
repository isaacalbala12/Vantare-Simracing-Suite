# verify-prealpha.ps1
#
# Validacion automatizable del gate prealpha. NO requiere LMU real ni frontend
# compilado; cubre lo que el agente puede ejecutar sin sesion manual.
#
# Comandos canonicos segun docs/engineer/testing/prealpha-gate.md S2:
#   1. go test ./internal/... ./cmd/...
#   2. smoke cmd/spotter-debug (sustituye a cmd/lmu-debug -jsonl)
#   3. validar fixtures replay
#   4. validar internal/tts/ (engine + cache + tests)
#
# Uso (desde raiz del repo):
#   .\vantare-v2\scripts\verify-prealpha.ps1
#
# Exit codes:
#   0 = verde, gate pasa
#   1 = algun check fallo (ver output)
#
# Cambios respecto a la version previa:
#   - Sustituye `cmd/lmu-debug -jsonl` por `cmd/spotter-debug` (el flag
#     -jsonl nunca existio; ver crewchief-parity-audit.md B.1).
#   - Trabaja contra `./internal/... ./cmd/...` para evitar build constraints
#     de Wails (macOS) y embed de frontend/dist.
#   - Valida fixtures replay persistentes bajo
#     `internal/engineer/replay/testdata/`.
#   - Valida que internal/tts/ exista y sus tests pasen.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

$Failures = New-Object System.Collections.Generic.List[string]

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Run-Check($name, $scriptBlock) {
    Write-Step "Check: $name"
    try {
        & $scriptBlock
        Write-Host "    PASS" -ForegroundColor Green
    } catch {
        Write-Host "    FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $Failures.Add($name)
    }
}

# --- Check 1: go test (paquetes Go sin frontend ni Wails) ------------------
Run-Check "go test internal/... cmd/..." {
    # Excluimos cmd/vantare (Wails main, requiere frontend/dist compilado que no
    # existe en este worktree de ingeniero) y los binarios legacy lmu-* (no
    # scope prealpha). Auditamos solo lo que el gate prealpha declara.
    $out = go test -count=1 ./internal/... ./cmd/spotter-debug/... ./cmd/lmu-debug/... ./cmd/lmu-dump/... ./cmd/lmu-test/... ./cmd/lmu-api-probe/... 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $out
        throw "go test fallo con exit code $LASTEXITCODE"
    }
}

# --- Check 2: cmd/spotter-debug smoke ---------------------------------------
Run-Check "cmd/spotter-debug smoke (mock once)" {
    $tmp = Join-Path $env:TEMP ("spotter-prealpha-" + [Guid]::NewGuid().ToString("N") + ".jsonl")
    try {
        $out = go run ./cmd/spotter-debug -mock -once -out $tmp 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "spotter-debug exit code ${LASTEXITCODE}: $out"
        }
        if (-not (Test-Path $tmp)) {
            throw "output JSONL no creado"
        }
        $size = (Get-Item $tmp).Length
        if ($size -lt 50) {
            throw "output JSONL demasiado pequeno ($size bytes)"
        }
        $firstLine = Get-Content $tmp -TotalCount 1
        if ($firstLine -notmatch '"alignedX"') {
            throw "primera linea sin campo alignedX: $firstLine"
        }
    } finally {
        Remove-Item -Force $tmp -ErrorAction SilentlyContinue
    }
}

# --- Check 3: replay fixtures persistentes ----------------------------------
Run-Check "replay fixtures (4 archivos, >=4 frames cada uno)" {
    $testdataDir = Join-Path $RepoRoot "internal/engineer/replay/testdata"
    if (-not (Test-Path $testdataDir)) {
        throw "directorio testdata/ no existe: $testdataDir"
    }
    $expected = @("left-basic.jsonl", "right-basic.jsonl", "three-wide.jsonl", "all-clear.jsonl")
    foreach ($name in $expected) {
        $path = Join-Path $testdataDir $name
        if (-not (Test-Path $path)) {
            throw "fixture falta: $path"
        }
        $lines = (Get-Content $path).Count
        if ($lines -lt 4) {
            throw "fixture $name tiene $lines lineas, >=4 esperado"
        }
    }
}

# --- Check 4: replay fixtures reproducibles sin stale ----------------------
Run-Check "replay test -v" {
    $out = go test -count=1 ./internal/engineer/replay/... -v 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $out
        throw "replay tests rojos"
    }
}

# --- Check 5: internal/tts/ existe y tests verdes --------------------------
Run-Check "internal/tts/ existe y compila" {
    $ttsDir = Join-Path $RepoRoot "internal/tts"
    if (-not (Test-Path $ttsDir)) {
        throw "internal/tts/ no existe"
    }
    $out = go build ./internal/tts/... 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "internal/tts/ no compila: $out"
    }
}

Run-Check "internal/tts/ tests verdes" {
    $out = go test -count=1 ./internal/tts/... 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $out
        throw "tts tests rojos"
    }
}

# --- Check 6: spotter tests verdes (geometria + ValidityRule + speed gate) --
Run-Check "internal/engineer/spotter + audio + core tests verdes" {
    $out = go test -count=1 ./internal/engineer/spotter/... ./internal/engineer/audio/... ./internal/engineer/core/... 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $out
        throw "spotter/audio/core tests rojos"
    }
}

# --- Check 7: spotter-debug con fixture replay real -----------------------
Run-Check "cmd/spotter-debug -source=replay -once" {
    $tmp = Join-Path $env:TEMP ("spotter-replay-" + [Guid]::NewGuid().ToString("N") + ".jsonl")
    try {
        $fixture = Join-Path $RepoRoot "internal/engineer/replay/testdata/left-basic.jsonl"
        $out = go run ./cmd/spotter-debug -source=replay -replay-path $fixture -once -out $tmp 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "spotter-debug replay exit code ${LASTEXITCODE}: $out"
        }
        $firstLine = Get-Content $tmp -TotalCount 1
        if ($firstLine -notmatch '"inOverlap":true') {
            throw "left-basic fixture no produjo inOverlap:true: $firstLine"
        }
    } finally {
        Remove-Item -Force $tmp -ErrorAction SilentlyContinue
    }
}

# --- Resumen --------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor White
if ($Failures.Count -eq 0) {
    Write-Host " PREALPHA GATE: PASS" -ForegroundColor Green
    Write-Host " Todos los checks automatizables verdes." -ForegroundColor Green
    Write-Host " Pendiente (manual, requiere sesion LMU):" -ForegroundColor Yellow
    Write-Host "   - Captura LMU real >=1 min trafico (gate S1.2)" -ForegroundColor Yellow
    Write-Host "   - Validacion en >=3 circuitos (gate S1.6, G0.10)" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor White
    exit 0
} else {
    Write-Host " PREALPHA GATE: FAIL" -ForegroundColor Red
    Write-Host " Checks fallidos:" -ForegroundColor Red
    foreach ($f in $Failures) {
        Write-Host "   - $f" -ForegroundColor Red
    }
    Write-Host "========================================" -ForegroundColor White
    exit 1
}