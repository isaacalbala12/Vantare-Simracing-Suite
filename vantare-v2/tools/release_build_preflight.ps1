[CmdletBinding()]
param()

$requiredVariables = @(
    "VANTARE_SUPABASE_URL",
    "VANTARE_SUPABASE_ANON_KEY"
)
$missingVariables = New-Object 'System.Collections.Generic.List[string]'

foreach ($name in $requiredVariables) {
    $value = [Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Output "$name=UNSET"
        $missingVariables.Add($name)
    } else {
        Write-Output "$name=SET"
    }
}

if ($missingVariables.Count -ne 0) {
    Write-Output "MISSING=$($missingVariables -join ',')"
    exit 1
}
