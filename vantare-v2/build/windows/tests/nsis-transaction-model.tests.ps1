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
        stagedExe = $null
        outDir = "product"
        exeBackup = $null
        runtimeBackup = $null
        pending = $null
        committed = $false
    }
}

function Remove-ModelStage {
    param([System.Collections.IDictionary]$State, [string]$Scenario)
    Assert-Model ($State.outDir -ne "stage") "$Scenario tries to remove the current OutDir"
    $State.stagedExe = $null
}

function Get-PriorInventory {
    param([System.Collections.IDictionary]$State)
    if ($State.priorExe -and $State.priorRuntime) { return "both" }
    if ($State.priorExe) { return "exe" }
    if ($State.priorRuntime) { return "runtime" }
    return "none"
}

function Invoke-ModelCommittedCleanup {
    param([System.Collections.IDictionary]$State, [ValidateSet("none", "exe", "runtime")][string]$FailCleanup = "none")
    if ($FailCleanup -eq "exe" -and $State.exeBackup) { return $false }
    $State.exeBackup = $null
    if ($FailCleanup -eq "runtime" -and $State.runtimeBackup) { return $false }
    $State.runtimeBackup = $null
    $State.outDir = "product"
    Remove-ModelStage -State $State -Scenario "committed cleanup"
    $State.pending = $null
    $State.committed = $false
    return $true
}

function Invoke-ModelRollback {
    param(
        [System.Collections.IDictionary]$State,
        [ValidateSet("none", "after_exe_retire", "after_stage_cleanup", "after_runtime_remove", "after_runtime_restore", "during_exe_restore", "after_staged_restore", "after_exe_restore", "after_commit")]
        [string]$StopAt = "none",
        [switch]$FailRuntimeRemoval
    )
    if (-not $State.pending) { return }
    $State.outDir = "product"
    $priorExe = $State.pending -eq "both" -or $State.pending -eq "exe"
    $priorRuntime = $State.pending -eq "both" -or $State.pending -eq "runtime"

    # A backup proves the old exe was moved, so any product exe is new. Without
    # a backup, a prior exe is still the untouched old product and must remain.
    if ($priorExe) {
        if ($State.exeBackup) { $State.exe = $null }
        elseif ($State.exe -ne "old") { throw "pending rollback lost the untouched previous exe" }
    } else {
        Assert-Model (-not $State.exeBackup) "fresh transaction unexpectedly owns an exe backup"
        $State.exe = $null
    }
    if ($StopAt -eq "after_exe_retire") { return }

    Remove-ModelStage -State $State -Scenario "pending rollback"
    if ($StopAt -eq "after_stage_cleanup") { return }

    if ($priorRuntime) {
        if ($State.runtimeBackup) {
            if ($FailRuntimeRemoval) { return }
            $State.runtime = $null
            if ($StopAt -eq "after_runtime_remove") { return }
            $State.runtime = $State.runtimeBackup
            $State.runtimeBackup = $null
        } elseif ($State.runtime -ne "old") {
            throw "pending rollback lost the previous runtime"
        }
    } else {
        Assert-Model (-not $State.runtimeBackup) "fresh transaction unexpectedly owns a runtime backup"
        if ($FailRuntimeRemoval -and $State.runtime) { return }
        $State.runtime = $null
        if ($StopAt -eq "after_runtime_remove") { return }
    }
    if ($StopAt -eq "after_runtime_restore") { return }

    # Copy the old exe last and retain its backup until the current pair is
    # committed. A crash can therefore delete/re-copy it on the next recovery.
    if ($priorExe) {
        if ($State.exeBackup) {
            $State.outDir = "stage"
            $State.stagedExe = "partial-old"
            if ($StopAt -eq "during_exe_restore") { return }
            $State.stagedExe = $State.exeBackup
            if ($StopAt -eq "after_staged_restore") { return }
            $State.exe = $State.stagedExe
            $State.outDir = "product"
            Remove-ModelStage -State $State -Scenario "rollback restored exe"
        }
        elseif ($State.exe -ne "old") { throw "pending rollback lost the previous exe" }
    } else {
        $State.exe = $null
    }
    if ($StopAt -eq "after_exe_restore") { return }

    $State.committed = $true
    if ($StopAt -eq "after_commit") { return }
    [void](Invoke-ModelCommittedCleanup -State $State)
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
    if ($State.exeBackup -or $State.runtimeBackup -or $State.stagedExe) {
        throw "orphan transaction member without state"
    }
}

