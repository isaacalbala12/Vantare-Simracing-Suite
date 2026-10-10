# Escenas de ajustes sobre el Overlay real; fondo negro, GDI y mutex compartido.
param([Parameter(Mandatory)][string]$Exe,
      [string]$Out=(Join-Path $env:TEMP 'vantare-variants'),
      [ValidateSet('standings','relative','multiclass_relative','head_to_head','broadcast_tower')]
      [string[]]$Folders=@('standings','relative','multiclass_relative','head_to_head','broadcast_tower'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SceneBackground {
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$Exe=(Resolve-Path -LiteralPath $Exe).Path
New-Item -ItemType Directory -Force $out | Out-Null
$mutex=[System.Threading.Mutex]::new($false,'Global\VantareParityCapture')
[void]$mutex.WaitOne()
$form=[System.Windows.Forms.Form]::new()
$form.FormBorderStyle='None';$form.Bounds=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$form.BackColor=[System.Drawing.Color]::Black;$form.TopMost=$true;$form.ShowInTaskbar=$false
try {
$form.Show();[System.Windows.Forms.Application]::DoEvents()
if([SceneBackground]::GetDpiForWindow($form.Handle) -ne 96){throw "la evidencia requiere DPI 96"}
foreach($folder in $Folders) {
$scenePath=Join-Path $repo "src/$folder/scenes.json"
$scenes=Get-Content -Raw -LiteralPath $scenePath | ConvertFrom-Json
foreach($scene in $scenes) {
$kind=$scene.layout.instances[0].settings.kind
$name="$kind-$($scene.name)"
[void][SceneBackground]::ShowWindow($form.Handle,5)
[void][SceneBackground]::SetWindowPos($form.Handle,[IntPtr](-1),0,0,0,0,67)
[System.Windows.Forms.Application]::DoEvents()
$layout=Join-Path $out "$name.layout.json"
$scene.layout | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $layout -Encoding utf8
$snapshot=(Resolve-Path -LiteralPath (Join-Path (Split-Path $scenePath) $scene.snapshot)).Path
$proc=Start-Process -FilePath $Exe -ArgumentList @(('"'+$layout+'"'),('"'+$snapshot+'"')) -WindowStyle Hidden -RedirectStandardError (Join-Path $out "$name.stderr.log") -RedirectStandardOutput (Join-Path $out "$name.stdout.log") -PassThru
try {
$deadline=[DateTime]::UtcNow.AddSeconds(2)
while([DateTime]::UtcNow -lt $deadline){[System.Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 40}
$settled=$false
$settleDeadline=[DateTime]::UtcNow.AddSeconds(10)
while([DateTime]::UtcNow -lt $settleDeadline -and -not $settled){
 [System.Windows.Forms.Application]::DoEvents()
 $proc.Refresh()
 $handle=$proc.MainWindowHandle
 if($handle -ne [IntPtr]::Zero){[void][SceneBackground]::ShowWindow($handle,5);[void][SceneBackground]::SetWindowPos($handle,[IntPtr](-1),0,0,0,0,67)}
 $probe=[System.Drawing.Bitmap]::new(1,1);$probeGraphics=[System.Drawing.Graphics]::FromImage($probe)
 try { $probeGraphics.CopyFromScreen(24,24,0,0,[System.Drawing.Size]::new(1,1));$pixel=$probe.GetPixel(0,0);$settled=($pixel.R+$pixel.G+$pixel.B)-gt 0 } finally {$probeGraphics.Dispose();$probe.Dispose()}
 if(-not $settled){Start-Sleep -Milliseconds 150}
}
if(-not $settled){throw "$name no pintó el panel"}
if($proc.HasExited){throw "$name terminó antes de capturar: $($proc.ExitCode)"}
$proc.Refresh()
if($proc.MainWindowHandle -ne [IntPtr]::Zero){[void][SceneBackground]::SetWindowPos($proc.MainWindowHandle,[IntPtr](-1),0,0,0,0,67)}
$bounds=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp=[System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
$graphics=[System.Drawing.Graphics]::FromImage($bmp)
try { $graphics.CopyFromScreen($bounds.X,$bounds.Y,0,0,$bounds.Size);$bmp.Save((Join-Path $out "$name.full.png"),[System.Drawing.Imaging.ImageFormat]::Png) } finally { $graphics.Dispose();$bmp.Dispose() }
Write-Output "capturado $name"
} finally { if(-not $proc.HasExited){Stop-Process -Id $proc.Id};$proc.Dispose() }
}
}
} finally {$form.Close();$form.Dispose();$mutex.ReleaseMutex();$mutex.Dispose()}
