param([Parameter(Mandatory)][string[]]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
foreach ($file in $Path) {
    $bitmap = [Drawing.Bitmap]::new([IO.Path]::GetFullPath($file))
    $data = $null
    try {
        $data = $bitmap.LockBits([Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height), [Drawing.Imaging.ImageLockMode]::ReadOnly, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $row = [byte[]]::new($bitmap.Width * 4)
        $transparent = 0
        for ($y = 0; $y -lt $bitmap.Height; $y++) {
            [Runtime.InteropServices.Marshal]::Copy([IntPtr]::Add($data.Scan0, $y * $data.Stride), $row, 0, $row.Length)
            for ($x = 3; $x -lt $row.Length; $x += 4) { if ($row[$x] -ne 255) { $transparent++ } }
        }
        if ($transparent) { throw "$file contiene $transparent pixels con alfa menor que 255" }
        "PASS opaco: $file"
    } finally {
        if ($data) { $bitmap.UnlockBits($data) }
        $bitmap.Dispose()
    }
}
