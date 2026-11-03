# Test-only filesystem and process helpers. No installed PowerShell engine is loaded.
#requires -Version 5.1
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-NativeHash([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Write-NativeJson([string]$Path, $Value) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)) | Out-Null
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
}
function New-NativeZip([string]$Directory, [string]$Destination) {
    $null=Assert-MatrixRoot $Directory
    $null=Assert-MatrixRoot $Destination
    $zip=[IO.Compression.ZipFile]::Open($Destination,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach($item in Get-ChildItem -LiteralPath $Directory -Recurse -Force) {
            $name=$item.FullName.Substring($Directory.Length+1).Replace('\','/')
            if(-not $item.PSIsContainer){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$item.FullName,$name)}
            elseif(-not @(Get-ChildItem -LiteralPath $item.FullName -Force).Count){$null=$zip.CreateEntry("$name/")}
        }
    }finally{$zip.Dispose()}
}
function Invoke-NativeProcess([string]$Executable,[string[]]$Arguments=@(),[AllowNull()][string]$InputText=$null,[int]$TimeoutMilliseconds=30000,[string]$LogPath='') {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$Executable
    $info.Arguments=(@($Arguments|ForEach-Object {'"'+[regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'}) -join ' ')
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $process=[Diagnostics.Process]::new();$process.StartInfo=$info
    try {
        if(-not $process.Start()){throw 'No se pudo iniciar el proceso QA'}
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        if($null -ne $InputText){$process.StandardInput.Write($InputText)}
        $process.StandardInput.Close()
        if(-not $process.WaitForExit($TimeoutMilliseconds)){$process.Kill();$process.WaitForExit();throw 'Proceso QA agotó el plazo'}
        $result=[pscustomobject]@{ExitCode=$process.ExitCode;Stdout=$stdout.GetAwaiter().GetResult();Stderr=$stderr.GetAwaiter().GetResult()}
        if($LogPath){[IO.File]::WriteAllText($LogPath,($result.Stdout+"`n"+$result.Stderr))}
        $result
    }finally{$process.Dispose()}
}
function Get-MatrixMembers {
    $inventory=Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'fixtures/shipped-inventory-0.0.987.json') -Raw|ConvertFrom-Json
    @($inventory.channels.beta | Where-Object {$_ -cne 'candidate.ps1'})
}
function Open-NativeRoot([string]$Path,[switch]$Initialize) {
    $full=Assert-MatrixRoot $Path
    if($Initialize){[IO.Directory]::CreateDirectory($full)|Out-Null}
    $full
}
function Set-NativeState([string]$Root,$State) {Write-NativeJson (Join-Path $Root 'state.json') $State}
function Get-NativeDataIndex([string]$Root) {
    $entries=@(Get-ChildItem -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue | Sort-Object FullName | ForEach-Object {
        $relative=$_.FullName.Substring($Root.Length+1).Replace('\','/')
        if($_.PSIsContainer){"d:$relative"}else{"f:${relative}:$(Get-NativeHash $_.FullName)"}
    })
    ($entries -join "`n")
}
