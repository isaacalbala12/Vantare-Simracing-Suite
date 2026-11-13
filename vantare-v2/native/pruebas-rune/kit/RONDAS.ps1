Set-StrictMode -Version Latest

function New-VantareOverlayPlan {
    [CmdletBinding()]
    param(
        [ValidateSet(1,4,10)][int]$Copies = 10,
        [ValidateSet(60,144)][int]$Hz = 60,
        [bool]$Load = $false,
        [ValidateSet('rune','gpui_fast')][string]$Comparison = 'rune',
        [ValidateRange(8,24)][int]$Rounds = 8
    )
    $plan = [Collections.Generic.List[object]]::new()
    for ($round = 1; $round -le $Rounds; $round++) {
        $order = if ($round % 2) { 'ABBA' } else { 'BAAB' }
        $blocks = if ($round % 2) { @('aa','ab') } else { @('ab','aa') }
        foreach ($block in $blocks) {
            for ($slot = 0; $slot -lt 4; $slot++) {
                $role = [string]$order[$slot]
                $variant = if ($block -eq 'aa' -or $role -eq 'A') { 'gpui' } else { $Comparison }
                $plan.Add([pscustomobject][ordered]@{
                    id = ('r{0:D2}-{1}-{2}' -f $round,$block,($slot+1))
                    round = $round
                    block = $block
                    role = $role
                    variant = $variant
                    comparison = $Comparison
                    windows = 1 # Una capa por monitor; copies cuenta widgets.
                    copies = $Copies
                    hz = $Hz
                    load = $Load
                    warmup_s = 10
                    duration_s = 60
                })
            }
        }
    }
    $plan.ToArray()
}

function Register-VantareAttempt {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Ledger,
        [Parameter(Mandatory)][string]$Family,
        [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256
    )
    $path = [IO.Path]::GetFullPath($Ledger)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'El registro de intentos no puede ser un enlace.'
    }
    $stream = [IO.File]::Open($path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        $reader = [IO.StreamReader]::new($stream,[Text.UTF8Encoding]::new($false),$true,1024,$true)
        try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $records = @($content -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json -ErrorAction Stop })
        $starts = @($records | Where-Object { $_.event -eq 'start' -and $_.family -eq $Family })
        if ($starts.Count -ge 3) { throw 'Tres intentos ya iniciados: conservar fallos y pedir revision a Isaac.' }
        $record = [ordered]@{
            event = 'start'
            family = $Family
            attempt = $starts.Count+1
            manifest_sha256 = $ManifestSha256
            started_utc = [DateTime]::UtcNow.ToString('o')
        }
        $line = ($record | ConvertTo-Json -Compress) + [Environment]::NewLine
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($line)
        $null = $stream.Seek(0,[IO.SeekOrigin]::End)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
        [pscustomobject]$record
    } finally { $stream.Dispose() }
}

function Complete-VantareAttempt {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Ledger,
        [Parameter(Mandatory)][string]$Family,
        [ValidateRange(1,3)][int]$Attempt,
        [ValidateSet('complete','invalid','cancelled')][string]$Status,
        [Parameter(Mandatory)][string]$Reason
    )
    $path = [IO.Path]::GetFullPath($Ledger)
    $stream = [IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        $reader = [IO.StreamReader]::new($stream,[Text.UTF8Encoding]::new($false),$true,1024,$true)
        try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $records = @($content -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json -ErrorAction Stop })
        $matching = @($records | Where-Object { $_.family -eq $Family -and $_.attempt -eq $Attempt })
        if (@($matching | Where-Object { $_.event -eq 'start' }).Count -ne 1) { throw 'No hay un inicio unico para este intento.' }
        if (@($matching | Where-Object { $_.event -eq 'end' }).Count) { throw 'El intento ya esta cerrado.' }
        $record = [ordered]@{event='end'; family=$Family; attempt=$Attempt; status=$Status; reason=$Reason; ended_utc=[DateTime]::UtcNow.ToString('o')}
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($record | ConvertTo-Json -Compress)+[Environment]::NewLine)
        $null = $stream.Seek(0,[IO.SeekOrigin]::End)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}