function Invoke-ModelInstall {
    param(
        [System.Collections.IDictionary]$State,
        [ValidateSet("none", "after_pending", "after_exe_backup", "after_runtime_backup", "during_runtime", "after_runtime", "during_staged_exe", "after_staged_exe", "after_exe_publish", "after_commit", "cleanup_exe", "cleanup_runtime")]
        [string]$StopAt = "none"
    )
    Invoke-ModelRecovery -State $State
    $State.pending = Get-PriorInventory -State $State
    if ($StopAt -eq "after_pending") { return }

    if ($State.priorExe) {
        $State.exeBackup = $State.exe
        $State.exe = $null
    }
    if ($StopAt -eq "after_exe_backup") { return }

    if ($State.priorRuntime) {
        $State.runtimeBackup = $State.runtime
        $State.runtime = $null
    }
    if ($StopAt -eq "after_runtime_backup") { return }

    $State.runtime = "partial"
    if ($StopAt -eq "during_runtime") { return }
    $State.runtime = "new"
    if ($StopAt -eq "after_runtime") { return }

    $State.outDir = "product"
    Remove-ModelStage -State $State -Scenario "install before staging"
    $State.outDir = "stage"
    $State.stagedExe = "partial"
    if ($StopAt -eq "during_staged_exe") { return }
    $State.stagedExe = "new"
    if ($StopAt -eq "after_staged_exe") { return }

    $State.exe = $State.stagedExe
    $State.outDir = "product"
    Remove-ModelStage -State $State -Scenario "install after publish"
    if ($StopAt -eq "after_exe_publish") { return }

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

function Assert-SafeProductState {
    param([System.Collections.IDictionary]$State, [bool]$PriorRuntime, [string]$Scenario)
    if (-not $State.exe) { return }
    if ($State.exe -eq "new") {
        Assert-Model ($State.runtime -eq "new") "$Scenario exposes a new exe with a non-new runtime"
        return
    }
    Assert-Model ($State.exe -eq "old") "$Scenario exposes a partial or unknown product exe"
    $expectedRuntime = if ($PriorRuntime) { "old" } else { $null }
    Assert-Model ($State.runtime -eq $expectedRuntime) "$Scenario exposes the old exe with a mixed runtime"
}

function Assert-PriorPair {
    param([System.Collections.IDictionary]$State, [bool]$PriorExe, [bool]$PriorRuntime, [string]$Scenario)
    Assert-Model ($State.exe -eq $(if ($PriorExe) { "old" } else { $null })) "$Scenario did not restore prior exe state"
    Assert-Model ($State.runtime -eq $(if ($PriorRuntime) { "old" } else { $null })) "$Scenario did not restore prior runtime state"
    Assert-Model (-not $State.exeBackup -and -not $State.runtimeBackup -and -not $State.stagedExe) "$Scenario left transaction members"
}

function Assert-NewPair {
    param([System.Collections.IDictionary]$State, [string]$Scenario)
    Assert-Model ($State.exe -eq "new" -and $State.runtime -eq "new") "$Scenario did not retain the committed new pair"
    Assert-Model (-not $State.exeBackup -and -not $State.runtimeBackup -and -not $State.stagedExe) "$Scenario left committed transaction members"
}

$priorStates = @(
    @{ name = "both"; exe = $true; runtime = $true },
    @{ name = "exe-only"; exe = $true; runtime = $false },
    @{ name = "runtime-only"; exe = $false; runtime = $true },
    @{ name = "none"; exe = $false; runtime = $false }
)
$installCuts = @("after_pending", "after_exe_backup", "after_runtime_backup", "during_runtime", "after_runtime", "during_staged_exe", "after_staged_exe", "after_exe_publish")
$rollbackCuts = @("after_exe_retire", "after_stage_cleanup", "after_runtime_remove", "after_runtime_restore", "during_exe_restore", "after_staged_restore", "after_exe_restore", "after_commit")
foreach ($prior in $priorStates) {
    foreach ($cut in $installCuts) {
        $state = New-TransactionModel -PriorExe $prior.exe -PriorRuntime $prior.runtime
        Invoke-ModelInstall -State $state -StopAt $cut
        Assert-SafeProductState -State $state -PriorRuntime $prior.runtime -Scenario "$($prior.name)/install/$cut"
        Invoke-ModelRecovery -State $state
        Assert-PriorPair -State $state -PriorExe $prior.exe -PriorRuntime $prior.runtime -Scenario "$($prior.name)/install/$cut/recovery"
    }

    foreach ($cut in $rollbackCuts) {
        $state = New-TransactionModel -PriorExe $prior.exe -PriorRuntime $prior.runtime
        Invoke-ModelInstall -State $state -StopAt "after_exe_publish"
        Invoke-ModelRollback -State $state -StopAt $cut
        Assert-SafeProductState -State $state -PriorRuntime $prior.runtime -Scenario "$($prior.name)/rollback/$cut"
        Invoke-ModelRecovery -State $state
        Assert-PriorPair -State $state -PriorExe $prior.exe -PriorRuntime $prior.runtime -Scenario "$($prior.name)/rollback/$cut/reentry"
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

foreach ($prior in $priorStates | Where-Object runtime) {
    $state = New-TransactionModel -PriorExe $prior.exe -PriorRuntime $prior.runtime
    Invoke-ModelInstall -State $state -StopAt "during_runtime"
    Invoke-ModelRollback -State $state -FailRuntimeRemoval
    Assert-Model (-not $state.exe -and $state.pending -and $state.runtimeBackup) "$($prior.name)/runtime-remove-failure is not safely retryable"
    Invoke-ModelRecovery -State $state
    Assert-PriorPair -State $state -PriorExe $prior.exe -PriorRuntime $prior.runtime -Scenario "$($prior.name)/runtime-remove-failure/reentry"
}

$orphan = New-TransactionModel -PriorExe $true -PriorRuntime $false
$orphan.exeBackup = "old"
$orphan.exe = "new"
$orphanFailed = $false
try { Invoke-ModelRecovery -State $orphan } catch { $orphanFailed = $true }
Assert-Model $orphanFailed "recovery accepted an isolated transaction member without state"

$nsi = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "build\windows\nsis\project.nsi")
foreach ($contract in @(
    "INSTALL_TX_PENDING",
    "INSTALL_TX_PENDING_TEMP",
    "INSTALL_TX_COMMITTED",
    "INSTALL_TX_STAGE",
    "Function CleanupCommittedTransaction",
    'FileWrite $0 "$TransactionPrior',
    'Rename "${INSTALL_TX_PENDING_TEMP}" "${INSTALL_TX_PENDING}"',
    'IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 close_not_needed',
    'SetOutPath "${INSTALL_TX_STAGE}"',
    'Rename "${INSTALL_TX_STAGE}\${PRODUCT_EXECUTABLE}" "$INSTDIR\${PRODUCT_EXECUTABLE}"',
    'CopyFiles /SILENT "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" "${INSTALL_TX_STAGE}\${PRODUCT_EXECUTABLE}"',
    "Function RollbackPendingTransaction",
    "Call WriteCommittedMarker"
)) {
    Assert-Model ($nsi.Contains($contract)) "project.nsi is missing ordered transaction contract: $contract"
}
$sectionStart = $nsi.IndexOf("Section`r`n")
if ($sectionStart -lt 0) { $sectionStart = $nsi.IndexOf("Section`n") }
$committedCheck = $nsi.IndexOf('IfFileExists "${INSTALL_TX_COMMITTED}"', $sectionStart)
$pendingCheck = $nsi.IndexOf('IfFileExists "${INSTALL_TX_PENDING}"', $committedCheck + 1)
Assert-Model ($committedCheck -ge 0 -and $pendingCheck -gt $committedCheck) "reentry does not prioritize committed cleanup over pending rollback"
$runtimeVerify = $nsi.IndexOf('# Verify the complete new runtime before staging the executable.', $sectionStart)
$wailsFiles = $nsi.IndexOf('!insertmacro wails.files', $sectionStart)
$publishExe = $nsi.IndexOf('Rename "${INSTALL_TX_STAGE}\${PRODUCT_EXECUTABLE}" "$INSTDIR\${PRODUCT_EXECUTABLE}"', $wailsFiles)
$commitWrite = $nsi.IndexOf("Call WriteCommittedMarker", $publishExe)
Assert-Model ($runtimeVerify -ge 0 -and $wailsFiles -gt $runtimeVerify -and $publishExe -gt $wailsFiles -and $commitWrite -gt $publishExe) `
    "installer does not verify runtime, stage exe, atomically publish exe, then commit in that order"
$cleanupCall = $nsi.IndexOf("Call CleanupCommittedTransaction", $commitWrite + 1)
Assert-Model ($cleanupCall -gt $commitWrite) "installer does not persist commit state before cleanup"

$rollbackStart = $nsi.IndexOf("Function RollbackPendingTransaction")
$rollbackEnd = $nsi.IndexOf("FunctionEnd", $rollbackStart)
$retireExe = $nsi.IndexOf('Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"', $rollbackStart)
$removeRuntime = $nsi.IndexOf('RMDir /r "${TELEMETRY_RUNTIME_DIR}"', $retireExe)
$restoreExe = $nsi.IndexOf('CopyFiles /SILENT "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" "${INSTALL_TX_STAGE}\${PRODUCT_EXECUTABLE}"', $removeRuntime)
Assert-Model ($retireExe -gt $rollbackStart -and $removeRuntime -gt $retireExe -and $restoreExe -gt $removeRuntime -and $restoreExe -lt $rollbackEnd) `
    "rollback does not retire new exe, restore runtime, then copy old exe last"

$nsiLines = @($nsi -split "`r?`n")
$stageRemovals = @($nsiLines | ForEach-Object -Begin { $lineNumber = -1 } -Process {
    $lineNumber++
    if ($_ -match '^\s*RMDir(?:\s+/r)?\s+"\$\{INSTALL_TX_STAGE\}"') { $lineNumber }
})
Assert-Model ($stageRemovals.Count -eq 5) "expected exactly five stage cleanup paths, got $($stageRemovals.Count)"
foreach ($removal in $stageRemovals) {
    $previousOutDir = $null
    for ($line = $removal - 1; $line -ge 0; $line--) {
        if ($nsiLines[$line] -match '^\s*SetOutPath\s+') {
            $previousOutDir = $nsiLines[$line].Trim()
            break
        }
    }
    Assert-Model ($previousOutDir -eq 'SetOutPath "$INSTDIR"') "stage cleanup on line $($removal + 1) is unsafe after: $previousOutDir"
}

Write-Host "PASS NSIS transaction model: safe install/rollback cuts, retryable runtime failure and convergent reentry."
