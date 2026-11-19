#requires -Version 7
function New-CitaTaskDefinition {
 [CmdletBinding()]
 param(
  [Parameter(Mandatory)]$Action,
  [Parameter(Mandatory)][datetime]$At,
  [Parameter(Mandatory)][string]$UserId,
  [switch]$SinRed
 )
 $type=if($SinRed){'S4U'}else{'Password'}
 $principal=New-ScheduledTaskPrincipal -UserId $UserId -LogonType $type -RunLevel Limited
 $trigger=New-ScheduledTaskTrigger -Once -At $At
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
 New-ScheduledTask -Action $Action -Principal $principal -Trigger $trigger -Settings $settings
}

function Assert-CitaRegisteredTask([string]$Name,$Action,[string]$UserId,[datetime]$At,[switch]$SinRed){
 [xml]$xml=Export-ScheduledTask -TaskName $Name -ErrorAction Stop
 $task=$xml.Task
 $principal=$task.Principals.Principal
 $settings=$task.Settings
 $registeredAction=$task.Actions.Exec
 $expectedLogon=if($SinRed){'S4U'}else{'Password'}
 $sid=[Security.Principal.NTAccount]::new($UserId).Translate([Security.Principal.SecurityIdentifier]).Value
 if(@($principal).Count -ne 1 -or $principal.UserId -notin @($sid,$UserId) -or
    $principal.LogonType -cne $expectedLogon -or ($principal.RunLevel -and $principal.RunLevel -cne 'LeastPrivilege') -or
    $settings.MultipleInstancesPolicy -cne 'IgnoreNew' -or ($settings.StartWhenAvailable -and $settings.StartWhenAvailable -ne 'false') -or
    $settings.RestartOnFailure -or $settings.ExecutionTimeLimit -cne 'PT2H' -or
    @($task.Triggers.ChildNodes).Count -ne 1 -or $task.Triggers.ChildNodes[0].LocalName -cne 'TimeTrigger' -or
    $task.Triggers.TimeTrigger.Repetition -or [math]::Abs(([datetimeoffset]::Parse($task.Triggers.TimeTrigger.StartBoundary)-[datetimeoffset]$At).TotalSeconds) -ge 1 -or
    @($task.Actions.ChildNodes).Count -ne 1 -or $registeredAction.Command -ine $Action.Execute -or
    $registeredAction.Arguments -cne $Action.Arguments -or
    (-not $SinRed -and $registeredAction.Arguments -cnotmatch ' -CitaSha256 [0-9a-fA-F]{64}$')){
  throw 'La tarea registrada no coincide con la política de cita'
 }
}
