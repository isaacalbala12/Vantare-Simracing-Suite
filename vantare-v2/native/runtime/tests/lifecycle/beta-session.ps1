param([string]$Root, [int]$HubPid, [int]$SupervisorPid, [string]$Supervisor, [string]$Instance)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Ejecutar el decisor de producto, sin cargar candidate, registro, red ni Apply.
$source = Join-Path $PSScriptRoot '../../..' 'packaging/beta.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw $errors[0] }
$function = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Run-BetaHub'
}, $true)
if ($null -eq $function) { throw 'Falta Run-BetaHub de producto' }
. ([scriptblock]::Create($function.Extent.Text))
function Open-NativeRoot([string]$Directory) { $Directory }
function Apply-BetaUpdate { [IO.File]::AppendAllText((Join-Path $Root 'beta-actions'), "apply`n") }
function Stage-BetaUpdate { [IO.File]::AppendAllText((Join-Path $Root 'beta-actions'), "stage`n") }
function Set-BetaStatus { throw 'Error inesperado en Run-BetaHub de producto' }
function Confirm-BetaBoot { $true }
function Start-BetaHub {
    [IO.File]::AppendAllText((Join-Path $Root 'beta-actions'), "hub`n")
    [Diagnostics.Process]::GetProcessById($HubPid)
}
function Stop-BetaRuntime {
    [IO.File]::AppendAllText((Join-Path $Root 'beta-actions'), "stop`n")
    $owned = [Diagnostics.Process]::GetProcessById($SupervisorPid)
    try {
        $command = [Diagnostics.ProcessStartInfo]::new($Supervisor)
        $command.UseShellExecute = $false
        $command.CreateNoWindow = $true
        foreach ($arg in @('--parar', '--instancia', $Instance)) { $command.ArgumentList.Add($arg) }
        $stop = [Diagnostics.Process]::Start($command)
        try { $stop.WaitForExit(); if ($stop.ExitCode) { throw 'Stop falló' } }
        finally { $stop.Dispose() }
        if (-not $owned.WaitForExit(15000)) { throw 'Supervisor no terminó' }
    } finally { $owned.Dispose() }
}
Run-BetaHub $Root
