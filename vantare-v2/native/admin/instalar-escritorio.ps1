# Instalación privada por usuario; conserva la sesión al reinstalar.
[CmdletBinding()]
param(
    [string]$Executable = (Join-Path $PSScriptRoot '../target/gates/prueba/vantare-admin.exe')
)
$ErrorActionPreference = 'Stop'
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$destination = Join-Path $env:LOCALAPPDATA 'Vantare Admin'
$installed = Join-Path $destination 'vantare-admin.exe'
foreach ($process in @(Get-Process vantare-admin -ErrorAction SilentlyContinue)) {
    if ($process.Path -eq $installed) { throw 'Cierra Vantare Admin antes de actualizarla.' }
}
New-Item -ItemType Directory -Force $destination | Out-Null
Copy-Item -LiteralPath $Executable -Destination $installed -Force
foreach ($dll in @(Get-ChildItem -LiteralPath (Split-Path $Executable) -Filter '*.dll' -File)) {
    Copy-Item -LiteralPath $dll.FullName -Destination $destination -Force
}
$icon = Join-Path $destination 'vantare.ico'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../assets/icon.ico') -Destination $icon -Force
$launcher = Join-Path $destination 'abrir.ps1'
# CREATE_NO_WINDOW oculta solo la consola del binario; la ventana GPUI sigue visible.
@'
$ErrorActionPreference = 'Stop'
$env:VANTARE_NATIVE_DATA_ROOT = Join-Path $PSScriptRoot 'data'
$env:RUST_LOG = 'vantare_admin=info'
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = Join-Path $PSScriptRoot 'vantare-admin.exe'
$start.WorkingDirectory = $PSScriptRoot
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
[void][Diagnostics.Process]::Start($start)
'@ | Set-Content -LiteralPath $launcher -Encoding UTF8
$shell = New-Object -ComObject WScript.Shell
$powershell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder 'Vantare Admin.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = "$icon,0"
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Administración privada Vantare · solo owner · sesión aislada'
    $shortcut.Save()
}
Write-Output "Vantare Admin instalada en $destination; accesos en Escritorio y menú Inicio."
