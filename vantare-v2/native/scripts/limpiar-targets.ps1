# Retira targets de Cargo sin compilar desde hace más de -Dias días (#1465).
# Uso (simulación por defecto; -Aplicar borra de verdad):
#   pwsh -NoProfile -File native/scripts/limpiar-targets.ps1 -Raiz C:\VantareServer\targets,C:\VantareServer\wt -Dias 7
# Un target es un directorio con el CACHEDIR.TAG que crea Cargo. Se busca hasta
# -Profundidad niveles bajo cada raíz (worktree/vantare-v2/native/target = 4).
# Nunca borra un target con un build en marcha (su .cargo-lock está abierto),
# ni enlaces/junctions, ni nada fuera de las raíces indicadas. Todo lo borrado
# es regenerable compilando de nuevo.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string[]]$Raiz,
    [ValidateRange(1, 365)][int]$Dias = 7,
    [ValidateRange(1, 6)][int]$Profundidad = 4,
    [switch]$Aplicar
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$firma = 'Signature: 8a477f597d28d172789f06886806bc55'
$limite = (Get-Date).AddDays(-$Dias)

function Test-Enlace([IO.FileSystemInfo]$item) {
    [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Find-Target([IO.DirectoryInfo]$dir, [int]$nivel) {
    if (Test-Enlace $dir) { return }
    $tag = Join-Path $dir.FullName 'CACHEDIR.TAG'
    if ((Test-Path -LiteralPath $tag -PathType Leaf) -and
        (Get-Content -LiteralPath $tag -TotalCount 1) -ceq $firma) { return $dir }
    if ($nivel -ge $Profundidad) { return }
    foreach ($hijo in $dir.EnumerateDirectories()) { Find-Target $hijo ($nivel + 1) }
}

# Último build: fichero más reciente en cada perfil (<perfil>/ y <perfil>/deps),
# incluidos perfiles anidados como target/gates/debug. Cargo reescribe ahí cada unidad compilada.
function Get-UltimoUso([IO.DirectoryInfo]$target) {
    $fechas = [Collections.Generic.List[datetime]]::new()
    $fechas.Add($target.LastWriteTime)
    foreach ($fp in $target.EnumerateDirectories('.fingerprint', [IO.SearchOption]::AllDirectories)) {
        $perfil = $fp.Parent
        foreach ($d in @($perfil, [IO.DirectoryInfo]::new((Join-Path $perfil.FullName 'deps')))) {
            if (-not $d.Exists) { continue }
            $fechas.Add($d.LastWriteTime)
            foreach ($f in $d.EnumerateFiles()) { $fechas.Add($f.LastWriteTime) }
        }
    }
    ($fechas | Measure-Object -Maximum).Maximum
}

# Cargo mantiene abierto <perfil>/.cargo-lock durante el build.
function Test-EnUso([IO.DirectoryInfo]$target) {
    foreach ($lock in $target.EnumerateFiles('.cargo-lock', [IO.SearchOption]::AllDirectories)) {
        try { [IO.File]::Open($lock.FullName, 'Open', 'ReadWrite', 'None').Dispose() }
        catch [IO.IOException] { return $true }
    }
    $false
}

$liberado = 0L
foreach ($r in $Raiz) {
    $raizDir = [IO.DirectoryInfo]::new((Resolve-Path -LiteralPath $r).Path)
    foreach ($t in @(Find-Target $raizDir 0)) {
        if ($t.FullName -eq $raizDir.FullName) { Write-Warning "Se omite la raíz ${r}: es un target entero."; continue }
        $uso = Get-UltimoUso $t
        $gb = (Get-ChildItem -LiteralPath $t.FullName -Recurse -File -Force | Measure-Object Length -Sum).Sum / 1GB
        $resumen = '{0}  último build {1:yyyy-MM-dd HH:mm}  {2:N1} GB' -f $t.FullName, $uso, $gb
        if ($uso -ge $limite) { "conservar  $resumen"; continue }
        if (Test-EnUso $t) { "en uso     $resumen"; continue }
        if (-not $Aplicar) { "borraría   $resumen"; $liberado += $gb; continue }
        try {
            Remove-Item -LiteralPath $t.FullName -Recurse -Force
            "borrado    $resumen"
            $liberado += $gb
        } catch { Write-Warning "No se pudo borrar $($t.FullName): $_" }
    }
}
$verbo = if ($Aplicar) { 'Liberados' } else { 'Se liberarían' }
'{0} {1:N1} GB (targets sin build en {2} días).' -f $verbo, $liberado, $Dias
