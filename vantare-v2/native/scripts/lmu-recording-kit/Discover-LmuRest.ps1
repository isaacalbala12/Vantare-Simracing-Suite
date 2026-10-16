param([Parameter(Mandatory=$true)][string]$UiZip, [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($UiZip)
$routes = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$unresolved = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$excluded = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
# Dos endpoints productivos que la UI actual recibe también por websocket.
[void]$routes.Add('/rest/watch/sessionInfo')
[void]$routes.Add('/rest/watch/standings')
foreach ($route in @('/rest/race/track','/rest/sessions/getAllAvailableVehicles','/rest/sessions/opponents/all','/rest/watch/getIncidentsList/1')) { [void]$routes.Add($route) }
try {
    foreach ($entry in $archive.Entries) {
        if (-not $entry.FullName.EndsWith('.js')) { continue }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $source = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $variables = @{ restServiceUrl='/rest/'; restUrl='/rest/watch/' }
        # Los prefijos REST son constantes, nunca se evalúa JavaScript del juego.
        for ($pass=0; $pass -lt 3; $pass++) {
            foreach ($match in [regex]::Matches($source, '(?:const|var|let)\s+(\w+)\s*=\s*["''`]([^"''`\r\n]+)["''`]\s*;')) {
                $value = $match.Groups[2].Value
                foreach ($key in @($variables.Keys)) { $value = $value.Replace('${'+$key+'}', $variables[$key]) }
                if ($value.StartsWith('/rest/') -or $value.StartsWith('/navigation/')) { $variables[$match.Groups[1].Value]=$value }
            }
        }
        # Solo llamadas GET que efectúa la UI. Nunca POST/PUT/DELETE ni ejecución JS.
        $pattern = '(?:\bgetJson|\bgetText|\$http\.get)\s*\(\s*(?:["''`]([^"''`]+)["''`]|(\w+)\s*\+\s*["'']([^"'']*)["'']|(\w+)\s*[,\)])'
        foreach ($match in [regex]::Matches($source, $pattern)) {
            $value=$match.Groups[1].Value
            if ($match.Groups[2].Success) { $value=$variables[$match.Groups[2].Value]+$match.Groups[3].Value }
            if ($match.Groups[4].Success) { $value=$variables[$match.Groups[4].Value] }
            if (-not $value) { continue }
            foreach ($key in @($variables.Keys)) { $value=$value.Replace('${'+$key+'}',$variables[$key]) }
            if (-not ($value.StartsWith('/rest/') -or $value.StartsWith('/navigation/'))) { continue }
            # Hay GET que actúan sobre el juego, y rutas de credenciales/perfil.
            if ($value -match '(?i)/(profile|multiplayer|chat|materialeditor|liveryeditor)/?|resetvr|/play/|commandline|/assign/|championshipAction') {
                [void]$excluded.Add($value); continue
            }
            if ($value -match '\$\{|[?#]') { [void]$unresolved.Add($value); continue }
            [void]$routes.Add($value)
        }
    }
} finally { $archive.Dispose() }
$hashStream=[IO.File]::OpenRead($UiZip)
$hasher=[Security.Cryptography.SHA256]::Create()
try { $hash=([BitConverter]::ToString($hasher.ComputeHash($hashStream))).Replace('-','').ToLowerInvariant() }
finally { $hashStream.Dispose(); $hasher.Dispose() }
$catalog = [ordered]@{
    schema='vantare.lmu-rest-catalog.v1'
    source='GET de todos los JS del UI.zip instalado + los dos endpoints productivos'
    ui_sha256=$hash
    capture=@($routes | Sort-Object)
    unresolved_templates=@($unresolved | Sort-Object)
    excluded_non_telemetry_or_mutating_get=@($excluded | Sort-Object)
    limitation='Catálogo de la UI, no una enumeración del servidor: no se conocen rutas no referenciadas por esta build. Se conservan 404/500/timeouts. No se capturan credenciales ni se invocan acciones.'
}
[IO.File]::WriteAllText($Output, ($catalog | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Host "Catálogo: $($routes.Count) rutas GET, $($unresolved.Count) plantillas pendientes, $($excluded.Count) exclusiones de credenciales/acciones."
