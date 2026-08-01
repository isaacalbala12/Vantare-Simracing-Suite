$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "sbom-tools.ps1")

$components = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "sbom-components.json") | ConvertFrom-Json
$validBuildInfo = @(
    "`tpath`tvantare.local/research/ta03b-duckdb",
    "`tmod`tvantare.local/research/ta03b-duckdb`t(devel)",
    "`tdep`tgithub.com/duckdb/duckdb-go-bindings`tv0.10505.0`th1:fixture",
    "`tdep`tgithub.com/duckdb/duckdb-go/v2`tv2.10505.0`th1:fixture",
    "`tdep`tgithub.com/go-viper/mapstructure/v2`tv2.5.0`th1:fixture",
    "`tdep`tgithub.com/google/uuid`tv1.6.0`th1:fixture",
    "`tbuild`tCGO_ENABLED=1"
)

Assert-ExactGoModuleInventory -BuildInfoLines $validBuildInfo -ExpectedModules $components.goModules

$cases = @(
    [ordered]@{
        Name = "unexpected module"
        Lines = @($validBuildInfo + "`tdep`texample.com/unexpected`tv1.0.0`th1:fixture")
        Pattern = "unexpected=\[example.com/unexpected\]"
    },
    [ordered]@{
        Name = "missing expected module"
        Lines = @($validBuildInfo | Where-Object { $_ -notmatch 'github.com/google/uuid' })
        Pattern = "missing=\[github.com/google/uuid\]"
    },
    [ordered]@{
        Name = "changed version"
        Lines = @($validBuildInfo -replace "github.com/google/uuid`tv1\.6\.0", "github.com/google/uuid`tv1.7.0")
        Pattern = "version-mismatch=\[github.com/google/uuid expected=v1.6.0 actual=v1.7.0\]"
    },
    [ordered]@{
        Name = "changed module casing"
        Lines = @($validBuildInfo -replace "github.com/google/uuid", "github.com/Google/uuid")
        Pattern = "missing=\[github.com/google/uuid\].*unexpected=\[github.com/Google/uuid\]"
    },
    [ordered]@{
        Name = "changed version casing"
        Lines = @($validBuildInfo -replace "github.com/google/uuid`tv1\.6\.0", "github.com/google/uuid`tV1.6.0")
        Pattern = "version-mismatch=\[github.com/google/uuid expected=v1.6.0 actual=V1.6.0\]"
    }
)

foreach ($case in $cases) {
    try {
        Assert-ExactGoModuleInventory -BuildInfoLines $case.Lines -ExpectedModules $components.goModules
        throw "Expected rejection for $($case.Name) did not occur."
    }
    catch {
        if ($_.Exception.Message -notmatch $case.Pattern) {
            throw
        }
    }
}

Write-Output "PASS exact Go module inventory and five fail-closed regressions."
