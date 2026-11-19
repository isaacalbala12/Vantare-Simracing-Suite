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
