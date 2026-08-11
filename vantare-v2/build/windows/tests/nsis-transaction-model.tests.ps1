[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))

function Assert-Model {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function New-TransactionModel {
    param([bool]$PriorExe, [bool]$PriorRuntime)
    return [ordered]@{
        priorExe = $PriorExe
        priorRuntime = $PriorRuntime
        exe = if ($PriorExe) { "old" } else { $null }
        runtime = if ($PriorRuntime) { "old" } else { $null }
        exeBackup = $null
        runtimeBackup = $null
        pending = $null
        committed = $false
    }
}

function Get-PriorInventory {
    param([System.Collections.IDictionary]$State)
    if ($State.priorExe -and $State.priorRuntime) { return "both" }
    if ($State.priorExe) { return "exe" }
    if ($State.priorRuntime) { return "runtime" }
    return "none"
}

function Invoke-ModelRollback {
    param([System.Collections.IDictionary]$State)
    if (-not $State.pending) { return }
    $priorExe = $State.pending -eq "both" -or $State.pending -eq "exe"
    $priorRuntime = $State.pending -eq "both" -or $State.pending -eq "runtime"

    if ($priorExe) {
        if ($State.exeBackup) {
            $State.exe = $State.exeBackup
            $State.exeBackup = $null
        } elseif ($State.exe -ne "old") {
            throw "pending rollback lost the previous exe"
        }
    } else {
        Assert-Model (-not $State.exeBackup) "fresh transaction unexpectedly owns an exe backup"
        $State.exe = $null
    }

    if ($priorRuntime) {
        if ($State.runtimeBackup) {
            $State.runtime = $State.runtimeBackup
            $State.runtimeBackup = $null
        } elseif ($State.runtime -ne "old") {
            throw "pending rollback lost the previous runtime"
        }
    } else {
        Assert-Model (-not $State.runtimeBackup) "fresh transaction unexpectedly owns a runtime backup"
        $State.runtime = $null
    }
    $State.pending = $null
}

function Invoke-ModelCommittedCleanup {
    param([System.Collections.IDictionary]$State, [ValidateSet("none", "exe", "runtime")][string]$FailCleanup = "none")
    if ($FailCleanup -eq "exe" -and $State.exeBackup) { return $false }
    $State.exeBackup = $null
    if ($FailCleanup -eq "runtime" -and $State.runtimeBackup) { return $false }
    $State.runtimeBackup = $null
    $State.pending = $null
    $State.committed = $false
    return $true
}

function Invoke-ModelRecovery {
    param([System.Collections.IDictionary]$State)
    if ($State.committed) {
        [void](Invoke-ModelCommittedCleanup -State $State)
        return
    }
    if ($State.pending) {
        Invoke-ModelRollback -State $State
        return
    }
    if ($State.exeBackup -or $State.runtimeBackup) {
        throw "orphan backup without transaction state"
    }
}

function Invoke-ModelInstall {
    param(
        [System.Collections.IDictionary]$State,
        [ValidateSet("none", "after_pending", "after_exe", "during_runtime", "before_commit", "after_commit", "cleanup_exe", "cleanup_runtime")]
        [string]$StopAt = "none"
    )
    Invoke-ModelRecovery -State $State
    $State.pending = Get-PriorInventory -State $State
    if ($StopAt -eq "after_pending") { return }

    if ($State.priorExe) {
        $State.exeBackup = $State.exe
        $State.exe = $null
    }
    if ($StopAt -eq "after_exe") { return }

    if ($State.priorRuntime) {
        $State.runtimeBackup = $State.runtime
        $State.runtime = $null
    }
    $State.exe = "new"
    $State.runtime = "partial"
    if ($StopAt -eq "during_runtime") { return }
    $State.runtime = "new"
    if ($StopAt -eq "before_commit") { return }

    $State.committed = $true
    if ($StopAt -eq "after_commit") { return }
    if ($StopAt -eq "cleanup_exe") {
        [void](Invoke-ModelCommittedCleanup -State $State -FailCleanup "exe")
        return
    }
    if ($StopAt -eq "cleanup_runtime") {
        [void](Invoke-ModelCommittedCleanup -State $State -FailCleanup "runtime")
        return
    }
    [void](Invoke-ModelCommittedCleanup -State $State)
}

function Assert-PriorPair {
    param([System.Collections.IDictionary]$State, [bool]$PriorExe, [bool]$PriorRuntime, [string]$Scenario)
    Assert-Model ($State.exe -eq $(if ($PriorExe) { "old" } else { $null })) "$Scenario did not restore prior exe state"
    Assert-Model ($State.runtime -eq $(if ($PriorRuntime) { "old" } else { $null })) "$Scenario did not restore prior runtime state"
    Assert-Model (-not $State.exeBackup -and -not $State.runtimeBackup) "$Scenario left a mixed backup pair"
}

function Assert-NewPair {
    param([System.Collections.IDictionary]$State, [string]$Scenario)
    Assert-Model ($State.exe -eq "new" -and $State.runtime -eq "new") "$Scenario did not retain the committed new pair"
    Assert-Model (-not $State.exeBackup -and -not $State.runtimeBackup) "$Scenario left committed backups after recovery"
}

$priorStates = @(
    @{ name = "both"; exe = $true; runtime = $true },
    @{ name = "exe-only"; exe = $true; runtime = $false },
    @{ name = "runtime-only"; exe = $false; runtime = $true },
    @{ name = "none"; exe = $false; runtime = $false }
)
foreach ($prior in $priorStates) {
    foreach ($stop in @("after_pending", "after_exe", "during_runtime", "before_commit")) {
        $state = New-TransactionModel -PriorExe $prior.exe -PriorRuntime $prior.runtime
        Invoke-ModelInstall -State $state -StopAt $stop
        Invoke-ModelRecovery -State $state
        Assert-PriorPair -State $state -PriorExe $prior.exe -PriorRuntime $prior.runtime -Scenario "$($prior.name)/$stop"
    }
    foreach ($stop in @("after_commit", "cleanup_exe", "cleanup_runtime")) {
        $state = New-TransactionModel -PriorExe $prior.exe -PriorRuntime $prior.runtime
        Invoke-ModelInstall -State $state -StopAt $stop
        Invoke-ModelRecovery -State $state
        Assert-NewPair -State $state -Scenario "$($prior.name)/$stop"
        Invoke-ModelRecovery -State $state
        Assert-NewPair -State $state -Scenario "$($prior.name)/$stop/reentry"
    }
}

$orphan = New-TransactionModel -PriorExe $true -PriorRuntime $false
$orphan.exeBackup = "old"
$orphan.exe = "new"
$orphanFailed = $false
try { Invoke-ModelRecovery -State $orphan } catch { $orphanFailed = $true }
Assert-Model $orphanFailed "recovery accepted an isolated backup without transaction state"

$nsi = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "build\windows\nsis\project.nsi")
foreach ($contract in @(
    "INSTALL_TX_PENDING",
    "INSTALL_TX_PENDING_TEMP",
    "INSTALL_TX_COMMITTED",
    "Function RollbackPendingTransaction",
    "Function CleanupCommittedTransaction",
    'FileWrite $0 "$TransactionPrior',
    'Rename "${INSTALL_TX_PENDING_TEMP}" "${INSTALL_TX_PENDING}"',
    'IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 close_not_needed',
    "Call WriteCommittedMarker"
)) {
    Assert-Model ($nsi.Contains($contract)) "project.nsi is missing transaction contract: $contract"
}
$sectionStart = $nsi.IndexOf("Section`r`n")
if ($sectionStart -lt 0) { $sectionStart = $nsi.IndexOf("Section`n") }
$committedCheck = $nsi.IndexOf('IfFileExists "${INSTALL_TX_COMMITTED}"', $sectionStart)
$pendingCheck = $nsi.IndexOf('IfFileExists "${INSTALL_TX_PENDING}"', $committedCheck + 1)
Assert-Model ($committedCheck -ge 0 -and $pendingCheck -gt $committedCheck) "reentry does not prioritize committed cleanup over pending rollback"
$commitWrite = $nsi.IndexOf("Call WriteCommittedMarker")
$cleanupCall = $nsi.IndexOf("Call CleanupCommittedTransaction", $commitWrite + 1)
Assert-Model ($commitWrite -ge 0 -and $cleanupCall -gt $commitWrite) "installer cleans backups before persisting commit state"

Write-Host "PASS NSIS transaction model matrix (4 prior states, rollback, commit, cleanup failure and reentry)."
