# Fixtures del proceso REAL de overlays. Invocar dentro de compilar.ps1.
param([Parameter(Mandatory)][string]$TargetDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$nativeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$target = if ([IO.Path]::IsPathRooted($TargetDirectory)) {
    [IO.Path]::GetFullPath($TargetDirectory)
} else { [IO.Path]::GetFullPath((Join-Path $nativeRoot $TargetDirectory)) }
$jobs = if ($env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS } else { '2' }
$artifacts = @()
Push-Location $nativeRoot
try {
    foreach ($variant in @('normal', 'qa')) {
        if ($target.StartsWith('D:', [StringComparison]::OrdinalIgnoreCase) -and
            (Get-PSDrive D).Free -lt 15GB) { throw 'D: menos de 15 GB libres; no se borra nada.' }
        $build = @('build', '-p', 'vantare-ui', '--bin', 'vantare-overlays',
            '--target-dir', $target, '--locked', '--offline', '-j', $jobs)
        if ($variant -ceq 'qa') { $build += @('--features', 'parity-capture') }
        & cargo @build
        if ($LASTEXITCODE) { throw "No se pudo compilar overlays $variant." }
        $directory = Join-Path $target "debug/lifecycle/$variant"
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $image = Join-Path $directory 'vantare-overlays.exe'
        Copy-Item -LiteralPath (Join-Path $target 'debug/vantare-overlays.exe') -Destination $image -Force
        $artifacts += [ordered]@{variant=$variant; image=$image; sha256=(Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash}
    }
    $artifacts | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'debug/lifecycle/artifacts.json') -Encoding utf8
} finally { Pop-Location }
