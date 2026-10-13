#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$Setup,
    [Parameter(Mandatory)][string]$Uninstall,
    [Parameter(Mandatory)][string]$EvidenceDirectory
)
$ErrorActionPreference='Stop'
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidence)){throw 'Use a fresh isolated QA directory.'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
Import-Module (Join-Path $vs 'Common7/Tools/Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'|Out-Null
# This fixture only writes a marker beside itself. --version never calls its ICU stubs.
$source=@'
#include <windows.h>
__declspec(dllexport) unsigned long long fixture_stub(void) { return 0; }
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID reserved) {
    if (reason == DLL_PROCESS_ATTACH) {
        WCHAR path[MAX_PATH];
        DWORD n = GetModuleFileNameW(module, path, MAX_PATH);
        while (n > 0 && path[n-1] != L'\\') --n;
        const WCHAR name[] = L"dll-loaded.marker";
        for (unsigned i = 0; i < sizeof(name)/sizeof(name[0]); ++i) path[n+i] = name[i];
        HANDLE file = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
        if (file != INVALID_HANDLE_VALUE) { DWORD written; WriteFile(file, "TEST ONLY", 9, &written, NULL); CloseHandle(file); }
    }
    return TRUE;
}
'@
[IO.File]::WriteAllText((Join-Path $evidence 'fixture.c'),$source)
$helper=@'
import sys
from installer_pe_tests import pe_info
_, imports = pe_info(sys.argv[1])
names = imports['icuuc.dll']
assert all(isinstance(name,str) for name in names)
print('LIBRARY icuuc\nEXPORTS\n'+'\n'.join(name+'=fixture_stub' for name in names))
'@
# Import the parser without requiring another package or copying its implementation.
$helper=$helper.Replace('from installer_pe_tests import pe_info',"import importlib.util`nspec=importlib.util.spec_from_file_location('installer_pe_tests',sys.argv[2])`nmodule=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)`npe_info=module.pe_info")
[IO.File]::WriteAllText((Join-Path $evidence 'exports.py'),$helper)
& python (Join-Path $evidence 'exports.py') $Setup (Join-Path $PSScriptRoot 'installer-pe-tests.py') > (Join-Path $evidence 'fixture.def')
if($LASTEXITCODE){throw 'Could not read ICU imports.'}
Push-Location $evidence
try {
    & cl /nologo /LD /GS- fixture.c /link /OUT:icuuc.dll /DEF:fixture.def | Out-File build.log
    if($LASTEXITCODE){throw 'Could not build benign DLL fixture.'}
    foreach($item in @(@{name='setup';exe=$Setup},@{name='uninstall';exe=$Uninstall})){
        foreach($silent in @($false,$true)){
            $directory=Join-Path $evidence ($item.name+'-'+$silent)
            [IO.Directory]::CreateDirectory($directory)|Out-Null
            $exe=Join-Path $directory 'installer.exe'
            Copy-Item -LiteralPath $item.exe -Destination $exe
            Copy-Item -LiteralPath (Join-Path $evidence 'icuuc.dll') -Destination $directory
            $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$exe
            $info.Arguments=$(if($silent){'/S --version'}else{'--version'})
            $info.UseShellExecute=$false;$info.CreateNoWindow=$true
            $process=[Diagnostics.Process]::Start($info)
            try{
                if(-not $process.WaitForExit(30000)){throw 'Owned CLI probe did not finish; retain evidence.'}
                if($process.ExitCode -ne 0){throw 'CLI probe failed.'}
            }finally{$process.Dispose()}
            if(Test-Path -LiteralPath (Join-Path $directory 'dll-loaded.marker')){throw "$($item.name), /S=${silent}: adjacent ICU fixture loaded before Rust"}
            Write-Output "PASS $($item.name), /S=${silent}: adjacent ICU fixture not loaded"
        }
    }
}finally{Pop-Location}
