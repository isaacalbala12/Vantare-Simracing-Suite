# Configuración pública de compilación: datos literales, nunca código PowerShell.
function Import-NativeBuildConfig([string]$Path) {
    $allowed = @('VANTARE_SUPABASE_URL', 'VANTARE_SUPABASE_ANON_KEY', 'VANTARE_LICENSE_PUBLIC_KEYS',
        'VANTARE_CLERK_ISSUER', 'VANTARE_CLERK_CLIENT_ID', 'VANTARE_CLERK_REDIRECT',
        'VANTARE_ACCOUNT_BRIDGE_URL', 'VANTARE_POSTHOG_KEY', 'VANTARE_ADMIN_URL',
        'VANTARE_BUILD_CHANNEL', 'VANTARE_VERSION')
    if ((Get-Item -LiteralPath $Path).Length -gt 65536) { throw 'Configuración de build demasiado grande.' }
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $Path).Path)) {
        if (-not $line.Trim() -or $line.TrimStart().StartsWith('#')) { continue }
        if ($line -cnotmatch '^([A-Z][A-Z0-9_]*)=(.*)$') { throw 'Formato de configuración inválido; use NOMBRE=valor.' }
        $name = $Matches[1]; $value = $Matches[2].Trim()
        if ($name -cnotin $allowed -or $values.ContainsKey($name)) { throw "Variable desconocida o repetida: $name" }
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if (-not $value -or $value.Contains([char]0) -or $value -match 'service_role|sb_secret_|-----BEGIN .*PRIVATE KEY-----') { throw 'La configuración debe contener solo valores públicos.' }
        if ($name -ceq 'VANTARE_SUPABASE_ANON_KEY' -and $value.Contains('.')) {
            try {
                $parts = $value.Split('.')
                if ($parts.Count -ne 3) { throw 'JWT inválido' }
                $payload = $parts[1].Replace('-', '+').Replace('_', '/')
                $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
                $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
                if ($claims.role -cne 'anon') { throw 'La clave debe ser anon' }
            } catch { throw 'La clave Supabase debe ser pública (anon), nunca privilegiada.' }
        }
        $values[$name] = $value
    }
    $previous = @{}
    foreach ($name in $values.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    try {
        foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process') }
    } catch {
        Restore-NativeBuildConfig $previous
        throw 'No se pudo cargar la configuración pública de build.'
    }
    return $previous
}

function Restore-NativeBuildConfig($Previous) {
    foreach ($name in $Previous.Keys) {
        if ($null -eq $Previous[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $Previous[$name], 'Process') }
    }
}
