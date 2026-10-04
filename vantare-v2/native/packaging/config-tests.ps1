param([Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-config.ps1')
[IO.Directory]::CreateDirectory($EvidenceDirectory) | Out-Null
$file = Join-Path $EvidenceDirectory ('config-' + [guid]::NewGuid().ToString('N') + '.cfg')
$original = [Environment]::GetEnvironmentVariable('VANTARE_POSTHOG_KEY', 'Process')
$expected = 'public-fixture-before'
$passed = 0
try {
    [Environment]::SetEnvironmentVariable('VANTARE_POSTHOG_KEY', $expected, 'Process')
    # La expansión de PowerShell debe seguir siendo texto literal.
    $literal = '$(throw "evaluación prohibida")'
    [IO.File]::WriteAllText($file, "# fixture pública`nVANTARE_POSTHOG_KEY='$literal'`n")
    $previous = Import-NativeBuildConfig $file
    try {
        if ($env:VANTARE_POSTHOG_KEY -cne $literal) { throw 'La configuración dejó de ser literal.' }
        $passed++
    } finally { Restore-NativeBuildConfig $previous }
    if ([Environment]::GetEnvironmentVariable('VANTARE_POSTHOG_KEY', 'Process') -cne $expected) { throw 'No se restauró el valor público previo.' }
    $passed++
    foreach ($invalid in @('UNKNOWN=value', "VANTARE_POSTHOG_KEY=a`nVANTARE_POSTHOG_KEY=b", 'VANTARE_POSTHOG_KEY=', 'VANTARE_SUPABASE_ANON_KEY=sb_secret_fixture', 'VANTARE_SUPABASE_ANON_KEY=invalid.jwt.fixture')) {
        [IO.File]::WriteAllText($file, $invalid)
        $rejected = $false
        try { $null = Import-NativeBuildConfig $file } catch { $rejected = $true }
        if (-not $rejected) { throw 'La configuración inválida fue aceptada.' }
        if ([Environment]::GetEnvironmentVariable('VANTARE_POSTHOG_KEY', 'Process') -cne $expected) { throw 'Un rechazo alteró el entorno.' }
        $passed++
    }
    # .NET Framework trata vacío y ausente como la misma configuración desactivada.
    [Environment]::SetEnvironmentVariable('VANTARE_POSTHOG_KEY', $null, 'Process')
    [IO.File]::WriteAllText($file, 'VANTARE_POSTHOG_KEY=public-fixture')
    $previous = Import-NativeBuildConfig $file
    Restore-NativeBuildConfig $previous
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('VANTARE_POSTHOG_KEY', 'Process'))) { throw 'No se restauró la configuración desactivada.' }
    $passed++
    Write-Output "$passed comprobaciones de configuración PASS."
} finally { [Environment]::SetEnvironmentVariable('VANTARE_POSTHOG_KEY', $original, 'Process') }
