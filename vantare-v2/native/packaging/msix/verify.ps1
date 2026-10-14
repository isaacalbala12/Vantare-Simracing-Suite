#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ArtifactsDirectory,
    [string]$UpdateDirectory,
    [string]$Replay,
    [string]$Build = '1.3.0.0',
    [switch]$TrustTestCertificate,
    [switch]$Activate
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ArtifactsDirectory).Path
$evidence = Get-Content -LiteralPath (Join-Path $root 'build-evidence.json') -Raw | ConvertFrom-Json
if ($evidence.identity -ne 'Vantare.Native.LocalTest' -or $evidence.publisher -ne 'CN=Vantare Native Local Test' -or -not $evidence.test_certificate_thumbprint) { throw 'Solo paquetes locales de prueba.' }
$package = Join-Path $root "vantare-native-$($evidence.version)-x64.msix"
if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $evidence.package_sha256) { throw 'SHA del paquete no coincide.' }
if (Get-AppxPackage -Name $evidence.identity) { throw 'La identidad ya está instalada; no se reemplaza una prueba ajena.' }
if ($Activate -and (-not $Replay -or -not (Test-Path -LiteralPath $Replay))) { throw 'Activación necesita replay real explícito.' }
$results = [Collections.Generic.List[string]]::new()
$installed = $false
$trusted = $false
$runtimePid = 0
$hubPid = 0
$data = Join-Path $env:LOCALAPPDATA ('VantareMsixProbe-' + [Guid]::NewGuid().ToString('N'))
$probeId = [IO.Path]::GetFileName($data)
$pipeName = 'vantare-' + $probeId
$sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
function Assert-Probe([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "FAIL: $Name" }
    $results.Add("PASS: $Name")
}
function Assert-PackageIdentity([string]$Path, $Expected) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entry = $zip.GetEntry('AppxManifest.xml')
        if (-not $entry -or $entry.Length -gt 1MB) { throw 'Manifiesto ausente o demasiado grande.' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
        Assert-Probe ($manifest.Package.Identity.Name -ceq $Expected.identity -and $manifest.Package.Identity.Publisher -ceq $Expected.publisher -and $manifest.Package.Identity.Version -ceq $Expected.version) 'Identidad real del MSIX coincide antes de instalar'
    } finally { $zip.Dispose() }
}
function Get-ProbeProcesses($Package) {
    @(Get-CimInstance Win32_Process | Where-Object { $_.SessionId -eq $sessionId -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Package.InstallLocation + '\', [StringComparison]::OrdinalIgnoreCase) })
}
function Wait-Probe([scriptblock]$Predicate, [string]$Name) {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        if (& $Predicate) { $results.Add("PASS: $Name"); return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "FAIL (20 s): $Name"
}
try {
    Assert-PackageIdentity $package $evidence
    $certPath = Join-Path $root 'local-test.cer'
    $publicCert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certPath)
    Assert-Probe ($publicCert.Thumbprint -eq $evidence.test_certificate_thumbprint -and $publicCert.Subject -eq $evidence.publisher) 'Certificado público coincide'
    # Una firma autofirmada no es confiable hasta importar el CER expresamente.
    if ($TrustTestCertificate) {
        if (Test-Path "Cert:/LocalMachine/TrustedPeople/$($publicCert.Thumbprint)") { throw 'Confianza ya existente; no asumir propiedad.' }
        Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:/LocalMachine/TrustedPeople' | Out-Null
        $trusted = $true
    }
    & (Join-Path $evidence.sdk_directory 'signtool.exe') verify /pa $package
    Assert-Probe ($LASTEXITCODE -eq 0) 'Firma confiable SHA256'
    Add-AppxPackage -Path $package
    $installed = $true
    $app = Get-AppxPackage -Name $evidence.identity
    Assert-Probe ($null -ne $app -and $app.Version.ToString() -eq $evidence.version) 'Instalación y versión registrada'
    Assert-Probe (Test-Path (Join-Path $app.InstallLocation 'bin/vantare-engineer.exe')) 'Binarios en WindowsApps'
    if ($Activate) {
        # Activar AUMID demuestra ejecución empaquetada, no ejecutar la copia del build.
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MsixProbe {
    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivation {
        [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint pid);
        [PreserveSig] int ActivateForFile(IntPtr id, IntPtr items, IntPtr verb, out uint pid);
        [PreserveSig] int ActivateForProtocol(IntPtr id, IntPtr items, out uint pid);
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)] static extern int GetPackageFullName(IntPtr process, ref uint length, System.Text.StringBuilder name);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static uint Activate(string id, string args) {
        var manager = (IActivation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
        try { uint pid; Marshal.ThrowExceptionForHR(manager.ActivateApplication(id, args, 2, out pid)); return pid; }
        finally { Marshal.ReleaseComObject(manager); }
    }
    public static string Identity(uint pid) {
        IntPtr handle = OpenProcess(0x1000, false, pid);
        if (handle == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try {
            uint length = 0;
            int result = GetPackageFullName(handle, ref length, null);
            if (result != 122) throw new System.ComponentModel.Win32Exception(result);
            var name = new System.Text.StringBuilder((int)length);
            result = GetPackageFullName(handle, ref length, name);
            if (result != 0) throw new System.ComponentModel.Win32Exception(result);
            return name.ToString();
        } finally { CloseHandle(handle); }
    }
}
'@
        $hubArguments = '--data-dir "' + $data + '/hub" --layout "' + $data + '/layout.json" --engineer-settings "' + $data + '/engineer.json" --launcher-file "' + $data + '/launcher.json" --pipe ' + $pipeName
        $hubPid = [MsixProbe]::Activate(($app.PackageFamilyName + '!Hub'), $hubArguments)
        Wait-Probe { $p = Get-Process -Id $hubPid -ErrorAction SilentlyContinue; $p -and $p.MainWindowHandle -ne 0 } 'Hub con ventana'
        Assert-Probe ([MsixProbe]::Identity($hubPid) -eq $app.PackageFullName) 'Hub con identidad MSIX'
        $hub = Get-Process -Id $hubPid
        Assert-Probe ($hub.CloseMainWindow()) 'Cierre Hub solicitado'
        Assert-Probe ($hub.WaitForExit(10000)) 'Hub termina'
        # checkpoint::save_cursor no crea el directorio padre. Crear solo datos nuevos de prueba.
        [IO.Directory]::CreateDirectory($data) | Out-Null
        $arguments = '--instancia ' + $probeId + ' --engineer "' + $data + '/cursor.json" -- --replay "' + (Resolve-Path -LiteralPath $Replay).Path + '" --build ' + $Build + ' --pipe ' + $pipeName + ' -- 4 --fuente pipe:' + $pipeName
        $runtimePid = [MsixProbe]::Activate(($app.PackageFamilyName + '!Runtime'), $arguments)
        Wait-Probe { @(Get-ProbeProcesses $app | Where-Object { $_.Name -in @('vantare.exe', 'vantare-core.exe', 'vantare-overlays.exe', 'vantare-engineer.exe') }).Count -eq 4 } 'Supervisor, core, overlays y Engineer vivos'
        foreach ($process in Get-ProbeProcesses $app) {
            Assert-Probe ([MsixProbe]::Identity($process.ProcessId) -eq $app.PackageFullName) ("Identidad empaquetada: " + $process.Name)
        }
        Wait-Probe { @(Get-ProbeProcesses $app | Where-Object { $_.Name -eq 'vantare-overlays.exe' } | ForEach-Object { (Get-Process -Id $_.ProcessId).MainWindowHandle } | Where-Object { $_ -ne 0 }).Count -gt 0 } 'Overlays con ventana'
        # El checkpoint SOLO aparece tras negociación/event frame y ACK. No fake IPC.
        $virtualData = Join-Path $env:LOCALAPPDATA ("Packages/$($app.PackageFamilyName)/LocalCache/Local/" + [IO.Path]::GetFileName($data))
        Wait-Probe { (Test-Path (Join-Path $virtualData 'cursor.json')) -or (Test-Path (Join-Path $data 'cursor.json')) } 'Engineer consume journal real y persiste cursor'
        $cursor = if (Test-Path (Join-Path $virtualData 'cursor.json')) { Join-Path $virtualData 'cursor.json' } else { Join-Path $data 'cursor.json' }
        $results.Add("INFO: cursor físico=$cursor; contenido=" + [IO.File]::ReadAllText($cursor))
        $stop = Start-Process -FilePath (Join-Path $app.InstallLocation 'bin/vantare.exe') -ArgumentList ('--instancia ' + $probeId + ' --parar') -WindowStyle Hidden -PassThru
        Assert-Probe ($stop.WaitForExit(10000) -and $stop.ExitCode -eq 0) 'Petición de cierre nativa'
        Wait-Probe { @(Get-ProbeProcesses $app).Count -eq 0 } 'Cierre ordenado, sin procesos del paquete'
    }
    if ($UpdateDirectory) {
        $update = Get-Content -LiteralPath (Join-Path $UpdateDirectory 'build-evidence.json') -Raw | ConvertFrom-Json
        Assert-Probe ($update.identity -eq $evidence.identity -and $update.publisher -eq $evidence.publisher -and $update.test_certificate_thumbprint -eq $evidence.test_certificate_thumbprint -and [version]$update.version -gt [version]$evidence.version) 'Update misma identidad, firma y versión creciente'
        $next = Join-Path $UpdateDirectory "vantare-native-$($update.version)-x64.msix"
        Assert-Probe ((Get-FileHash -LiteralPath $next -Algorithm SHA256).Hash.ToLowerInvariant() -eq $update.package_sha256) 'SHA update'
        Assert-PackageIdentity $next $update
        $state = Join-Path $env:LOCALAPPDATA "Packages/$($app.PackageFamilyName)/LocalState/msix-probe.txt"
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($state)) | Out-Null
        [IO.File]::WriteAllText($state, 'estado de prueba ISA-1432')
        Add-AppxPackage -Path $next
        $app = Get-AppxPackage -Name $evidence.identity
        Assert-Probe ($app.Version.ToString() -eq $update.version) 'Actualización registrada'
        Assert-Probe ([IO.File]::ReadAllText($state) -eq 'estado de prueba ISA-1432') 'Update conserva LocalState'
        if ($Activate) {
            $hubPid = [MsixProbe]::Activate(($app.PackageFamilyName + '!Hub'), $hubArguments)
            Wait-Probe { $p = Get-Process -Id $hubPid -ErrorAction SilentlyContinue; $p -and $p.MainWindowHandle -ne 0 } 'Hub abre tras update'
            Assert-Probe ([MsixProbe]::Identity($hubPid) -eq $app.PackageFullName) 'Hub usa identidad de versión nueva'
            $hub = Get-Process -Id $hubPid
            Assert-Probe ($hub.CloseMainWindow() -and $hub.WaitForExit(10000)) 'Hub nuevo termina'
        }
    }
} catch {
    $results.Add('BLOCKED/FAIL: ' + $_.Exception.Message)
    throw
} finally {
    try {
        if ($installed) {
            $app = Get-AppxPackage -Name $evidence.identity
            if ($app) {
                foreach ($process in Get-ProbeProcesses $app) { Stop-Process -Id $process.ProcessId -ErrorAction Continue }
                Remove-AppxPackage -Package $app.PackageFullName
                Assert-Probe (-not (Get-AppxPackage -Name $evidence.identity)) 'Desinstalación sin registro del paquete'
                Assert-Probe (@(Get-ProbeProcesses $app).Count -eq 0) 'Desinstalación sin procesos'
                Wait-Probe { -not (Test-Path -LiteralPath $app.InstallLocation) } 'Payload WindowsApps retirado'
                $packageData = Join-Path $env:LOCALAPPDATA "Packages/$($app.PackageFamilyName)"
                $results.Add("INFO: datos de paquete restantes=" + (Test-Path $packageData))
            }
        }
    } catch {
        $results.Add('FAIL limpieza: ' + $_.Exception.Message)
        throw
    } finally {
        try {
            if ($trusted) { Remove-Item -LiteralPath "Cert:/LocalMachine/TrustedPeople/$($publicCert.Thumbprint)" }
        } finally {
            # My permanece para generar update; retirada exacta en MSIX.md.
            $results | Set-Content -LiteralPath (Join-Path $root 'verification.log') -Encoding UTF8
            $results
        }
    }
}
