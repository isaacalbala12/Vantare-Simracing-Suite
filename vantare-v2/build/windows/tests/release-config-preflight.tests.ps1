[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$preflightScript = Join-Path $repoRoot "tools\release_build_preflight.ps1"
$failures = New-Object 'System.Collections.Generic.List[string]'
$syntheticUrl = "https://synthetic-release.invalid"
$syntheticKey = "synthetic-anon-key-for-tests"

function Invoke-Case {
    param([string]$Name, [scriptblock]$Test)
    try {
        & $Test
        Write-Host "PASS $Name"
    } catch {
        $failures.Add("${Name}: $($_.Exception.Message)")
        Write-Host "FAIL $Name - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Invoke-PreflightProcess {
    param([AllowNull()][string]$Url, [AllowNull()][string]$AnonKey)

    $executable = (Get-Process -Id $PID).Path
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $executable
    $startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$preflightScript`""
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    [void]$startInfo.EnvironmentVariables.Remove("VANTARE_SUPABASE_URL")
    [void]$startInfo.EnvironmentVariables.Remove("VANTARE_SUPABASE_ANON_KEY")
    if ($null -ne $Url) { $startInfo.EnvironmentVariables["VANTARE_SUPABASE_URL"] = $Url }
    if ($null -ne $AnonKey) { $startInfo.EnvironmentVariables["VANTARE_SUPABASE_ANON_KEY"] = $AnonKey }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Output = $stdout + $stderr
    }
}

function Invoke-TaskProcess {
    param(
        [string]$TaskName,
        [bool]$Configured,
        [bool]$DryRun,
        [bool]$Force = $false
    )

    $executable = (Get-Process -Id $PID).Path
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $executable
    $dryArgument = if ($DryRun) { "-dry " } else { "" }
    $forceArgument = if ($Force) { "-f " } else { "" }
    $startInfo.Arguments = "-NoProfile -Command `"& wails3 task $forceArgument$dryArgument$TaskName`""
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    [void]$startInfo.EnvironmentVariables.Remove("VANTARE_SUPABASE_URL")
    [void]$startInfo.EnvironmentVariables.Remove("VANTARE_SUPABASE_ANON_KEY")
    if ($Configured) {
        $startInfo.EnvironmentVariables["VANTARE_SUPABASE_URL"] = $syntheticUrl
        $startInfo.EnvironmentVariables["VANTARE_SUPABASE_ANON_KEY"] = $syntheticKey
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Output = $stdout + $stderr
    }
}

Invoke-Case "preflight script parses in this PowerShell host" {
    Assert-True (Test-Path -LiteralPath $preflightScript) "Preflight script is missing."
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $preflightScript, [ref]$tokens, [ref]$parseErrors
    )
    Assert-True ($parseErrors.Count -eq 0) "Parser errors: $($parseErrors.Message -join '; ')"
}

Invoke-Case "preflight fails closed and names both missing variables" {
    $result = Invoke-PreflightProcess -Url $null -AnonKey $null
    Assert-True ($result.ExitCode -ne 0) "Preflight accepted both variables as absent."
    Assert-True ($result.Output -match 'VANTARE_SUPABASE_URL=UNSET') "URL status was not reported as UNSET."
    Assert-True ($result.Output -match 'VANTARE_SUPABASE_ANON_KEY=UNSET') "Anon key status was not reported as UNSET."
    Assert-True ($result.Output -match 'MISSING=.*VANTARE_SUPABASE_URL.*VANTARE_SUPABASE_ANON_KEY') `
        "Both missing variable names were not reported."
}

Invoke-Case "preflight fails when either variable is missing" {
    $missingUrl = Invoke-PreflightProcess -Url $null -AnonKey $syntheticKey
    Assert-True ($missingUrl.ExitCode -ne 0) "Preflight accepted a missing URL."
    Assert-True ($missingUrl.Output -match 'VANTARE_SUPABASE_URL=UNSET') "Missing URL was not reported."
    Assert-True ($missingUrl.Output -notmatch [regex]::Escape($syntheticKey)) "Preflight printed the anon key value."

    $missingKey = Invoke-PreflightProcess -Url $syntheticUrl -AnonKey $null
    Assert-True ($missingKey.ExitCode -ne 0) "Preflight accepted a missing anon key."
    Assert-True ($missingKey.Output -match 'VANTARE_SUPABASE_ANON_KEY=UNSET') "Missing anon key was not reported."
    Assert-True ($missingKey.Output -notmatch [regex]::Escape($syntheticUrl)) "Preflight printed the URL value."
}

Invoke-Case "preflight passes with synthetic values without printing them" {
    $result = Invoke-PreflightProcess -Url $syntheticUrl -AnonKey $syntheticKey
    Assert-True ($result.ExitCode -eq 0) "Preflight rejected a complete synthetic configuration."
    Assert-True ($result.Output -match 'VANTARE_SUPABASE_URL=SET') "URL status was not reported as SET."
    Assert-True ($result.Output -match 'VANTARE_SUPABASE_ANON_KEY=SET') "Anon key status was not reported as SET."
    Assert-True ($result.Output -notmatch [regex]::Escape($syntheticUrl)) "Preflight printed the URL value."
    Assert-True ($result.Output -notmatch [regex]::Escape($syntheticKey)) "Preflight printed the anon key value."
}

$dependencyStartPattern = '(?i)go\s+run|go\s+mod\s+tidy|go\s+build|\bpnpm(?:\.cmd)?\b|prepare-runtime\.ps1|telemetry:runtime'

foreach ($taskName in @("release:artifacts", "windows:package:all", "release:portable")) {
    Invoke-Case "$taskName fails before build dependencies with env unset" {
        $result = Invoke-TaskProcess -TaskName $taskName -Configured $false -DryRun $false
        Assert-True ($result.ExitCode -ne 0) "$taskName accepted missing release configuration."
        Assert-True ($result.Output -match 'VANTARE_SUPABASE_URL=UNSET') "$taskName did not report the URL as UNSET."
        Assert-True ($result.Output -match 'VANTARE_SUPABASE_ANON_KEY=UNSET') "$taskName did not report the anon key as UNSET."
        Assert-True ($result.Output -notmatch $dependencyStartPattern) `
            "$taskName started a build/runtime dependency before failing."
    }

    Invoke-Case "$taskName force rebuild cannot bypass the release preflight" {
        $result = Invoke-TaskProcess -TaskName $taskName -Configured $false -DryRun $false -Force $true
        Assert-True ($result.ExitCode -ne 0) "$taskName -f bypassed missing release configuration."
        Assert-True ($result.Output -match 'MISSING=.*VANTARE_SUPABASE_URL.*VANTARE_SUPABASE_ANON_KEY') `
            "$taskName -f did not report both missing names."
        Assert-True ($result.Output -notmatch $dependencyStartPattern) `
            "$taskName -f started a build/runtime dependency before failing."
    }

    Invoke-Case "$taskName schedules preflight before build dependencies with env unset" {
        $result = Invoke-TaskProcess -TaskName $taskName -Configured $false -DryRun $true
        Assert-True ($result.ExitCode -eq 0) "$taskName dry-run did not render."
        $preflightIndex = $result.Output.IndexOf("release_build_preflight.ps1", [System.StringComparison]::OrdinalIgnoreCase)
        $buildIndexes = @(
            $result.Output.IndexOf("prepare-runtime.ps1", [System.StringComparison]::OrdinalIgnoreCase),
            $result.Output.IndexOf("pnpm install", [System.StringComparison]::OrdinalIgnoreCase),
            $result.Output.IndexOf("pnpm run build", [System.StringComparison]::OrdinalIgnoreCase),
            $result.Output.IndexOf("go build", [System.StringComparison]::OrdinalIgnoreCase)
        ) | Where-Object { $_ -ge 0 }
        Assert-True ($preflightIndex -ge 0) `
            "$taskName can advance to build/runtime without scheduling the release config preflight."
        Assert-True ($buildIndexes.Count -gt 0) "$taskName dry-run did not expose a build/runtime command to order."
        Assert-True ($preflightIndex -lt ($buildIndexes | Measure-Object -Minimum).Minimum) `
            "$taskName schedules build/runtime before the release config preflight."
    }

    Invoke-Case "$taskName dry-run with synthetic env does not expose values" {
        $result = Invoke-TaskProcess -TaskName $taskName -Configured $true -DryRun $true
        Assert-True ($result.ExitCode -eq 0) "$taskName configured dry-run did not render."
        Assert-True ($result.Output -notmatch [regex]::Escape($syntheticUrl)) "$taskName dry-run exposed the URL value."
        Assert-True ($result.Output -notmatch [regex]::Escape($syntheticKey)) "$taskName dry-run exposed the anon key value."
    }
}

Invoke-Case "windows:build remains available without release preflight" {
    $result = Invoke-TaskProcess -TaskName "windows:build" -Configured $false -DryRun $true
    Assert-True ($result.ExitCode -eq 0) "windows:build dry-run did not render without release configuration."
    Assert-True ($result.Output -notmatch 'release_build_preflight\.ps1') `
        "windows:build was incorrectly wired to the release preflight."
}

if ($failures.Count -ne 0) {
    Write-Host "`n$($failures.Count) release config preflight test(s) failed:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "`nAll release config preflight tests passed."
