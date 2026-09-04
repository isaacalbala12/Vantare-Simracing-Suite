package storagebench

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// Windows CI parses the delivered scripts without launching the application,
// reading configuration, or executing the profiling scenario.
func TestWindowsHarnessPowerShellSyntax(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("PowerShell syntax gate runs on Windows CI")
	}
	executable, err := exec.LookPath("pwsh")
	if err != nil {
		t.Fatalf("PowerShell 7 required for harness validation: %v", err)
	}
	directory, err := filepath.Abs("../windows")
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command(executable, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `
$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $env:VANTARE_ASTRA_SYNTAX_DIRECTORY -Filter '*.ps1' -File)
if ($files.Count -ne 4) { throw 'Expected exactly four delivered PowerShell scripts' }
foreach ($file in $files) {
 $parseErrors = $null
 $parseTokens = $null
 $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$parseTokens, [ref]$parseErrors)
 if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { Write-Output $_.Message }; exit 1 }
}
`)
	command.Env = append(os.Environ(), "VANTARE_ASTRA_SYNTAX_DIRECTORY="+directory)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("PowerShell syntax: %v\n%s", err, output)
	}
}
