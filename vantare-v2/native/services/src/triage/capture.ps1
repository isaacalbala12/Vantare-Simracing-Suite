$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if ($env:VANTARE_TRIAGE_SYSTEM -eq '1') {
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object -First 8 | ForEach-Object {
    @{model=[string]$_.Name; driver_version=[string]$_.DriverVersion}
})
$system = @{os=@{name=[string]$os.Caption;version=[string]$os.Version;build=[string]$os.BuildNumber};
    cpu=@{model=[string]$cpu.Name;cores=[int]$cpu.NumberOfCores};gpu=$gpus;
    ram_gb=[math]::Round([double]$os.TotalVisibleMemorySize / 1MB,2);
    displays=@();overlays_active=@();obs_active=$false}
} else { $system = @{} }
$active = @()
foreach ($entry in @(@('obs64','OBS'),@('Streamlabs OBS','Streamlabs'),@('SimHub','SimHub'),@('CrewChiefV4','CrewChief'),@('vantare-overlays','Vantare'))) {
    if (Get-Process -Name $entry[0] -ErrorAction SilentlyContinue) { $active += $entry[1] }
}
$game = 'none'; $gameVersion = $null
foreach ($entry in @(@('LeMansUltimate','lmu'),@('AC2-Win64-Shipping','acc'))) {
    $running = Get-Process -Name $entry[0] -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($running) {
        $game = $entry[1]
        try { $gameVersion = [string]$running.MainModule.FileVersionInfo.ProductVersion } catch { $gameVersion = $null }
        if ([string]::IsNullOrWhiteSpace($gameVersion)) { $gameVersion = $null }
        break
    }
}
if ($env:VANTARE_TRIAGE_SYSTEM -eq '1') { $system.overlays_active = $active; $system.obs_active = ($active -contains 'OBS') }
@{system=$system;
    game=$game;game_version=$gameVersion} | ConvertTo-Json -Depth 6 -Compress
