function Start-ABChild {
    param([string]$File,[string[]]$Arguments,[string]$Stdout,[string]$Stderr)
    $child=Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
    # PS5 necesita conservar el handle antes de sondear HasExited/Refresh.
    $null=$child.Handle
    return $child
}
