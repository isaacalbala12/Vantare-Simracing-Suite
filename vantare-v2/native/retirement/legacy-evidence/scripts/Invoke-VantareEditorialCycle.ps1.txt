#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$BundlesPath,
    [string]$WorkRoot = (Join-Path $env:LOCALAPPDATA 'Vantare\strategy-editorial'),
    [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
    [string]$RunDate = (Get-Date -Format 'yyyy-MM-dd'),
    [switch]$DryRun,
    [string]$DecisionPath,
    [string]$CatalogKeyEpoch,
    [UInt64]$CatalogVersion = 0,
    [UInt64]$PreviousCatalogVersion = 0,
    [string]$PublishedAt,
    [string]$ExpiresAt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cycleDirectory = Join-Path ([System.IO.Path]::GetFullPath($WorkRoot)) $RunDate
$logPath = Join-Path $cycleDirectory 'cycle.log'
$logLines = [System.Collections.Generic.List[string]]::new()

function Write-CycleStatus {
    param([string]$Message)
    $script:logLines.Add($Message)
    Write-Host "[vantare-editorial] $Message"
}

function Invoke-GoStep {
    param(
        [string]$Name,
        [string[]]$Arguments
    )
    Write-CycleStatus "START $Name"
    $output = & go @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($output) {
        $output | ForEach-Object {
            $detail = [string]$_
            $script:logLines.Add("DETAIL ${Name}: $detail")
            Write-Host $detail
        }
    }
    if ($exitCode -ne 0) {
        throw "$Name failed (go exit $exitCode). Review the error above and $logPath."
    }
    Write-CycleStatus "OK $Name"
}

try {
    if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
        throw 'Go is not available in PATH. Install the repository Go version before scheduling the cycle.'
    }
    if ($DryRun) {
        if ($BundlesPath) {
            throw 'Do not combine -DryRun with -BundlesPath. Dry-run always uses the synthetic repository fixture.'
        }
        $BundlesPath = Join-Path $PSScriptRoot 'testdata\editorial-cycle\bundles'
        Write-CycleStatus 'MODE dry-run (synthetic local bundles; no network)'
    } elseif (-not $BundlesPath) {
        throw 'Provide -BundlesPath with the already synchronized local bundle directory, or use -DryRun.'
    } else {
        Write-CycleStatus 'MODE local bundles (no remote synchronization or publication)'
    }

    $resolvedBundles = (Resolve-Path -LiteralPath $BundlesPath).Path
    New-Item -ItemType Directory -Path $cycleDirectory -Force | Out-Null

    $summaryPath = Join-Path $cycleDirectory 'curator-summary.json'
    $reportPath = Join-Path $cycleDirectory 'llm-report.md'
    $templatePath = Join-Path $cycleDirectory 'decision.template.json'
    $selectionPath = Join-Path $cycleDirectory 'selection.approved.json'
    $catalogPath = Join-Path $cycleDirectory 'catalog.unsigned.json'
    $resolvedDecision = $null
    if ($DecisionPath) {
        $resolvedDecision = (Resolve-Path -LiteralPath $DecisionPath).Path
        foreach ($generatedPath in @($summaryPath, $reportPath, $templatePath, $selectionPath, $catalogPath, $logPath)) {
            if ([string]::Equals(
                [System.IO.Path]::GetFullPath($resolvedDecision),
                [System.IO.Path]::GetFullPath($generatedPath),
                [System.StringComparison]::OrdinalIgnoreCase
            )) {
                throw 'DecisionPath cannot be one of the generated cycle artifacts. Copy decision.template.json to a stable decision.approved.json path first.'
            }
        }
    }
    foreach ($generatedPath in @($summaryPath, $reportPath, $templatePath, $selectionPath, $catalogPath, $logPath)) {
        [System.IO.File]::Delete($generatedPath)
    }

    Push-Location $repositoryRoot
    try {
        Invoke-GoStep 'curator summary' @('run', './cmd/vantare-curator', '--in', $resolvedBundles, '--out', $summaryPath)
        Invoke-GoStep 'allowlisted LLM report' @('run', './cmd/vantare-editorial', 'report', '--summary', $summaryPath, '--out', $reportPath)
        Invoke-GoStep 'closed decision template' @('run', './cmd/vantare-editorial', 'decision-template', '--summary', $summaryPath, '--out', $templatePath)

        if ($DecisionPath) {
            foreach ($required in @(
                @{ Name = '-CatalogKeyEpoch'; Value = $CatalogKeyEpoch },
                @{ Name = '-PublishedAt'; Value = $PublishedAt },
                @{ Name = '-ExpiresAt'; Value = $ExpiresAt }
            )) {
                if (-not $required.Value) {
                    throw "$($required.Name) is required when -DecisionPath is provided. Catalog metadata must be explicit and reviewed."
                }
            }
            if ($CatalogVersion -eq 0) {
                throw '-CatalogVersion must be greater than zero when -DecisionPath is provided.'
            }
            Invoke-GoStep 'approved selection validation' @('run', './cmd/vantare-editorial', 'approve', '--summary', $summaryPath, '--decision', $resolvedDecision, '--out', $selectionPath)
            Invoke-GoStep 'unsigned catalog build' @(
                'run', './cmd/vantare-catalog', 'build',
                '--summary', $summaryPath,
                '--selection', $selectionPath,
                '--out', $catalogPath,
                '--key-epoch', $CatalogKeyEpoch,
                '--version', $CatalogVersion.ToString(),
                '--previous-version', $PreviousCatalogVersion.ToString(),
                '--published-at', $PublishedAt,
                '--expires-at', $ExpiresAt
            )
        } else {
            Write-CycleStatus 'WAIT Isaac decision: copy decision.template.json, edit only approvals, then rerun with -DecisionPath and reviewed catalog metadata'
        }
    } finally {
        Pop-Location
    }

    Write-CycleStatus "DONE artifacts: $cycleDirectory"
    [System.IO.File]::WriteAllLines($logPath, $logLines, [System.Text.UTF8Encoding]::new($false))
} catch {
    $message = $_.Exception.Message
    Write-CycleStatus "STOP $message"
    New-Item -ItemType Directory -Path $cycleDirectory -Force | Out-Null
    [System.IO.File]::WriteAllLines($logPath, $logLines, [System.Text.UTF8Encoding]::new($false))
    Write-Error "Editorial cycle stopped: $message"
    exit 1
}
