#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$VersionADirectory,
    [Parameter(Mandatory)][string]$VersionBDirectory,
    [Parameter(Mandatory)][string]$ReferenceDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [switch]$ResumeUninstall
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$prefix=[IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/')
foreach($path in @($VersionADirectory,$VersionBDirectory,$ReferenceDirectory,$EvidenceDirectory)){
    if(-not (Assert-NativePath $path).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Interacción fuera de QA.'}
}
$evidence=Assert-NativePath $EvidenceDirectory
if((Test-Path -LiteralPath $evidence) -and -not $ResumeUninstall){throw 'Conservar evidencia previa.'}
$root=Join-Path ([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa')) ([IO.Path]::GetFileName($evidence))
if((Test-Path -LiteralPath $root) -and -not $ResumeUninstall){throw 'Conservar raíz UI previa.'}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
if($ResumeUninstall){
    $metadata=[IO.File]::ReadAllText((Join-Path $evidence 'capture-metadata.json'))|ConvertFrom-Json
    $registration=Get-ItemProperty -LiteralPath $key
    if($metadata.root -cne $root -or $metadata.kind -cne 'real QA interactions, no live Hub' -or $registration.InstallLocation -cne $root){throw 'No reanudar otra instalación.'}
}else{
    foreach($path in @($key,(Join-Path ([Environment]::GetFolderPath('Programs')) 'Vantare QA1492'),(Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Vantare QA1492.lnk'),(Join-Path ([Environment]::GetFolderPath('Startup')) 'Vantare QA1492.lnk'))){if(Test-Path -LiteralPath $path){throw 'QA1492 ajena existente; conservar.'}}
}
function Free-Screen {if(Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada'){throw 'Pantalla ocupada; conservar la operación existente.'}}
Free-Screen
[IO.Directory]::CreateDirectory($evidence)|Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public static class InstallerInteraction1591 {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd,ref POINT point);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint message,IntPtr wp,IntPtr lp);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int mode);
 public static double HeadingDifference(Bitmap a,Bitmap b) {
  long total=0;int count=0;
  for(int y=96;y<132;y+=2)for(int x=280;x<678;x+=2){var p=a.GetPixel(x,y);var q=b.GetPixel(x,y);total+=Math.Abs(p.R-q.R)+Math.Abs(p.G-q.G)+Math.Abs(p.B-q.B);count+=3;}
  return (double)total/count/255;
 }
}
'@
$script:Process=$null;$script:Window=[IntPtr]::Zero;$script:Passed=0
function Assert-UI([bool]$Value,[string]$Message){if(-not $Value){throw "ASSERT: $Message"};$script:Passed++;Write-Output "PASS $Message"}
function Frame {
    Free-Screen
    if($script:Process.HasExited){throw 'La ventana QA terminó antes del resultado.'}
    if([InstallerInteraction1591]::GetForegroundWindow() -ne $script:Window){throw 'Otro usuario/ventana tomó el foco; no capturar ni enviar entrada.'}
    $rect=[InstallerInteraction1591+RECT]::new();$point=[InstallerInteraction1591+POINT]::new()
    $null=[InstallerInteraction1591]::GetClientRect($script:Window,[ref]$rect)
    $null=[InstallerInteraction1591]::ClientToScreen($script:Window,[ref]$point)
    if(($rect.Right-$rect.Left) -ne 720 -or ($rect.Bottom-$rect.Top) -ne 460 -or [InstallerInteraction1591]::GetDpiForWindow($script:Window) -ne 96){throw 'Interacción exige 720x460 DPI96; no cambia DPI global.'}
    $bitmap=[Drawing.Bitmap]::new(720,460);$graphics=[Drawing.Graphics]::FromImage($bitmap)
    try{$graphics.CopyFromScreen($point.X,$point.Y,0,0,$bitmap.Size)}finally{$graphics.Dispose()}
    $bitmap
}
function Wait-Screen([string]$Name,[string]$Save,[int]$Timeout=180){
    $reference=[Drawing.Bitmap]::new((Join-Path $ReferenceDirectory ($Name+'.png')))
    $timer=[Diagnostics.Stopwatch]::StartNew()
    try{
        while($timer.Elapsed.TotalSeconds -lt $Timeout){
            $bitmap=Frame
            try{
                $difference=[InstallerInteraction1591]::HeadingDifference($bitmap,$reference)
                if($difference -lt 0.008){
                    if($Save){$bitmap.Save((Join-Path $evidence ($Save+'.png')),[Drawing.Imaging.ImageFormat]::Png)}
                    Assert-UI $true ("pantalla $Name renderizada por operación real")
                    return
                }
                if($timer.Elapsed.TotalSeconds -gt $Timeout-1){$bitmap.Save((Join-Path $evidence 'unexpected.png'),[Drawing.Imaging.ImageFormat]::Png)}
            }finally{$bitmap.Dispose()}
            Start-Sleep -Milliseconds 50
        }
        throw "No llegó la pantalla $Name; conservar ventana/instalación QA."
    }finally{$reference.Dispose()}
}
function Save-Frame([string]$Name){$bitmap=Frame;try{$bitmap.Save((Join-Path $evidence ($Name+'.png')),[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}}
function Click([int]$X,[int]$Y){
    Free-Screen
    if($script:Process.HasExited -or [InstallerInteraction1591]::GetForegroundWindow() -ne $script:Window){throw 'No enviar entrada fuera de la ventana QA propia.'}
    $lp=[IntPtr](($Y -shl 16) -bor $X)
    $null=[InstallerInteraction1591]::PostMessage($script:Window,0x200,[IntPtr]::Zero,$lp)
    $null=[InstallerInteraction1591]::PostMessage($script:Window,0x201,[IntPtr]1,$lp)
    $null=[InstallerInteraction1591]::PostMessage($script:Window,0x202,[IntPtr]::Zero,$lp)
}
function Start-UI([string]$Executable,[string]$Arguments){
    Free-Screen
    # La ventana es el objeto interactivo de QA solicitado; no es un helper.
    $parameters=@{FilePath=$Executable;PassThru=$true}
    if($Arguments){$parameters.ArgumentList=$Arguments}
    $script:Process=Start-Process @parameters
    $timer=[Diagnostics.Stopwatch]::StartNew()
    do{
        $script:Process.Refresh();$script:Window=$script:Process.MainWindowHandle
        if($script:Process.HasExited){throw 'Setup no abrió UI; revisar su código.'}
        if($timer.Elapsed.TotalSeconds -gt 45){throw 'Setup no abrió ventana; conservar proceso.'}
        if($script:Window -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 50}
    }while($script:Window -eq [IntPtr]::Zero)
    $null=[InstallerInteraction1591]::SetForegroundWindow($script:Window)
}
function Close-UI([int]$Expected){
    Free-Screen
    $script:Process.CloseMainWindow()|Out-Null
    if(-not $script:Process.WaitForExit(45000)){throw 'La UI no cerró; no matar la transacción.'}
    Assert-UI ($script:Process.ExitCode -eq $Expected) ("UI código $Expected")
    $script:Process.Dispose();$script:Process=$null
}
$mutex=[Threading.Mutex]::new($false,'Global\VantareParityCapture');$held=$false
try{
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held){throw 'Otra captura posee el mutex.'}
    Free-Screen
    if(-not $ResumeUninstall){
    Start-UI (Join-Path $VersionADirectory 'VantareSetup.exe') ('"/D='+$root+'"')
    Wait-Screen 'welcome' 'welcome'
    Click 320 425
    # Esperar el cambio real del panel: borde inferior de Opciones a y=332.
    $timer=[Diagnostics.Stopwatch]::StartNew()
    do{$bitmap=Frame;try{$ready=$bitmap.GetPixel(635,265).R -gt 100}finally{$bitmap.Dispose()};if(-not $ready){Start-Sleep -Milliseconds 50}}while(-not $ready -and $timer.Elapsed.TotalSeconds -lt 10)
    Assert-UI $ready 'Opciones abre escritorio ON'
    Save-Frame 'options'
    $null=[InstallerInteraction1591]::PostMessage($script:Window,0x100,[IntPtr]9,[IntPtr]::Zero)
    $null=[InstallerInteraction1591]::PostMessage($script:Window,0x101,[IntPtr]9,[IntPtr]::Zero)
    Click 653 18
    $timer.Restart();while(-not [InstallerInteraction1591]::IsIconic($script:Window) -and $timer.Elapsed.TotalSeconds -lt 10){Start-Sleep -Milliseconds 50}
    Assert-UI ([InstallerInteraction1591]::IsIconic($script:Window)) 'botón propio minimiza'
    $null=[InstallerInteraction1591]::ShowWindow($script:Window,9);$null=[InstallerInteraction1591]::SetForegroundWindow($script:Window)
    Click 620 425
    Wait-Screen 'installing' 'installing'
    Wait-Screen 'done' 'done'
    $ui=Read-NativeInstallerUi $root
    Assert-UI ($ui.desktop -and -not $ui.autostart) 'interactivo persiste escritorio ON/autostart OFF'
    Assert-UI (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Vantare QA1492.lnk')) 'instalación interactiva crea escritorio QA propio'
    Close-UI 0
    $state=Read-NativeState $root;$first=$state.active.generation
    $data=Join-Path $root "generations/$first/data"
    [IO.File]::WriteAllText((Join-Path $data 'ui-fixture.json'),'{"TEST":"interactivo conserva"}')
    $index=Get-NativeDataIndex $data
    Start-UI (Join-Path $VersionBDirectory 'VantareSetup.exe') ('"/D='+$root+'"')
    Wait-Screen 'installed' 'installed'
    $session=[IO.File]::Open((Join-Path $root 'beta-session.lock'),'Open','ReadWrite','None')
    try{Click 620 425;Wait-Screen 'error' 'error';Close-UI 2}finally{$session.Dispose()}
    Start-UI (Join-Path $VersionBDirectory 'VantareSetup.exe') ('"/D='+$root+'"')
    Wait-Screen 'installed' ''
    Click 620 425
    # Actualizar usa otro título de terminado; esperar el registro y el botón activo.
    $timer.Restart()
    do{
        $registration=Get-ItemProperty -LiteralPath $key
        $ready=$registration.DisplayVersion -ceq ([Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $VersionBDirectory 'VantareSetup.exe'))).ProductVersion
        if(-not $ready){Start-Sleep -Milliseconds 50}
    }while(-not $ready -and $timer.Elapsed.TotalSeconds -lt 180)
    Assert-UI $ready 'actualización interactiva registra B'
    $timer.Restart()
    do{$bitmap=Frame;try{$ready=$bitmap.GetPixel(45,196).G -gt $bitmap.GetPixel(45,196).R}finally{$bitmap.Dispose()};if(-not $ready){Start-Sleep -Milliseconds 50}}while(-not $ready -and $timer.Elapsed.TotalSeconds -lt 30)
    Assert-UI $ready 'actualización alcanza terminado real'
    Close-UI 0
    $state=Read-NativeState $root;$data=Join-Path $root "generations/$($state.active.generation)/data"
    Assert-UI ((Get-NativeDataIndex $data) -ceq $index) 'actualizar por UI conserva datos exactos'
    Write-NativeJson (Join-Path $evidence 'capture-metadata.json') @{kind='real QA interactions, no live Hub';root=$root;data_path=$data;versionA=([Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $VersionADirectory 'VantareSetup.exe'))).ProductVersion;versionB=([Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $VersionBDirectory 'VantareSetup.exe'))).ProductVersion;sizeA=(Get-Item -LiteralPath (Join-Path $VersionADirectory 'vantare-native-amd64-package.zip')).Length;sizeB=(Get-Item -LiteralPath (Join-Path $VersionBDirectory 'vantare-native-amd64-package.zip')).Length;dpi=96}
    }
    $before=[ordered]@{};foreach($generation in @(Get-ChildItem -LiteralPath (Join-Path $root 'generations') -Directory)){$before[$generation.Name]=Get-NativeDataIndex (Join-Path $generation.FullName 'data')}
    Start-UI (Join-Path $root 'Uninstall.exe') ''
    Wait-Screen 'uninstall' 'uninstall'
    Click 620 425
    Wait-Screen 'uninstalled' 'uninstalled'
    Close-UI 0
    $timer=[Diagnostics.Stopwatch]::StartNew();while(Test-Path -LiteralPath (Join-Path $root 'Uninstall.exe')){if($timer.Elapsed.TotalSeconds -gt 45){throw 'Cleanup UI pendiente.'};Start-Sleep -Milliseconds 50}
    Assert-UI (-not (Test-Path -LiteralPath $key)) 'desinstalar por UI quita registro QA'
    foreach($generation in $before.Keys){Assert-UI ((Get-NativeDataIndex (Join-Path $root "generations/$generation/data")) -ceq $before[$generation]) 'desinstalar por UI conserva cada data'}
    Write-Output "$script:Passed interacciones/renderizados reales PASS a DPI96; arrastre y otros DPI siguen requieren sesión de QA."
}finally{
    if($held){$mutex.ReleaseMutex()};$mutex.Dispose()
    # Nunca matar ni borrar instalación como efecto de un fallo del harness.
}
