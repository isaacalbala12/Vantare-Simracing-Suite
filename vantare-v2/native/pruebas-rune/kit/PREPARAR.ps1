# Solo lectura y validación; no inicia programas.
function Read-VantareKit {
    param([Parameter(Mandatory)][string]$Root)
    $rootPath=[IO.Path]::GetFullPath($Root)
    $manifest=Get-Content -LiteralPath (Join-Path $rootPath 'kit.json') -Raw | ConvertFrom-Json -AsHashtable
    if ($manifest.schema -ne 1) { throw 'Kit no reconocido.' }
    if (($manifest.ContainsKey('pending_binaries') -and $manifest.pending_binaries.Count) -or ($manifest.ContainsKey('ready') -and -not $manifest.ready)) {
        throw 'Kit pendiente de Inicio Rune. Esperar el ZIP completo; no iniciar mediciones.'
    }
    $paths=@{}
    foreach ($entry in $manifest.files) {
        $relative=[string]$entry.path
        if ($relative -match '[\\:]' -or $relative.StartsWith('/') -or $relative.Split('/') -contains '..') { throw 'Ruta no válida en el kit.' }
        $path=[IO.Path]::GetFullPath((Join-Path $rootPath $relative))
        if (-not $path.StartsWith($rootPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera del kit.' }
        $cursor=$path
        while ($cursor.Length -ge $rootPath.Length) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'El kit no admite enlaces.' }
            if ($cursor -eq $rootPath) { break }
            $cursor=[IO.Path]::GetDirectoryName($cursor)
        }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Archivo alterado: $relative" }
        if ($paths.ContainsKey($relative)) { throw 'Archivo duplicado.' }
        $paths[$relative]=$path
    }
    $binaries=@{}
    foreach ($role in $manifest.binaries.Keys) {
        $row=$manifest.binaries[$role]
        if (-not $paths.ContainsKey($row.path)) { throw 'Falta un programa declarado.' }
        $binaries[$role]=@{path=$paths[$row.path];sha256=($manifest.files | Where-Object path -eq $row.path).sha256}
    }
    [pscustomobject]@{Root=$rootPath;Manifest=$manifest;Binaries=$binaries;Paths=$paths
        ManifestSha256=(Get-FileHash -LiteralPath (Join-Path $rootPath 'kit.json') -Algorithm SHA256).Hash.ToLowerInvariant()}
}
