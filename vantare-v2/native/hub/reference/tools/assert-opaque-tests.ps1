$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Join-Path ([IO.Path]::GetTempPath()) ('hub-alpha-test-' + [guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($root)
$bitmap = [Drawing.Bitmap]::new(2,2)
try {
    foreach ($alpha in @(255,254,0)) {
        foreach ($x in 0..1) { foreach ($y in 0..1) { $bitmap.SetPixel($x,$y,[Drawing.Color]::FromArgb(255,20,20,20)) } }
        $bitmap.SetPixel(1,1,[Drawing.Color]::FromArgb($alpha,20,20,20))
        $file = Join-Path $root "$alpha.png"
        $bitmap.Save($file,[Drawing.Imaging.ImageFormat]::Png)
        $rejected = $false
        try { & "$PSScriptRoot/assert-opaque.ps1" -Path $file | Out-Null }
        catch { $rejected = $true }
        if ($rejected -ne ($alpha -lt 255)) { throw "Resultado incorrecto para alfa $alpha" }
    }
    'PASS alfa 255 aceptado; alfa 254 y 0 rechazados'
} finally {
    $bitmap.Dispose()
    foreach ($name in @('255.png','254.png','0.png')) { [IO.File]::Delete((Join-Path $root $name)) }
    [IO.Directory]::Delete($root)
}
