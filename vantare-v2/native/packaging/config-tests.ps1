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
    foreach ($invalid in @('UNKNOWN=value', "VANTARE_POSTHOG_KEY=a`nVANTARE_POSTHOG_KEY=b", 'VANTARE_POSTHOG_KEY=', 'VANTARE_SUPABASE_ANON_KEY=sb_secret_fixture', 'VANTARE_SUPABASE_ANON_KEY=invalid.jwt.fixture', 'CLERK_SECRET_KEY=private-fixture', 'VANTARE_CLERK_ACCOUNT_PORTAL_URL=', "VANTARE_CLERK_ACCOUNT_PORTAL_URL=a`nVANTARE_CLERK_ACCOUNT_PORTAL_URL=b")) {
        [IO.File]::WriteAllText($file, $invalid)
        $rejected = $false
        try { $null = Import-NativeBuildConfig $file } catch { $rejected = $true }
        if (-not $rejected) { throw 'La configuración inválida fue aceptada.' }
        if ([Environment]::GetEnvironmentVariable('VANTARE_POSTHOG_KEY', 'Process') -cne $expected) { throw 'Un rechazo alteró el entorno.' }
        $passed++
    }
    # La identidad pública del producto también se carga y se restaura.
    $versionBefore = [Environment]::GetEnvironmentVariable('VANTARE_VERSION', 'Process')
    $channelBefore = [Environment]::GetEnvironmentVariable('VANTARE_BUILD_CHANNEL', 'Process')
    [IO.File]::WriteAllText($file, "VANTARE_VERSION=0.0.0-test`nVANTARE_BUILD_CHANNEL=test`n")
    $previous = Import-NativeBuildConfig $file
    try {
        if ($env:VANTARE_VERSION -cne '0.0.0-test' -or $env:VANTARE_BUILD_CHANNEL -cne 'test') { throw 'No se cargó la identidad pública de build.' }
        $passed++
    } finally { Restore-NativeBuildConfig $previous }
    if ([Environment]::GetEnvironmentVariable('VANTARE_VERSION', 'Process') -cne $versionBefore -or
        [Environment]::GetEnvironmentVariable('VANTARE_BUILD_CHANNEL', 'Process') -cne $channelBefore) { throw 'No se restauró la identidad pública anterior.' }
    $passed++
    # Una variable ausente debe volver a estar ausente (no presente con valor vacío).
    Remove-Item Env:VANTARE_POSTHOG_KEY -ErrorAction SilentlyContinue
    [IO.File]::WriteAllText($file, 'VANTARE_POSTHOG_KEY=public-fixture')
    $previous = Import-NativeBuildConfig $file
    Restore-NativeBuildConfig $previous
    if ($null -ne [Environment]::GetEnvironmentVariable('VANTARE_POSTHOG_KEY', 'Process')) { throw 'No se restauró la ausencia de configuración.' }
    $passed++
    # Instancia productiva: las cuatro variables públicas llegan juntas al build.
    $names = @('VANTARE_CLERK_ISSUER', 'VANTARE_CLERK_CLIENT_ID', 'VANTARE_CLERK_REDIRECT', 'VANTARE_CLERK_ACCOUNT_PORTAL_URL')
    $before = @{}
    foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    $fixture = @('https://clerk.example.invalid', 'public-native-fixture', 'http://127.0.0.1:47813/callback', 'https://accounts.example.invalid')
    $lines = for ($i = 0; $i -lt $names.Count; $i++) { $names[$i] + '=' + $fixture[$i] }
    [IO.File]::WriteAllLines($file, $lines)
    $previous = Import-NativeBuildConfig $file
    try {
        for ($i = 0; $i -lt $names.Count; $i++) {
            if ([Environment]::GetEnvironmentVariable($names[$i], 'Process') -cne $fixture[$i]) { throw 'No se cargó Clerk productivo.' }
            $passed++
        }
    } finally { Restore-NativeBuildConfig $previous }
    foreach ($name in $names) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $before[$name]) { throw 'No se restauró Clerk anterior.' }
        $passed++
    }
    Write-Output "$passed comprobaciones de configuración PASS."
} finally {
    if ($null -eq $original) { Remove-Item Env:VANTARE_POSTHOG_KEY -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('VANTARE_POSTHOG_KEY', $original, 'Process') }
}
